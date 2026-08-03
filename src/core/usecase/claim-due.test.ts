import { describe, it, expect } from "bun:test";
import { claimDueJobs } from "./claim-due";
import type { OneshotJob } from "../entity/job";
import type { ConcurrencyController, AcquireResult } from "../port/concurrency-controller";
import type { DueJob } from "./schedule-tick";

function makeJob(name: string): OneshotJob {
  return {
    name,
    command: ["true"],
    notify: { onFailure: "silent" },
    schedule: { kind: "interval", seconds: 60 },
    retry: { maxAttempts: 1, backoffMs: [] },
  };
}

function due(job: OneshotJob, nextFireAt = 0): DueJob {
  return { job, nextFireAt };
}

function controller(
  decide: (jobName: string) => AcquireResult,
): ConcurrencyController {
  return {
    acquire: (job) => decide(job.name),
    release: () => {},
    snapshot: () => ({ running: 0, perGroup: {} }),
  };
}

describe("claimDueJobs", () => {
  it("starts jobs that acquire successfully and advances lastFireAt", () => {
    const a = makeJob("a");
    const lastFireAt: Record<string, number> = {};
    const results = claimDueJobs({
      due: [due(a)],
      lastFireAt,
      now: 10_000,
      controller: controller(() => ({ ok: true, releaseToken: "tok-a" })),
    });
    expect(results).toEqual([
      { kind: "start", job: a, releaseToken: "tok-a" },
    ]);
    expect(lastFireAt).toEqual({ a: 10_000 });
  });

  it("defers on global-cap without advancing lastFireAt (root fix)", () => {
    const a = makeJob("a");
    const lastFireAt: Record<string, number> = {};
    const results = claimDueJobs({
      due: [due(a)],
      lastFireAt,
      now: 10_000,
      controller: controller(() => ({ ok: false, reason: "global-cap" })),
    });
    expect(results).toEqual([{ kind: "defer", job: a, reason: "global-cap" }]);
    expect(lastFireAt).toEqual({});
  });

  it("defers on group-cap without advancing lastFireAt", () => {
    const a = makeJob("a");
    const lastFireAt: Record<string, number> = {};
    const results = claimDueJobs({
      due: [due(a)],
      lastFireAt,
      now: 10_000,
      controller: controller(() => ({ ok: false, reason: "group-cap" })),
    });
    expect(results).toEqual([{ kind: "defer", job: a, reason: "group-cap" }]);
    expect(lastFireAt).toEqual({});
  });

  it("skips on overlap and advances lastFireAt (consume the schedule slot)", () => {
    const a = makeJob("a");
    const lastFireAt: Record<string, number> = {};
    const results = claimDueJobs({
      due: [due(a)],
      lastFireAt,
      now: 10_000,
      controller: controller(() => ({ ok: false, reason: "overlap" })),
    });
    expect(results).toEqual([{ kind: "skip", job: a, reason: "overlap" }]);
    expect(lastFireAt).toEqual({ a: 10_000 });
  });

  it("starts first jobs then defers the rest when cap fills mid-batch", () => {
    const jobs = ["a", "b", "c", "d", "e", "f"].map(makeJob);
    let running = 0;
    const cap = 4;
    const lastFireAt: Record<string, number> = {};
    const results = claimDueJobs({
      due: jobs.map((j) => due(j)),
      lastFireAt,
      now: 9_000,
      controller: {
        acquire: (job) => {
          if (running >= cap) return { ok: false, reason: "global-cap" };
          running += 1;
          return { ok: true, releaseToken: `tok-${job.name}` };
        },
        release: () => {
          running -= 1;
        },
        snapshot: () => ({ running, perGroup: {} }),
      },
    });
    const starts = results.filter((r) => r.kind === "start");
    const defers = results.filter((r) => r.kind === "defer");
    expect(starts).toHaveLength(4);
    expect(defers).toHaveLength(2);
    expect(defers.map((d) => d.job.name)).toEqual(["e", "f"]);
    // only started jobs consume due
    expect(Object.keys(lastFireAt).sort()).toEqual(["a", "b", "c", "d"]);
    expect(lastFireAt["e"]).toBeUndefined();
    expect(lastFireAt["f"]).toBeUndefined();
  });

  it("leaves prior lastFireAt intact when deferring", () => {
    const a = makeJob("a");
    const lastFireAt: Record<string, number> = { a: 1_000 };
    claimDueJobs({
      due: [due(a)],
      lastFireAt,
      now: 99_000,
      controller: controller(() => ({ ok: false, reason: "global-cap" })),
    });
    expect(lastFireAt).toEqual({ a: 1_000 });
  });
});

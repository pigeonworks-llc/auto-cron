import { describe, it, expect } from "bun:test";
import { checkDeps, type CheckDepsInput, type CheckDepsResult } from "./check-deps";
import type { OneshotJob } from "../entity/job";
import type { Clock } from "../port/clock";
import type { RunStore } from "../port/run-store";
import type { JobRun } from "../entity/job-run";

function makeOneshotJob(overrides: Partial<OneshotJob> = {}): OneshotJob {
  return {
    name: "test-job",
    command: ["echo", "hello"],
    notify: { onFailure: "silent" },
    schedule: { kind: "interval", seconds: 60 },
    retry: { maxAttempts: 1, backoffMs: [] },
    ...overrides,
  };
}

describe("check-deps usecase", () => {
  it("returns ok when dependsOn is empty", async () => {
    const clock: Clock = { now: () => 1000 };
    const store: RunStore = {
      insert: async () => "",
      setState: async () => {},
      recent: async () => [],
      latestSucceeded: async () => null,
      runningRuns: async () => [],
    };
    const job = makeOneshotJob({ name: "no-deps" });
    const result = await checkDeps({ job, runStore: store, clock });
    expect(result).toEqual({ ok: true, unmet: [] });
  });

  it("reports unmet when dependency has never succeeded", async () => {
    const clock: Clock = { now: () => 1000000 };
    const store: RunStore = {
      insert: async () => "",
      setState: async () => {},
      recent: async () => [],
      latestSucceeded: async () => null,
      runningRuns: async () => [],
    };
    const job = makeOneshotJob({
      name: "child",
      dependsOn: ["parent"],
    });
    const result = await checkDeps({ job, runStore: store, clock });
    expect(result.ok).toBe(false);
    expect(result.unmet).toEqual(["parent"]);
  });

  it("reports unmet when dependency succeeded but outside cutoff", async () => {
    // now=100000000, withinH=1 → cutoff=100000000-3600000=96400000
    // parent finishedAt=0 < 96400000 → outside cutoff → unmet
    const clock: Clock = { now: () => 100000000 };
    const store: RunStore = {
      insert: async () => "",
      setState: async () => {},
      recent: async () => [],
      latestSucceeded: async () => null,
      runningRuns: async () => [],
    };
    const job = makeOneshotJob({
      name: "child",
      dependsOn: ["parent"],
      dependsWithinHours: 1,
    });
    const parentRun: JobRun = {
      jobId: "parent",
      runId: "r1",
      attempt: 1,
      startedAt: 0,
      finishedAt: 0,
      exitCode: 0,
      stdout: "",
      stderr: "",
      state: "succeeded",
    };
    const storeWithParent: RunStore = {
      ...store,
      latestSucceeded: async () => parentRun,
    };
    const result = await checkDeps({ job, runStore: storeWithParent, clock });
    expect(result.ok).toBe(false);
    expect(result.unmet).toEqual(["parent"]);
  });

  it("returns ok when dependency succeeded within cutoff", async () => {
    // now=100000000, withinH=24 → cutoff=100000000-86400000=13600000
    // parent finishedAt=50000000 > 13600000 → within cutoff → ok
    const clock: Clock = { now: () => 100000000 };
    const store: RunStore = {
      insert: async () => "",
      setState: async () => {},
      recent: async () => [],
      latestSucceeded: async () => null,
      runningRuns: async () => [],
    };
    const job = makeOneshotJob({
      name: "child",
      dependsOn: ["parent"],
      dependsWithinHours: 24,
    });
    const parentRun: JobRun = {
      jobId: "parent",
      runId: "r1",
      attempt: 1,
      startedAt: 40000000,
      finishedAt: 50000000,
      exitCode: 0,
      stdout: "",
      stderr: "",
      state: "succeeded",
    };
    const storeWithParent: RunStore = {
      ...store,
      latestSucceeded: async () => parentRun,
    };
    const result = await checkDeps({ job, runStore: storeWithParent, clock });
    expect(result.ok).toBe(true);
    expect(result.unmet).toEqual([]);
  });
});

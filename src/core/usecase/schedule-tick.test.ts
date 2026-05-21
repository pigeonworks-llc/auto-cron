import { describe, it, expect } from "bun:test";
import { findDueJobs, type ScheduleTickInput, type DueJob } from "./schedule-tick";
import type { OneshotJob } from "../entity/job";
import type { Clock } from "../port/clock";
import type { ServiceJob } from "../entity/job";

function makeClock(now: number): Clock {
  return { now: () => now };
}

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

describe("schedule-tick usecase", () => {
  it("returns empty array when jobs is empty", () => {
    const clock = makeClock(1000);
    const input: ScheduleTickInput = { jobs: [], lastFireAt: {}, clock };
    const result = findDueJobs(input);
    expect(result).toEqual([]);
  });

  it("returns one DueJob for a single OneshotJob", () => {
    const clock = makeClock(5000);
    const job = makeOneshotJob({ name: "alpha" });
    const input: ScheduleTickInput = { jobs: [job], lastFireAt: {}, clock };
    const result = findDueJobs(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.job.name).toBe("alpha");
    expect(result[0]!.nextFireAt).toBe(5000);
  });

  it("returns multiple DueJobs for multiple OneshotJobs", () => {
    const clock = makeClock(9999);
    const jobs = [
      makeOneshotJob({ name: "alpha" }),
      makeOneshotJob({ name: "beta" }),
    ];
    const input: ScheduleTickInput = { jobs, lastFireAt: {}, clock };
    const result = findDueJobs(input);
    expect(result).toHaveLength(2);
    expect(result.map((d) => d.job.name)).toEqual(["alpha", "beta"]);
    expect(result.every((d) => d.nextFireAt === 9999)).toBe(true);
  });

  it("rejects ServiceJob at type level (compile-time check)", () => {
    const serviceJob: ServiceJob = {
      name: "srv",
      command: ["server"],
      lifecycle: "service",
      notify: { onFailure: "silent" },
      restart: { backoffMs: [1000] },
    };
    // @ts-expect-error — ServiceJob is not assignable to readonly OneshotJob[]
    const input: ScheduleTickInput = { jobs: [serviceJob], lastFireAt: {}, clock: makeClock(0) };
    void input;
  });
});

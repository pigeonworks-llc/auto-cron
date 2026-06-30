import { describe, it, expect } from "bun:test";
import { findDueJobs, type ScheduleTickInput } from "./schedule-tick";
import type { OneshotJob, ServiceJob } from "../entity/job";
import type { Clock } from "../port/clock";
import type { Scheduler } from "../port/scheduler";
import type { Schedule } from "../entity/schedule";

function makeClock(now: number): Clock {
  return { now: () => now };
}

/**
 * Stub Scheduler: interval → base + seconds*1000, manual → Infinity.
 * Matches the CronEvaluator behaviour for interval/manual schedules.
 */
function makeScheduler(): Scheduler {
  return {
    nextFireAt(schedule: Schedule, base: number): number {
      switch (schedule.kind) {
        case "manual":
          return Number.POSITIVE_INFINITY;
        case "interval":
          return base + schedule.seconds * 1000;
        case "cron":
          // For unit-test purposes, treat cron as interval-60s from base
          return base + 60_000;
      }
    },
  };
}

function makeOneshotJob(overrides: Partial<OneshotJob> = {}): OneshotJob {
  return {
    name: "test-job",
    command: ["echo", "hello"],
    notify: { onFailure: "silent" },
    schedule: { kind: "interval", seconds: 5 },
    retry: { maxAttempts: 1, backoffMs: [] },
    ...overrides,
  };
}

const scheduler = makeScheduler();

describe("schedule-tick usecase", () => {
  it("returns empty array when jobs is empty", () => {
    const input: ScheduleTickInput = {
      jobs: [],
      lastFireAt: {},
      clock: makeClock(1_000),
      scheduler,
    };
    expect(findDueJobs(input)).toEqual([]);
  });

  it("interval job is NOT due when insufficient time has passed", () => {
    // last=9000, interval=5s → next = 9000+5000 = 14000 > now=10000
    const job = makeOneshotJob({ name: "a", schedule: { kind: "interval", seconds: 5 } });
    const input: ScheduleTickInput = {
      jobs: [job],
      lastFireAt: { a: 9_000 },
      clock: makeClock(10_000),
      scheduler,
    };
    const result = findDueJobs(input);
    expect(result).toHaveLength(0);
  });

  it("interval job IS due when sufficient time has passed", () => {
    // last=9000, interval=5s → next = 14000 <= now=20000
    const job = makeOneshotJob({ name: "a", schedule: { kind: "interval", seconds: 5 } });
    const input: ScheduleTickInput = {
      jobs: [job],
      lastFireAt: { a: 9_000 },
      clock: makeClock(20_000),
      scheduler,
    };
    const result = findDueJobs(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.job.name).toBe("a");
    expect(result[0]!.nextFireAt).toBe(14_000); // 9000 + 5000
  });

  it("manual job is never due regardless of now", () => {
    const job = makeOneshotJob({ name: "m", schedule: { kind: "manual" } });
    const input: ScheduleTickInput = {
      jobs: [job],
      lastFireAt: {},
      clock: makeClock(99_999_999),
      scheduler,
    };
    expect(findDueJobs(input)).toHaveLength(0);
  });

  it("does NOT fire on boot when job has never fired (fire-on-boot suppressed)", () => {
    // unseen job, default: base=now=10000 → next=15000 > 10000 → NOT due.
    // Prevents the daemon-restart re-fire that caused duplicate sends.
    const job = makeOneshotJob({ name: "fresh", schedule: { kind: "interval", seconds: 5 } });
    const input: ScheduleTickInput = {
      jobs: [job],
      lastFireAt: {},
      clock: makeClock(10_000),
      scheduler,
    };
    expect(findDueJobs(input)).toHaveLength(0);
  });

  it("DOES fire on boot when catchUpOnWake is true (opt-in catch-up)", () => {
    // unseen job + catchUpOnWake: base=0 → next=5000 <= 10000 → due.
    const job = makeOneshotJob({
      name: "catchup",
      schedule: { kind: "interval", seconds: 5 },
      catchUpOnWake: true,
    });
    const input: ScheduleTickInput = {
      jobs: [job],
      lastFireAt: {},
      clock: makeClock(10_000),
      scheduler,
    };
    const result = findDueJobs(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.nextFireAt).toBe(5_000); // 0 + 5000
  });

  it("returns multiple DueJobs when several jobs are overdue", () => {
    const jobs = [
      makeOneshotJob({ name: "alpha", schedule: { kind: "interval", seconds: 5 } }),
      makeOneshotJob({ name: "beta", schedule: { kind: "interval", seconds: 5 } }),
    ];
    // Both last fired at 0, now=10000 → both due (next=5000 <= 10000)
    const input: ScheduleTickInput = {
      jobs,
      lastFireAt: { alpha: 0, beta: 0 },
      clock: makeClock(10_000),
      scheduler,
    };
    const result = findDueJobs(input);
    expect(result).toHaveLength(2);
    expect(result.map((d) => d.job.name)).toEqual(["alpha", "beta"]);
  });

  it("only returns jobs that are due (mixed due/not-due)", () => {
    const jobs = [
      makeOneshotJob({ name: "overdue", schedule: { kind: "interval", seconds: 5 } }),
      makeOneshotJob({ name: "pending", schedule: { kind: "interval", seconds: 5 } }),
    ];
    const input: ScheduleTickInput = {
      jobs,
      // overdue: last=0 → next=5000 <= 10000 → due
      // pending: last=9000 → next=14000 > 10000 → not due
      lastFireAt: { overdue: 0, pending: 9_000 },
      clock: makeClock(10_000),
      scheduler,
    };
    const result = findDueJobs(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.job.name).toBe("overdue");
  });

  it("rejects ServiceJob at type level (compile-time check)", () => {
    const serviceJob: ServiceJob = {
      name: "srv",
      command: ["server"],
      lifecycle: "service",
      notify: { onFailure: "silent" },
      restart: { backoffMs: [1000] },
    };
    const input: ScheduleTickInput = {
      // @ts-expect-error — ServiceJob is not assignable to readonly OneshotJob[]
      jobs: [serviceJob],
      lastFireAt: {},
      clock: makeClock(0),
      scheduler,
    };
    void input;
  });
});

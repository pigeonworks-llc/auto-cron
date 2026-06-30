import { describe, it, expect } from "bun:test";
import { detectSilentJobs, type SilenceInput } from "./detect-silence";
import type { OneshotJob } from "../entity/job";
import type { Scheduler } from "../port/scheduler";
import type { Schedule } from "../entity/schedule";

// Stub: interval → base + sec*1000, manual → +Infinity (matches CronEvaluator).
const scheduler: Scheduler = {
  nextFireAt(schedule: Schedule, base: number): number {
    switch (schedule.kind) {
      case "manual":
        return Number.POSITIVE_INFINITY;
      case "interval":
        return base + schedule.seconds * 1000;
      case "cron":
        return base + 60_000;
    }
  },
};

function job(name: string, schedule: OneshotJob["schedule"]): OneshotJob {
  return {
    name,
    command: ["x"],
    notify: { onFailure: "digest" },
    schedule,
    retry: { maxAttempts: 1, backoffMs: [] },
  };
}

function input(over: Partial<SilenceInput>): SilenceInput {
  return {
    jobs: [],
    lastStartedAt: {},
    now: 1_000_000,
    graceMs: 60_000,
    fallbackBase: 0,
    scheduler,
    ...over,
  };
}

describe("detectSilentJobs", () => {
  it("flags a job whose expected fire + grace has passed", () => {
    // last=100000, interval=60s → expected=160000; +grace60s=220000 < now=1_000_000 → silent
    const j = job("stale", { kind: "interval", seconds: 60 });
    const r = detectSilentJobs(input({ jobs: [j], lastStartedAt: { stale: 100_000 } }));
    expect(r).toHaveLength(1);
    expect(r[0]!.job.name).toBe("stale");
    expect(r[0]!.expectedAt).toBe(160_000);
  });

  it("does NOT flag a job still within its grace window", () => {
    // last=now-30s, interval=60s → expected=now+30s (future) → not overdue
    const now = 1_000_000;
    const j = job("fresh", { kind: "interval", seconds: 60 });
    const r = detectSilentJobs(input({ jobs: [j], now, lastStartedAt: { fresh: now - 30_000 } }));
    expect(r).toHaveLength(0);
  });

  it("skips manual jobs (never auto-fire)", () => {
    const j = job("m", { kind: "manual" });
    const r = detectSilentJobs(input({ jobs: [j], lastStartedAt: { m: 0 } }));
    expect(r).toHaveLength(0);
  });

  it("uses fallbackBase for never-run jobs (overdue since fallback)", () => {
    // no lastStartedAt → base=fallbackBase=0, interval=60s → expected=60000; +grace<now → silent
    const j = job("never", { kind: "interval", seconds: 60 });
    const r = detectSilentJobs(input({ jobs: [j], lastStartedAt: {}, fallbackBase: 0 }));
    expect(r).toHaveLength(1);
    expect(r[0]!.job.name).toBe("never");
  });

  it("does NOT flag a never-run job whose fallbackBase is recent", () => {
    // base=fallbackBase=now-10s, interval=60s → expected=now+50s (future) → not overdue
    const now = 1_000_000;
    const j = job("new", { kind: "interval", seconds: 60 });
    const r = detectSilentJobs(input({ jobs: [j], now, lastStartedAt: {}, fallbackBase: now - 10_000 }));
    expect(r).toHaveLength(0);
  });
});

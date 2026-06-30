import { describe, it, expect } from "bun:test";
import { formatRelative, nextFireFor, scheduleLabel } from "./cli-format";
import type { Job } from "../core/entity/job";
import type { Scheduler } from "../core/port/scheduler";
import type { Schedule } from "../core/entity/schedule";

const scheduler: Scheduler = {
  nextFireAt(s: Schedule, base: number): number {
    switch (s.kind) {
      case "manual":
        return Number.POSITIVE_INFINITY;
      case "interval":
        return base + s.seconds * 1000;
      case "cron":
        return base + 3600_000;
    }
  },
};

function oneshot(over: Partial<Job> = {}): Job {
  return {
    name: "j",
    command: ["x"],
    notify: { onFailure: "silent" },
    schedule: { kind: "cron", expr: "0 10 * * *", timezone: "Asia/Tokyo" },
    retry: { maxAttempts: 1, backoffMs: [] },
    ...over,
  } as Job;
}

describe("formatRelative", () => {
  it("formats future as 'in N'", () => {
    expect(formatRelative(5 * 60_000)).toBe("in 5m");
    expect(formatRelative(2 * 3600_000)).toBe("in 2h");
  });
  it("formats past as 'N ago'", () => {
    expect(formatRelative(-30_000)).toBe("30s ago");
    expect(formatRelative(-3 * 86400_000)).toBe("3d ago");
  });
  it("treats sub-second as now", () => {
    expect(formatRelative(0)).toBe("now");
  });
  it("never returns Infinity text", () => {
    expect(formatRelative(Number.POSITIVE_INFINITY)).toBe("never");
  });
});

describe("nextFireFor", () => {
  it("computes next fire for a cron job", () => {
    const j = oneshot({ schedule: { kind: "cron", expr: "0 10 * * *", timezone: "UTC" } });
    expect(nextFireFor(j, 1000, scheduler)).toBe(1000 + 3600_000);
  });
  it("returns Infinity for manual", () => {
    const j = oneshot({ schedule: { kind: "manual" } });
    expect(nextFireFor(j, 1000, scheduler)).toBe(Number.POSITIVE_INFINITY);
  });
  it("returns Infinity for service jobs", () => {
    const j = { name: "s", command: ["x"], lifecycle: "service", notify: { onFailure: "silent" }, restart: { backoffMs: [1000] } } as Job;
    expect(nextFireFor(j, 1000, scheduler)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("scheduleLabel", () => {
  it("labels cron with expr", () => {
    expect(scheduleLabel(oneshot({ schedule: { kind: "cron", expr: "0 10 * * *" } }))).toBe("cron 0 10 * * *");
  });
  it("labels interval / manual / service", () => {
    expect(scheduleLabel(oneshot({ schedule: { kind: "interval", seconds: 30 } }))).toBe("every 30s");
    expect(scheduleLabel(oneshot({ schedule: { kind: "manual" } }))).toBe("manual");
    expect(scheduleLabel({ name: "s", command: ["x"], lifecycle: "service", notify: { onFailure: "silent" }, restart: { backoffMs: [1] } } as Job)).toBe("service");
  });
});

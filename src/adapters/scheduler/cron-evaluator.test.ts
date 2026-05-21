import { describe, it, expect } from "bun:test";
import { nextFireAt, CronEvaluator } from "./cron-evaluator";

// Epoch ms helpers
const UTC = (...args: ConstructorParameters<typeof Date>) => new Date(...args).getTime();

describe("nextFireAt — manual schedule", () => {
  it("returns POSITIVE_INFINITY for manual", () => {
    const result = nextFireAt({ kind: "manual" }, Date.now());
    expect(result).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("nextFireAt — interval schedule", () => {
  it("returns base + seconds*1000 for interval 60 sec", () => {
    const base = 1_000_000;
    const result = nextFireAt({ kind: "interval", seconds: 60 }, base);
    expect(result).toBe(base + 60_000);
  });

  it("returns base + seconds*1000 for interval 5 sec", () => {
    const base = 9_000;
    const result = nextFireAt({ kind: "interval", seconds: 5 }, base);
    expect(result).toBe(base + 5_000); // 14000
  });

  it("returns 0 + ms when base is 0 (never-fired job)", () => {
    const result = nextFireAt({ kind: "interval", seconds: 30 }, 0);
    expect(result).toBe(30_000);
  });
});

describe("nextFireAt — cron schedule (UTC default)", () => {
  it("returns next 18:00 UTC when now is 2026-05-21T00:00:00Z", () => {
    const base = UTC("2026-05-21T00:00:00Z");
    const expected = UTC("2026-05-21T18:00:00Z");
    const result = nextFireAt({ kind: "cron", expr: "0 18 * * *" }, base);
    expect(result).toBe(expected);
  });

  it("returns the same-day occurrence when base is before it", () => {
    // 2026-05-21T10:00:00Z → next 18:00 UTC is same day
    const base = UTC("2026-05-21T10:00:00Z");
    const expected = UTC("2026-05-21T18:00:00Z");
    const result = nextFireAt({ kind: "cron", expr: "0 18 * * *" }, base);
    expect(result).toBe(expected);
  });

  it("rolls over to next day when base is after the occurrence", () => {
    // 2026-05-21T20:00:00Z → next 18:00 UTC is next day
    const base = UTC("2026-05-21T20:00:00Z");
    const expected = UTC("2026-05-22T18:00:00Z");
    const result = nextFireAt({ kind: "cron", expr: "0 18 * * *" }, base);
    expect(result).toBe(expected);
  });
});

describe("nextFireAt — cron schedule (Asia/Tokyo timezone)", () => {
  it("resolves 18:00 JST correctly when now is 2026-05-21T00:00:00Z (= 09:00 JST)", () => {
    // 2026-05-21T00:00:00Z = 2026-05-21T09:00:00+09:00
    // next 18:00 JST = 2026-05-21T18:00:00+09:00 = 2026-05-21T09:00:00Z
    const base = UTC("2026-05-21T00:00:00Z");
    const expected = UTC("2026-05-21T09:00:00Z");
    const result = nextFireAt(
      { kind: "cron", expr: "0 18 * * *", timezone: "Asia/Tokyo" },
      base,
    );
    expect(result).toBe(expected);
  });

  it("rolls over to next day JST when past 18:00 JST", () => {
    // 2026-05-21T12:00:00Z = 2026-05-21T21:00:00+09:00 (past 18:00)
    // next 18:00 JST = 2026-05-22T18:00:00+09:00 = 2026-05-22T09:00:00Z
    const base = UTC("2026-05-21T12:00:00Z");
    const expected = UTC("2026-05-22T09:00:00Z");
    const result = nextFireAt(
      { kind: "cron", expr: "0 18 * * *", timezone: "Asia/Tokyo" },
      base,
    );
    expect(result).toBe(expected);
  });
});

describe("nextFireAt — invalid cron expression", () => {
  it("throws on invalid cron expression (croner behaviour)", () => {
    expect(() => nextFireAt({ kind: "cron", expr: "not-a-cron" }, Date.now())).toThrow();
  });
});

describe("CronEvaluator class", () => {
  it("implements Scheduler port and delegates to nextFireAt", () => {
    const evaluator = new CronEvaluator();
    const base = 0;
    expect(evaluator.nextFireAt({ kind: "manual" }, base)).toBe(Number.POSITIVE_INFINITY);
    expect(evaluator.nextFireAt({ kind: "interval", seconds: 10 }, base)).toBe(10_000);
  });
});

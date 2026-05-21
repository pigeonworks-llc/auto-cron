import { describe, it, expect } from "bun:test";
import type { Schedule } from "./schedule";

// Schedule is a pure discriminated union, so the bulk of "tests" is the
// type system itself. These runtime tests pin the shape (so a refactor
// that flattens / renames the discriminator is caught) and verify the
// optional fields behave as documented.

describe("Schedule entity (discriminated union)", () => {
  it("accepts a cron variant with required expr and optional timezone", () => {
    const s: Schedule = { kind: "cron", expr: "0 18 * * *" };
    expect(s.kind).toBe("cron");
    if (s.kind === "cron") {
      expect(s.expr).toBe("0 18 * * *");
      expect(s.timezone).toBeUndefined();
    }

    const withTz: Schedule = {
      kind: "cron",
      expr: "0 18 * * *",
      timezone: "Asia/Tokyo",
    };
    if (withTz.kind === "cron") {
      expect(withTz.timezone).toBe("Asia/Tokyo");
    }
  });

  it("accepts an interval variant carrying a positive seconds count", () => {
    const s: Schedule = { kind: "interval", seconds: 300 };
    expect(s.kind).toBe("interval");
    if (s.kind === "interval") {
      expect(s.seconds).toBe(300);
    }
  });

  it("accepts a manual variant carrying only the discriminator", () => {
    const s: Schedule = { kind: "manual" };
    expect(s.kind).toBe("manual");
  });

  it("narrows correctly via the kind discriminator (exhaustive switch)", () => {
    function describe_(s: Schedule): string {
      switch (s.kind) {
        case "cron":
          return `cron(${s.expr})`;
        case "interval":
          return `interval(${s.seconds}s)`;
        case "manual":
          return "manual";
      }
    }
    expect(describe_({ kind: "cron", expr: "0 0 * * *" })).toBe(
      "cron(0 0 * * *)",
    );
    expect(describe_({ kind: "interval", seconds: 60 })).toBe("interval(60s)");
    expect(describe_({ kind: "manual" })).toBe("manual");
  });
});

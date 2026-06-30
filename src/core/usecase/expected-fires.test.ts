import { describe, it, expect } from "bun:test";
import { countFires } from "./expected-fires";
import type { Schedule } from "../entity/schedule";

// Windows are UTC so the math is machine-independent; cron schedules pin
// timezone:"UTC" to match.
const JUN29 = Date.UTC(2026, 5, 29, 0, 0, 0); // month is 0-indexed → June
const JUN30 = Date.UTC(2026, 5, 30, 0, 0, 0);

describe("countFires", () => {
  it("daily cron fires once per day window", () => {
    const s: Schedule = { kind: "cron", expr: "0 10 * * *", timezone: "UTC" };
    expect(countFires(s, JUN29, JUN30)).toBe(1);
  });

  it("*/15 fires 4 times in an hour window", () => {
    const s: Schedule = { kind: "cron", expr: "*/15 * * * *", timezone: "UTC" };
    const from = Date.UTC(2026, 5, 29, 0, 0, 0);
    const to = Date.UTC(2026, 5, 29, 1, 0, 0);
    expect(countFires(s, from, to)).toBe(4); // :00 :15 :30 :45
  });

  it("counts a fire landing exactly on the window start", () => {
    const s: Schedule = { kind: "cron", expr: "0 0 * * *", timezone: "UTC" };
    expect(countFires(s, JUN29, JUN30)).toBe(1); // 00:00 inclusive
  });

  it("returns 0 when the cron does not fire in the window", () => {
    const s: Schedule = { kind: "cron", expr: "0 10 1 1 *", timezone: "UTC" }; // Jan 1 only
    expect(countFires(s, JUN29, JUN30)).toBe(0);
  });

  it("interval fires window/interval times", () => {
    const s: Schedule = { kind: "interval", seconds: 3600 };
    expect(countFires(s, JUN29, JUN30)).toBe(24); // 86400 / 3600
  });

  it("manual never fires", () => {
    const s: Schedule = { kind: "manual" };
    expect(countFires(s, JUN29, JUN30)).toBe(0);
  });
});

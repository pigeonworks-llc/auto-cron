import { describe, it, expect } from "bun:test";
import { resolveDayWindow, buildReport } from "./expected";
import type { Job } from "../core/entity/job";

describe("resolveDayWindow", () => {
  it("resolves an explicit YYYY-MM-DD to a 24h local window", () => {
    const w = resolveDayWindow("2026-06-29", new Date());
    expect(w.date).toBe("2026-06-29");
    expect(w.to - w.from).toBe(24 * 60 * 60 * 1000);
    // from is local midnight of the given date
    expect(new Date(w.from).getFullYear()).toBe(2026);
    expect(new Date(w.from).getHours()).toBe(0);
  });

  it("defaults to yesterday relative to now", () => {
    const now = new Date(2026, 5, 30, 12, 0, 0); // 2026-06-30 12:00 local
    const w = resolveDayWindow(undefined, now);
    expect(w.date).toBe("2026-06-29");
  });

  it("throws on a malformed date", () => {
    expect(() => resolveDayWindow("2026/06/29", new Date())).toThrow();
  });
});

describe("buildReport", () => {
  function cronJob(name: string, expr: string): Job {
    return {
      name,
      command: ["x"],
      notify: { onFailure: "silent" },
      schedule: { kind: "cron", expr, timezone: "UTC" },
      retry: { maxAttempts: 1, backoffMs: [] },
    };
  }
  function manualJob(name: string): Job {
    return {
      name,
      command: ["x"],
      notify: { onFailure: "silent" },
      schedule: { kind: "manual" },
      retry: { maxAttempts: 1, backoffMs: [] },
    };
  }
  function serviceJob(name: string): Job {
    return {
      name,
      command: ["x"],
      lifecycle: "service",
      notify: { onFailure: "silent" },
      restart: { backoffMs: [1000] },
    };
  }

  const from = Date.UTC(2026, 5, 29, 0, 0, 0);
  const to = Date.UTC(2026, 5, 30, 0, 0, 0);

  it("includes cron jobs with their expected count", () => {
    const r = buildReport([cronJob("daily", "0 10 * * *")], from, to);
    expect(r).toEqual([{ name: "daily", kind: "cron", expected: 1 }]);
  });

  it("excludes manual and service jobs", () => {
    const r = buildReport(
      [cronJob("c", "0 10 * * *"), manualJob("m"), serviceJob("s")],
      from,
      to,
    );
    expect(r.map((j) => j.name)).toEqual(["c"]);
  });
});

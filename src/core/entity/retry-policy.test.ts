import { describe, it, expect } from "bun:test";
import {
  backoffMsForAttempt,
  type RetryPolicy,
} from "./retry-policy";

// RetryPolicy is a value object: the shape is enforced by TypeScript,
// and the only behavior worth unit-testing here is the backoff lookup
// (which clamps gracefully when an attempt index exceeds the array).

describe("RetryPolicy entity", () => {
  it("accepts maxAttempts=1 with an empty backoffMs (no retry case)", () => {
    const p: RetryPolicy = { maxAttempts: 1, backoffMs: [] };
    expect(p.maxAttempts).toBe(1);
    expect(p.backoffMs).toEqual([]);
  });

  it("accepts maxAttempts>1 with a backoffMs array sized to N-1", () => {
    const p: RetryPolicy = {
      maxAttempts: 3,
      backoffMs: [60_000, 300_000],
    };
    expect(p.maxAttempts).toBe(3);
    expect(p.backoffMs).toEqual([60_000, 300_000]);
  });
});

describe("backoffMsForAttempt", () => {
  it("returns 0 for attempt=1 (no wait before the first run)", () => {
    const p: RetryPolicy = { maxAttempts: 3, backoffMs: [60_000, 300_000] };
    expect(backoffMsForAttempt(p, 1)).toBe(0);
  });

  it("returns the array entry for in-range attempts (2..N)", () => {
    const p: RetryPolicy = {
      maxAttempts: 4,
      backoffMs: [60_000, 300_000, 900_000],
    };
    expect(backoffMsForAttempt(p, 2)).toBe(60_000); // index 0
    expect(backoffMsForAttempt(p, 3)).toBe(300_000); // index 1
    expect(backoffMsForAttempt(p, 4)).toBe(900_000); // index 2
  });

  it("reuses the LAST backoff value when the attempt index overruns the array", () => {
    // Documented behavior in the plan: backoffMs[N-1] is the steady-state
    // backoff for any attempt beyond the array's length.
    const p: RetryPolicy = { maxAttempts: 10, backoffMs: [60_000, 300_000] };
    expect(backoffMsForAttempt(p, 5)).toBe(300_000);
    expect(backoffMsForAttempt(p, 100)).toBe(300_000);
  });

  it("returns 0 when backoffMs is empty regardless of attempt index", () => {
    const p: RetryPolicy = { maxAttempts: 1, backoffMs: [] };
    expect(backoffMsForAttempt(p, 1)).toBe(0);
    expect(backoffMsForAttempt(p, 2)).toBe(0);
  });

  it("treats non-positive attempts as 0 (defensive — caller bug should not crash)", () => {
    const p: RetryPolicy = { maxAttempts: 3, backoffMs: [60_000] };
    expect(backoffMsForAttempt(p, 0)).toBe(0);
    expect(backoffMsForAttempt(p, -1)).toBe(0);
  });
});

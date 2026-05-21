import { describe, it, expect } from "bun:test";
import {
  restartBackoffMsForAttempt,
  type RestartPolicy,
} from "./restart-policy";

describe("RestartPolicy entity", () => {
  it("accepts backoffMs with maxRestarts undefined (infinite restarts)", () => {
    const p: RestartPolicy = { backoffMs: [5_000, 30_000] };
    expect(p.backoffMs).toEqual([5_000, 30_000]);
    expect(p.maxRestarts).toBeUndefined();
  });

  it("accepts maxRestarts=0 as infinite restarts", () => {
    const p: RestartPolicy = { backoffMs: [5_000], maxRestarts: 0 };
    expect(p.maxRestarts).toBe(0);
  });

  it("accepts maxRestarts=N for finite restart budget", () => {
    const p: RestartPolicy = { backoffMs: [5_000, 30_000], maxRestarts: 5 };
    expect(p.maxRestarts).toBe(5);
  });

  it("resetAfterSec defaults to undefined (default 60 in supervisor)", () => {
    const p: RestartPolicy = { backoffMs: [5_000] };
    expect(p.resetAfterSec).toBeUndefined();
  });

  it("accepts explicit resetAfterSec", () => {
    const p: RestartPolicy = { backoffMs: [5_000], resetAfterSec: 120 };
    expect(p.resetAfterSec).toBe(120);
  });
});

describe("restartBackoffMsForAttempt", () => {
  const policy: RestartPolicy = { backoffMs: [5_000, 30_000, 120_000] };

  it("returns 0 for attempt=1 (first spawn, no wait)", () => {
    expect(restartBackoffMsForAttempt(policy, 1)).toBe(0);
  });

  it("returns the array entry for in-range attempts (2..N)", () => {
    expect(restartBackoffMsForAttempt(policy, 2)).toBe(5_000);   // index 0
    expect(restartBackoffMsForAttempt(policy, 3)).toBe(30_000);  // index 1
    expect(restartBackoffMsForAttempt(policy, 4)).toBe(120_000); // index 2
  });

  it("reuses the LAST backoff value when attempt index overruns the array", () => {
    const p: RestartPolicy = { backoffMs: [5_000, 30_000] };
    expect(restartBackoffMsForAttempt(p, 5)).toBe(30_000);
    expect(restartBackoffMsForAttempt(p, 100)).toBe(30_000);
  });

  it("returns 0 when backoffMs is empty regardless of attempt index", () => {
    const p: RestartPolicy = { backoffMs: [] };
    expect(restartBackoffMsForAttempt(p, 1)).toBe(0);
    expect(restartBackoffMsForAttempt(p, 2)).toBe(0);
  });

  it("treats non-positive attempts as 0 (defensive — caller bug should not crash)", () => {
    const p: RestartPolicy = { backoffMs: [5_000] };
    expect(restartBackoffMsForAttempt(p, 0)).toBe(0);
    expect(restartBackoffMsForAttempt(p, -1)).toBe(0);
  });
});

import { describe, it, expect } from "bun:test";
import { checkConcurrency } from "./check-concurrency";
import type { Job, OneshotJob, ServiceJob } from "../entity/job";
import type { ConcurrencyController, AcquireResult } from "../port/concurrency-controller";

function makeOneshotJob(overrides: Partial<OneshotJob> = {}): OneshotJob {
  return {
    name: "oneshot-job",
    command: ["echo", "hello"],
    notify: { onFailure: "silent" },
    schedule: { kind: "interval", seconds: 60 },
    retry: { maxAttempts: 1, backoffMs: [] },
    ...overrides,
  };
}

function makeServiceJob(overrides: Partial<ServiceJob> = {}): ServiceJob {
  return {
    name: "service-job",
    command: ["server"],
    lifecycle: "service",
    notify: { onFailure: "silent" },
    restart: { backoffMs: [1000] },
    ...overrides,
  };
}

describe("check-concurrency usecase", () => {
  it("passes through acquire result for OneshotJob", () => {
    const job: Job = makeOneshotJob({ name: "oneshot" });
    const controller: ConcurrencyController = {
      acquire: () => ({ ok: true, releaseToken: "tok-1" }),
      release: () => {},
      snapshot: () => ({ running: 0, perGroup: {} }),
    };
    const result = checkConcurrency(job, controller);
    expect(result).toEqual({ ok: true, releaseToken: "tok-1" });
  });

  it("passes through acquire result for ServiceJob", () => {
    const job: Job = makeServiceJob({ name: "svc" });
    const controller: ConcurrencyController = {
      acquire: () => ({ ok: true, releaseToken: "tok-2" }),
      release: () => {},
      snapshot: () => ({ running: 0, perGroup: {} }),
    };
    const result = checkConcurrency(job, controller);
    expect(result).toEqual({ ok: true, releaseToken: "tok-2" });
  });

  it("passes through rejected acquire", () => {
    const job: Job = makeOneshotJob({ name: "blocked" });
    const controller: ConcurrencyController = {
      acquire: () => ({ ok: false, reason: "global-cap" }),
      release: () => {},
      snapshot: () => ({ running: 0, perGroup: {} }),
    };
    const result = checkConcurrency(job, controller);
    expect(result).toEqual({ ok: false, reason: "global-cap" });
  });
});

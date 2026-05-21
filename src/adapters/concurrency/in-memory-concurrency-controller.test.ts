import { describe, it, expect, beforeEach } from "bun:test";
import { InMemoryConcurrencyController } from "./in-memory-concurrency-controller";
import type { OneshotJob } from "../../core/entity/job";
import type { GlobalConcurrencyConfig } from "../../core/entity/concurrency-policy";

function makeJob(overrides: Partial<OneshotJob> = {}): OneshotJob {
  return {
    name: "test-job",
    command: ["echo", "hello"],
    notify: { onFailure: "silent" },
    schedule: { kind: "interval", seconds: 60 },
    retry: { maxAttempts: 1, backoffMs: [] },
    ...overrides,
  };
}

function makeController(config: Partial<GlobalConcurrencyConfig> = {}): InMemoryConcurrencyController {
  const cfg: GlobalConcurrencyConfig = { maxConcurrentJobs: 4, ...config };
  return new InMemoryConcurrencyController(() => cfg);
}

describe("InMemoryConcurrencyController", () => {
  it("acquire success → snapshot shows running=1", () => {
    const ctrl = makeController();
    const job = makeJob({ name: "job-a" });
    const result = ctrl.acquire(job);
    expect(result.ok).toBe(true);
    expect(ctrl.snapshot().running).toBe(1);
  });

  it("same job with onOverlap=skip → second acquire returns reason=overlap", () => {
    const ctrl = makeController();
    const job = makeJob({ name: "job-b", concurrency: { onOverlap: "skip" } });
    const first = ctrl.acquire(job);
    expect(first.ok).toBe(true);
    const second = ctrl.acquire(job);
    expect(second).toEqual({ ok: false, reason: "overlap" });
  });

  it("global cap=2 → third acquire returns reason=global-cap", () => {
    const ctrl = makeController({ maxConcurrentJobs: 2 });
    const job1 = makeJob({ name: "job-c1" });
    const job2 = makeJob({ name: "job-c2" });
    const job3 = makeJob({ name: "job-c3" });
    expect(ctrl.acquire(job1).ok).toBe(true);
    expect(ctrl.acquire(job2).ok).toBe(true);
    const third = ctrl.acquire(job3);
    expect(third).toEqual({ ok: false, reason: "global-cap" });
  });

  it("group cap=1 → second job in same group returns reason=group-cap", () => {
    const ctrl = makeController({ maxConcurrentJobs: 4, groupMax: { gpu: 1 } });
    const job1 = makeJob({ name: "job-d1", concurrency: { onOverlap: "concurrent", group: "gpu" } });
    const job2 = makeJob({ name: "job-d2", concurrency: { onOverlap: "concurrent", group: "gpu" } });
    expect(ctrl.acquire(job1).ok).toBe(true);
    const second = ctrl.acquire(job2);
    expect(second).toEqual({ ok: false, reason: "group-cap" });
  });

  it("release decrements running counter and allows next acquire to succeed", () => {
    const ctrl = makeController({ maxConcurrentJobs: 1 });
    const job = makeJob({ name: "job-e" });
    const first = ctrl.acquire(job);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    expect(ctrl.snapshot().running).toBe(1);
    ctrl.release(first.releaseToken);
    expect(ctrl.snapshot().running).toBe(0);
    const second = ctrl.acquire(job);
    expect(second.ok).toBe(true);
  });

  it("different groups count independently", () => {
    const ctrl = makeController({ maxConcurrentJobs: 4, groupMax: { gpu: 1, net: 1 } });
    const jobGpu = makeJob({ name: "job-gpu", concurrency: { onOverlap: "concurrent", group: "gpu" } });
    const jobNet = makeJob({ name: "job-net", concurrency: { onOverlap: "concurrent", group: "net" } });
    expect(ctrl.acquire(jobGpu).ok).toBe(true);
    expect(ctrl.acquire(jobNet).ok).toBe(true);
    const snap = ctrl.snapshot();
    expect(snap.running).toBe(2);
    expect(snap.perGroup).toEqual({ gpu: 1, net: 1 });
  });

  it("onOverlap=concurrent allows two instances of the same job to run", () => {
    const ctrl = makeController();
    const job = makeJob({ name: "job-f", concurrency: { onOverlap: "concurrent" } });
    const first = ctrl.acquire(job);
    expect(first.ok).toBe(true);
    const second = ctrl.acquire(job);
    expect(second.ok).toBe(true);
    expect(ctrl.snapshot().running).toBe(2);
  });
});

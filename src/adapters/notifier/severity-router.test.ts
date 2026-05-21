import { describe, it, expect } from "bun:test";
import { SeverityRouter } from "./severity-router";
import type { Notifier, Severity } from "../../core/port/notifier";
import type { Job } from "../../core/entity/job";
import type { JobRun } from "../../core/entity/job-run";

type NotifyInput = { job: Job; run: JobRun; severity: Severity };

function makeNotifier(): { notifier: Notifier; calls: NotifyInput[] } {
  const calls: NotifyInput[] = [];
  const notifier: Notifier = {
    notify: async (input) => {
      calls.push(input);
    },
  };
  return { notifier, calls };
}

function makeJob(overrides: Partial<Job["notify"]> = {}): Job {
  return {
    name: "test-job",
    command: ["echo", "hi"],
    notify: { onFailure: "silent", ...overrides },
    schedule: { kind: "interval", seconds: 60 },
    retry: { maxAttempts: 1, backoffMs: [] },
  } as Job;
}

function makeRun(state: JobRun["state"], overrides: Partial<JobRun> = {}): JobRun {
  return {
    jobId: "test-job",
    runId: "run-1",
    attempt: 1,
    startedAt: 1_000_000,
    finishedAt: 1_001_000,
    exitCode: state === "succeeded" ? 0 : 1,
    stdout: "",
    stderr: "",
    state,
    ...overrides,
  };
}

describe("SeverityRouter", () => {
  it("onFailure=immediate + state=failed → gchat called with severity=error", async () => {
    const gchat = makeNotifier();
    const digest = makeNotifier();
    const router = new SeverityRouter({ warnDigestFile: digest.notifier, gchatWebhook: gchat.notifier });

    const job = makeJob({ onFailure: "immediate" });
    const run = makeRun("failed");
    await router.notify({ job, run, severity: "error" });

    expect(gchat.calls).toHaveLength(1);
    expect(gchat.calls[0]!.severity).toBe("error");
    expect(digest.calls).toHaveLength(0);
  });

  it("onFailure=digest + state=failed → warn-digest called with severity=warn", async () => {
    const gchat = makeNotifier();
    const digest = makeNotifier();
    const router = new SeverityRouter({ warnDigestFile: digest.notifier, gchatWebhook: gchat.notifier });

    const job = makeJob({ onFailure: "digest" });
    const run = makeRun("failed");
    await router.notify({ job, run, severity: "error" });

    expect(digest.calls).toHaveLength(1);
    expect(digest.calls[0]!.severity).toBe("warn");
    expect(gchat.calls).toHaveLength(0);
  });

  it("onFailure=silent + state=failed → no-op", async () => {
    const gchat = makeNotifier();
    const digest = makeNotifier();
    const router = new SeverityRouter({ warnDigestFile: digest.notifier, gchatWebhook: gchat.notifier });

    const job = makeJob({ onFailure: "silent" });
    const run = makeRun("failed");
    await router.notify({ job, run, severity: "error" });

    expect(gchat.calls).toHaveLength(0);
    expect(digest.calls).toHaveLength(0);
  });

  it("onSuccess=immediate + state=succeeded → gchat called", async () => {
    const gchat = makeNotifier();
    const digest = makeNotifier();
    const router = new SeverityRouter({ warnDigestFile: digest.notifier, gchatWebhook: gchat.notifier });

    const job = makeJob({ onFailure: "silent", onSuccess: "immediate" });
    const run = makeRun("succeeded");
    await router.notify({ job, run, severity: "info" });

    expect(gchat.calls).toHaveLength(1);
    expect(digest.calls).toHaveLength(0);
  });

  it("onSuccess=undefined + state=succeeded → no-op (silent default)", async () => {
    const gchat = makeNotifier();
    const digest = makeNotifier();
    const router = new SeverityRouter({ warnDigestFile: digest.notifier, gchatWebhook: gchat.notifier });

    const job = makeJob({ onFailure: "silent" }); // onSuccess not set
    const run = makeRun("succeeded");
    await router.notify({ job, run, severity: "info" });

    expect(gchat.calls).toHaveLength(0);
    expect(digest.calls).toHaveLength(0);
  });

  it("onSuccess=silent + state=succeeded → no-op", async () => {
    const gchat = makeNotifier();
    const digest = makeNotifier();
    const router = new SeverityRouter({ warnDigestFile: digest.notifier, gchatWebhook: gchat.notifier });

    const job = makeJob({ onFailure: "silent", onSuccess: "silent" });
    const run = makeRun("succeeded");
    await router.notify({ job, run, severity: "info" });

    expect(gchat.calls).toHaveLength(0);
    expect(digest.calls).toHaveLength(0);
  });
});

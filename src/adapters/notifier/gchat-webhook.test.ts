import { describe, it, expect } from "bun:test";
import { GChatWebhookNotifier } from "./gchat-webhook";
import type { Job } from "../../core/entity/job";
import type { JobRun } from "../../core/entity/job-run";

function makeJob(overrides: Partial<Job["notify"]> = {}): Job {
  return {
    name: "test-job",
    command: ["echo", "hi"],
    notify: { onFailure: "immediate", ...overrides },
    schedule: { kind: "interval", seconds: 60 },
    retry: { maxAttempts: 1, backoffMs: [] },
  } as Job;
}

function makeRun(): JobRun {
  return {
    jobId: "test-job",
    runId: "run-1",
    attempt: 1,
    startedAt: 1_000_000,
    finishedAt: 1_001_000,
    exitCode: 1,
    stdout: "",
    stderr: "",
    state: "failed",
  };
}

function makeFetch(): { fetchFn: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchFn = (async (url: unknown) => {
    urls.push(String(url));
    return new Response("ok");
  }) as typeof fetch;
  return { fetchFn, urls };
}

describe("GChatWebhookNotifier webhookEnv override", () => {
  it("webhookEnv 未指定 → default webhook に POST", async () => {
    const { fetchFn, urls } = makeFetch();
    const notifier = new GChatWebhookNotifier("https://default.example/hook", fetchFn, {});
    await notifier.notify({ job: makeJob(), run: makeRun(), severity: "error" });
    expect(urls).toEqual(["https://default.example/hook"]);
  });

  it("webhookEnv 指定 + env 非空 → override webhook に POST", async () => {
    const { fetchFn, urls } = makeFetch();
    const env = { GCHAT_WEBHOOK_EATREEL: "https://override.example/hook" };
    const notifier = new GChatWebhookNotifier("https://default.example/hook", fetchFn, env);
    const job = makeJob({ webhookEnv: "GCHAT_WEBHOOK_EATREEL" });
    await notifier.notify({ job, run: makeRun(), severity: "error" });
    expect(urls).toEqual(["https://override.example/hook"]);
  });

  it("webhookEnv 指定 + env 未設定 → default webhook に fallback", async () => {
    const { fetchFn, urls } = makeFetch();
    const notifier = new GChatWebhookNotifier("https://default.example/hook", fetchFn, {});
    const job = makeJob({ webhookEnv: "GCHAT_WEBHOOK_EATREEL" });
    await notifier.notify({ job, run: makeRun(), severity: "error" });
    expect(urls).toEqual(["https://default.example/hook"]);
  });

  it("webhookEnv 指定 + env 空文字 → default webhook に fallback", async () => {
    const { fetchFn, urls } = makeFetch();
    const env = { GCHAT_WEBHOOK_EATREEL: "" };
    const notifier = new GChatWebhookNotifier("https://default.example/hook", fetchFn, env);
    const job = makeJob({ webhookEnv: "GCHAT_WEBHOOK_EATREEL" });
    await notifier.notify({ job, run: makeRun(), severity: "error" });
    expect(urls).toEqual(["https://default.example/hook"]);
  });

  it("webhookEnv env 非空 + default 空 → override に POST (default 未設定でも per-job は生きる)", async () => {
    const { fetchFn, urls } = makeFetch();
    const env = { GCHAT_WEBHOOK_EATREEL: "https://override.example/hook" };
    const notifier = new GChatWebhookNotifier("", fetchFn, env);
    const job = makeJob({ webhookEnv: "GCHAT_WEBHOOK_EATREEL" });
    await notifier.notify({ job, run: makeRun(), severity: "error" });
    expect(urls).toEqual(["https://override.example/hook"]);
  });

  it("webhookEnv 未指定 + default 空 → silent no-op", async () => {
    const { fetchFn, urls } = makeFetch();
    const notifier = new GChatWebhookNotifier("", fetchFn, {});
    await notifier.notify({ job: makeJob(), run: makeRun(), severity: "error" });
    expect(urls).toEqual([]);
  });
});

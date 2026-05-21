import { describe, it, expect } from "bun:test";
import { runJob, type RunJobDeps, type RunJobOutcome } from "./run-job";
import type { OneshotJob } from "../entity/job";
import type { Clock } from "../port/clock";
import type { Executor, ExecResult } from "../port/executor";
import type { RunStore } from "../port/run-store";

function makeClock(): Clock {
  let t = 0;
  return { now: () => (t += 100) };
}

function makeOneshotJob(overrides: Partial<OneshotJob> = {}): OneshotJob {
  return {
    name: "test-job",
    command: ["echo", "hello"],
    notify: { onFailure: "silent" },
    schedule: { kind: "interval", seconds: 60 },
    retry: { maxAttempts: 1, backoffMs: [] },
    ...overrides,
  };
}

function makeExecutor(result: Partial<ExecResult> = {}): Executor {
  return {
    run: async () => ({
      exitCode: result.exitCode ?? 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      killed: result.killed ?? false,
    }),
  };
}

function makeRunStore(): RunStore {
  let runId = "run-1";
  return {
    insert: async () => runId,
    setState: async () => {},
    recent: async () => [],
    latestSucceeded: async () => null,
    runningRuns: async () => [],
  };
}

describe("run-job usecase", () => {
  it("succeeds when exitCode is 0", async () => {
    const job = makeOneshotJob({ name: "alpha" });
    const deps: RunJobDeps = {
      executor: makeExecutor({ exitCode: 0, stdout: "ok" }),
      runStore: makeRunStore(),
      clock: makeClock(),
      sleep: async () => {},
    };
    const result = await runJob(job, deps);
    expect(result.finalAttempt).toBe(1);
    expect(result.finalExit.exitCode).toBe(0);
    expect(result.finalFailure).toBe(false);
  });

  it("fails when exitCode is non-zero", async () => {
    const job = makeOneshotJob({ name: "beta" });
    const deps: RunJobDeps = {
      executor: makeExecutor({ exitCode: 1, stderr: "error" }),
      runStore: makeRunStore(),
      clock: makeClock(),
      sleep: async () => {},
    };
    const result = await runJob(job, deps);
    expect(result.finalAttempt).toBe(1);
    expect(result.finalExit.exitCode).toBe(1);
    expect(result.finalFailure).toBe(true);
  });

  it("calls runStore.insert and runStore.setState", async () => {
    const insertCalls: unknown[] = [];
    const setStateCalls: unknown[] = [];
    const store: RunStore = {
      insert: async (input) => {
        insertCalls.push(input);
        return "run-abc";
      },
      setState: async (runId, patch) => {
        setStateCalls.push({ runId, patch });
      },
      recent: async () => [],
      latestSucceeded: async () => null,
      runningRuns: async () => [],
    };
    const job = makeOneshotJob({ name: "gamma", command: ["ls"] });
    const deps: RunJobDeps = {
      executor: makeExecutor({ exitCode: 0, stdout: "files" }),
      runStore: store,
      clock: makeClock(),
      sleep: async () => {},
    };
    await runJob(job, deps);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({
      jobId: "gamma",
      attempt: 1,
      state: "running",
    });
    expect(setStateCalls).toHaveLength(1);
    expect(setStateCalls[0]).toMatchObject({
      runId: "run-abc",
      patch: { state: "succeeded", exitCode: 0 },
    });
  });
});

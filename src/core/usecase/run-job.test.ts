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
  let count = 0;
  return {
    insert: async () => `run-${++count}`,
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

  it("retries until success on 3rd attempt", async () => {
    const job = makeOneshotJob({ retry: { maxAttempts: 3, backoffMs: [] } });
    let callCount = 0;
    const executor: Executor = {
      run: async () => ({
        exitCode: ++callCount < 3 ? 1 : 0,
        stdout: "",
        stderr: "",
        killed: false,
      }),
    };
    const deps: RunJobDeps = {
      executor,
      runStore: makeRunStore(),
      clock: makeClock(),
      sleep: async () => {},
    };
    const result = await runJob(job, deps);
    expect(result.finalAttempt).toBe(3);
    expect(result.finalFailure).toBe(false);
    expect(result.runIds.length).toBe(3);
  });

  it("exhausts all attempts and returns finalFailure=true", async () => {
    const job = makeOneshotJob({ retry: { maxAttempts: 3, backoffMs: [] } });
    const deps: RunJobDeps = {
      executor: makeExecutor({ exitCode: 1 }),
      runStore: makeRunStore(),
      clock: makeClock(),
      sleep: async () => {},
    };
    const result = await runJob(job, deps);
    expect(result.finalAttempt).toBe(3);
    expect(result.finalFailure).toBe(true);
    expect(result.runIds.length).toBe(3);
  });

  it("returns failure immediately when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const job = makeOneshotJob({ retry: { maxAttempts: 3, backoffMs: [] } });
    const deps: RunJobDeps = {
      executor: makeExecutor({ exitCode: 0 }),
      runStore: makeRunStore(),
      clock: makeClock(),
      sleep: async () => {},
    };
    const result = await runJob(job, deps, controller.signal);
    expect(result.finalFailure).toBe(true);
    expect(result.runIds.length).toBe(0);
  });

  it("stops retrying when signal is aborted between attempts", async () => {
    const controller = new AbortController();
    const job = makeOneshotJob({ retry: { maxAttempts: 3, backoffMs: [100] } });
    const executor: Executor = {
      run: async () => ({ exitCode: 1, stdout: "", stderr: "", killed: false }),
    };
    const deps: RunJobDeps = {
      executor,
      runStore: makeRunStore(),
      clock: makeClock(),
      // abort during the first sleep (between attempt 1 and 2)
      sleep: async (_ms, _signal) => {
        controller.abort();
      },
    };
    const result = await runJob(job, deps, controller.signal);
    expect(result.finalFailure).toBe(true);
    // attempt 1 completed, abort detected at top of attempt 2
    expect(result.runIds.length).toBe(1);
    expect(result.finalAttempt).toBe(1);
  });

  it("calls sleep with correct backoffMs between attempts", async () => {
    const sleepCalls: number[] = [];
    const job = makeOneshotJob({ retry: { maxAttempts: 3, backoffMs: [100, 200] } });
    let callCount = 0;
    const executor: Executor = {
      run: async () => ({
        exitCode: ++callCount < 3 ? 1 : 0,
        stdout: "",
        stderr: "",
        killed: false,
      }),
    };
    const deps: RunJobDeps = {
      executor,
      runStore: makeRunStore(),
      clock: makeClock(),
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
    };
    await runJob(job, deps);
    // sleep called after attempt 1 (backoffMs[0]=100) and after attempt 2 (backoffMs[1]=200)
    expect(sleepCalls).toEqual([100, 200]);
  });
});

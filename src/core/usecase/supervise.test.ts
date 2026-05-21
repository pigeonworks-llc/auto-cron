import { describe, it, expect } from "bun:test";
import { supervise } from "./supervise";
import type { ServiceJob } from "../entity/job";
import type { Clock } from "../port/clock";
import type { Executor, ExecResult } from "../port/executor";
import type { RunStore } from "../port/run-store";

function fakeClock(initial: number): Clock {
  let t = initial;
  return { now: () => t };
}

function steppingClock(): Clock {
  let t = 0;
  return { now: () => (t += 100) };
}

function fakeExecutor(results: Array<Partial<ExecResult>>): Executor {
  let i = 0;
  return {
    run: async () => {
      const r = results[i] ?? { exitCode: 0, killed: true };
      i++;
      return {
        exitCode: r.exitCode ?? 0,
        stdout: r.stdout ?? "",
        stderr: r.stderr ?? "",
        killed: r.killed ?? false,
      };
    },
  };
}

function fakeRunStore(): RunStore {
  return {
    insert: async () => "run-id",
    setState: async () => {},
    recent: async () => [],
    latestSucceeded: async () => null,
    runningRuns: async () => [],
  };
}

const serviceJob: ServiceJob = {
  name: "svc",
  lifecycle: "service",
  command: ["server"],
  restart: { backoffMs: [10] }, // small backoff for tests
  notify: { onFailure: "silent", onSuccess: "silent" },
};

describe("supervise", () => {
  it("returns 'killed' when executor kills process on first run", async () => {
    const result = await supervise(
      serviceJob,
      {
        executor: fakeExecutor([{ exitCode: 0, killed: true }]),
        runStore: fakeRunStore(),
        clock: steppingClock(),
        sleep: async () => {},
      },
    );
    expect(result.reason).toBe("killed");
    expect(result.totalRestarts).toBe(0);
  });

  it("returns 'aborted' when signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const result = await supervise(
      serviceJob,
      {
        executor: fakeExecutor([{ exitCode: 0 }]),
        runStore: fakeRunStore(),
        clock: steppingClock(),
        sleep: async () => {},
      },
      ac.signal,
    );
    expect(result.reason).toBe("aborted");
    expect(result.totalRestarts).toBe(0);
  });

  it("crashes once then restarts", async () => {
    // First run: crash (exitCode=1), second run: killed (stop loop)
    const result = await supervise(
      serviceJob,
      {
        executor: fakeExecutor([
          { exitCode: 1, killed: false },
          { exitCode: 0, killed: true },
        ]),
        runStore: fakeRunStore(),
        clock: steppingClock(),
        sleep: async () => {},
      },
    );
    expect(result.reason).toBe("killed");
    expect(result.totalRestarts).toBe(1);
  });

  it("reaches max-restarts and stops", async () => {
    // maxRestarts=2 means: initial run + 2 restarts = 3 crashes total before giving up
    const job: ServiceJob = {
      ...serviceJob,
      restart: { backoffMs: [10], maxRestarts: 2 },
    };
    const result = await supervise(
      job,
      {
        executor: fakeExecutor([
          { exitCode: 1, killed: false },
          { exitCode: 1, killed: false },
          { exitCode: 1, killed: false },
        ]),
        runStore: fakeRunStore(),
        clock: steppingClock(),
        sleep: async () => {},
      },
    );
    expect(result.reason).toBe("max-restarts");
    expect(result.totalRestarts).toBe(2);
  });

  it("resets consecutive counter when healthy run exceeds resetAfterSec", async () => {
    // We simulate 2 runs: both healthy (> 60s alive) so consecutiveFailures stays 0.
    // After 2 runs, sleep triggers an abort to stop the loop.
    let t = 0;
    const clock: Clock = {
      now: () => {
        const r = t;
        t += 120_000; // each run lasts > resetAfterSec (60s)
        return r;
      },
    };
    const ac = new AbortController();
    let runCount = 0;
    const result = await supervise(
      { ...serviceJob, restart: { backoffMs: [10], resetAfterSec: 60 } },
      {
        executor: {
          run: async () => ({ exitCode: 0, stdout: "", stderr: "", killed: false }),
        },
        runStore: fakeRunStore(),
        clock,
        sleep: async () => {
          runCount++;
          if (runCount >= 2) {
            ac.abort();
          }
        },
      },
      ac.signal,
    );
    expect(result.reason).toBe("aborted");
  });
});

import { describe, it, expect } from "bun:test";
import { cascadeFailure, type CascadeFailureInput } from "./cascade-failure";
import type { OneshotJob } from "../entity/job";
import type { Clock } from "../port/clock";
import type { RunStore } from "../port/run-store";

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

describe("cascade-failure usecase", () => {
  it("returns empty when no jobs depend on the failed job", async () => {
    const clock: Clock = { now: () => 1000 };
    const store: RunStore = {
      insert: async () => "r1",
      setState: async () => {},
      recent: async () => [],
      latestSucceeded: async () => null,
      runningRuns: async () => [],
    };
    const result = await cascadeFailure({
      failedJobName: "alpha",
      allJobs: [
        makeOneshotJob({ name: "alpha" }),
        makeOneshotJob({ name: "beta" }),
      ],
      runStore: store,
      clock,
    });
    expect(result.blockedJobNames).toEqual([]);
  });

  it("blocks direct dependents (1 level)", async () => {
    const store: RunStore = {
      insert: async () => "r2",
      setState: async () => {},
      recent: async () => [],
      latestSucceeded: async () => null,
      runningRuns: async () => [],
    };
    const result = await cascadeFailure({
      failedJobName: "parent",
      allJobs: [
        makeOneshotJob({ name: "parent" }),
        makeOneshotJob({ name: "child", dependsOn: ["parent"] }),
      ],
      runStore: store,
      clock: { now: () => 500 },
    });
    expect(result.blockedJobNames).toEqual(["child"]);
  });

  it("blocks transitive dependents (2 levels)", async () => {
    const insertCalls: unknown[] = [];
    const store: RunStore = {
      insert: async (input) => {
        insertCalls.push(input);
        return "r";
      },
      setState: async () => {},
      recent: async () => [],
      latestSucceeded: async () => null,
      runningRuns: async () => [],
    };
    const result = await cascadeFailure({
      failedJobName: "root",
      allJobs: [
        makeOneshotJob({ name: "root" }),
        makeOneshotJob({ name: "mid", dependsOn: ["root"] }),
        makeOneshotJob({ name: "leaf", dependsOn: ["mid"] }),
      ],
      runStore: store,
      clock: { now: () => 1000 },
    });
    expect(result.blockedJobNames).toEqual(["mid", "leaf"]);
    expect(insertCalls).toHaveLength(2);
  });

  it("prevents infinite cycles (self-referencing dep)", async () => {
    const store: RunStore = {
      insert: async () => "r",
      setState: async () => {},
      recent: async () => [],
      latestSucceeded: async () => null,
      runningRuns: async () => [],
    };
    const result = await cascadeFailure({
      failedJobName: "a",
      allJobs: [
        makeOneshotJob({ name: "a", dependsOn: ["a"] }),
      ],
      runStore: store,
      clock: { now: () => 0 },
    });
    // a dependsOn [a] but a is the failedJob → visited from start → not re-processed
    expect(result.blockedJobNames).toEqual([]);
  });
});

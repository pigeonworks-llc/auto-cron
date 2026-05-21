import { describe, it, expect } from "bun:test";
import type {
  ConcurrencyPolicy,
  GlobalConcurrencyConfig,
} from "./concurrency-policy";

describe("ConcurrencyPolicy entity", () => {
  it("accepts onOverlap=skip without optional fields", () => {
    const p: ConcurrencyPolicy = { onOverlap: "skip" };
    expect(p.onOverlap).toBe("skip");
    expect(p.group).toBeUndefined();
    expect(p.queueDepth).toBeUndefined();
  });

  it("accepts onOverlap=queue without optional fields", () => {
    const p: ConcurrencyPolicy = { onOverlap: "queue" };
    expect(p.onOverlap).toBe("queue");
    expect(p.group).toBeUndefined();
    expect(p.queueDepth).toBeUndefined();
  });

  it("accepts onOverlap=killPrevious without optional fields", () => {
    const p: ConcurrencyPolicy = { onOverlap: "killPrevious" };
    expect(p.onOverlap).toBe("killPrevious");
  });

  it("accepts onOverlap=concurrent without optional fields", () => {
    const p: ConcurrencyPolicy = { onOverlap: "concurrent" };
    expect(p.onOverlap).toBe("concurrent");
  });

  it("accepts optional group field", () => {
    const p: ConcurrencyPolicy = { onOverlap: "skip", group: "gpu" };
    expect(p.group).toBe("gpu");
  });

  it("accepts optional queueDepth field", () => {
    const p: ConcurrencyPolicy = { onOverlap: "queue", queueDepth: 3 };
    expect(p.queueDepth).toBe(3);
  });

  it("accepts all optional fields together", () => {
    const p: ConcurrencyPolicy = {
      onOverlap: "queue",
      group: "data-export",
      queueDepth: 5,
    };
    expect(p.onOverlap).toBe("queue");
    expect(p.group).toBe("data-export");
    expect(p.queueDepth).toBe(5);
  });

  it("exhaustive switch narrowing over all 4 onOverlap values", () => {
    const values: ConcurrencyPolicy["onOverlap"][] = [
      "skip",
      "queue",
      "killPrevious",
      "concurrent",
    ];
    for (const v of values) {
      const p: ConcurrencyPolicy = { onOverlap: v };
      // exhaustive switch — every variant produces the expected string
      switch (p.onOverlap) {
        case "skip":
          expect(p.onOverlap).toBe("skip");
          break;
        case "queue":
          expect(p.onOverlap).toBe("queue");
          break;
        case "killPrevious":
          expect(p.onOverlap).toBe("killPrevious");
          break;
        case "concurrent":
          expect(p.onOverlap).toBe("concurrent");
          break;
        default:
          // TypeScript should prove this is unreachable
          const _exhaustive: never = p.onOverlap;
          throw new Error(`unhandled onOverlap variant: ${_exhaustive}`);
      }
    }
  });

  it("rejects invalid onOverlap values at runtime", () => {
    function isValidOnOverlap(v: string): v is ConcurrencyPolicy["onOverlap"] {
      return ["skip", "queue", "killPrevious", "concurrent"].includes(v);
    }
    expect(isValidOnOverlap("skip")).toBe(true);
    expect(isValidOnOverlap("queue")).toBe(true);
    expect(isValidOnOverlap("killPrevious")).toBe(true);
    expect(isValidOnOverlap("concurrent")).toBe(true);
    expect(isValidOnOverlap("parallel")).toBe(false);
    expect(isValidOnOverlap("")).toBe(false);
  });
});

describe("GlobalConcurrencyConfig entity", () => {
  it("accepts maxConcurrentJobs only", () => {
    const c: GlobalConcurrencyConfig = { maxConcurrentJobs: 4 };
    expect(c.maxConcurrentJobs).toBe(4);
    expect(c.groupMax).toBeUndefined();
  });

  it("accepts maxConcurrentJobs with optional groupMax", () => {
    const c: GlobalConcurrencyConfig = {
      maxConcurrentJobs: 8,
      groupMax: { gpu: 1, "network-scan": 2 },
    };
    expect(c.maxConcurrentJobs).toBe(8);
    expect(c.groupMax!.gpu).toBe(1);
    expect(c.groupMax!["network-scan"]).toBe(2);
  });
});

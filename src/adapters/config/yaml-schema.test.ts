import { describe, it, expect } from "bun:test";
import { validateYamlJobsFile } from "./yaml-schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validOneshotRaw() {
  return {
    name: "backup-db",
    command: ["pg_dump", "all"],
    notify: { onFailure: "immediate", onSuccess: "silent" },
    schedule: { kind: "cron", expr: "0 18 * * *", timezone: "Asia/Tokyo" },
    retry: { maxAttempts: 3, backoffMs: [60_000, 300_000] },
    env: { FOO: "bar" },
    concurrency: { onOverlap: "skip", group: "db", queueDepth: 1 },
    dependsOn: ["prev-step"],
    catchUpOnWake: true,
    dependsWithinHours: 48,
  };
}

function validServiceRaw() {
  return {
    name: "dashboard-server",
    command: ["bun", "run", "daemon.ts"],
    lifecycle: "service",
    notify: { onFailure: "digest" },
    restart: { backoffMs: [5_000, 30_000], maxRestarts: 10, resetAfterSec: 60 },
  };
}

// ---------------------------------------------------------------------------
// Valid OneshotJob
// ---------------------------------------------------------------------------

describe("validateYamlJobsFile — valid OneshotJob", () => {
  it("accepts a fully-populated OneshotJob (cron schedule)", () => {
    const result = validateYamlJobsFile({ jobs: [validOneshotRaw()] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const job = result.value.jobs[0];
    expect(job).toBeDefined();
    if (!job) return;

    expect(job.name).toBe("backup-db");
    expect(job.command).toEqual(["pg_dump", "all"]);
    expect(job.notify).toEqual({ onFailure: "immediate", onSuccess: "silent" });
    expect(job.concurrency).toEqual({ onOverlap: "skip", group: "db", queueDepth: 1 });
    expect(job.env).toEqual({ FOO: "bar" });

    // lifecycle omitted → OneshotJob
    if ("schedule" in job) {
      expect(job.schedule).toEqual({
        kind: "cron",
        expr: "0 18 * * *",
        timezone: "Asia/Tokyo",
      });
      expect(job.retry).toEqual({ maxAttempts: 3, backoffMs: [60_000, 300_000] });
      expect(job.dependsOn).toEqual(["prev-step"]);
      expect(job.catchUpOnWake).toBe(true);
      expect(job.dependsWithinHours).toBe(48);
    } else {
      throw new Error("Expected OneshotJob with schedule");
    }
  });

  it("accepts OneshotJob with lifecycle='oneshot' explicit", () => {
    const raw = { ...validOneshotRaw(), lifecycle: "oneshot" };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const job = result.value.jobs[0];
    expect(job?.lifecycle).toBe("oneshot");
  });

  it("accepts OneshotJob with interval schedule", () => {
    const raw = {
      ...validOneshotRaw(),
      schedule: { kind: "interval", seconds: 300 },
    };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(true);
  });

  it("accepts OneshotJob with manual schedule", () => {
    const raw = {
      ...validOneshotRaw(),
      schedule: { kind: "manual" },
    };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(true);
  });

  it("accepts OneshotJob with empty backoffMs (no retry delay)", () => {
    const raw = { ...validOneshotRaw(), retry: { maxAttempts: 1, backoffMs: [] } };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(true);
  });

  it("accepts OneshotJob without optional fields", () => {
    const raw = {
      name: "minimal-job",
      command: ["echo", "hi"],
      notify: { onFailure: "silent" },
      schedule: { kind: "manual" },
      retry: { maxAttempts: 1, backoffMs: [] },
    };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const job = result.value.jobs[0];
    expect(job?.name).toBe("minimal-job");
  });
});

// ---------------------------------------------------------------------------
// Valid ServiceJob
// ---------------------------------------------------------------------------

describe("validateYamlJobsFile — valid ServiceJob", () => {
  it("accepts a fully-populated ServiceJob", () => {
    const result = validateYamlJobsFile({ jobs: [validServiceRaw()] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const job = result.value.jobs[0];
    expect(job).toBeDefined();
    if (!job) return;

    expect(job.name).toBe("dashboard-server");
    expect(job.lifecycle).toBe("service");
    if ("restart" in job) {
      expect(job.restart.backoffMs).toEqual([5_000, 30_000]);
      expect(job.restart.maxRestarts).toBe(10);
      expect(job.restart.resetAfterSec).toBe(60);
    } else {
      throw new Error("Expected ServiceJob with restart");
    }
  });

  it("accepts ServiceJob with minimal restart (empty backoffMs)", () => {
    const raw = {
      name: "svc",
      command: ["sleep", "inf"],
      lifecycle: "service",
      notify: { onFailure: "silent" },
      restart: { backoffMs: [] },
    };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unknown fields — silently ignored
// ---------------------------------------------------------------------------

describe("validateYamlJobsFile — unknown fields are ignored", () => {
  it("ignores unknown top-level job fields", () => {
    const raw = {
      ...validOneshotRaw(),
      unknownField: "some-value",
      anotherExtra: 42,
    };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(true);
  });

  it("ignores unknown fields inside global", () => {
    const result = validateYamlJobsFile({
      global: { maxConcurrentJobs: 4, extraKey: "ignored" },
      jobs: [],
    });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invalid: jobs not an array
// ---------------------------------------------------------------------------

describe("validateYamlJobsFile — invalid: jobs not array", () => {
  it("returns error when jobs is a string", () => {
    const result = validateYamlJobsFile({ jobs: "not-an-array" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.path === "$.jobs")).toBe(true);
  });

  it("returns error when jobs is missing", () => {
    const result = validateYamlJobsFile({});
    expect(result.ok).toBe(false);
  });

  it("returns error when jobs is an object (not array)", () => {
    const result = validateYamlJobsFile({ jobs: {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.path === "$.jobs")).toBe(true);
  });

  it("returns root error when parsed is not an object", () => {
    const result = validateYamlJobsFile("string-root");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.path).toBe("$");
  });

  it("returns root error when parsed is null", () => {
    const result = validateYamlJobsFile(null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.path).toBe("$");
  });
});

// ---------------------------------------------------------------------------
// Invalid: lifecycle=service but restart missing
// ---------------------------------------------------------------------------

describe("validateYamlJobsFile — invalid: service job without restart", () => {
  it("returns error at restart path when lifecycle=service but restart absent", () => {
    const raw = {
      name: "svc",
      command: ["sleep", "inf"],
      lifecycle: "service",
      notify: { onFailure: "silent" },
      // restart intentionally omitted
    };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) => e.path.includes("restart")),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invalid: OneshotJob missing required fields
// ---------------------------------------------------------------------------

describe("validateYamlJobsFile — invalid: oneshot missing schedule/retry", () => {
  it("returns errors for missing schedule and retry", () => {
    const raw = {
      name: "job",
      command: ["echo"],
      notify: { onFailure: "silent" },
      // schedule and retry both missing
    };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const paths = result.errors.map((e) => e.path);
    expect(paths.some((p) => p.includes("schedule"))).toBe(true);
    expect(paths.some((p) => p.includes("retry"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multi-error aggregation
// ---------------------------------------------------------------------------

describe("validateYamlJobsFile — multi-error aggregation", () => {
  it("collects errors from multiple invalid jobs", () => {
    const raw1 = {
      name: "bad-service",
      command: ["sleep", "inf"],
      lifecycle: "service",
      notify: { onFailure: "silent" },
      // restart missing
    };
    const raw2 = {
      // name missing
      command: ["echo"],
      notify: { onFailure: "silent" },
      // schedule and retry missing
    };
    const result = validateYamlJobsFile({ jobs: [raw1, raw2] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Errors from job[0]: restart missing
    // Errors from job[1]: name, schedule, retry missing
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
    const paths = result.errors.map((e) => e.path);
    expect(paths.some((p) => p.startsWith("$.jobs[0]"))).toBe(true);
    expect(paths.some((p) => p.startsWith("$.jobs[1]"))).toBe(true);
  });

  it("collects multiple field errors within a single job", () => {
    const raw = {
      name: "bad-job",
      command: "not-an-array", // wrong type
      notify: { onFailure: "bad-value" }, // wrong enum
      schedule: { kind: "cron" }, // missing expr
      retry: { maxAttempts: 0, backoffMs: [] }, // maxAttempts < 1
    };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Global option validation
// ---------------------------------------------------------------------------

describe("validateYamlJobsFile — global option", () => {
  it("accepts file without global (global is optional)", () => {
    const result = validateYamlJobsFile({ jobs: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.global).toBeUndefined();
  });

  it("accepts valid global with maxConcurrentJobs", () => {
    const result = validateYamlJobsFile({
      global: { maxConcurrentJobs: 8 },
      jobs: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.global?.maxConcurrentJobs).toBe(8);
  });

  it("accepts global with groupMax", () => {
    const result = validateYamlJobsFile({
      global: { maxConcurrentJobs: 4, groupMax: { gpu: 1, net: 2 } },
      jobs: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.global?.groupMax).toEqual({ gpu: 1, net: 2 });
  });

  it("rejects maxConcurrentJobs = 0", () => {
    const result = validateYamlJobsFile({
      global: { maxConcurrentJobs: 0 },
      jobs: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) => e.path === "$.global.maxConcurrentJobs"),
    ).toBe(true);
  });

  it("rejects maxConcurrentJobs = -1", () => {
    const result = validateYamlJobsFile({
      global: { maxConcurrentJobs: -1 },
      jobs: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) => e.path === "$.global.maxConcurrentJobs"),
    ).toBe(true);
  });

  it("rejects global that is not an object", () => {
    const result = validateYamlJobsFile({
      global: "bad",
      jobs: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.path === "$.global")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("validateYamlJobsFile — edge cases", () => {
  it("accepts empty jobs array", () => {
    const result = validateYamlJobsFile({ jobs: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.jobs).toHaveLength(0);
  });

  it("accepts multiple valid jobs of mixed kinds", () => {
    const result = validateYamlJobsFile({
      jobs: [validOneshotRaw(), validServiceRaw()],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.jobs).toHaveLength(2);
  });

  it("rejects invalid lifecycle value", () => {
    const raw = {
      ...validOneshotRaw(),
      lifecycle: "daemon", // unknown value
    };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// notify.severity_routing (ADR-0088)
// ---------------------------------------------------------------------------

describe("validateYamlJobsFile — notify.severity_routing", () => {
  it("accepts severity_routing with warn + crit (full)", () => {
    const raw = {
      ...validOneshotRaw(),
      notify: {
        onFailure: "digest",
        severity_routing: { warn: "digest", crit: "immediate" },
      },
    };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const job = result.value.jobs[0];
    if (!job) return;
    expect(job.notify.severity_routing).toEqual({
      warn: "digest",
      crit: "immediate",
    });
  });

  it("accepts severity_routing with only crit (partial)", () => {
    const raw = {
      ...validOneshotRaw(),
      notify: {
        onFailure: "digest",
        severity_routing: { crit: "immediate" },
      },
    };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(true);
  });

  it("accepts notify without severity_routing (optional)", () => {
    const raw = {
      ...validOneshotRaw(),
      notify: { onFailure: "digest" },
    };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const job = result.value.jobs[0];
    if (!job) return;
    expect(job.notify.severity_routing).toBeUndefined();
  });

  it("rejects severity_routing with invalid dispatch value", () => {
    const raw = {
      ...validOneshotRaw(),
      notify: {
        onFailure: "digest",
        severity_routing: { warn: "shout" },
      },
    };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) =>
        e.path.endsWith("notify.severity_routing.warn"),
      ),
    ).toBe(true);
  });

  it("rejects severity_routing with unknown severity key", () => {
    const raw = {
      ...validOneshotRaw(),
      notify: {
        onFailure: "digest",
        severity_routing: { info: "immediate" },
      },
    };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) =>
        e.path.endsWith("notify.severity_routing.info"),
      ),
    ).toBe(true);
  });

  it("rejects severity_routing that is not an object", () => {
    const raw = {
      ...validOneshotRaw(),
      notify: {
        onFailure: "digest",
        severity_routing: "digest",
      },
    };
    const result = validateYamlJobsFile({ jobs: [raw] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) => e.path.endsWith("notify.severity_routing")),
    ).toBe(true);
  });
});

describe("validateYamlJobsFile — load-time guards (cross-job + cron)", () => {
  function oneshot(
    name: string,
    command: readonly string[],
    schedule:
      | { kind: "cron"; expr: string; timezone?: string }
      | { kind: "interval"; seconds: number },
  ) {
    return {
      name,
      command,
      notify: { onFailure: "silent" },
      schedule,
      retry: { maxAttempts: 1, backoffMs: [] },
    };
  }

  it("rejects duplicate job name", () => {
    const result = validateYamlJobsFile({
      jobs: [
        oneshot("dup", ["a"], { kind: "interval", seconds: 5 }),
        oneshot("dup", ["b"], { kind: "interval", seconds: 9 }),
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes("duplicate job name"))).toBe(true);
  });

  it("rejects duplicate command + identical schedule (redundant double-schedule)", () => {
    const result = validateYamlJobsFile({
      jobs: [
        oneshot("a", ["intel", "brief", "daily"], { kind: "cron", expr: "0 10 * * *" }),
        oneshot("b", ["intel", "brief", "daily"], { kind: "cron", expr: "0 10 * * *" }),
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) => e.message.includes("duplicates command + schedule")),
    ).toBe(true);
  });

  it("accepts same command on DIFFERENT schedules (e.g. daily + weekly)", () => {
    const result = validateYamlJobsFile({
      jobs: [
        oneshot("daily", ["intel", "brief"], { kind: "cron", expr: "0 10 * * *" }),
        oneshot("weekly", ["intel", "brief"], { kind: "cron", expr: "0 10 * * 1" }),
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an invalid cron expression at load", () => {
    const result = validateYamlJobsFile({
      jobs: [oneshot("bad", ["x"], { kind: "cron", expr: "not a cron" })],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.path.endsWith(".expr"))).toBe(true);
  });

  it("accepts a valid cron expression", () => {
    const result = validateYamlJobsFile({
      jobs: [
        oneshot("good", ["x"], { kind: "cron", expr: "0 10 * * *", timezone: "Asia/Tokyo" }),
      ],
    });
    expect(result.ok).toBe(true);
  });
});

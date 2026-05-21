import { describe, it, expect } from "bun:test";
import type { JobRun, JobRunState } from "./job-run";

const ALL_STATES: JobRunState[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "skipped-overlap",
  "skipped-queue-full",
  "skipped-dep-not-met",
  "blocked-parent-failed",
  "killed-by-overlap",
  "service-crashed",
];

describe("JobRun entity", () => {
  it("all 10 JobRunState variants are identifiable at runtime", () => {
    expect(ALL_STATES).toHaveLength(10);
    for (const s of ALL_STATES) {
      expect(typeof s).toBe("string");
      expect(s.includes("skipped") || s === "service-crashed" || !s.includes("-") || s === "blocked-parent-failed" || s === "killed-by-overlap").toBe(true);
    }
  });

  it("queued run has expected field types", () => {
    const run: JobRun = {
      jobId: "test-job",
      runId: "01J0ABCDEF1234567890ABCDEF",
      attempt: 1,
      startedAt: 1_700_000_000_000,
      finishedAt: null,
      exitCode: null,
      stdout: "",
      stderr: "",
      state: "queued",
    };
    expect(run.jobId).toBe("test-job");
    expect(run.attempt).toBe(1);
    expect(run.finishedAt).toBeNull();
    expect(run.exitCode).toBeNull();
    expect(run.state).toBe("queued");
  });

  it("running run has startedAt but no finishedAt or exitCode", () => {
    const run: JobRun = {
      jobId: "test-job",
      runId: "01J0ABCDEF1234567890ABCDEF",
      attempt: 1,
      startedAt: 1_700_000_000_000,
      finishedAt: null,
      exitCode: null,
      stdout: "",
      stderr: "",
      state: "running",
    };
    expect(run.state).toBe("running");
    expect(run.finishedAt).toBeNull();
    expect(run.exitCode).toBeNull();
  });

  it("succeeded run has finishedAt and exitCode 0", () => {
    const run: JobRun = {
      jobId: "test-job",
      runId: "01J0ABCDEF1234567890ABCDEF",
      attempt: 1,
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_010_000,
      exitCode: 0,
      stdout: "all good",
      stderr: "",
      state: "succeeded",
    };
    expect(run.state).toBe("succeeded");
    expect(run.finishedAt).toBe(1_700_000_010_000);
    expect(run.exitCode).toBe(0);
  });

  it("failed run has finishedAt and non-zero exitCode", () => {
    const run: JobRun = {
      jobId: "test-job",
      runId: "01J0ABCDEF1234567890ABCDEF",
      attempt: 1,
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_010_000,
      exitCode: 1,
      stdout: "",
      stderr: "error occurred",
      state: "failed",
      error: "exit code 1",
    };
    expect(run.state).toBe("failed");
    expect(run.exitCode).toBe(1);
    expect(run.error).toBe("exit code 1");
  });

  // skipped-* convention: exitCode === null, stderr === ""
  const SKIPPED_STATES: JobRunState[] = [
    "skipped-overlap",
    "skipped-queue-full",
    "skipped-dep-not-met",
  ];

  for (const st of SKIPPED_STATES) {
    it(`${st} state has exitCode null and stderr "" convention`, () => {
      const run: JobRun = {
        jobId: "test-job",
        runId: "01J0ABCDEF1234567890ABCDEF",
        attempt: 1,
        startedAt: 1_700_000_000_000,
        finishedAt: 1_700_000_010_000,
        exitCode: null,
        stdout: "",
        stderr: "",
        state: st,
      };
      expect(run.state).toBe(st);
      expect(run.exitCode).toBeNull();
      expect(run.stderr).toBe("");
    });
  }

  it("service-crashed state is reachable at runtime", () => {
    const run: JobRun = {
      jobId: "test-service",
      runId: "01J0ABCDEF1234567890ABCDEF",
      attempt: 3,
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_005_000,
      exitCode: 137,
      stdout: "log output",
      stderr: "SIGKILL",
      state: "service-crashed",
    };
    expect(run.state).toBe("service-crashed");
    expect(run.exitCode).toBe(137);
    expect(run.stderr).toBe("SIGKILL");
  });

  it("exhaustive switch over JobRunState narrows correctly", () => {
    // Exhaustive switch test: all variants must be handled at compile time.
    function describeState(s: JobRunState): string {
      switch (s) {
        case "queued":
          return "queued";
        case "running":
          return "running";
        case "succeeded":
          return "succeeded";
        case "failed":
          return "failed";
        case "skipped-overlap":
          return "skipped";
        case "skipped-queue-full":
          return "skipped";
        case "skipped-dep-not-met":
          return "skipped";
        case "blocked-parent-failed":
          return "blocked";
        case "killed-by-overlap":
          return "killed";
        case "service-crashed":
          return "crashed";
      }
    }
    for (const s of ALL_STATES) {
      expect(typeof describeState(s)).toBe("string");
    }
  });
});

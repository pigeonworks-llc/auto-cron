import { describe, it, expect } from "bun:test";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { YamlJobConfig } from "./yaml-job-config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpPath(): string {
  return join(
    tmpdir(),
    `auto-cron-test-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`,
  );
}

const MINIMAL_ONESHOT_JOB = `\
name: test-job
command: [echo, hello]
notify:
  onFailure: silent
schedule:
  kind: manual
retry:
  maxAttempts: 1
  backoffMs: []
`;

function yamlWithJobs(jobs: string): string {
  return `jobs:\n${jobs
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Constructor + round-trip
// ---------------------------------------------------------------------------

describe("YamlJobConfig — constructor and jobs()", () => {
  it("loads jobs from file on construction", () => {
    const path = makeTmpPath();
    try {
      writeFileSync(path, yamlWithJobs(`- ${MINIMAL_ONESHOT_JOB.replace(/\n/g, "\n  ")}`));
      const config = new YamlJobConfig(path);
      expect(config.jobs()).toHaveLength(1);
      expect(config.jobs()[0]?.name).toBe("test-job");
    } finally {
      unlinkSync(path);
    }
  });

  it("loads all job fields correctly (round-trip)", () => {
    const path = makeTmpPath();
    try {
      writeFileSync(
        path,
        `
jobs:
  - name: cron-job
    command: [pg_dump, all]
    notify:
      onFailure: immediate
      onSuccess: silent
    schedule:
      kind: cron
      expr: "0 18 * * *"
      timezone: "Asia/Tokyo"
    retry:
      maxAttempts: 3
      backoffMs: [60000, 300000]
    env:
      FOO: bar
    dependsOn:
      - prev-step
    catchUpOnWake: true
    dependsWithinHours: 48
    concurrency:
      onOverlap: skip
`,
      );
      const config = new YamlJobConfig(path);
      expect(config.jobs()).toHaveLength(1);
      const job = config.jobs()[0];
      expect(job?.name).toBe("cron-job");
      expect(job?.command).toEqual(["pg_dump", "all"]);
      expect(job?.notify).toEqual({ onFailure: "immediate", onSuccess: "silent" });
      expect(job?.env).toEqual({ FOO: "bar" });
      if (job && "schedule" in job) {
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
        throw new Error("Expected OneshotJob");
      }
    } finally {
      unlinkSync(path);
    }
  });

  it("loads a ServiceJob correctly", () => {
    const path = makeTmpPath();
    try {
      writeFileSync(
        path,
        `
jobs:
  - name: my-service
    command: [bun, run, daemon.ts]
    lifecycle: service
    notify:
      onFailure: digest
    restart:
      backoffMs: [5000, 30000]
      maxRestarts: 10
      resetAfterSec: 60
`,
      );
      const config = new YamlJobConfig(path);
      const job = config.jobs()[0];
      expect(job?.name).toBe("my-service");
      expect(job?.lifecycle).toBe("service");
      if (job && "restart" in job) {
        expect(job.restart.backoffMs).toEqual([5_000, 30_000]);
        expect(job.restart.maxRestarts).toBe(10);
      } else {
        throw new Error("Expected ServiceJob");
      }
    } finally {
      unlinkSync(path);
    }
  });

  it("loads multiple jobs", () => {
    const path = makeTmpPath();
    try {
      writeFileSync(
        path,
        `
jobs:
  - name: job-a
    command: [echo, a]
    notify:
      onFailure: silent
    schedule:
      kind: manual
    retry:
      maxAttempts: 1
      backoffMs: []
  - name: job-b
    command: [echo, b]
    lifecycle: service
    notify:
      onFailure: silent
    restart:
      backoffMs: [1000]
`,
      );
      const config = new YamlJobConfig(path);
      expect(config.jobs()).toHaveLength(2);
      expect(config.jobs()[0]?.name).toBe("job-a");
      expect(config.jobs()[1]?.name).toBe("job-b");
    } finally {
      unlinkSync(path);
    }
  });
});

// ---------------------------------------------------------------------------
// global()
// ---------------------------------------------------------------------------

describe("YamlJobConfig — global()", () => {
  it("returns default {maxConcurrentJobs: 4} when global not in YAML", () => {
    const path = makeTmpPath();
    try {
      writeFileSync(path, "jobs: []\n");
      const config = new YamlJobConfig(path);
      expect(config.global()).toEqual({ maxConcurrentJobs: 4 });
    } finally {
      unlinkSync(path);
    }
  });

  it("returns global values from YAML when present", () => {
    const path = makeTmpPath();
    try {
      writeFileSync(
        path,
        `
global:
  maxConcurrentJobs: 8
  groupMax:
    gpu: 1
    net: 2
jobs: []
`,
      );
      const config = new YamlJobConfig(path);
      expect(config.global().maxConcurrentJobs).toBe(8);
      expect(config.global().groupMax).toEqual({ gpu: 1, net: 2 });
    } finally {
      unlinkSync(path);
    }
  });
});

// ---------------------------------------------------------------------------
// reload()
// ---------------------------------------------------------------------------

describe("YamlJobConfig — reload()", () => {
  it("updates jobs after file is rewritten and reload() called", async () => {
    const path = makeTmpPath();
    try {
      writeFileSync(
        path,
        `
jobs:
  - name: job-original
    command: [echo, original]
    notify:
      onFailure: silent
    schedule:
      kind: manual
    retry:
      maxAttempts: 1
      backoffMs: []
`,
      );
      const config = new YamlJobConfig(path);
      expect(config.jobs()).toHaveLength(1);
      expect(config.jobs()[0]?.name).toBe("job-original");

      // Overwrite the file with new content
      writeFileSync(
        path,
        `
jobs:
  - name: job-updated-1
    command: [echo, updated-1]
    notify:
      onFailure: silent
    schedule:
      kind: manual
    retry:
      maxAttempts: 1
      backoffMs: []
  - name: job-updated-2
    command: [echo, updated-2]
    notify:
      onFailure: silent
    schedule:
      kind: manual
    retry:
      maxAttempts: 1
      backoffMs: []
`,
      );

      await config.reload();
      expect(config.jobs()).toHaveLength(2);
      expect(config.jobs()[0]?.name).toBe("job-updated-1");
      expect(config.jobs()[1]?.name).toBe("job-updated-2");
    } finally {
      unlinkSync(path);
    }
  });

  it("global() updates after reload()", async () => {
    const path = makeTmpPath();
    try {
      writeFileSync(path, "jobs: []\n");
      const config = new YamlJobConfig(path);
      expect(config.global().maxConcurrentJobs).toBe(4); // default

      writeFileSync(
        path,
        `
global:
  maxConcurrentJobs: 16
jobs: []
`,
      );
      await config.reload();
      expect(config.global().maxConcurrentJobs).toBe(16);
    } finally {
      unlinkSync(path);
    }
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe("YamlJobConfig — error cases", () => {
  it("throws on construction when validation fails (service missing restart)", () => {
    const path = makeTmpPath();
    try {
      writeFileSync(
        path,
        `
jobs:
  - name: bad-svc
    command: [sleep, inf]
    lifecycle: service
    notify:
      onFailure: silent
    # restart intentionally missing
`,
      );
      expect(() => new YamlJobConfig(path)).toThrow(/YAML config invalid/);
    } finally {
      unlinkSync(path);
    }
  });

  it("throws when jobs field is not an array", () => {
    const path = makeTmpPath();
    try {
      writeFileSync(path, "jobs: not-an-array\n");
      expect(() => new YamlJobConfig(path)).toThrow(/YAML config invalid/);
    } finally {
      unlinkSync(path);
    }
  });

  it("throws when YAML is structurally invalid (root is scalar)", () => {
    const path = makeTmpPath();
    try {
      writeFileSync(path, "just a string\n");
      expect(() => new YamlJobConfig(path)).toThrow();
    } finally {
      unlinkSync(path);
    }
  });

  it("throws on reload() when file becomes invalid", async () => {
    const path = makeTmpPath();
    try {
      writeFileSync(path, "jobs: []\n");
      const config = new YamlJobConfig(path);
      expect(config.jobs()).toHaveLength(0);

      writeFileSync(path, "jobs: not-an-array\n");
      await expect(config.reload()).rejects.toThrow(/YAML config invalid/);
    } finally {
      unlinkSync(path);
    }
  });

  it("throws when file does not exist", () => {
    expect(() => new YamlJobConfig("/nonexistent/path/to/jobs.yaml")).toThrow();
  });
});

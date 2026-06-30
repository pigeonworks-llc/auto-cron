import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "bun";
import type { JobConfig } from "../../core/port/job-config";
import type { RunStore } from "../../core/port/run-store";
import type { Job } from "../../core/entity/job";
import type { JobRun } from "../../core/entity/job-run";
import type { GlobalConcurrencyConfig } from "../../core/entity/concurrency-policy";
import { startDashboard } from "./dashboard";
import { SseChannel } from "./sse-channel";

const TEST_PORT = 17891;

// --- mock fixtures -----------------------------------------------------------

const mockJobs: readonly Job[] = [
  {
    name: "fetch-data",
    command: ["echo", "fetch"],
    notify: { onFailure: "silent" },
    schedule: { kind: "interval", seconds: 60 },
    retry: { maxAttempts: 1, backoffMs: [] },
  },
  {
    name: "process-data",
    command: ["echo", "process"],
    notify: { onFailure: "silent" },
    schedule: { kind: "interval", seconds: 60 },
    retry: { maxAttempts: 1, backoffMs: [] },
    dependsOn: ["fetch-data"],
  },
];

const mockJobConfig: JobConfig = {
  jobs: () => mockJobs,
  global: (): GlobalConcurrencyConfig => ({ maxConcurrentJobs: 4 }),
  reload: async () => {},
};

const mockRuns: readonly JobRun[] = [
  {
    jobId: "fetch-data",
    runId: "01HZ000000000000000000001",
    attempt: 1,
    startedAt: 1_716_000_000_000,
    finishedAt: 1_716_000_001_000,
    exitCode: 0,
    stdout: "",
    stderr: "",
    state: "succeeded",
  },
];

const mockRunStore: RunStore = {
  insert: async () => "run-id",
  setState: async () => {},
  recent: async (jobId: string) => (jobId === "fetch-data" ? mockRuns : []),
  latestSucceeded: async () => null,
  runningRuns: async () => [],
};

// --- server lifecycle --------------------------------------------------------

let server: Server<undefined>;
let events: SseChannel;

beforeAll(() => {
  events = new SseChannel();
  server = startDashboard({
    jobConfig: mockJobConfig,
    runStore: mockRunStore,
    port: TEST_PORT,
    events,
  });
});

afterAll(() => {
  server.stop();
});

// --- tests -------------------------------------------------------------------

describe("dashboard GET /", () => {
  it("returns 200 HTML containing job names and Mermaid graph", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("fetch-data");
    expect(html).toContain("process-data");
    expect(html).toContain("graph TD");
  });
});

describe("dashboard GET /jobs", () => {
  it("returns 200 JSON array with all jobs", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/jobs`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Job[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0]!.name).toBe("fetch-data");
    expect(body[1]!.name).toBe("process-data");
  });
});

describe("dashboard GET /runs/:name", () => {
  it("returns 200 JSON array for a known job", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/runs/fetch-data`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as JobRun[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0]!.jobId).toBe("fetch-data");
    expect(body[0]!.state).toBe("succeeded");
  });

  it("returns 200 empty JSON array for an unknown job", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/runs/no-such-job`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as JobRun[];
    expect(body).toHaveLength(0);
  });
});

describe("dashboard GET /events", () => {
  it("returns text/event-stream and delivers a published event within timeout", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/events`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let allText = "";

    // Helper: read one HTTP chunk with a per-read deadline; accumulates into allText.
    const readOne = (ms: number): Promise<boolean> => {
      const timer = new Promise<{ value: undefined; done: true }>((r) =>
        setTimeout(() => r({ value: undefined, done: true as const }), ms),
      );
      return Promise.race([reader.read(), timer]).then(({ value, done }) => {
        if (done || value === undefined) return false;
        allText += dec.decode(value);
        return true;
      });
    };

    // First read: consume the initial ": ping\n\n" keepalive comment that the
    // server enqueues upon connection. This ensures the HTTP response has been
    // fully flushed to the client before we publish a real event.
    await readOne(1_000);

    // Now publish a real event; the server-side subscription is already active.
    events.publish({ event: "run-complete", data: "fetch-data" });

    // Second read: collect the SSE event frame.
    await readOne(2_000);

    await reader.cancel();

    // allText contains everything received (ping + event, or both in one chunk).
    expect(allText).toContain("event: run-complete");
    expect(allText).toContain("data: fetch-data");
  });
});

describe("dashboard GET /healthz", () => {
  it("returns 200 {status:ok, jobs}", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/healthz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; jobs: number };
    expect(body.status).toBe("ok");
    expect(body.jobs).toBe(2);
  });
});

describe("dashboard GET /metrics", () => {
  it("returns Prometheus text with jobs_total and per-job gauges", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("auto_cron_jobs_total 2");
    // fetch-data has a succeeded run in the mock; process-data has none.
    expect(body).toContain('auto_cron_last_run_success{job="fetch-data"} 1');
    expect(body).not.toContain('job="process-data"');
  });
});

describe("dashboard GET /unknown", () => {
  it("returns 404 for unrecognised paths", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/does-not-exist`);
    expect(res.status).toBe(404);
  });
});

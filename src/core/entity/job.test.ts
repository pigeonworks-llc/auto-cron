import { describe, it, expect } from "bun:test";
import type { Schedule } from "./schedule";
import type { RetryPolicy } from "./retry-policy";
import type { RestartPolicy } from "./restart-policy";
import type { NotifyPolicy } from "./notify-policy";
import type { ConcurrencyPolicy } from "./concurrency-policy";
import { isServiceJob, type Job, type OneshotJob, type ServiceJob } from "./job";

const manual: Schedule = { kind: "manual" };
const noRetry: RetryPolicy = { maxAttempts: 1, backoffMs: [] };
const notify: NotifyPolicy = { onFailure: "silent" };

describe("OneshotJob", () => {
  it("constructs a minimum-valid OneshotJob (lifecycle omitted)", () => {
    const j: OneshotJob = {
      name: "backup-db",
      command: ["pg_dump", "all"],
      notify,
      schedule: manual,
      retry: noRetry,
    };
    expect(j.lifecycle).toBeUndefined();
    expect(j.name).toBe("backup-db");
    expect(j.command).toEqual(["pg_dump", "all"]);
  });

  it("constructs a OneshotJob with lifecycle='oneshot' explicitly", () => {
    const j: OneshotJob = {
      name: "explicit-oneshot",
      command: ["echo", "hello"],
      lifecycle: "oneshot",
      notify,
      schedule: manual,
      retry: noRetry,
    };
    expect(j.lifecycle).toBe("oneshot");
  });

  it("accepts all optional fields (dependsOn, catchUpOnWake, dependsWithinHours, env, concurrency)", () => {
    const j: OneshotJob = {
      name: "full-job",
      command: ["sh", "script.sh"],
      notify,
      schedule: { kind: "cron", expr: "0 * * * *" },
      retry: { maxAttempts: 3, backoffMs: [60_000] },
      dependsOn: ["prev-step"],
      catchUpOnWake: true,
      dependsWithinHours: 48,
      env: { FOO: "bar" },
      concurrency: { onOverlap: "skip" },
    };
    expect(j.dependsOn).toEqual(["prev-step"]);
    expect(j.catchUpOnWake).toBe(true);
    expect(j.dependsWithinHours).toBe(48);
    expect(j.env).toEqual({ FOO: "bar" });
  });
});

describe("ServiceJob", () => {
  it("constructs a ServiceJob with lifecycle='service' and restart required", () => {
    const restart: RestartPolicy = { backoffMs: [5_000, 30_000] };
    const j: ServiceJob = {
      name: "dashboard-server",
      command: ["bun", "run", "bin.ts", "serve"],
      lifecycle: "service",
      notify,
      restart,
    };
    expect(j.lifecycle).toBe("service");
    expect(j.restart.backoffMs).toEqual([5_000, 30_000]);
  });

  it("schedule is a type error on ServiceJob", () => {
    const restart: RestartPolicy = { backoffMs: [5_000] };
    const _bad: ServiceJob = {
      name: "bad",
      command: ["echo", "hi"],
      lifecycle: "service",
      notify,
      restart,
      // @ts-expect-error — ServiceJob に schedule は存在しない
      schedule: { kind: "manual" },
    };
  });

  it("retry is a type error on ServiceJob", () => {
    const restart: RestartPolicy = { backoffMs: [5_000] };
    const _bad: ServiceJob = {
      name: "bad",
      command: ["echo", "hi"],
      lifecycle: "service",
      notify,
      restart,
      // @ts-expect-error — ServiceJob に retry は存在しない
      retry: { maxAttempts: 1, backoffMs: [] },
    };
  });
});

describe("isServiceJob", () => {
  it("returns true for ServiceJob and false for OneshotJob", () => {
    const jobs: Job[] = [
      {
        name: "oneshot",
        command: ["echo", "hello"],
        lifecycle: "oneshot" as const,
        notify,
        schedule: manual,
        retry: noRetry,
      },
      {
        name: "service",
        command: ["bun", "serve"],
        lifecycle: "service" as const,
        notify,
        restart: { backoffMs: [5_000] },
      },
    ];

    const narrowed = jobs.filter(isServiceJob);
    expect(narrowed).toHaveLength(1);
    const svc = narrowed[0]!;
    expect(svc.name).toBe("service");

    // After narrowing, lifecycle is "service" and restart is accessible
    expect(svc.lifecycle).toBe("service");
    expect(svc.restart.backoffMs).toEqual([5_000]);
  });
});

describe("common fields", () => {
  it("name / command / notify are present on both variants", () => {
    const oneshot: OneshotJob = {
      name: "o",
      command: ["true"],
      notify,
      schedule: manual,
      retry: noRetry,
    };
    const service: ServiceJob = {
      name: "s",
      command: ["sleep", "inf"],
      lifecycle: "service",
      notify,
      restart: { backoffMs: [5_000] },
    };

    // Common fields exist on both
    expect(oneshot.name).toBe("o");
    expect(oneshot.command).toEqual(["true"]);
    expect(service.name).toBe("s");
    expect(service.command).toEqual(["sleep", "inf"]);

    // Both have notify of the same type
    expect(oneshot.notify).toEqual(service.notify);
  });

  it("env and concurrency are optional on both variants", () => {
    const withOpts: Job = {
      name: "with-opts",
      command: ["echo"],
      notify,
      schedule: manual,
      retry: noRetry,
      env: { KEY: "val" },
      concurrency: { onOverlap: "queue", queueDepth: 2 },
    };
    // On the union type these are accessible after narrowing or via common fields
    expect("env" in withOpts).toBe(true);
    expect("concurrency" in withOpts).toBe(true);
  });
});

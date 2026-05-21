import type { Job, OneshotJob, ServiceJob } from "../../core/entity/job";
import type {
  GlobalConcurrencyConfig,
  ConcurrencyPolicy,
} from "../../core/entity/concurrency-policy";
import type { NotifyPolicy } from "../../core/entity/notify-policy";
import type { RetryPolicy } from "../../core/entity/retry-policy";
import type { RestartPolicy } from "../../core/entity/restart-policy";
import type { Schedule } from "../../core/entity/schedule";

export interface YamlJobsFile {
  global?: GlobalConcurrencyConfig;
  jobs: readonly Job[];
}

export type ValidationError = { path: string; message: string };

export function validateYamlJobsFile(
  parsed: unknown,
): { ok: true; value: YamlJobsFile } | { ok: false; errors: readonly ValidationError[] } {
  const errors: ValidationError[] = [];
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, errors: [{ path: "$", message: "root must be an object" }] };
  }
  const obj = parsed as Record<string, unknown>;

  // global (optional)
  let global: GlobalConcurrencyConfig | undefined;
  if (obj["global"] !== undefined) {
    const g = obj["global"];
    if (g === null || typeof g !== "object" || Array.isArray(g)) {
      errors.push({ path: "$.global", message: "must be object" });
    } else {
      const gObj = g as Record<string, unknown>;
      if (
        typeof gObj["maxConcurrentJobs"] !== "number" ||
        gObj["maxConcurrentJobs"] <= 0
      ) {
        errors.push({
          path: "$.global.maxConcurrentJobs",
          message: "must be positive integer",
        });
      }
      // groupMax は optional 検証略 (詳細は test で)
      global = gObj as unknown as GlobalConcurrencyConfig;
    }
  }

  // jobs (required, array)
  if (!Array.isArray(obj["jobs"])) {
    errors.push({ path: "$.jobs", message: "must be array" });
    return { ok: false, errors };
  }

  const jobs: Job[] = [];
  const rawJobs = obj["jobs"] as unknown[];
  for (let i = 0; i < rawJobs.length; i++) {
    const j: unknown = rawJobs[i];
    const result = validateJob(j, `$.jobs[${i}]`);
    if (!result.ok) {
      errors.push(...result.errors);
    } else {
      jobs.push(result.value);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  const value: YamlJobsFile = global !== undefined ? { global, jobs } : { jobs };
  return { ok: true, value };
}

function validateJob(
  raw: unknown,
  path: string,
): { ok: true; value: Job } | { ok: false; errors: readonly ValidationError[] } {
  const errors: ValidationError[] = [];

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: [{ path, message: "must be an object" }] };
  }

  const obj = raw as Record<string, unknown>;
  const lifecycle = obj["lifecycle"];

  if (lifecycle !== undefined && lifecycle !== "oneshot" && lifecycle !== "service") {
    errors.push({
      path: `${path}.lifecycle`,
      message: 'must be "oneshot" or "service"',
    });
  }

  // name
  const name = obj["name"];
  if (typeof name !== "string" || name.length === 0) {
    errors.push({ path: `${path}.name`, message: "must be non-empty string" });
  }

  // command
  const command = obj["command"];
  if (!Array.isArray(command)) {
    errors.push({ path: `${path}.command`, message: "must be array of strings" });
  } else {
    for (let i = 0; i < command.length; i++) {
      const elem: unknown = command[i];
      if (typeof elem !== "string") {
        errors.push({ path: `${path}.command[${i}]`, message: "must be string" });
      }
    }
  }

  // env (optional)
  const env = obj["env"];
  if (env !== undefined) {
    if (env === null || typeof env !== "object" || Array.isArray(env)) {
      errors.push({ path: `${path}.env`, message: "must be object" });
    } else {
      const envObj = env as Record<string, unknown>;
      for (const [k, v] of Object.entries(envObj)) {
        if (typeof v !== "string") {
          errors.push({ path: `${path}.env.${k}`, message: "must be string" });
        }
      }
    }
  }

  // notify (required)
  const notify = obj["notify"];
  if (notify === undefined) {
    errors.push({ path: `${path}.notify`, message: "required" });
  } else {
    errors.push(...validateNotify(notify, `${path}.notify`));
  }

  // concurrency (optional)
  const concurrency = obj["concurrency"];
  if (concurrency !== undefined) {
    errors.push(...validateConcurrency(concurrency, `${path}.concurrency`));
  }

  if (lifecycle === "service") {
    // ServiceJob: restart required
    const restart = obj["restart"];
    if (restart === undefined) {
      errors.push({ path: `${path}.restart`, message: "required for service jobs" });
    } else {
      errors.push(...validateRestart(restart, `${path}.restart`));
    }

    if (errors.length > 0) return { ok: false, errors };

    const job: ServiceJob = {
      lifecycle: "service",
      name: name as string,
      command: command as readonly string[],
      notify: notify as NotifyPolicy,
      restart: obj["restart"] as RestartPolicy,
      ...(env !== undefined ? { env: env as Readonly<Record<string, string>> } : {}),
      ...(concurrency !== undefined
        ? { concurrency: concurrency as ConcurrencyPolicy }
        : {}),
    };
    return { ok: true, value: job };
  } else {
    // OneshotJob (lifecycle undefined or "oneshot")
    const schedule = obj["schedule"];
    if (schedule === undefined) {
      errors.push({ path: `${path}.schedule`, message: "required" });
    } else {
      errors.push(...validateSchedule(schedule, `${path}.schedule`));
    }

    const retry = obj["retry"];
    if (retry === undefined) {
      errors.push({ path: `${path}.retry`, message: "required" });
    } else {
      errors.push(...validateRetry(retry, `${path}.retry`));
    }

    if (errors.length > 0) return { ok: false, errors };

    const job: OneshotJob = {
      name: name as string,
      command: command as readonly string[],
      notify: notify as NotifyPolicy,
      schedule: schedule as Schedule,
      retry: retry as RetryPolicy,
      ...(lifecycle === "oneshot" ? { lifecycle: "oneshot" as const } : {}),
      ...(env !== undefined ? { env: env as Readonly<Record<string, string>> } : {}),
      ...(concurrency !== undefined
        ? { concurrency: concurrency as ConcurrencyPolicy }
        : {}),
      ...(Array.isArray(obj["dependsOn"])
        ? { dependsOn: obj["dependsOn"] as readonly string[] }
        : {}),
      ...(typeof obj["catchUpOnWake"] === "boolean"
        ? { catchUpOnWake: obj["catchUpOnWake"] }
        : {}),
      ...(typeof obj["dependsWithinHours"] === "number"
        ? { dependsWithinHours: obj["dependsWithinHours"] }
        : {}),
    };
    return { ok: true, value: job };
  }
}

function validateNotify(raw: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [{ path, message: "must be object" }];
  }
  const obj = raw as Record<string, unknown>;
  const validOnFailure: readonly string[] = ["immediate", "digest", "silent"];
  if (
    typeof obj["onFailure"] !== "string" ||
    !validOnFailure.includes(obj["onFailure"])
  ) {
    errors.push({
      path: `${path}.onFailure`,
      message: 'must be "immediate", "digest", or "silent"',
    });
  }
  if (obj["onSuccess"] !== undefined) {
    const validOnSuccess: readonly string[] = ["immediate", "silent"];
    if (
      typeof obj["onSuccess"] !== "string" ||
      !validOnSuccess.includes(obj["onSuccess"])
    ) {
      errors.push({
        path: `${path}.onSuccess`,
        message: 'must be "immediate" or "silent"',
      });
    }
  }
  return errors;
}

function validateConcurrency(raw: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [{ path, message: "must be object" }];
  }
  const obj = raw as Record<string, unknown>;
  const validOverlap: readonly string[] = [
    "skip",
    "queue",
    "killPrevious",
    "concurrent",
  ];
  if (
    typeof obj["onOverlap"] !== "string" ||
    !validOverlap.includes(obj["onOverlap"])
  ) {
    errors.push({
      path: `${path}.onOverlap`,
      message: 'must be "skip", "queue", "killPrevious", or "concurrent"',
    });
  }
  if (obj["group"] !== undefined && typeof obj["group"] !== "string") {
    errors.push({ path: `${path}.group`, message: "must be string" });
  }
  if (
    obj["queueDepth"] !== undefined &&
    (typeof obj["queueDepth"] !== "number" || obj["queueDepth"] <= 0)
  ) {
    errors.push({ path: `${path}.queueDepth`, message: "must be positive integer" });
  }
  return errors;
}

function validateSchedule(raw: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [{ path, message: "must be object" }];
  }
  const obj = raw as Record<string, unknown>;
  const kind = obj["kind"];
  if (kind === "cron") {
    if (typeof obj["expr"] !== "string" || obj["expr"].length === 0) {
      errors.push({ path: `${path}.expr`, message: "must be non-empty string" });
    }
    if (obj["timezone"] !== undefined && typeof obj["timezone"] !== "string") {
      errors.push({ path: `${path}.timezone`, message: "must be string" });
    }
  } else if (kind === "interval") {
    if (typeof obj["seconds"] !== "number" || obj["seconds"] <= 0) {
      errors.push({ path: `${path}.seconds`, message: "must be positive number" });
    }
  } else if (kind === "manual") {
    // valid, nothing additional to check
  } else {
    errors.push({
      path: `${path}.kind`,
      message: 'must be "cron", "interval", or "manual"',
    });
  }
  return errors;
}

function validateRetry(raw: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [{ path, message: "must be object" }];
  }
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj["maxAttempts"] !== "number" ||
    !Number.isInteger(obj["maxAttempts"]) ||
    obj["maxAttempts"] < 1
  ) {
    errors.push({ path: `${path}.maxAttempts`, message: "must be integer >= 1" });
  }
  if (!Array.isArray(obj["backoffMs"])) {
    errors.push({ path: `${path}.backoffMs`, message: "must be array" });
  } else {
    const arr = obj["backoffMs"] as unknown[];
    for (let i = 0; i < arr.length; i++) {
      const elem: unknown = arr[i];
      if (typeof elem !== "number" || elem < 0) {
        errors.push({
          path: `${path}.backoffMs[${i}]`,
          message: "must be non-negative number",
        });
      }
    }
  }
  return errors;
}

function validateRestart(raw: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [{ path, message: "must be object" }];
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj["backoffMs"])) {
    errors.push({ path: `${path}.backoffMs`, message: "must be array" });
  } else {
    const arr = obj["backoffMs"] as unknown[];
    for (let i = 0; i < arr.length; i++) {
      const elem: unknown = arr[i];
      if (typeof elem !== "number" || elem < 0) {
        errors.push({
          path: `${path}.backoffMs[${i}]`,
          message: "must be non-negative number",
        });
      }
    }
  }
  if (
    obj["maxRestarts"] !== undefined &&
    (typeof obj["maxRestarts"] !== "number" || obj["maxRestarts"] < 0)
  ) {
    errors.push({ path: `${path}.maxRestarts`, message: "must be non-negative integer" });
  }
  if (
    obj["resetAfterSec"] !== undefined &&
    (typeof obj["resetAfterSec"] !== "number" || obj["resetAfterSec"] <= 0)
  ) {
    errors.push({ path: `${path}.resetAfterSec`, message: "must be positive number" });
  }
  return errors;
}

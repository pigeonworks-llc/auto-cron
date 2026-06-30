import type { Job } from "../core/entity/job";
import type { Scheduler } from "../core/port/scheduler";

// cli-format — pure formatting helpers for the operator CLI (bin.ts). Kept
// separate from the IO so the time/label logic is unit-tested.

// formatRelative — signed delta (target - now) → human relative string.
//   future (>0) → "in 5m", past (<0) → "30s ago", ~0 → "now", Infinity → "never".
export function formatRelative(deltaMs: number): string {
  if (!Number.isFinite(deltaMs)) return "never";
  const abs = Math.abs(deltaMs);
  if (abs < 1000) return "now";
  let n: number;
  let unit: string;
  if (abs < 60_000) {
    n = Math.floor(abs / 1000);
    unit = "s";
  } else if (abs < 3600_000) {
    n = Math.floor(abs / 60_000);
    unit = "m";
  } else if (abs < 86400_000) {
    n = Math.floor(abs / 3600_000);
    unit = "h";
  } else {
    n = Math.floor(abs / 86400_000);
    unit = "d";
  }
  return deltaMs > 0 ? `in ${n}${unit}` : `${n}${unit} ago`;
}

// nextFireFor — epoch ms of a job's next fire, or Infinity for manual/service.
export function nextFireFor(job: Job, nowMs: number, scheduler: Scheduler): number {
  if (job.lifecycle === "service") return Number.POSITIVE_INFINITY;
  if (job.schedule.kind === "manual") return Number.POSITIVE_INFINITY;
  return scheduler.nextFireAt(job.schedule, nowMs);
}

// scheduleLabel — one-line human label for a job's schedule.
export function scheduleLabel(job: Job): string {
  if (job.lifecycle === "service") return "service";
  const s = job.schedule;
  switch (s.kind) {
    case "cron":
      return s.timezone !== undefined ? `cron ${s.expr} ${s.timezone}` : `cron ${s.expr}`;
    case "interval":
      return `every ${s.seconds}s`;
    case "manual":
      return "manual";
  }
}

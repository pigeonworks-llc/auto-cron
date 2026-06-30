// expected.ts — L3 daily inventory helper. Prints, as JSON, how many times each
// cron/interval job is *expected* to fire on a given local day. The inventory
// shell script joins this against actual runs (runs.db) to detect under-run
// (silence) and over-run (duplicate execution = the 2026-06 incident's fingerprint).
//
// cron interpretation stays in auto-cron's croner (single SoT) — the shell side
// must not re-parse cron, or it would drift from the daemon.
//
// usage: bun src/main/expected.ts [--date YYYY-MM-DD] [--jobs <path>]
//   --date  local day to evaluate (default: yesterday, local tz)
//   --jobs  jobs.yaml path (default: $AUTO_CRON_JOBS_YAML or ~/.config/...)
// output: {"date","from","to","jobs":[{"name","kind","expected"}]}  (manual/service excluded)

import { YamlJobConfig } from "../adapters/config/yaml-job-config";
import { countFires } from "../core/usecase/expected-fires";
import type { Job } from "../core/entity/job";

export interface DayWindow {
  date: string; // YYYY-MM-DD (local)
  from: number; // epoch ms, local midnight
  to: number; // epoch ms, +24h
}

export interface ExpectedRow {
  name: string;
  kind: "cron" | "interval";
  expected: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// resolveDayWindow — explicit YYYY-MM-DD → that local day; undefined → yesterday
// relative to `now`. Window is [local-midnight, +24h).
export function resolveDayWindow(dateArg: string | undefined, now: Date): DayWindow {
  let dayStart: Date;
  if (dateArg !== undefined) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateArg);
    if (m === null) throw new Error(`--date must be YYYY-MM-DD, got "${dateArg}"`);
    dayStart = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  } else {
    dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
  }
  const from = dayStart.getTime();
  return { date: fmt(dayStart), from, to: from + DAY_MS };
}

// buildReport — cron/interval jobs only (manual + service excluded), each with
// its expected fire count over [from, to).
export function buildReport(jobs: readonly Job[], from: number, to: number): ExpectedRow[] {
  const rows: ExpectedRow[] = [];
  for (const job of jobs) {
    if (job.lifecycle === "service") continue; // no schedule
    const schedule = job.schedule;
    if (schedule.kind === "manual") continue;
    rows.push({ name: job.name, kind: schedule.kind, expected: countFires(schedule, from, to) });
  }
  return rows;
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (import.meta.main) {
  const jobsPath =
    arg("--jobs") ??
    process.env.AUTO_CRON_JOBS_YAML ??
    `${process.env.HOME}/.config/auto-cron/jobs.yaml`;
  let win: DayWindow;
  try {
    win = resolveDayWindow(arg("--date"), new Date());
  } catch (e) {
    console.error(`expected: ${(e as Error).message}`);
    process.exit(2);
  }
  const cfg = new YamlJobConfig(jobsPath);
  const jobs = buildReport(cfg.jobs(), win.from, win.to);
  console.log(JSON.stringify({ date: win.date, from: win.from, to: win.to, jobs }));
}

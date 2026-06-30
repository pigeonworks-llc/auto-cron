// bin.ts — auto-cron operator CLI (read-only + reload). Does NOT start the
// daemon or bind the dashboard port; safe to run alongside the live daemon.
//
//   auto-cron list                 jobs + next fire time (soonest first)
//   auto-cron status               last run state per job
//   auto-cron history <job> [n]    recent runs for a job (default 20)
//   auto-cron reload               SIGHUP the running daemon (reload jobs.yaml)
//
// run/dashboard/metrics are intentionally out of scope here (issue #6).

import { Database } from "bun:sqlite";
import { execFileSync } from "node:child_process";
import { YamlJobConfig } from "../adapters/config/yaml-job-config";
import { SqliteRunStore } from "../adapters/store/sqlite-run-store";
import { CronEvaluator } from "../adapters/scheduler/cron-evaluator";
import { formatRelative, nextFireFor, scheduleLabel } from "./cli-format";

export function parseCommand(argv: readonly string[]): { cmd: string; args: string[] } {
  if (argv.length === 0) return { cmd: "help", args: [] };
  return { cmd: argv[0]!, args: argv.slice(1) };
}

const cfg = {
  jobsYaml: process.env.AUTO_CRON_JOBS_YAML ?? `${process.env.HOME}/.config/auto-cron/jobs.yaml`,
  dbPath: process.env.AUTO_CRON_DB_PATH ?? `${process.env.HOME}/.local/share/auto-cron/runs.db`,
  daemonPattern: "bun.*auto-cron/src/main/daemon.ts",
};

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function openStore(): SqliteRunStore {
  const db = new Database(cfg.dbPath, { readonly: true });
  return new SqliteRunStore(db);
}

async function cmdList(): Promise<void> {
  const jobs = new YamlJobConfig(cfg.jobsYaml).jobs();
  const now = Date.now();
  const scheduler = new CronEvaluator();
  const rows = jobs
    .map((j) => ({ name: j.name, sched: scheduleLabel(j), next: nextFireFor(j, now, scheduler) }))
    .sort((a, b) => a.next - b.next);
  console.log(`${pad("JOB", 42)}${pad("SCHEDULE", 32)}NEXT`);
  for (const r of rows) {
    console.log(`${pad(r.name, 42)}${pad(r.sched, 32)}${formatRelative(r.next - now)}`);
  }
}

async function cmdStatus(): Promise<void> {
  const jobs = new YamlJobConfig(cfg.jobsYaml).jobs();
  const store = openStore();
  const now = Date.now();
  console.log(`${pad("JOB", 42)}${pad("LAST STATE", 18)}WHEN`);
  for (const j of jobs) {
    const recent = await store.recent(j.name, 1);
    const last = recent[0];
    if (last === undefined) {
      console.log(`${pad(j.name, 42)}${pad("—", 18)}never`);
    } else {
      console.log(`${pad(j.name, 42)}${pad(last.state, 18)}${formatRelative(last.startedAt - now)}`);
    }
  }
}

async function cmdHistory(args: readonly string[]): Promise<number> {
  const job = args[0];
  if (job === undefined) {
    console.error("usage: auto-cron history <job> [n]");
    return 2;
  }
  const n = args[1] !== undefined ? Number(args[1]) : 20;
  const store = openStore();
  const now = Date.now();
  const runs = await store.recent(job, Number.isFinite(n) && n > 0 ? n : 20);
  if (runs.length === 0) {
    console.log(`no runs for "${job}"`);
    return 0;
  }
  console.log(`${pad("WHEN", 14)}${pad("STATE", 18)}${pad("EXIT", 6)}RUN`);
  for (const r of runs) {
    const exit = r.exitCode === null ? "—" : String(r.exitCode);
    console.log(`${pad(formatRelative(r.startedAt - now), 14)}${pad(r.state, 18)}${pad(exit, 6)}${r.runId}`);
  }
  return 0;
}

function cmdReload(): number {
  let out = "";
  try {
    out = execFileSync("pgrep", ["-f", cfg.daemonPattern], { encoding: "utf8" });
  } catch {
    console.error("auto-cron: no running daemon found");
    return 1;
  }
  const pids = out.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
  for (const pid of pids) {
    process.kill(Number(pid), "SIGHUP");
    console.log(`reloaded daemon pid ${pid} (SIGHUP)`);
  }
  return 0;
}

function usage(): void {
  console.log(
    [
      "auto-cron — operator CLI",
      "  list                 jobs + next fire time (soonest first)",
      "  status               last run state per job",
      "  history <job> [n]    recent runs for a job (default 20)",
      "  reload               SIGHUP the running daemon (reload jobs.yaml)",
    ].join("\n"),
  );
}

if (import.meta.main) {
  const { cmd, args } = parseCommand(process.argv.slice(2));
  const run = async (): Promise<number> => {
    switch (cmd) {
      case "list":
        await cmdList();
        return 0;
      case "status":
        await cmdStatus();
        return 0;
      case "history":
        return cmdHistory(args);
      case "reload":
        return cmdReload();
      case "help":
      case "--help":
      case "-h":
        usage();
        return 0;
      default:
        console.error(`auto-cron: unknown command "${cmd}"`);
        usage();
        return 2;
    }
  };
  run()
    .then((code) => process.exit(code))
    .catch((e: unknown) => {
      console.error(`auto-cron: ${(e as Error).message}`);
      process.exit(1);
    });
}

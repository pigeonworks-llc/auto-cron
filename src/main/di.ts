import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { YamlJobConfig } from "../adapters/config/yaml-job-config";
import { SqliteRunStore } from "../adapters/store/sqlite-run-store";
import { runMigrations, loadMigrationsFromDir } from "../adapters/store/migration-runner";
import { BunSpawnExecutor } from "../adapters/executor/bun-spawn-executor";
import { InMemoryConcurrencyController } from "../adapters/concurrency/in-memory-concurrency-controller";
import { SeverityRouter } from "../adapters/notifier/severity-router";
import { WarnDigestFileNotifier } from "../adapters/notifier/warn-digest-file";
import { GChatWebhookNotifier } from "../adapters/notifier/gchat-webhook";
import { CronEvaluator } from "../adapters/scheduler/cron-evaluator";
import { startDashboard } from "../adapters/http/dashboard";
import { SseChannel } from "../adapters/http/sse-channel";
import { runJob } from "../core/usecase/run-job";
import { findDueJobs } from "../core/usecase/schedule-tick";

export function buildDeps(cfg: {
  jobsYaml: string;
  dbPath: string;
  dashboardPort: number;
  dashboardHost?: string;
}) {
  const jobConfig = new YamlJobConfig(cfg.jobsYaml);
  mkdirSync(dirname(cfg.dbPath), { recursive: true });
  const db = new Database(cfg.dbPath, { create: true });
  // migrations apply (Phase C migration-runner 経由)
  const migrations = loadMigrationsFromDir(join(import.meta.dir, "../adapters/store/migrations"));
  runMigrations(db, migrations);
  const runStore = new SqliteRunStore(db);
  const executor = new BunSpawnExecutor();
  const clock = { now: () => Date.now() };
  const scheduler = new CronEvaluator();
  const concurrencyController = new InMemoryConcurrencyController(() => jobConfig.global());
  const notifier = new SeverityRouter({
    warnDigestFile: new WarnDigestFileNotifier(),
    gchatWebhook: new GChatWebhookNotifier(process.env.GCHAT_WEBHOOK_AUTOCRON ?? ""),
  });
  const events = new SseChannel();
  const dashboardServer = startDashboard({
    jobConfig,
    runStore,
    port: cfg.dashboardPort,
    hostname: cfg.dashboardHost,
    events,
  });
  return {
    jobConfig, runStore, executor, clock, scheduler, concurrencyController, notifier, events,
    dashboardServer,
    runJob: (job: any, _ignore: any, signal?: AbortSignal) =>
      runJob(job, { executor, runStore, clock, sleep: (ms: number, s?: AbortSignal) => new Promise<void>(r => setTimeout(r, ms)) }, signal),
    scheduleTick: { findDueJobs },
  };
}

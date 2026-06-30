import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { OneshotJob } from "../core/entity/job";
import type { JobRun } from "../core/entity/job-run";
import { buildDeps } from "./di";
import { buildHeartbeat } from "../core/usecase/heartbeat";
import { detectSilentJobs } from "../core/usecase/detect-silence";

const cfg = {
  jobsYaml: process.env.AUTO_CRON_JOBS_YAML ?? `${process.env.HOME}/.config/auto-cron/jobs.yaml`,
  dbPath: process.env.AUTO_CRON_DB_PATH ?? `${process.env.HOME}/.local/share/auto-cron/runs.db`,
  dashboardPort: Number(process.env.AUTO_CRON_DASHBOARD_PORT ?? 7891),
  // Bind the dashboard on IPv4 loopback (default "localhost" binds ::1 only on
  // macOS, which Prometheus — scraping 127.0.0.1:7891 like the rest of the
  // monitoring fleet — cannot reach → target down). 127.0.0.1 stays loopback-only.
  dashboardHost: process.env.AUTO_CRON_DASHBOARD_HOST ?? "127.0.0.1",
  // silent-failure L2: daemon liveness footprint (外部 watchdog が mtime を見る) +
  // job 沈黙検知 (予定 + grace を過ぎても走らない job を warn 通知)。
  heartbeatPath:
    process.env.AUTO_CRON_HEARTBEAT ?? `${process.env.HOME}/.local/state/auto-cron/heartbeat.json`,
  silenceGraceMs: Number(process.env.AUTO_CRON_SILENCE_GRACE_MIN ?? 60) * 60_000,
  silenceSweepMs: Number(process.env.AUTO_CRON_SILENCE_SWEEP_MIN ?? 5) * 60_000,
};

const ac = new AbortController();
const deps = buildDeps(cfg);

// Graceful shutdown — release the dashboard port and abort the scheduler
// loop. Without `dashboardServer.stop(true)` the listening socket lingers
// past process exit (observed: launchctl kickstart -k spawns a fresh bun
// instance that then EADDRINUSE because the previous bun is still holding
// :7891). See issue pigeonworks-llc/auto-cron#38.
let shuttingDown = false;
function shutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`auto-cron daemon: ${reason}, shutting down`);
  ac.abort();
  try {
    deps.dashboardServer.stop(true);
  } catch (e) {
    console.error("dashboard.stop() failed:", e);
  }
  // Give the scheduler loop one tick to observe `aborted`, then force-exit
  // so launchd sees us cleanly gone. Without this Bun may keep the process
  // alive for stray promise handles in the loop.
  setTimeout(() => process.exit(0), 100);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGHUP", () => {
  console.log("SIGHUP: reloading jobs.yaml");
  void deps.jobConfig.reload();
});

console.log(`auto-cron daemon starting (jobs=${deps.jobConfig.jobs().length}, dashboard=:${cfg.dashboardPort})`);

// scheduler tick: every 1 sec、due jobs を找って runJob / supervise を起動
// ServiceJob は startup で 1 度起動 + supervise loop、
// OneshotJob は schedule-tick で due 時に runJob spawn。

// silent-failure L2: daemon 生存下で個別 job が黙ったのを検知して warn 通知。
// 沈黙→復帰の遷移時のみ通知 (alertedSilent で重複抑止、再起動で reset は許容)。
const alertedSilent = new Set<string>();
async function runSilenceSweep(now: number, daemonStartedAt: number): Promise<void> {
  const oneshot = deps.jobConfig
    .jobs()
    .filter((j) => (j.lifecycle ?? "oneshot") === "oneshot") as readonly OneshotJob[];
  const lastStartedAt: Record<string, number | undefined> = {};
  for (const j of oneshot) {
    const recent = await deps.runStore.recent(j.name, 1);
    lastStartedAt[j.name] = recent[0]?.startedAt;
  }
  const silent = detectSilentJobs({
    jobs: oneshot,
    lastStartedAt,
    now,
    graceMs: cfg.silenceGraceMs,
    fallbackBase: daemonStartedAt,
    scheduler: deps.scheduler,
  });
  const silentNames = new Set(silent.map((s) => s.job.name));
  for (const name of [...alertedSilent]) {
    if (!silentNames.has(name)) alertedSilent.delete(name); // recovered
  }
  for (const s of silent) {
    if (alertedSilent.has(s.job.name)) continue; // already alerted this episode
    alertedSilent.add(s.job.name);
    const mins = Math.round(s.overdueByMs / 60_000);
    const run: JobRun = {
      jobId: s.job.name,
      runId: `silence-${now}`,
      attempt: 0,
      startedAt: s.expectedAt,
      finishedAt: now,
      exitCode: null,
      stdout: "",
      stderr: "",
      state: "failed",
      error: `job silent: overdue ${mins}m (expected fire at ${new Date(s.expectedAt).toISOString()})`,
    };
    await deps.notifier.notify({ job: s.job, run, severity: "warn" });
  }
}

async function loop() {
  const lastFireAt: Record<string, number> = {};
  const daemonStartedAt = deps.clock.now();
  let lastSweepAt = daemonStartedAt;
  mkdirSync(dirname(cfg.heartbeatPath), { recursive: true });
  while (!ac.signal.aborted) {
    // A single tick must never tear down the whole scheduler. Without this
    // guard a throw (e.g. a malformed cron in findDueJobs, or acquire) rejected
    // loop() while the process stayed alive — KeepAlive never fires, so ALL
    // scheduling stops silently. Catch per-tick, log, and continue.
    try {
      const now = deps.clock.now();
      // heartbeat footprint — 外部 watchdog (auto-cron-health) が mtime stale を見て
      // daemon 死活/ハングを検知する。tick が回っている = loop が生きている証拠。
      try {
        writeFileSync(
          cfg.heartbeatPath,
          JSON.stringify(buildHeartbeat(now, process.pid, deps.jobConfig.jobs().length)),
        );
      } catch (e) {
        console.error("auto-cron heartbeat write failed:", e);
      }
      // job 沈黙検知 sweep (低頻度)。
      if (now - lastSweepAt >= cfg.silenceSweepMs) {
        lastSweepAt = now;
        await runSilenceSweep(now, daemonStartedAt);
      }
      const due = deps.scheduleTick.findDueJobs({
        jobs: deps.jobConfig.jobs().filter(j => (j.lifecycle ?? "oneshot") === "oneshot") as readonly OneshotJob[],
        lastFireAt,
        clock: deps.clock,
        scheduler: deps.scheduler,
      });
      for (const d of due) {
        lastFireAt[d.job.name] = now;
        const acquire = deps.concurrencyController.acquire(d.job);
        if (!acquire.ok) continue;
        const { releaseToken } = acquire;
        const fireAt = now;
        // fire & forget runJob — 完了後に release。reject 時も release して
        // concurrency slot を leak させない (旧コードは .catch なしで
        // unhandled rejection + slot leak になりえた)。
        void deps.runJob(d.job, undefined, ac.signal)
          .then(async (outcome) => {
            deps.concurrencyController.release(releaseToken);
            if (outcome.finalFailure) {
              const run: JobRun = {
                jobId: d.job.name,
                runId: outcome.runIds[outcome.runIds.length - 1] ?? "",
                attempt: outcome.finalAttempt,
                startedAt: fireAt,
                finishedAt: deps.clock.now(),
                exitCode: outcome.finalExit.exitCode,
                stdout: outcome.finalExit.stdout,
                stderr: outcome.finalExit.stderr,
                state: "failed",
              };
              await deps.notifier.notify({ job: d.job, run, severity: "error" });
            }
          })
          .catch((err: unknown) => {
            deps.concurrencyController.release(releaseToken);
            console.error(`auto-cron runJob "${d.job.name}" rejected:`, err);
          });
      }
    } catch (e) {
      console.error("auto-cron scheduler tick error (continuing):", e);
    }
    await new Promise<void>(r => setTimeout(r, 1000));
  }
  console.log("auto-cron daemon exiting cleanly");
}

void loop();

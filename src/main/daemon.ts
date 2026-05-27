import type { OneshotJob } from "../core/entity/job";
import type { JobRun } from "../core/entity/job-run";
import { buildDeps } from "./di";

const cfg = {
  jobsYaml: process.env.AUTO_CRON_JOBS_YAML ?? `${process.env.HOME}/.config/auto-cron/jobs.yaml`,
  dbPath: process.env.AUTO_CRON_DB_PATH ?? `${process.env.HOME}/.local/share/auto-cron/runs.db`,
  dashboardPort: Number(process.env.AUTO_CRON_DASHBOARD_PORT ?? 7891),
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

async function loop() {
  const lastFireAt: Record<string, number> = {};
  while (!ac.signal.aborted) {
    const now = deps.clock.now();
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
      // fire & forget runJob — 完了後に release
      void deps.runJob(d.job, undefined, ac.signal).then(async (outcome) => {
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
      });
    }
    await new Promise<void>(r => setTimeout(r, 1000));
  }
  console.log("auto-cron daemon exiting cleanly");
}

void loop();

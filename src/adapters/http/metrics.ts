// metrics — Prometheus text-exposition renderer for the dashboard /metrics
// endpoint. Pure (data in → text out) so it is unit-tested without a server.
//
// Per-job lines are omitted for never-run jobs: their absence (vs the job being
// counted in auto_cron_jobs_total) is the deadman signal Prometheus detects via
// absent()/staleness — complementing the L3 daily inventory.

export interface MetricsInput {
  jobsTotal: number;
  perJob: ReadonlyArray<{
    name: string;
    lastRunMs: number | null;
    lastSuccess: boolean | null;
  }>;
}

function escapeLabel(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export function renderMetrics(input: MetricsInput): string {
  const lines: string[] = [];
  lines.push("# HELP auto_cron_jobs_total Number of configured jobs");
  lines.push("# TYPE auto_cron_jobs_total gauge");
  lines.push(`auto_cron_jobs_total ${input.jobsTotal}`);

  lines.push("# HELP auto_cron_last_run_timestamp_seconds Unix time of the most recent run start per job");
  lines.push("# TYPE auto_cron_last_run_timestamp_seconds gauge");
  for (const j of input.perJob) {
    if (j.lastRunMs === null) continue;
    lines.push(
      `auto_cron_last_run_timestamp_seconds{job="${escapeLabel(j.name)}"} ${Math.floor(j.lastRunMs / 1000)}`,
    );
  }

  lines.push("# HELP auto_cron_last_run_success Whether the most recent run succeeded (1) or not (0) per job");
  lines.push("# TYPE auto_cron_last_run_success gauge");
  for (const j of input.perJob) {
    if (j.lastSuccess === null) continue;
    lines.push(`auto_cron_last_run_success{job="${escapeLabel(j.name)}"} ${j.lastSuccess ? 1 : 0}`);
  }

  return lines.join("\n") + "\n";
}

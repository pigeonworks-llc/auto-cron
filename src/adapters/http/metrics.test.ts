import { describe, it, expect } from "bun:test";
import { renderMetrics } from "./metrics";

describe("renderMetrics", () => {
  it("emits jobs_total and per-job gauges for jobs with runs", () => {
    const out = renderMetrics({
      jobsTotal: 2,
      perJob: [
        { name: "fetch-data", lastRunMs: 1_716_000_000_000, lastSuccess: true },
        { name: "proc-data", lastRunMs: 1_716_000_500_000, lastSuccess: false },
      ],
    });
    expect(out).toContain("auto_cron_jobs_total 2");
    expect(out).toContain('auto_cron_last_run_timestamp_seconds{job="fetch-data"} 1716000000');
    expect(out).toContain('auto_cron_last_run_success{job="fetch-data"} 1');
    expect(out).toContain('auto_cron_last_run_success{job="proc-data"} 0');
  });

  it("omits per-job lines for never-run jobs (absent = deadman signal)", () => {
    const out = renderMetrics({
      jobsTotal: 1,
      perJob: [{ name: "never", lastRunMs: null, lastSuccess: null }],
    });
    expect(out).toContain("auto_cron_jobs_total 1");
    expect(out).not.toContain('job="never"');
  });

  it("includes HELP/TYPE header lines", () => {
    const out = renderMetrics({ jobsTotal: 0, perJob: [] });
    expect(out).toContain("# TYPE auto_cron_jobs_total gauge");
  });

  it("escapes label values", () => {
    const out = renderMetrics({
      jobsTotal: 1,
      perJob: [{ name: 'a"b\\c', lastRunMs: 1000, lastSuccess: true }],
    });
    expect(out).toContain('job="a\\"b\\\\c"');
  });
});

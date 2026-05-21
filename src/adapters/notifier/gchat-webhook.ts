import type { Job } from "../../core/entity/job";
import type { JobRun } from "../../core/entity/job-run";
import type { Notifier, Severity } from "../../core/port/notifier";

const DEFAULT_TIMEOUT_MS = 10_000;

export class GChatWebhookNotifier implements Notifier {
  constructor(
    private readonly webhookUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async notify(input: { job: Job; run: JobRun; severity: Severity }): Promise<void> {
    if (this.webhookUrl.length === 0) return; // webhook 未設定 → silent
    const text = formatMessage(input);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      await this.fetchFn(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
    } catch {
      // best-effort; webhook failure should not crash daemon
    } finally {
      clearTimeout(t);
    }
  }
}

function formatMessage(input: { job: Job; run: JobRun; severity: Severity }): string {
  const icon = input.severity === "error" ? "🔴" : input.severity === "warn" ? "🟡" : "🟢";
  return `${icon} auto-cron *${input.job.name}* — ${input.run.state} (attempt ${input.run.attempt}, exit ${input.run.exitCode ?? "n/a"})\n${input.run.error ?? ""}`;
}

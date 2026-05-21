import type { Job } from "../entity/job";
import type { JobRun } from "../entity/job-run";

// Notifier port — Phase H で severity-router adapter が
// NotifyPolicy.onFailure / onSuccess に応じて warn-digest 経路 / GChat webhook
// に振り分けて配信。
export type Severity = "error" | "warn" | "info";

export interface Notifier {
  notify(input: {
    job: Job;
    run: JobRun;
    severity: Severity;
  }): Promise<void>;
}

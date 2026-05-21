import type { Job } from "../../core/entity/job";
import type { JobRun } from "../../core/entity/job-run";
import type { Notifier, Severity } from "../../core/port/notifier";

export interface SeverityRouterDeps {
  warnDigestFile: Notifier;   // digest 経路
  gchatWebhook: Notifier;     // immediate 経路
}

export class SeverityRouter implements Notifier {
  constructor(private readonly deps: SeverityRouterDeps) {}

  async notify(input: { job: Job; run: JobRun; severity: Severity }): Promise<void> {
    // success path
    if (input.run.state === "succeeded") {
      const onSuccess = input.job.notify.onSuccess;
      if (onSuccess === "immediate") return this.deps.gchatWebhook.notify(input);
      return; // silent (default)
    }
    // failure path
    const onFailure = input.job.notify.onFailure;
    if (onFailure === "immediate") return this.deps.gchatWebhook.notify({ ...input, severity: "error" });
    if (onFailure === "digest") return this.deps.warnDigestFile.notify({ ...input, severity: "warn" });
    return; // silent
  }
}

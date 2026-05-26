import type { Job } from "../../core/entity/job";
import type { JobRun } from "../../core/entity/job-run";
import type { Notifier, Severity } from "../../core/port/notifier";

export interface SeverityRouterDeps {
  warnDigestFile: Notifier;   // digest 経路
  gchatWebhook: Notifier;     // immediate 経路
}

type Dispatch = "immediate" | "digest" | "silent";

export class SeverityRouter implements Notifier {
  constructor(private readonly deps: SeverityRouterDeps) {}

  async notify(input: { job: Job; run: JobRun; severity: Severity }): Promise<void> {
    // success path (unchanged)
    if (input.run.state === "succeeded") {
      const onSuccess = input.job.notify.onSuccess;
      if (onSuccess === "immediate") return this.deps.gchatWebhook.notify(input);
      return; // silent (default)
    }
    // failure path
    const policy = input.job.notify;

    // severity_routing precedence (ADR-0088): if a per-severity dispatch
    // is declared for this input.severity, use it. Otherwise fall through
    // to the flat onFailure enum.
    const routed = this.resolveRouted(policy, input.severity);
    const dispatch: Dispatch = routed ?? policy.onFailure;

    if (dispatch === "immediate") {
      return this.deps.gchatWebhook.notify({ ...input, severity: "error" });
    }
    if (dispatch === "digest") {
      return this.deps.warnDigestFile.notify({ ...input, severity: "warn" });
    }
    return; // silent
  }

  private resolveRouted(
    policy: Job["notify"],
    severity: Severity,
  ): Dispatch | undefined {
    const sr = policy.severity_routing;
    if (!sr) return undefined;
    // Map port Severity -> ADR routing key.
    //   port "error" ⇔ ADR "crit"
    //   port "warn"  ⇔ ADR "warn"
    //   port "info" never hits the failure path (success branch returns earlier).
    if (severity === "error") return sr.crit;
    if (severity === "warn") return sr.warn;
    return undefined;
  }
}

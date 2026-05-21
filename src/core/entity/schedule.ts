// Schedule — when a Job's next fire time should be computed.
//
// Three variants, discriminated by `kind`:
//
//   - cron     : standard 5-field cron expression. Optional timezone
//                (IANA name, e.g. "Asia/Tokyo"). Defaults to UTC when
//                omitted to match Bun's croner default.
//   - interval : fire every N seconds from the daemon's clock zero
//                (`daemon-started-at + n*seconds`). Useful for poll
//                loops whose phase doesn't matter.
//   - manual   : never fires automatically. Only reachable via
//                `auto-cron run <name>` or as a downstream of another
//                job's success (Phase G dependency resolution).
//
// The discriminator is `kind` (not `type`) to match the convention used
// across auto-forge entities (PublishTarget, MergeOutcome, etc.) — keeps
// the cross-repo concept fork mechanical.
export type Schedule =
  | { kind: "cron"; expr: string; timezone?: string }
  | { kind: "interval"; seconds: number }
  | { kind: "manual" };

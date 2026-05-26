// NotifyPolicy — how a Job's final outcome translates to user-facing alerts.
//
// onFailure 値別の severity mapping (severity-router adapter で振り分け):
//   immediate → severity=error → GChat webhook 即時 (重大、 即対応)
//   digest    → severity=warn  → ~/.local/var/log/auto-cron/<job>.err 追記 → 既存 warn-digest 朝集約
//   silent    → severity=none  → no-op (run history には残る、 通知のみ抑制)
//
// onSuccess は opt-in。 default silent (省略時)。 immediate にすると
// 「正常終了の通知も即時」 (デプロイ完了通知用途など、 まれ)。
//
// severity_routing (opt-in、 ADR-0088 CI 3-layer 由来):
//   Job が `severity` (= ADR の crit / warn) を区別して発火する場合、
//   onFailure flat enum より per-severity dispatch を優先する。
//   key と Notifier port の Severity の対応:
//     severity_routing.crit ⇔ input.severity = "error"
//     severity_routing.warn ⇔ input.severity = "warn"
//   該当 severity の dispatch が未指定なら flat enum (onFailure) に fallback。
//   例: { warn: "digest", crit: "immediate" } = warn は朝の digest 集約に、
//       crit は GChat 即時通知。
export interface NotifyPolicy {
  onFailure: "immediate" | "digest" | "silent";
  onSuccess?: "immediate" | "silent";
  severity_routing?: {
    warn?: "immediate" | "digest" | "silent";
    crit?: "immediate" | "digest" | "silent";
  };
}

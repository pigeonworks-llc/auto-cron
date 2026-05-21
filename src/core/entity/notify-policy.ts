// NotifyPolicy — how a Job's final outcome translates to user-facing alerts.
//
// onFailure 値別の severity mapping (severity-router adapter で振り分け):
//   immediate → severity=error → GChat webhook 即時 (重大、 即対応)
//   digest    → severity=warn  → ~/.local/var/log/auto-cron/<job>.err 追記 → 既存 warn-digest 朝集約
//   silent    → severity=none  → no-op (run history には残る、 通知のみ抑制)
//
// onSuccess は opt-in。 default silent (省略時)。 immediate にすると
// 「正常終了の通知も即時」 (デプロイ完了通知用途など、 まれ)。
export interface NotifyPolicy {
  onFailure: "immediate" | "digest" | "silent";
  onSuccess?: "immediate" | "silent";
}

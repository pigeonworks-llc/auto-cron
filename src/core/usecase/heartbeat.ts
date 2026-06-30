// heartbeat — daemon が生きている footprint。watchdog (外部 launchd health-check)
// が heartbeat ファイルの mtime / ts を見て stale を判定する。
// auto-forge-health.sh と同形 (heartbeat.json mtime stale → alert + recover)。

export interface Heartbeat {
  /** epoch ms。最後に tick が回った時刻。 */
  ts: number;
  /** daemon プロセス pid (recovery 時の参考)。 */
  pid: number;
  /** その時点でロードされている job 数 (config 健全性の目安)。 */
  jobCount: number;
}

export function buildHeartbeat(now: number, pid: number, jobCount: number): Heartbeat {
  return { ts: now, pid, jobCount };
}

// ConcurrencyPolicy — per-Job overlap / group / queue 制御。
//
// onOverlap 値別の挙動 (check-concurrency usecase で gate):
//   skip          (default) 前 run 進行中なら新 fire を skipped-overlap で記録
//   queue         前 run 完了まで wait、 queueDepth (default 1) 超過は skipped-queue-full
//   killPrevious  前 run に SIGTERM (10s 後 SIGKILL fallback)、 新 run 起動
//   concurrent    制限なし、 並列実行 (stateless / read-only のみ)
//
// group は optional — set すると同 group の Job 群が serialize (group mutex)。
// queueDepth は onOverlap="queue" の時のみ意味あり (default 1)。
export interface ConcurrencyPolicy {
  onOverlap: "skip" | "queue" | "killPrevious" | "concurrent";
  group?: string;
  queueDepth?: number;
}

// GlobalConcurrencyConfig — daemon-wide cap + per-group cap。
//
// maxConcurrentJobs : daemon 全体での並列 max (default 4)。
//                     CPU 飽和防止。 cron fire が来た時 cap を超えていれば
//                     per-job onOverlap の policy に従って skip / queue。
// groupMax          : per-group の並列 max (default 1)。 例: {gpu: 1, "network-scan": 2}
export interface GlobalConcurrencyConfig {
  maxConcurrentJobs: number;
  groupMax?: Readonly<Record<string, number>>;
}

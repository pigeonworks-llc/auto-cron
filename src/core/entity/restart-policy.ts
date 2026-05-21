// RestartPolicy — ServiceJob lifecycle の crash-loop backoff。
//
// RetryPolicy が「同 attempt の再実行」 なのに対し、 RestartPolicy は
// 「service crash 後の再起動」 を表す:
//   RetryPolicy.maxAttempts = N 回試して失敗したら final-failure (oneshot)
//   RestartPolicy.maxRestarts = N 回 crash したら supervisor 諦め
//                                (undefined / 0 = 無限、 service の通常)
//
// backoffMs は restart 間隔。 over-range は last value 再利用 (RetryPolicy と同 semantics)。
// resetAfterSec = service が起動後この秒数以上 alive なら crash counter リセット
//                 (健全 restart vs crash-loop の判別、 default 60)。
export interface RestartPolicy {
  backoffMs: readonly number[];
  maxRestarts?: number;
  resetAfterSec?: number;
}

/**
 * Pre-restart wait. Attempts are 1-indexed (attempt=1 is first spawn,
 * attempt=2 is first restart after crash, ...). RetryPolicy と同 semantics:
 *   attempt <= 1 → 0
 *   in-range → backoffMs[attempt-2]
 *   over-range → backoffMs[length-1] (steady-state)
 *   empty backoffMs → 0
 */
export function restartBackoffMsForAttempt(
  policy: RestartPolicy,
  attempt: number,
): number {
  if (attempt <= 1) return 0;
  if (policy.backoffMs.length === 0) return 0;
  const idx = Math.min(attempt - 2, policy.backoffMs.length - 1);
  const ms = policy.backoffMs[idx];
  return ms ?? 0;
}

// RetryPolicy — describes the retry envelope around a Job's exec.
//
// - maxAttempts : 1 = no retry; N>1 = up to N runs of the same Job
//                 instance (failure → wait backoffMs[i-2] → next attempt).
// - backoffMs   : pre-wait between attempts. Length is conventionally
//                 maxAttempts-1 but not enforced: a shorter array reuses
//                 its LAST value for further attempts (steady-state
//                 backoff), an empty array means 0ms pre-wait throughout.
//                 Sized in milliseconds so YAML authors don't lose
//                 resolution and so the type aligns with setTimeout.
//
// The plan documents this contract explicitly so future authors aren't
// surprised by the "reuse last value" semantics; `backoffMsForAttempt`
// is the single chokepoint that implements it.
export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: readonly number[];
}

/**
 * Pre-attempt wait. Attempts are 1-indexed (attempt=1 is the first run,
 * attempt=2 is the first retry, ...). Returns 0 for the initial attempt
 * and clamps to the last array entry for out-of-range attempts.
 *
 * Defensive on the lower bound: `attempt <= 1` always returns 0 so a
 * caller bug (e.g. accidentally passing 0) doesn't crash the scheduler
 * with a NaN-from-undefined-arithmetic later.
 */
export function backoffMsForAttempt(
  policy: RetryPolicy,
  attempt: number,
): number {
  if (attempt <= 1) return 0;
  if (policy.backoffMs.length === 0) return 0;
  const idx = Math.min(attempt - 2, policy.backoffMs.length - 1);
  // idx is guaranteed in [0, length-1] by Math.min above; the
  // noUncheckedIndexedAccess return narrows once we assert.
  const ms = policy.backoffMs[idx];
  return ms ?? 0;
}

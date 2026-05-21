// JobRunState — 1 つの run instance の lifecycle state。 OneshotJob と
// ServiceJob 両方で再利用。
//
// queued / running / succeeded / failed は通常 lifecycle (両 lifecycle 共通)。
// skipped-* は OneshotJob 専用 (check-deps / check-concurrency が gate)。
// blocked-parent-failed は OneshotJob の cascade-failure marker。
// killed-by-overlap は ConcurrencyPolicy.onOverlap="killPrevious" で消された run。
// service-crashed は ServiceJob 専用 (supervise が restart する間の state)。
export type JobRunState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped-overlap"
  | "skipped-queue-full"
  | "skipped-dep-not-met"
  | "blocked-parent-failed"
  | "killed-by-overlap"
  | "service-crashed";

export interface JobRun {
  jobId: string;          // = Job.name
  runId: string;          // ULID (生成は run-store adapter で)
  attempt: number;        // 1-indexed; retry / restart の N 回目
  startedAt: number;      // epoch ms
  finishedAt: number | null;
  exitCode: number | null;
  stdout: string;            // truncated to last ~64KB by adapter
  stderr: string;            // 同上
  state: JobRunState;
  error?: string;
}

import type { JobRun, JobRunState } from "../entity/job-run";

// RunStore port — JobRun の永続化。 Phase C で sqlite-run-store が impl。
export interface RunStore {
  /** 新規 run record (state="queued" or "running")。 ULID 生成は adapter 側。 */
  insert(input: Omit<JobRun, "runId">): Promise<string>; // returns runId
  /** state + finishedAt + exitCode + stdout/stderr/error の patch。 */
  setState(
    runId: string,
    patch: { state: JobRunState; finishedAt?: number; exitCode?: number | null; stdout?: string; stderr?: string; error?: string },
  ): Promise<void>;
  /** 該当 Job の最新 N 件 (新しい順)。 default 10。 */
  recent(jobId: string, limit?: number): Promise<readonly JobRun[]>;
  /** 該当 Job の latest succeeded (check-deps が呼ぶ)。 */
  latestSucceeded(jobId: string): Promise<JobRun | null>;
  /** state="running" の row 全部 (zombie sweep 用、 boot 時 cleanup)。 */
  runningRuns(): Promise<readonly JobRun[]>;
}

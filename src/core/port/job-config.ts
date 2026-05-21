import type { Job } from "../entity/job";
import type { GlobalConcurrencyConfig } from "../entity/concurrency-policy";

// JobConfig port — YAML jobs.yaml から read-only に Job[] と global config を供給。
// Phase D で yaml-job-config adapter が impl、 SIGHUP reload で内部 state 更新。
export interface JobConfig {
  /** すべての登録 Job (順序は YAML 通り)。 */
  jobs(): readonly Job[];
  /** Global concurrency cap 等。 */
  global(): GlobalConcurrencyConfig;
  /** YAML を読み直す (SIGHUP handler から呼ぶ)。 */
  reload(): Promise<void>;
}

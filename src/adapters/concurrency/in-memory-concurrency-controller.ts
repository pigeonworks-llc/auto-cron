import type { Job } from "../../core/entity/job";
import type { ConcurrencyController, AcquireResult } from "../../core/port/concurrency-controller";
import type { GlobalConcurrencyConfig } from "../../core/entity/concurrency-policy";

interface RunningEntry {
  releaseToken: string;
  jobName: string;
  group: string | undefined;
}

let _tokenSeq = 0;
function newToken(): string {
  return `tok-${++_tokenSeq}-${Date.now()}`;
}

export class InMemoryConcurrencyController implements ConcurrencyController {
  private running = new Map<string, RunningEntry>();   // token → entry
  private runningJobs = new Set<string>();              // job names currently running (overlap detection)

  constructor(private readonly globalConfig: () => GlobalConcurrencyConfig) {}

  acquire(job: Job): AcquireResult {
    const cfg = this.globalConfig();
    // 1. overlap (per-job、 onOverlap="skip" の場合)
    if (this.runningJobs.has(job.name) && job.concurrency?.onOverlap === "skip") {
      return { ok: false, reason: "overlap" };
    }
    // 2. global cap
    if (this.running.size >= cfg.maxConcurrentJobs) {
      return { ok: false, reason: "global-cap" };
    }
    // 3. group cap
    const group = job.concurrency?.group;
    if (group !== undefined) {
      const groupMax = cfg.groupMax?.[group] ?? 1;
      const groupRunning = Array.from(this.running.values()).filter((e) => e.group === group).length;
      if (groupRunning >= groupMax) {
        return { ok: false, reason: "group-cap" };
      }
    }
    const token = newToken();
    this.running.set(token, { releaseToken: token, jobName: job.name, group });
    this.runningJobs.add(job.name);
    return { ok: true, releaseToken: token };
  }

  release(releaseToken: string): void {
    const entry = this.running.get(releaseToken);
    if (entry === undefined) return;
    this.running.delete(releaseToken);
    // job が同 name の別 attempt で running 中の場合は keep。
    // 単一 instance 前提の overlap detection なので、 同名 job が他に running なら名前を維持。
    const stillRunning = Array.from(this.running.values()).some((e) => e.jobName === entry.jobName);
    if (!stillRunning) this.runningJobs.delete(entry.jobName);
  }

  snapshot(): { running: number; perGroup: Readonly<Record<string, number>> } {
    const perGroup: Record<string, number> = {};
    for (const e of this.running.values()) {
      if (e.group !== undefined) {
        perGroup[e.group] = (perGroup[e.group] ?? 0) + 1;
      }
    }
    return { running: this.running.size, perGroup };
  }
}

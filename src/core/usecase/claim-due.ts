import type { OneshotJob } from "../entity/job";
import type { ConcurrencyController } from "../port/concurrency-controller";
import type { DueJob } from "./schedule-tick";

// claim-due — due な OneshotJob に concurrency slot を取り、成功時だけ
// lastFireAt を進めて due を消費する。
//
// 2026-08-03 incident (intel-briefing-claude-code-audit-weekly silent):
// daemon が acquire 前に lastFireAt を更新していたため、global-cap で枠落ちした
// job が「発火済み」扱いになり同一 schedule 窓で再 try されず、沈黙アラートに
// なった。due 消費は「開始 or 意図的 skip」に限る。

export type ClaimStart = {
  kind: "start";
  job: OneshotJob;
  releaseToken: string;
};

export type ClaimDefer = {
  kind: "defer";
  job: OneshotJob;
  reason: "global-cap" | "group-cap";
};

export type ClaimSkip = {
  kind: "skip";
  job: OneshotJob;
  reason: "overlap";
};

export type ClaimResult = ClaimStart | ClaimDefer | ClaimSkip;

export interface ClaimDueInput {
  due: readonly DueJob[];
  /** mutated: start / overlap-skip のときだけ job.name を now で更新 */
  lastFireAt: Record<string, number>;
  now: number;
  controller: ConcurrencyController;
}

/**
 * claimDueJobs — due 一覧を順に claim する。
 *
 * | acquire 結果 | lastFireAt | 意味 |
 * |---|---|---|
 * | ok | 更新 | 実行開始。caller が runJob + 後で release |
 * | global-cap / group-cap | 非更新 | defer。次 tick で再 due |
 * | overlap | 更新 | 意図的 skip (onOverlap:skip)。この予定枠は消費 |
 */
export function claimDueJobs(input: ClaimDueInput): readonly ClaimResult[] {
  const out: ClaimResult[] = [];
  for (const d of input.due) {
    const acquire = input.controller.acquire(d.job);
    if (!acquire.ok) {
      if (acquire.reason === "overlap") {
        input.lastFireAt[d.job.name] = input.now;
        out.push({ kind: "skip", job: d.job, reason: "overlap" });
      } else {
        out.push({ kind: "defer", job: d.job, reason: acquire.reason });
      }
      continue;
    }
    input.lastFireAt[d.job.name] = input.now;
    out.push({
      kind: "start",
      job: d.job,
      releaseToken: acquire.releaseToken,
    });
  }
  return out;
}

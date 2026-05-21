import type { Job } from "../entity/job";

// ConcurrencyController port — Phase G2 で daemon 内 in-memory state を持つ
// adapter が impl。 acquire / release は atomic (mutex 風)。
//
// acquire() の return:
//   { ok: true, releaseToken } — slot 取得成功、 release(releaseToken) で返す
//   { ok: false, reason: "global-cap" } — global cap exceeded
//   { ok: false, reason: "group-cap" } — group cap exceeded
//   { ok: false, reason: "overlap" } — onOverlap=skip の場合の重複検出
//
// killPrevious / queue は controller の責務外 (caller が決定、 controller は
// 「slot 取得可否」 だけを返す pure gate)。
export type AcquireResult =
  | { ok: true; releaseToken: string }
  | { ok: false; reason: "global-cap" | "group-cap" | "overlap" };

export interface ConcurrencyController {
  acquire(job: Job): AcquireResult;
  release(releaseToken: string): void;
  /** 観察用: 現在の running 数 (global) + per-group breakdown。 */
  snapshot(): { running: number; perGroup: Readonly<Record<string, number>> };
}

// Executor port — Bun.spawn を抽象化。 Phase E で bun-spawn-executor が impl。
//
// run() は spawn → wait → 結果 return。 onKill は signal 経由で SIGTERM/SIGKILL
// 送出 (killPrevious 用)。 内部実装は detached process group + kill -PGID で
// child subprocess も一緒に死ぬようにする。
export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  killed: boolean;  // true なら caller が SIGTERM 経由で殺した
}

export interface Executor {
  run(input: {
    command: readonly string[];
    env?: Readonly<Record<string, string>>;
    cwd?: string;
    /** AbortSignal を渡すと SIGTERM 経由で kill 可。 10s 後 SIGKILL fallback。 */
    signal?: AbortSignal;
  }): Promise<ExecResult>;
}

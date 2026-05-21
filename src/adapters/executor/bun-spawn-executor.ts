import type { Executor, ExecResult } from "../../core/port/executor";

/**
 * BunSpawnExecutor — Executor port の Bun.spawn による実装。
 *
 * - signal: AbortSignal を渡すと SIGTERM で kill し、 10s 後に SIGKILL fallback。
 * - stdout / stderr: 64 KB tail に切り詰め (大量出力の store 肥大化防止)。
 * - env: 指定時は process.env とマージ (input.env が上書き)。 未指定時は Bun
 *   デフォルト (parent env 引き継ぎ) に任せる。
 */
export class BunSpawnExecutor implements Executor {
  async run(input: {
    command: readonly string[];
    env?: Readonly<Record<string, string>>;
    cwd?: string;
    signal?: AbortSignal;
  }): Promise<ExecResult> {
    if (input.command.length === 0) {
      return { exitCode: -1, stdout: "", stderr: "empty command", killed: false };
    }

    const proc = Bun.spawn({
      cmd: [...input.command],
      env:
        input.env !== undefined
          ? { ...process.env, ...input.env }
          : undefined,
      cwd: input.cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    // signal-based kill + 10s SIGKILL fallback
    let killed = false;
    if (input.signal !== undefined) {
      const onAbort = () => {
        killed = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 10_000);
      };
      input.signal.addEventListener("abort", onAbort, { once: true });
    }

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    // 64 KB tail to cap stored output
    const tail = (s: string): string =>
      s.length > 64_000 ? s.slice(-64_000) : s;

    return {
      exitCode: exitCode ?? -1,
      stdout: tail(stdout),
      stderr: tail(stderr),
      killed,
    };
  }
}

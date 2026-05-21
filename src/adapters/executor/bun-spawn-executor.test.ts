import { describe, it, expect } from "bun:test";
import { BunSpawnExecutor } from "./bun-spawn-executor";

const executor = new BunSpawnExecutor();

describe("BunSpawnExecutor — basic execution", () => {
  it("echo hello → exitCode=0, stdout contains 'hello'", async () => {
    const result = await executor.run({ command: ["echo", "hello"] });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
    expect(result.killed).toBe(false);
  });

  it("bash -c 'exit 7' → exitCode=7", async () => {
    const result = await executor.run({ command: ["bash", "-c", "exit 7"] });
    expect(result.exitCode).toBe(7);
    expect(result.killed).toBe(false);
  });

  it("empty command → defensive return with exitCode=-1", async () => {
    const result = await executor.run({ command: [] });
    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("empty command");
    expect(result.killed).toBe(false);
  });

  it("env passthrough: bash -c 'echo $X' with env={X:'y'} → stdout='y'", async () => {
    const result = await executor.run({
      command: ["bash", "-c", "echo $X"],
      env: { X: "y" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("y");
  });

  it("captures stderr output", async () => {
    const result = await executor.run({
      command: ["bash", "-c", "echo err >&2; exit 1"],
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.trim()).toBe("err");
  });
});

describe("BunSpawnExecutor — abort signal", () => {
  it("abort signal kills long-running process; killed=true", async () => {
    const controller = new AbortController();
    // Abort after 100ms
    const timer = setTimeout(() => controller.abort(), 100);
    try {
      const result = await executor.run({
        command: ["sleep", "60"],
        signal: controller.signal,
      });
      expect(result.killed).toBe(true);
      // exit code is non-zero when killed (signal-based termination)
      expect(result.exitCode).not.toBe(0);
    } finally {
      clearTimeout(timer);
    }
  });
});

import { describe, it, expect, afterEach } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WarnDigestFileNotifier } from "./warn-digest-file";

function makeTmpDir(): string {
  return join(tmpdir(), `auto-cron-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

const cleanupDirs: string[] = [];

afterEach(async () => {
  for (const dir of cleanupDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("WarnDigestFileNotifier", () => {
  it("creates file and writes timestamp line on notify", async () => {
    const logDir = makeTmpDir();
    cleanupDirs.push(logDir);
    const notifier = new WarnDigestFileNotifier(logDir);

    const finishedAt = new Date("2024-01-15T10:00:00.000Z").getTime();
    await notifier.notify({
      job: { name: "my-job" },
      run: { state: "failed", finishedAt, error: "exit 1" },
    });

    const content = await readFile(join(logDir, "my-job.err"), "utf8");
    expect(content).toContain("2024-01-15T10:00:00.000Z");
    expect(content).toContain("failed");
    expect(content).toContain("exit 1");
    expect(content.endsWith("\n")).toBe(true);
  });

  it("appends to existing file on subsequent notify calls", async () => {
    const logDir = makeTmpDir();
    cleanupDirs.push(logDir);
    const notifier = new WarnDigestFileNotifier(logDir);

    const finishedAt = new Date("2024-01-15T10:00:00.000Z").getTime();
    await notifier.notify({
      job: { name: "my-job" },
      run: { state: "failed", finishedAt, error: "first" },
    });
    await notifier.notify({
      job: { name: "my-job" },
      run: { state: "failed", finishedAt: finishedAt + 1000, error: "second" },
    });

    const content = await readFile(join(logDir, "my-job.err"), "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("first");
    expect(lines[1]).toContain("second");
  });

  it("writes '(no detail)' when error field is missing", async () => {
    const logDir = makeTmpDir();
    cleanupDirs.push(logDir);
    const notifier = new WarnDigestFileNotifier(logDir);

    await notifier.notify({
      job: { name: "my-job" },
      run: { state: "failed", finishedAt: Date.now() },
    });

    const content = await readFile(join(logDir, "my-job.err"), "utf8");
    expect(content).toContain("(no detail)");
  });
});

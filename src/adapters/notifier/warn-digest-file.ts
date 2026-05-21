import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { Notifier } from "../../core/port/notifier";

const DEFAULT_LOG_DIR = join(homedir(), ".local/var/log/auto-cron");

export class WarnDigestFileNotifier implements Notifier {
  constructor(private readonly logDir: string = DEFAULT_LOG_DIR) {}

  async notify(input: { job: { name: string }; run: { state: string; finishedAt: number | null; error?: string } }): Promise<void> {
    const path = join(this.logDir, `${input.job.name}.err`);
    await mkdir(dirname(path), { recursive: true });
    const ts = new Date(input.run.finishedAt ?? Date.now()).toISOString();
    const line = `${ts} ${input.run.state}: ${input.run.error ?? "(no detail)"}\n`;
    await appendFile(path, line, "utf8");
  }
}

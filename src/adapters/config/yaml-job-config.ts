import { readFileSync } from "node:fs";
import { parse as yamlParse } from "yaml";
import type { JobConfig } from "../../core/port/job-config";
import type { Job } from "../../core/entity/job";
import type { GlobalConcurrencyConfig } from "../../core/entity/concurrency-policy";
import { validateYamlJobsFile, type YamlJobsFile } from "./yaml-schema";

export class YamlJobConfig implements JobConfig {
  private cache: YamlJobsFile = { jobs: [] };

  constructor(private readonly filePath: string) {
    this.loadSync();
  }

  jobs(): readonly Job[] {
    return this.cache.jobs;
  }

  global(): GlobalConcurrencyConfig {
    return this.cache.global ?? { maxConcurrentJobs: 4 };
  }

  async reload(): Promise<void> {
    this.loadSync();
  }

  private loadSync(): void {
    const raw = readFileSync(this.filePath, "utf8");
    const parsed: unknown = yamlParse(raw);
    const v = validateYamlJobsFile(parsed);
    if (!v.ok) {
      throw new Error(
        `YAML config invalid:\n${v.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n")}`,
      );
    }
    this.cache = v.value;
  }
}

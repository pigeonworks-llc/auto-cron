import type { Job } from "../../core/entity/job";

export function renderJobDag(jobs: readonly Job[]): string {
  const lines: string[] = ["graph TD"];
  for (const job of jobs) {
    const label = `${job.name}\\n(${job.lifecycle ?? "oneshot"})`;
    lines.push(`  ${nodeId(job.name)}["${label}"]`);
  }
  for (const job of jobs) {
    if (job.lifecycle === "service") continue;
    const deps = (job as { dependsOn?: readonly string[] }).dependsOn ?? [];
    for (const depName of deps) {
      lines.push(`  ${nodeId(depName)} --> ${nodeId(job.name)}`);
    }
  }
  return lines.join("\n");
}

function nodeId(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

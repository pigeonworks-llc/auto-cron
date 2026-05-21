import type { Server } from "bun";
import type { JobConfig } from "../../core/port/job-config";
import type { RunStore } from "../../core/port/run-store";
import { SseChannel, formatSseFrame } from "./sse-channel";
import { renderJobDag } from "./render-mermaid";

export interface DashboardDeps {
  jobConfig: JobConfig;
  runStore: RunStore;
  port?: number;
  hostname?: string;
  events?: SseChannel;
}

export function startDashboard(deps: DashboardDeps): Server<undefined> {
  const port = deps.port ?? 7891;
  const hostname = deps.hostname ?? "localhost";
  const events = deps.events ?? new SseChannel();

  return Bun.serve({
    port,
    hostname,
    fetch: async (req) => {
      const url = new URL(req.url);
      if (url.pathname === "/") {
        const jobs = deps.jobConfig.jobs();
        const dag = renderJobDag(jobs);
        const html = `<!doctype html><html><body><h1>auto-cron dashboard</h1>
<h2>Jobs (${jobs.length})</h2><ul>${jobs.map(j => `<li>${j.name} (${j.lifecycle ?? "oneshot"})</li>`).join("")}</ul>
<h2>DAG</h2><pre>${dag}</pre>
<h2>Events</h2><p><a href="/events">SSE stream</a></p></body></html>`;
        return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      if (url.pathname === "/jobs") {
        return Response.json(deps.jobConfig.jobs());
      }
      if (url.pathname.startsWith("/runs/")) {
        const jobId = decodeURIComponent(url.pathname.slice("/runs/".length));
        const runs = await deps.runStore.recent(jobId, 20);
        return Response.json(runs);
      }
      if (url.pathname === "/events") {
        let unsubscribe: (() => void) | null = null;
        const stream = new ReadableStream({
          start(controller) {
            // Send an initial keepalive comment so the HTTP response is flushed
            // to the client immediately (before any events arrive).
            controller.enqueue(new TextEncoder().encode(": ping\n\n"));
            unsubscribe = events.subscribe((ev) => {
              controller.enqueue(new TextEncoder().encode(formatSseFrame(ev)));
            });
          },
          cancel() {
            if (unsubscribe !== null) unsubscribe();
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
      return new Response("Not Found", { status: 404 });
    },
  });
}

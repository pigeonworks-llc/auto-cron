import type { ServerWebSocket } from "bun";

export interface SseEvent {
  event?: string;
  data: string;
}

export class SseChannel {
  private subscribers = new Set<(event: SseEvent) => void>();

  subscribe(fn: (event: SseEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  publish(event: SseEvent): void {
    for (const sub of this.subscribers) {
      try {
        sub(event);
      } catch {
        /* swallow */
      }
    }
  }

  size(): number {
    return this.subscribers.size;
  }
}

export function formatSseFrame(event: SseEvent): string {
  const lines: string[] = [];
  if (event.event !== undefined) lines.push(`event: ${event.event}`);
  for (const line of event.data.split("\n")) lines.push(`data: ${line}`);
  lines.push("", "");
  return lines.join("\n");
}

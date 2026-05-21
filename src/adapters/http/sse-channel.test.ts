import { describe, it, expect } from "bun:test";
import { SseChannel, formatSseFrame } from "./sse-channel";
import type { SseEvent } from "./sse-channel";

describe("SseChannel", () => {
  it("subscribe → publish → unsubscribe round-trip", () => {
    const ch = new SseChannel();
    const received: SseEvent[] = [];
    const unsub = ch.subscribe((ev) => received.push(ev));

    ch.publish({ data: "first" });
    unsub();
    ch.publish({ data: "second" });

    expect(received).toHaveLength(1);
    expect(received[0]!.data).toBe("first");
  });

  it("size() tracks subscriber count correctly", () => {
    const ch = new SseChannel();
    expect(ch.size()).toBe(0);

    const u1 = ch.subscribe(() => {});
    expect(ch.size()).toBe(1);

    const u2 = ch.subscribe(() => {});
    expect(ch.size()).toBe(2);

    u1();
    expect(ch.size()).toBe(1);

    u2();
    expect(ch.size()).toBe(0);
  });

  it("publish swallows subscriber errors without propagating", () => {
    const ch = new SseChannel();
    ch.subscribe(() => {
      throw new Error("subscriber boom");
    });
    expect(() => ch.publish({ data: "x" })).not.toThrow();
  });

  it("multiple subscribers all receive the same event", () => {
    const ch = new SseChannel();
    const a: string[] = [];
    const b: string[] = [];
    ch.subscribe((ev) => a.push(ev.data));
    ch.subscribe((ev) => b.push(ev.data));

    ch.publish({ data: "hello" });
    expect(a).toEqual(["hello"]);
    expect(b).toEqual(["hello"]);
  });
});

describe("formatSseFrame", () => {
  it("single-line data produces one data: line followed by blank lines", () => {
    expect(formatSseFrame({ data: "hello" })).toBe("data: hello\n\n");
  });

  it("multi-line data splits into multiple data: lines", () => {
    expect(formatSseFrame({ data: "line1\nline2" })).toBe("data: line1\ndata: line2\n\n");
  });

  it("event field is prepended before data lines when provided", () => {
    expect(formatSseFrame({ event: "update", data: "payload" })).toBe(
      "event: update\ndata: payload\n\n",
    );
  });

  it("event field is omitted when not provided", () => {
    const frame = formatSseFrame({ data: "no-event" });
    expect(frame).not.toContain("event:");
    expect(frame).toContain("data: no-event");
  });
});

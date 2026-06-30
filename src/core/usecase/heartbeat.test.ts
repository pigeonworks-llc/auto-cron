import { describe, it, expect } from "bun:test";
import { buildHeartbeat } from "./heartbeat";

describe("buildHeartbeat", () => {
  it("captures ts / pid / jobCount", () => {
    const hb = buildHeartbeat(1_700_000_000_000, 4242, 40);
    expect(hb).toEqual({ ts: 1_700_000_000_000, pid: 4242, jobCount: 40 });
  });

  it("is a plain JSON-serializable object", () => {
    const hb = buildHeartbeat(1, 2, 3);
    expect(JSON.parse(JSON.stringify(hb))).toEqual(hb);
  });
});

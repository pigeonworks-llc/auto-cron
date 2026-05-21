import { describe, it, expect } from "bun:test";
import { VERSION } from "./version";

describe("VERSION", () => {
  it("exports a non-empty semver-shaped string (Phase A toolchain smoke)", () => {
    expect(typeof VERSION).toBe("string");
    expect(VERSION.length).toBeGreaterThan(0);
    // Loose semver check — accepts 0.0.1 or 0.0.1-rc.1 etc. without
    // forcing a strict ABNF parser at Phase A.
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

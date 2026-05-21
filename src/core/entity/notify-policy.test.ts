import { describe, it, expect } from "bun:test";
import type { NotifyPolicy } from "./notify-policy";

describe("NotifyPolicy entity", () => {
  it("accepts onFailure=immediate without onSuccess (default silent)", () => {
    const p: NotifyPolicy = { onFailure: "immediate" };
    expect(p.onFailure).toBe("immediate");
    expect(p.onSuccess).toBeUndefined();
  });

  it("accepts onFailure=digest without onSuccess", () => {
    const p: NotifyPolicy = { onFailure: "digest" };
    expect(p.onFailure).toBe("digest");
    expect(p.onSuccess).toBeUndefined();
  });

  it("accepts onFailure=silent without onSuccess", () => {
    const p: NotifyPolicy = { onFailure: "silent" };
    expect(p.onFailure).toBe("silent");
    expect(p.onSuccess).toBeUndefined();
  });

  it("accepts optional onSuccess=immediate", () => {
    const p: NotifyPolicy = { onFailure: "immediate", onSuccess: "immediate" };
    expect(p.onFailure).toBe("immediate");
    expect(p.onSuccess).toBe("immediate");
  });

  it("accepts optional onSuccess=silent", () => {
    const p: NotifyPolicy = { onFailure: "digest", onSuccess: "silent" };
    expect(p.onFailure).toBe("digest");
    expect(p.onSuccess).toBe("silent");
  });

  it("exhaustive switch narrowing over all 3 onFailure values", () => {
    const values: NotifyPolicy["onFailure"][] = ["immediate", "digest", "silent"];
    for (const v of values) {
      const p: NotifyPolicy = { onFailure: v };
      // exhaustive switch — every variant produces the expected string
      switch (p.onFailure) {
        case "immediate":
          expect(p.onFailure).toBe("immediate");
          break;
        case "digest":
          expect(p.onFailure).toBe("digest");
          break;
        case "silent":
          expect(p.onFailure).toBe("silent");
          break;
        default:
          // TypeScript should prove this is unreachable
          const _exhaustive: never = p.onFailure;
          throw new Error(`unhandled onFailure variant: ${_exhaustive}`);
      }
    }
  });

  it("exhaustive switch narrowing over both onSuccess values (when present)", () => {
    const values: NonNullable<NotifyPolicy["onSuccess"]>[] = ["immediate", "silent"];
    for (const v of values) {
      // exhaustive switch
      switch (v) {
        case "immediate":
          expect(v).toBe("immediate");
          break;
        case "silent":
          expect(v).toBe("silent");
          break;
        default:
          const _exhaustive: never = v;
          throw new Error(`unhandled onSuccess variant: ${_exhaustive}`);
      }
    }
  });

  it("rejects invalid onFailure values at runtime (TypeScript would catch at compile time)", () => {
    // Runtime assertion via a builder function (simulates what a YAML parser would reject)
    function isValidOnFailure(v: string): v is NotifyPolicy["onFailure"] {
      return ["immediate", "digest", "silent"].includes(v);
    }
    expect(isValidOnFailure("immediate")).toBe(true);
    expect(isValidOnFailure("digest")).toBe(true);
    expect(isValidOnFailure("silent")).toBe(true);
    expect(isValidOnFailure("unknown")).toBe(false);
    expect(isValidOnFailure("")).toBe(false);
  });
});

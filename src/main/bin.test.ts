import { describe, it, expect } from "bun:test";
import { parseCommand } from "./bin";

describe("parseCommand", () => {
  it("extracts the subcommand and its args", () => {
    expect(parseCommand(["list"])).toEqual({ cmd: "list", args: [] });
    expect(parseCommand(["history", "jobA", "5"])).toEqual({ cmd: "history", args: ["jobA", "5"] });
  });
  it("defaults to help when no subcommand", () => {
    expect(parseCommand([])).toEqual({ cmd: "help", args: [] });
  });
});

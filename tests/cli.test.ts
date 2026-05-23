import { describe, expect, it } from "vitest";
import { getStartupMode, helpText } from "../src/cli.js";

describe("getStartupMode", () => {
  it("runs smoke mode first", () => {
    expect(getStartupMode(["--smoke"], { stdin: true, stdout: true })).toBe("smoke");
  });

  it("shows help when requested", () => {
    expect(getStartupMode(["--help"], { stdin: false, stdout: false })).toBe("help");
  });

  it("honors explicit server mode", () => {
    expect(getStartupMode(["--server"], { stdin: true, stdout: true })).toBe("server");
  });

  it("opens TUI for setup aliases", () => {
    expect(getStartupMode(["onboard"], { stdin: false, stdout: false })).toBe("tui");
    expect(getStartupMode(["setup"], { stdin: false, stdout: false })).toBe("tui");
    expect(getStartupMode(["--tui"], { stdin: false, stdout: false })).toBe("tui");
  });

  it("opens TUI when a human runs the binary in a terminal", () => {
    expect(getStartupMode([], { stdin: true, stdout: true })).toBe("tui");
  });

  it("starts MCP server when an MCP client launches it with pipes", () => {
    expect(getStartupMode([], { stdin: false, stdout: false })).toBe("server");
  });
});

describe("helpText", () => {
  it("documents server and onboarding modes", () => {
    expect(helpText()).toContain("--server");
    expect(helpText()).toContain("onboard");
  });
});

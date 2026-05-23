import { describe, expect, it } from "vitest";
import { getStartupMode, helpText, parseCliArgs } from "../src/cli.js";

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

  it("detects sse mode", () => {
    expect(getStartupMode(["--sse"], { stdin: true, stdout: true })).toBe("sse");
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

describe("parseCliArgs", () => {
  it("parses startup mode and defaults", () => {
    const config = parseCliArgs(["--sse"], { stdin: true, stdout: true }, {});
    expect(config.mode).toBe("sse");
    expect(config.port).toBe(3000);
    expect(config.allowedHosts).toEqual([]);
    expect(config.accessToken).toBeUndefined();
    expect(config.allowedXUsers).toBeUndefined();
  });

  it("parses explicit port option", () => {
    const config = parseCliArgs(["--sse", "--port", "4567"], { stdin: true, stdout: true }, {});
    expect(config.port).toBe(4567);
  });

  it("parses short port option", () => {
    const config = parseCliArgs(["--sse", "-p", "8888"], { stdin: true, stdout: true }, {});
    expect(config.port).toBe(8888);
  });

  it("falls back to PORT env when port option is missing or invalid", () => {
    const config = parseCliArgs(["--sse"], { stdin: true, stdout: true }, { PORT: "9999" });
    expect(config.port).toBe(9999);

    const invalidConfig = parseCliArgs(["--sse", "-p", "invalid"], { stdin: true, stdout: true }, { PORT: "9999" });
    expect(invalidConfig.port).toBe(9999);
  });

  it("parses allowed hosts from options", () => {
    const config = parseCliArgs(["--sse", "--allowed-hosts", "localhost,example.com, api.test.org"], { stdin: true, stdout: true }, {});
    expect(config.allowedHosts).toEqual(["localhost", "example.com", "api.test.org"]);
  });

  it("falls back to ALLOWED_HOSTS env", () => {
    const config = parseCliArgs(["--sse"], { stdin: true, stdout: true }, { ALLOWED_HOSTS: "envhost1, envhost2" });
    expect(config.allowedHosts).toEqual(["envhost1", "envhost2"]);
  });

  it("parses explicit access token option", () => {
    const config = parseCliArgs(["--sse", "--access-token", "my-secret-key-111"], { stdin: true, stdout: true }, {});
    expect(config.accessToken).toBe("my-secret-key-111");
  });

  it("falls back to X_MCP_ACCESS_TOKEN env", () => {
    const config = parseCliArgs(["--sse"], { stdin: true, stdout: true }, { X_MCP_ACCESS_TOKEN: "env-secret-222" });
    expect(config.accessToken).toBe("env-secret-222");
  });

  it("parses explicit allowed X users option", () => {
    const config = parseCliArgs(["--sse", "--allowed-x-users", "@batqwq, ElonMusk , @testuser"], { stdin: true, stdout: true }, {});
    expect(config.allowedXUsers).toEqual(["batqwq", "elonmusk", "testuser"]);
  });

  it("falls back to ALLOWED_X_USERS env", () => {
    const config = parseCliArgs(["--sse"], { stdin: true, stdout: true }, { ALLOWED_X_USERS: "user1, @user2" });
    expect(config.allowedXUsers).toEqual(["user1", "user2"]);
  });
});

describe("helpText", () => {
  it("documents server, sse, onboarding modes and options", () => {
    expect(helpText()).toContain("--server");
    expect(helpText()).toContain("--sse");
    expect(helpText()).toContain("--port");
    expect(helpText()).toContain("--allowed-hosts");
    expect(helpText()).toContain("--access-token");
    expect(helpText()).toContain("--allowed-x-users");
    expect(helpText()).toContain("onboard");
  });
});

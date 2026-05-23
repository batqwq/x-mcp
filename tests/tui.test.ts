import { describe, expect, it } from "vitest";
import { defaultOnboardingState } from "../src/onboarding.js";
import { getProviderEnvironmentStatus, maskApiKey, renderApiKeyPrompt, renderDashboard, renderEnvironmentReport, renderMcpClientConfig, renderPowerShellCommands } from "../src/tui.js";

describe("TUI rendering", () => {
  it("renders first-use onboarding state", () => {
    const status = getProviderEnvironmentStatus({});
    const screen = renderDashboard(status, defaultOnboardingState());

    expect(screen).toContain("first-use onboarding");
    expect(screen).toContain("未配置");
    expect(screen).toContain("标记 first-use onboarding 完成");
  });

  it("renders configured provider status", () => {
    const status = getProviderEnvironmentStatus({
      TWITTERAPI_IO_KEY: " key ",
      X_POST_PROVIDER: "TwitterAPI.io"
    });
    const report = renderEnvironmentReport(status);

    expect(report).toContain("已配置 TWITTERAPI_IO_KEY");
    expect(report).toContain("twitterapi_io");
  });

  it("does not treat blank provider keys as configured", () => {
    const status = getProviderEnvironmentStatus({
      TWITTERAPI_IO_KEY: " ",
      GETXAPI_KEY: ""
    });

    expect(status.twitterapiIoConfigured).toBe(false);
    expect(status.getxapiConfigured).toBe(false);
  });

  it("generates explicit MCP server config for npx", () => {
    const config = renderMcpClientConfig("getxapi");
    const parsed = JSON.parse(config) as {
      mcpServers: {
        "x-post": {
          args: string[];
          env: Record<string, string>;
        };
      };
    };

    expect(parsed.mcpServers["x-post"].args).toEqual(["-y", "github:batqwq/x-mcp", "--server"]);
    expect(parsed.mcpServers["x-post"].env.GETXAPI_KEY).toBe("your_getxapi_key");
  });

  it("generates PowerShell server commands", () => {
    expect(renderPowerShellCommands("twitterapi_io")).toContain("TWITTERAPI_IO_KEY");
    expect(renderPowerShellCommands("twitterapi_io")).toContain("--server");
  });

  it("renders API Key menu option in dashboard", () => {
    const status = getProviderEnvironmentStatus({});
    const screen = renderDashboard(status, defaultOnboardingState());

    expect(screen).toContain("6. 设置 API Key");
  });

  it("renders API Key prompt for twitterapi_io", () => {
    const prompt = renderApiKeyPrompt("twitterapi_io");

    expect(prompt).toContain("TwitterAPI.io");
    expect(prompt).toContain("TWITTERAPI_IO_KEY");
  });

  it("renders API Key prompt for getxapi", () => {
    const prompt = renderApiKeyPrompt("getxapi");

    expect(prompt).toContain("GetXAPI");
    expect(prompt).toContain("GETXAPI_KEY");
  });
});

describe("maskApiKey", () => {
  it("fully masks short keys", () => {
    expect(maskApiKey("abc")).toBe("***");
    expect(maskApiKey("12345678")).toBe("********");
  });

  it("shows first 4 and last 4 for longer keys", () => {
    expect(maskApiKey("abcdefghijklmnop")).toBe("abcd********mnop");
  });

  it("handles 9-character keys (edge case)", () => {
    const result = maskApiKey("123456789");
    expect(result).toBe("1234*6789");
  });
});

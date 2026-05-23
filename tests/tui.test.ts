import { describe, expect, it } from "vitest";
import { defaultOnboardingState } from "../src/onboarding.js";
import { getProviderEnvironmentStatus, renderDashboard, renderEnvironmentReport, renderMcpClientConfig, renderPowerShellCommands } from "../src/tui.js";

describe("TUI rendering", () => {
  it("renders first-use onboarding state", () => {
    const status = getProviderEnvironmentStatus({});
    const screen = renderDashboard(status, defaultOnboardingState());

    expect(screen).toContain("首次使用引导");
    expect(screen).toContain("未配置");
    expect(screen).toContain("标记首次使用引导完成");
  });

  it("renders configured provider status", () => {
    const status = getProviderEnvironmentStatus({
      TWITTERAPI_IO_KEY: "key",
      X_POST_PROVIDER: "twitterapi_io"
    });
    const report = renderEnvironmentReport(status);

    expect(report).toContain("已配置 TWITTERAPI_IO_KEY");
    expect(report).toContain("twitterapi_io");
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
});

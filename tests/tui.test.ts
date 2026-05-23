import { describe, expect, it } from "vitest";
import { defaultOnboardingState, type OnboardingState } from "../src/onboarding.js";
import {
  getProviderEnvironmentStatus,
  maskApiKey,
  renderApiKeyPrompt,
  renderDashboard,
  renderEnvironmentReport,
  renderMcpClientConfig,
  renderPowerShellCommands,
  renderSetupComplete,
  renderWelcome
} from "../src/tui.js";

const completedState: OnboardingState = { version: 1, completed: true, preferredProvider: "twitterapi_io" };

describe("TUI dashboard", () => {
  it("shows status icons and menu for unconfigured state", () => {
    const status = getProviderEnvironmentStatus({});
    const screen = renderDashboard(status, defaultOnboardingState());

    expect(screen).toContain("✗");
    expect(screen).toContain("未配置");
    expect(screen).toContain("1. 设置 API Key");
    expect(screen).toContain("2. 管理 Claude 连接凭证 (OAuth Credentials)");
    expect(screen).toContain("3. 生成 MCP 客户端配置");
    expect(screen).toContain("0. 退出");
  });

  it("shows check icon when provider is configured", () => {
    const status = getProviderEnvironmentStatus({ TWITTERAPI_IO_KEY: "key" });
    const screen = renderDashboard(status, completedState);

    expect(screen).toContain("✓");
    expect(screen).toContain("已配置");
  });

  it("does not treat blank provider keys as configured", () => {
    const status = getProviderEnvironmentStatus({
      TWITTERAPI_IO_KEY: " ",
      GETXAPI_KEY: ""
    });

    expect(status.twitterapiIoConfigured).toBe(false);
    expect(status.getxapiConfigured).toBe(false);
  });

  it("has API Key setup as first menu option", () => {
    const status = getProviderEnvironmentStatus({});
    const screen = renderDashboard(status, defaultOnboardingState());
    const lines = screen.split("\n");
    const menuLines = lines.filter((l) => /^\s+\d+\./.test(l));

    expect(menuLines[0]).toContain("设置 API Key");
  });
});

describe("welcome screen", () => {
  it("renders welcome message with provider URLs", () => {
    const welcome = renderWelcome();

    expect(welcome).toContain("欢迎使用 x-mcp");
    expect(welcome).toContain("twitterapi.io");
    expect(welcome).toContain("getxapi.com");
    expect(welcome).toContain("API Key");
  });
});

describe("setup complete screen", () => {
  it("shows configured providers", () => {
    const screen = renderSetupComplete({
      twitterapiIoConfigured: true,
      getxapiConfigured: false
    });

    expect(screen).toContain("设置完成");
    expect(screen).toContain("TwitterAPI.io");
    expect(screen).toContain("配置两个 provider 可启用自动故障切换");
  });

  it("mentions fallback when both configured", () => {
    const screen = renderSetupComplete({
      twitterapiIoConfigured: true,
      getxapiConfigured: true
    });

    expect(screen).toContain("自动切换备用");
  });
});

describe("environment report", () => {
  it("renders configured provider status with icons", () => {
    const status = getProviderEnvironmentStatus({
      TWITTERAPI_IO_KEY: " key ",
      X_POST_PROVIDER: "TwitterAPI.io"
    });
    const report = renderEnvironmentReport(status);

    expect(report).toContain("✓");
    expect(report).toContain("TWITTERAPI_IO_KEY 已配置");
    expect(report).toContain("twitterapi_io");
  });

  it("shows fallback status when both providers configured", () => {
    const status = getProviderEnvironmentStatus({
      TWITTERAPI_IO_KEY: "key1",
      GETXAPI_KEY: "key2"
    });
    const report = renderEnvironmentReport(status);

    expect(report).toContain("已启用");
  });

  it("shows fallback disabled when only one provider", () => {
    const status = getProviderEnvironmentStatus({
      TWITTERAPI_IO_KEY: "key1"
    });
    const report = renderEnvironmentReport(status);

    expect(report).toContain("未启用");
  });
});

describe("MCP config generation", () => {
  it("auto-fills real API keys into generated config", () => {
    const config = renderMcpClientConfig("twitterapi_io", {
      TWITTERAPI_IO_KEY: "real-key-123",
      GETXAPI_KEY: "getx-key-456"
    });
    const parsed = JSON.parse(config.split("\n").filter((l) => !l.startsWith("将") && !l.startsWith("提示")).join("\n")) as {
      mcpServers: { "x-post": { args: string[]; env: Record<string, string> } };
    };

    expect(parsed.mcpServers["x-post"].args).toEqual(["-y", "github:batqwq/x-mcp", "--server"]);
    expect(parsed.mcpServers["x-post"].env.TWITTERAPI_IO_KEY).toBe("real-key-123");
    expect(parsed.mcpServers["x-post"].env.GETXAPI_KEY).toBe("getx-key-456");
  });

  it("omits unconfigured keys from config", () => {
    const config = renderMcpClientConfig("getxapi", { GETXAPI_KEY: "only-getx" });

    expect(config).not.toContain("TWITTERAPI_IO_KEY");
    expect(config).toContain("only-getx");
  });
});

describe("PowerShell commands", () => {
  it("auto-fills real API keys", () => {
    const cmds = renderPowerShellCommands("twitterapi_io", { TWITTERAPI_IO_KEY: "tw-key" });

    expect(cmds).toContain('$env:TWITTERAPI_IO_KEY="tw-key"');
    expect(cmds).toContain("--server");
  });

  it("includes both keys when both configured", () => {
    const cmds = renderPowerShellCommands("twitterapi_io", {
      TWITTERAPI_IO_KEY: "tw",
      GETXAPI_KEY: "gx"
    });

    expect(cmds).toContain("tw");
    expect(cmds).toContain("gx");
  });
});

describe("API key prompt", () => {
  it("shows provider name and URL for twitterapi_io", () => {
    const prompt = renderApiKeyPrompt("twitterapi_io");

    expect(prompt).toContain("TwitterAPI.io");
    expect(prompt).toContain("TWITTERAPI_IO_KEY");
    expect(prompt).toContain("twitterapi.io");
  });

  it("shows provider name and URL for getxapi", () => {
    const prompt = renderApiKeyPrompt("getxapi");

    expect(prompt).toContain("GetXAPI");
    expect(prompt).toContain("GETXAPI_KEY");
    expect(prompt).toContain("getxapi.com");
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

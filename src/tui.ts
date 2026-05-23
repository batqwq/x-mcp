import { createInterface } from "node:readline/promises";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import type { Readable, Writable } from "node:stream";
import { completeOnboarding, readOnboardingState, touchOnboarding, type OnboardingState } from "./onboarding.js";
import type { EnvLike, ProviderId } from "./types.js";

const CLEAR_SCREEN = "\x1b[2J\x1b[H";

export interface ProviderEnvironmentStatus {
  twitterapiIoConfigured: boolean;
  getxapiConfigured: boolean;
  defaultProvider?: string;
}

export interface TuiOptions {
  env?: EnvLike;
  input?: Readable;
  output?: Writable;
}

export function getProviderEnvironmentStatus(env: EnvLike): ProviderEnvironmentStatus {
  return {
    twitterapiIoConfigured: Boolean(env.TWITTERAPI_IO_KEY),
    getxapiConfigured: Boolean(env.GETXAPI_KEY),
    defaultProvider: env.X_POST_PROVIDER
  };
}

export function renderDashboard(status: ProviderEnvironmentStatus, state: OnboardingState): string {
  const title = state.completed ? "x-mcp TUI" : "x-mcp 首次使用引导";
  const setupState = state.completed ? "已完成" : "未完成";

  return [
    "┌────────────────────────────────────────────┐",
    `│ ${pad(title, 42)} │`,
    "├────────────────────────────────────────────┤",
    `│ Onboarding: ${pad(setupState, 28)} │`,
    `│ TwitterAPI.io key: ${pad(status.twitterapiIoConfigured ? "已配置" : "未配置", 21)} │`,
    `│ GetXAPI key:       ${pad(status.getxapiConfigured ? "已配置" : "未配置", 21)} │`,
    `│ Default provider:  ${pad(status.defaultProvider ?? "未设置", 21)} │`,
    "└────────────────────────────────────────────┘",
    "",
    "1. 查看环境检查",
    "2. 生成 TwitterAPI.io MCP 配置",
    "3. 生成 GetXAPI MCP 配置",
    "4. 查看 PowerShell 一键运行命令",
    "5. 标记首次使用引导完成",
    "0. 退出",
    ""
  ].join("\n");
}

export function renderEnvironmentReport(status: ProviderEnvironmentStatus): string {
  const configuredProviders = [
    status.twitterapiIoConfigured ? "twitterapi_io" : undefined,
    status.getxapiConfigured ? "getxapi" : undefined
  ].filter(Boolean);

  return [
    "环境检查",
    "",
    `TwitterAPI.io: ${status.twitterapiIoConfigured ? "已配置 TWITTERAPI_IO_KEY" : "未配置 TWITTERAPI_IO_KEY"}`,
    `GetXAPI:       ${status.getxapiConfigured ? "已配置 GETXAPI_KEY" : "未配置 GETXAPI_KEY"}`,
    `默认 provider: ${status.defaultProvider ?? "未设置"}`,
    `可用 provider: ${configuredProviders.length > 0 ? configuredProviders.join(", ") : "无"}`,
    "",
    configuredProviders.length > 0
      ? "可以在 MCP 客户端中使用本 server。"
      : "请先设置 TWITTERAPI_IO_KEY 或 GETXAPI_KEY。"
  ].join("\n");
}

export function renderMcpClientConfig(provider: ProviderId): string {
  const envKey = provider === "twitterapi_io" ? "TWITTERAPI_IO_KEY" : "GETXAPI_KEY";
  const envValue = provider === "twitterapi_io" ? "your_twitterapi_io_key" : "your_getxapi_key";

  return JSON.stringify(
    {
      mcpServers: {
        "x-post": {
          command: "npx",
          args: ["-y", "github:batqwq/x-mcp", "--server"],
          env: {
            [envKey]: envValue,
            X_POST_PROVIDER: provider
          }
        }
      }
    },
    null,
    2
  );
}

export function renderPowerShellCommands(provider: ProviderId): string {
  if (provider === "twitterapi_io") {
    return [
      '$env:TWITTERAPI_IO_KEY="your_twitterapi_io_key"',
      '$env:X_POST_PROVIDER="twitterapi_io"',
      "npx -y github:batqwq/x-mcp --server"
    ].join("\n");
  }

  return [
    '$env:GETXAPI_KEY="your_getxapi_key"',
    '$env:X_POST_PROVIDER="getxapi"',
    "npx -y github:batqwq/x-mcp --server"
  ].join("\n");
}

export async function runTui(options: TuiOptions = {}): Promise<void> {
  const env = options.env ?? process.env;
  const input = options.input ?? defaultInput;
  const output = options.output ?? defaultOutput;
  const rl = createInterface({ input, output });

  let state = await readOnboardingState(env);
  try {
    state = await touchOnboarding(state, env);
  } catch {
    // The TUI remains useful even if the local onboarding marker cannot be written.
  }

  try {
    let running = true;
    while (running) {
      const status = getProviderEnvironmentStatus(env);
      output.write(`${CLEAR_SCREEN}${renderDashboard(status, state)}`);
      const choice = normalizeChoice(await askQuestion(rl, "选择 / Choose: ", "0"));

      switch (choice) {
        case "1":
          await pause(output, rl, renderEnvironmentReport(status));
          break;
        case "2":
          await pause(output, rl, renderMcpClientConfig("twitterapi_io"));
          break;
        case "3":
          await pause(output, rl, renderMcpClientConfig("getxapi"));
          break;
        case "4":
          await pause(output, rl, renderPowerShellCommands(await askProvider(rl)));
          break;
        case "5":
          try {
            state = await completeOnboarding(await askProvider(rl), env);
            await pause(output, rl, "首次使用引导已标记完成。不会保存 API Key，只保存 onboarding 状态。");
          } catch (error) {
            await pause(output, rl, `无法写入 onboarding 状态：${error instanceof Error ? error.message : String(error)}`);
          }
          break;
        case "0":
        case "q":
        case "quit":
        case "exit":
          running = false;
          break;
        default:
          await pause(output, rl, "未知选项，请输入 0-5。");
          break;
      }
    }
  } finally {
    rl.close();
  }
}

async function askProvider(rl: ReturnType<typeof createInterface>): Promise<ProviderId> {
  const answer = normalizeChoice(await askQuestion(rl, "选择 provider: 1=twitterapi_io, 2=getxapi [1]: ", "1"));
  return answer === "2" || answer === "getxapi" ? "getxapi" : "twitterapi_io";
}

async function pause(output: Writable, rl: ReturnType<typeof createInterface>, content: string): Promise<void> {
  output.write(`${CLEAR_SCREEN}${content}\n\n`);
  await askQuestion(rl, "按 Enter 返回菜单...", "");
}

function normalizeChoice(value: string): string {
  return value.trim().toLowerCase();
}

async function askQuestion(rl: ReturnType<typeof createInterface>, question: string, fallback: string): Promise<string> {
  try {
    return await rl.question(question);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ERR_USE_AFTER_CLOSE") {
      return fallback;
    }
    throw error;
  }
}

function pad(value: string, length: number): string {
  return value.length >= length ? value.slice(0, length) : `${value}${" ".repeat(length - value.length)}`;
}

import { createInterface } from "node:readline/promises";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import type { Readable, Writable } from "node:stream";
import { completeOnboarding, loadApiKeys, readOnboardingState, saveApiKey, touchOnboarding, type OnboardingState } from "./onboarding.js";
import type { EnvLike, ProviderId } from "./types.js";
import { normalizeApiKey, normalizeProviderId } from "./validation.js";

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
  const normalizedDefault = normalizeProviderId(env.X_POST_PROVIDER);
  return {
    twitterapiIoConfigured: Boolean(normalizeApiKey(env.TWITTERAPI_IO_KEY)),
    getxapiConfigured: Boolean(normalizeApiKey(env.GETXAPI_KEY)),
    defaultProvider: normalizedDefault ?? env.X_POST_PROVIDER?.trim()
  };
}

export function renderDashboard(status: ProviderEnvironmentStatus, state: OnboardingState): string {
  const title = state.completed ? "x-mcp TUI" : "x-mcp first-use onboarding";
  const setupState = state.completed ? "已完成" : "未完成";

  return [
    "============================================",
    title,
    "============================================",
    `Onboarding:        ${setupState}`,
    `TwitterAPI.io key: ${status.twitterapiIoConfigured ? "已配置" : "未配置"}`,
    `GetXAPI key:       ${status.getxapiConfigured ? "已配置" : "未配置"}`,
    `Default provider:  ${status.defaultProvider ?? "未设置"}`,
    "--------------------------------------------",
    "",
    "1. 查看环境检查",
    "2. 生成 TwitterAPI.io MCP 配置",
    "3. 生成 GetXAPI MCP 配置",
    "4. 查看 PowerShell 一键运行命令",
    "5. 标记 first-use onboarding 完成",
    "6. 设置 API Key",
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

export function renderApiKeyPrompt(provider: ProviderId): string {
  const providerName = provider === "twitterapi_io" ? "TwitterAPI.io" : "GetXAPI";
  const envKey = provider === "twitterapi_io" ? "TWITTERAPI_IO_KEY" : "GETXAPI_KEY";

  return [
    `设置 ${providerName} API Key`,
    "",
    `对应环境变量: ${envKey}`,
    `输入 API Key 后将立即生效，并保存到本地配置文件。`,
    `下次启动 TUI 时会自动加载（环境变量优先级更高）。`,
    ""
  ].join("\n");
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return "*".repeat(key.length);
  }
  return `${key.slice(0, 4)}${"*".repeat(key.length - 8)}${key.slice(-4)}`;
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

  // Restore persisted API keys into env (env vars take precedence).
  loadApiKeys(state, env);

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
            await pause(output, rl, "首次使用引导已标记完成。");
          } catch (error) {
            await pause(output, rl, `无法写入 onboarding 状态：${error instanceof Error ? error.message : String(error)}`);
          }
          break;
        case "6":
          try {
            const provider = await askProvider(rl);
            output.write(`${CLEAR_SCREEN}${renderApiKeyPrompt(provider)}`);
            const apiKey = await askQuestion(rl, "API Key: ", "");
            const trimmedKey = apiKey.trim();
            if (!trimmedKey) {
              await pause(output, rl, "API Key 不能为空，未做任何修改。");
            } else {
              const envKey = provider === "twitterapi_io" ? "TWITTERAPI_IO_KEY" : "GETXAPI_KEY";
              env[envKey] = trimmedKey;
              state = await saveApiKey(provider, trimmedKey, env);
              await pause(output, rl, `${provider === "twitterapi_io" ? "TwitterAPI.io" : "GetXAPI"} API Key 已设置并保存。\n显示: ${maskApiKey(trimmedKey)}`);
            }
          } catch (error) {
            await pause(output, rl, `无法保存 API Key：${error instanceof Error ? error.message : String(error)}`);
          }
          break;
        case "0":
        case "q":
        case "quit":
        case "exit":
          running = false;
          break;
        default:
          await pause(output, rl, "未知选项，请输入 0-6。");
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

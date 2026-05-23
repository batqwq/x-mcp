import { createInterface } from "node:readline/promises";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import type { Readable, Writable } from "node:stream";
import { completeOnboarding, loadApiKeys, readOnboardingState, saveApiKey, touchOnboarding, type OnboardingState } from "./onboarding.js";
import type { EnvLike, ProviderId } from "./types.js";
import { normalizeApiKey, normalizeProviderId } from "./validation.js";

const CLEAR_SCREEN = "\x1b[2J\x1b[H";
const CHECK = "✓";
const CROSS = "✗";

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

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function statusIcon(configured: boolean): string {
  return configured ? CHECK : CROSS;
}

export function renderDashboard(status: ProviderEnvironmentStatus, state: OnboardingState): string {
  const twitterIcon = statusIcon(status.twitterapiIoConfigured);
  const getxIcon = statusIcon(status.getxapiConfigured);

  return [
    "============================================",
    "  x-mcp TUI",
    "============================================",
    `  TwitterAPI.io  ${twitterIcon}  ${status.twitterapiIoConfigured ? "已配置" : "未配置"}`,
    `  GetXAPI        ${getxIcon}  ${status.getxapiConfigured ? "已配置" : "未配置"}`,
    `  默认 provider     ${status.defaultProvider ?? "自动"}`,
    "--------------------------------------------",
    "",
    "  1. 设置 API Key",
    "  2. 生成 MCP 客户端配置",
    "  3. 生成 PowerShell 一键命令",
    "  4. 查看环境详情",
    "  0. 退出",
    ""
  ].join("\n");
}

export function renderWelcome(): string {
  return [
    "============================================",
    "  欢迎使用 x-mcp!",
    "============================================",
    "",
    "  x-mcp 是一个只读的 X/Twitter MCP 服务器，",
    "  支持 TwitterAPI.io 和 GetXAPI 两个数据源。",
    "",
    "  开始之前，你需要至少设置一个 API Key。",
    "  设好后即可在 MCP 客户端中使用。",
    "",
    "  获取 API Key：",
    "    TwitterAPI.io → https://twitterapi.io",
    "    GetXAPI       → https://getxapi.com",
    ""
  ].join("\n");
}

export function renderSetupComplete(status: ProviderEnvironmentStatus): string {
  const providers = [
    status.twitterapiIoConfigured ? "TwitterAPI.io" : undefined,
    status.getxapiConfigured ? "GetXAPI" : undefined
  ].filter(Boolean);

  return [
    "============================================",
    "  设置完成!",
    "============================================",
    "",
    `  已配置 provider: ${providers.join(", ")}`,
    "",
    status.twitterapiIoConfigured && status.getxapiConfigured
      ? "  两个 provider 均已配置，当主 provider 故障时会自动切换备用。"
      : "  提示：配置两个 provider 可启用自动故障切换。",
    "",
    "  接下来你可以：",
    "  · 在菜单中生成 MCP 客户端配置（JSON）",
    "  · 或直接使用 npx -y github:batqwq/x-mcp --server 启动",
    ""
  ].join("\n");
}

export function renderEnvironmentReport(status: ProviderEnvironmentStatus): string {
  const configuredProviders = [
    status.twitterapiIoConfigured ? "twitterapi_io" : undefined,
    status.getxapiConfigured ? "getxapi" : undefined
  ].filter(Boolean);

  return [
    "环境详情",
    "",
    `  TwitterAPI.io  ${statusIcon(status.twitterapiIoConfigured)}  ${status.twitterapiIoConfigured ? "TWITTERAPI_IO_KEY 已配置" : "TWITTERAPI_IO_KEY 未配置"}`,
    `  GetXAPI        ${statusIcon(status.getxapiConfigured)}  ${status.getxapiConfigured ? "GETXAPI_KEY 已配置" : "GETXAPI_KEY 未配置"}`,
    `  默认 provider     ${status.defaultProvider ?? "自动（优先 TwitterAPI.io）"}`,
    `  可用 provider     ${configuredProviders.length > 0 ? configuredProviders.join(", ") : "无"}`,
    `  Fallback         ${configuredProviders.length > 1 ? "已启用（瞬态故障自动切换）" : "未启用（需配置两个 provider）"}`,
    "",
    configuredProviders.length > 0
      ? "  状态正常，可以在 MCP 客户端中使用。"
      : "  请先通过菜单「设置 API Key」配置至少一个 provider。"
  ].join("\n");
}

export function renderMcpClientConfig(provider: ProviderId, env: EnvLike): string {
  const twitterKey = normalizeApiKey(env.TWITTERAPI_IO_KEY);
  const getxKey = normalizeApiKey(env.GETXAPI_KEY);

  const envBlock: Record<string, string> = {};
  if (twitterKey) {
    envBlock.TWITTERAPI_IO_KEY = twitterKey;
  }
  if (getxKey) {
    envBlock.GETXAPI_KEY = getxKey;
  }
  envBlock.X_POST_PROVIDER = provider;

  return [
    "将以下 JSON 添加到你的 MCP 客户端配置文件中：",
    "",
    JSON.stringify(
      {
        mcpServers: {
          "x-post": {
            command: "npx",
            args: ["-y", "github:batqwq/x-mcp", "--server"],
            env: envBlock
          }
        }
      },
      null,
      2
    ),
    "",
    "提示：Key 已自动填入，可直接使用。"
  ].join("\n");
}

export function renderPowerShellCommands(provider: ProviderId, env: EnvLike): string {
  const twitterKey = normalizeApiKey(env.TWITTERAPI_IO_KEY);
  const getxKey = normalizeApiKey(env.GETXAPI_KEY);

  const lines: string[] = [];
  if (twitterKey) {
    lines.push(`$env:TWITTERAPI_IO_KEY="${twitterKey}"`);
  }
  if (getxKey) {
    lines.push(`$env:GETXAPI_KEY="${getxKey}"`);
  }
  lines.push(`$env:X_POST_PROVIDER="${provider}"`);
  lines.push("npx -y github:batqwq/x-mcp --server");

  return [
    "在 PowerShell 中运行以下命令：",
    "",
    ...lines,
    "",
    "提示：Key 已自动填入，可直接复制使用。"
  ].join("\n");
}

export function renderApiKeyPrompt(provider: ProviderId): string {
  const providerName = provider === "twitterapi_io" ? "TwitterAPI.io" : "GetXAPI";
  const envKey = provider === "twitterapi_io" ? "TWITTERAPI_IO_KEY" : "GETXAPI_KEY";
  const url = provider === "twitterapi_io" ? "https://twitterapi.io" : "https://getxapi.com";

  return [
    `设置 ${providerName} API Key`,
    "",
    `  获取地址: ${url}`,
    `  对应环境变量: ${envKey}`,
    "",
    "  输入后立即生效并保存到本地。",
    "  环境变量优先级高于保存的 Key。",
    ""
  ].join("\n");
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return "*".repeat(key.length);
  }
  return `${key.slice(0, 4)}${"*".repeat(key.length - 8)}${key.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Interactive TUI
// ---------------------------------------------------------------------------

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
    // First-use guided onboarding when no API key is configured.
    if (!state.completed) {
      state = await runOnboardingWizard(rl, output, env, state);
    }

    // Main menu loop.
    let running = true;
    while (running) {
      const status = getProviderEnvironmentStatus(env);
      output.write(`${CLEAR_SCREEN}${renderDashboard(status, state)}`);
      const choice = normalizeChoice(await askQuestion(rl, "选择 / Choose: ", "0"));

      switch (choice) {
        case "1":
          state = await handleSetApiKey(rl, output, env, state);
          break;
        case "2": {
          const provider = await askProvider(rl, env);
          await pause(output, rl, renderMcpClientConfig(provider, env));
          break;
        }
        case "3": {
          const provider = await askProvider(rl, env);
          await pause(output, rl, renderPowerShellCommands(provider, env));
          break;
        }
        case "4":
          await pause(output, rl, renderEnvironmentReport(getProviderEnvironmentStatus(env)));
          break;
        case "0":
        case "q":
        case "quit":
        case "exit":
          running = false;
          break;
        default:
          await pause(output, rl, "未知选项，请输入 0-4。");
          break;
      }
    }
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// Guided first-use onboarding wizard
// ---------------------------------------------------------------------------

async function runOnboardingWizard(
  rl: ReturnType<typeof createInterface>,
  output: Writable,
  env: EnvLike,
  state: OnboardingState
): Promise<OnboardingState> {
  // Step 1: Welcome.
  output.write(`${CLEAR_SCREEN}${renderWelcome()}`);
  const proceed = normalizeChoice(await askQuestion(rl, "现在设置 API Key? (Y/n): ", "y"));
  if (proceed === "n" || proceed === "no") {
    // User chose to skip — mark onboarding complete to avoid nagging.
    try {
      state = await completeOnboarding(undefined, env);
    } catch {
      // Ignore write failure.
    }
    return state;
  }

  // Step 2: Set API key(s).
  state = await handleSetApiKey(rl, output, env, state);

  // Step 3: Offer to set the other provider too.
  const status = getProviderEnvironmentStatus(env);
  if (status.twitterapiIoConfigured !== status.getxapiConfigured) {
    const otherName = status.twitterapiIoConfigured ? "GetXAPI" : "TwitterAPI.io";
    const more = normalizeChoice(await askQuestion(rl, `也设置 ${otherName} 以启用自动故障切换? (y/N): `, "n"));
    if (more === "y" || more === "yes") {
      const otherProvider: ProviderId = status.twitterapiIoConfigured ? "getxapi" : "twitterapi_io";
      state = await doSetApiKey(rl, output, env, state, otherProvider);
    }
  }

  // Step 4: Auto-complete onboarding.
  const finalStatus = getProviderEnvironmentStatus(env);
  const preferred = finalStatus.twitterapiIoConfigured ? "twitterapi_io" as ProviderId : "getxapi" as ProviderId;
  try {
    state = await completeOnboarding(finalStatus.twitterapiIoConfigured || finalStatus.getxapiConfigured ? preferred : undefined, env);
  } catch {
    // Ignore write failure.
  }

  // Step 5: Show completion summary.
  if (finalStatus.twitterapiIoConfigured || finalStatus.getxapiConfigured) {
    await pause(output, rl, renderSetupComplete(finalStatus));
  }

  return state;
}

// ---------------------------------------------------------------------------
// Shared API Key setting flow
// ---------------------------------------------------------------------------

async function handleSetApiKey(
  rl: ReturnType<typeof createInterface>,
  output: Writable,
  env: EnvLike,
  state: OnboardingState
): Promise<OnboardingState> {
  const provider = await askProvider(rl, env);
  return doSetApiKey(rl, output, env, state, provider);
}

async function doSetApiKey(
  rl: ReturnType<typeof createInterface>,
  output: Writable,
  env: EnvLike,
  state: OnboardingState,
  provider: ProviderId
): Promise<OnboardingState> {
  output.write(`${CLEAR_SCREEN}${renderApiKeyPrompt(provider)}`);
  const apiKey = await askQuestion(rl, "API Key: ", "");
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    await pause(output, rl, "API Key 不能为空，未做任何修改。");
    return state;
  }

  const envKey = provider === "twitterapi_io" ? "TWITTERAPI_IO_KEY" : "GETXAPI_KEY";
  env[envKey] = trimmedKey;
  try {
    state = await saveApiKey(provider, trimmedKey, env);
    const providerName = provider === "twitterapi_io" ? "TwitterAPI.io" : "GetXAPI";
    await pause(output, rl, `${providerName} API Key 已设置并保存。\n  显示: ${maskApiKey(trimmedKey)}`);
  } catch (error) {
    await pause(output, rl, `API Key 已在本次会话生效，但无法持久化保存：${error instanceof Error ? error.message : String(error)}`);
  }

  return state;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

async function askProvider(rl: ReturnType<typeof createInterface>, env: EnvLike): Promise<ProviderId> {
  const status = getProviderEnvironmentStatus(env);
  const hint1 = status.twitterapiIoConfigured ? " (已配置)" : "";
  const hint2 = status.getxapiConfigured ? " (已配置)" : "";
  const answer = normalizeChoice(
    await askQuestion(rl, `选择 provider: 1=TwitterAPI.io${hint1}, 2=GetXAPI${hint2} [1]: `, "1")
  );
  return answer === "2" || answer === "getxapi" ? "getxapi" : "twitterapi_io";
}

async function pause(output: Writable, rl: ReturnType<typeof createInterface>, content: string): Promise<void> {
  output.write(`${CLEAR_SCREEN}${content}\n\n`);
  await askQuestion(rl, "按 Enter 继续...", "");
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

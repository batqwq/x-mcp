import { createInterface } from "node:readline/promises";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import type { Readable, Writable } from "node:stream";
import { completeOnboarding, loadApiKeys, readOnboardingState, saveApiKey, touchOnboarding, saveOAuthClient, deleteOAuthClient, type OnboardingState } from "./onboarding.js";
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
  const oauthCount = Object.keys(state.oauthClients ?? {}).length;

  return [
    "============================================",
    "  x-mcp TUI",
    "============================================",
    `  TwitterAPI.io  ${twitterIcon}  ${status.twitterapiIoConfigured ? "已配置" : "未配置"}`,
    `  GetXAPI        ${getxIcon}  ${status.getxapiConfigured ? "已配置" : "未配置"}`,
    `  默认 provider     ${status.defaultProvider ?? "自动"}`,
    `  已配置凭证对       ${oauthCount} 组`,
    "--------------------------------------------",
    "",
    "  1. 设置 API Key",
    "  2. 管理 Claude 连接凭证 (OAuth Credentials)",
    "  3. 一键启动后台持久化运行 (Remote SSE Daemon)",
    "  4. 生成 MCP 客户端配置",
    "  5. 生成 PowerShell 一键命令",
    "  6. 查看环境详情",
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
        case "2":
          state = await handleManageOAuthCredentials(rl, output, env, state);
          break;
        case "3":
          state = await handleStartDaemon(rl, output, env, state);
          break;
        case "4": {
          const provider = await askProvider(rl, env);
          await pause(output, rl, renderMcpClientConfig(provider, env));
          break;
        }
        case "5": {
          const provider = await askProvider(rl, env);
          await pause(output, rl, renderPowerShellCommands(provider, env));
          break;
        }
        case "6":
          await pause(output, rl, renderEnvironmentReport(getProviderEnvironmentStatus(env)));
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

  // Step 4.5: Offer to generate Claude connection credentials.
  const genOAuth = normalizeChoice(await askQuestion(rl, "\n是否现在生成 Claude 远程连接凭证 (Client ID & Secret)? (Y/n): ", "y"));
  if (genOAuth === "y" || genOAuth === "yes") {
    const { randomBytes } = await import("node:crypto");
    const clientId = `x-mcp-client-${randomBytes(6).toString("hex")}`;
    const clientSecret = `x-mcp-secret-${randomBytes(16).toString("hex")}`;
    try {
      state = await saveOAuthClient(clientId, clientSecret, env);
      const report = [
        "🎉 自动生成 Claude 远程连接凭证成功！",
        "============================================",
        `  Client ID:     \x1b[32m${clientId}\x1b[39m`,
        `  Client Secret: \x1b[32m${clientSecret}\x1b[39m`,
        "============================================",
        "⚠️  请复制保存，并在 Claude Connectors 高级设置中填入它们！"
      ].join("\n");
      await pause(output, rl, report);
    } catch {
      // Ignore write failure
    }
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

export async function handleManageOAuthCredentials(
  rl: ReturnType<typeof createInterface>,
  output: Writable,
  env: EnvLike,
  state: OnboardingState
): Promise<OnboardingState> {
  let subRunning = true;
  while (subRunning) {
    const oauthClients = state.oauthClients ?? {};
    const count = Object.keys(oauthClients).length;

    const menu = [
      "============================================",
      "  管理 Claude 连接凭证 (OAuth Credentials)",
      "============================================",
      `  当前已保存凭证: ${count} 组`,
      "--------------------------------------------",
      "",
      "  1. 生成新的随机凭证 (Client ID & Secret)",
      "  2. 查看所有已保存凭证",
      "  3. 删除指定凭证",
      "  0. 返回主菜单",
      ""
    ].join("\n");

    output.write(`${CLEAR_SCREEN}${menu}`);
    const choice = normalizeChoice(await askQuestion(rl, "选择 / Choose: ", "0"));

    switch (choice) {
      case "1": {
        const { randomBytes } = await import("node:crypto");
        const clientId = `x-mcp-client-${randomBytes(6).toString("hex")}`;
        const clientSecret = `x-mcp-secret-${randomBytes(16).toString("hex")}`;
        state = await saveOAuthClient(clientId, clientSecret, env);
        
        const report = [
          "🎉 成功生成新的 Claude 远程连接凭证！",
          "============================================",
          `  Client ID:     \x1b[32m${clientId}\x1b[39m`,
          `  Client Secret: \x1b[32m${clientSecret}\x1b[39m`,
          "============================================",
          "⚠️  请妥善保存此 Client Secret！它只会完整显示一次。",
          "当您在 Claude Connectors 的 Advanced settings 配置远程 MCP 时，",
          "请分别填入上述 Client ID 和 Client Secret。",
          "服务器通过 HTTP Authorization Header (Basic 认证) 强安全保障本接口的安全。"
        ].join("\n");
        await pause(output, rl, report);
        break;
      }
      case "2": {
        if (count === 0) {
          await pause(output, rl, "当前没有任何已保存的凭证。");
          break;
        }
        const lines = [
          "已保存的连接凭证列表",
          "============================================",
          "格式：Client ID -> Client Secret (已脱敏保护)",
          "--------------------------------------------"
        ];
        for (const [cid, secret] of Object.entries(oauthClients)) {
          const maskedSecret = secret.length > 15 
            ? `${secret.slice(0, 13)}...${secret.slice(-4)}` 
            : "******";
          lines.push(`🔑 ID: \x1b[36m${cid}\x1b[39m\n   Secret: ${maskedSecret}\n`);
        }
        await pause(output, rl, lines.join("\n"));
        break;
      }
      case "3": {
        if (count === 0) {
          await pause(output, rl, "当前没有任何已保存的凭证可供删除。");
          break;
        }
        output.write(`${CLEAR_SCREEN}删除指定凭证\n============================================\n`);
        const targetId = (await askQuestion(rl, "请输入要删除的 Client ID: ", "")).trim();
        if (!targetId) {
          await pause(output, rl, "Client ID 不能为空，未做任何修改。");
          break;
        }
        if (!oauthClients[targetId]) {
          await pause(output, rl, `找不到指定的 Client ID: "${targetId}"`);
          break;
        }
        const confirm = normalizeChoice(await askQuestion(rl, `确认要删除 ${targetId} 吗? (y/N): `, "n"));
        if (confirm === "y" || confirm === "yes") {
          state = await deleteOAuthClient(targetId, env);
          await pause(output, rl, `✅ 凭证 ${targetId} 已成功删除。`);
        } else {
          await pause(output, rl, "已取消删除。");
        }
        break;
      }
      case "0":
      case "q":
      case "back":
        subRunning = false;
        break;
      default:
        await pause(output, rl, "未知选项，请输入 0-3。");
        break;
    }
  }
  return state;
}

export async function handleStartDaemon(
  rl: ReturnType<typeof createInterface>,
  output: Writable,
  env: EnvLike,
  state: OnboardingState
): Promise<OnboardingState> {
  const status = getProviderEnvironmentStatus(env);
  if (!status.twitterapiIoConfigured && !status.getxapiConfigured) {
    await pause(output, rl, "\x1b[31m❌  请先设置 API Key（选项 1）再启动远程服务！\x1b[39m");
    return state;
  }

  // 1. 自动凭证保障：若无 OAuth 凭证，自动随机生成一组默认对，确保安全
  let oauthClients = state.oauthClients ?? {};
  if (Object.keys(oauthClients).length === 0) {
    const { randomBytes } = await import("node:crypto");
    const defaultClientId = `x-mcp-client-${randomBytes(6).toString("hex")}`;
    const defaultClientSecret = `x-mcp-secret-${randomBytes(16).toString("hex")}`;
    try {
      state = await saveOAuthClient(defaultClientId, defaultClientSecret, env);
      oauthClients = state.oauthClients ?? {};
      output.write(`\n💡 检测到您当前未配置任何连接凭据，已自动为您生成一组默认凭证。\n`);
    } catch {
      oauthClients = { [defaultClientId]: defaultClientSecret };
    }
  }

  // 2. 引导配置启动端口
  output.write(`${CLEAR_SCREEN}一键启动后台持久化运行 (Remote SSE Daemon)\n============================================\n`);
  const portInput = (await askQuestion(rl, "请输入服务监听端口 [3000]: ", "3000")).trim();
  const port = parseInt(portInput || "3000", 10);
  if (isNaN(port) || port <= 0 || port >= 65536) {
    await pause(output, rl, "⚠️ 端口格式不正确，启动已取消。");
    return state;
  }

  // 3. 引导配置原生 HTTPS 直连
  const isHttps = normalizeChoice(await askQuestion(rl, "是否启用原生 HTTPS 加密直连? (y/N): ", "n"));
  let sslKey = "";
  let sslCert = "";
  if (isHttps === "y" || isHttps === "yes") {
    sslKey = (await askQuestion(rl, "请输入私钥文件路径 (ssl-key): ", "")).trim();
    sslCert = (await askQuestion(rl, "请输入证书完整链路径 (ssl-cert): ", "")).trim();
    if (!sslKey || !sslCert) {
      await pause(output, rl, "⚠️ 证书或私钥路径不能为空，启动已取消。");
      return state;
    }
  }

  // 4. 调用 CLI 原生守护进程命令后台自我拉起
  const { spawn } = await import("node:child_process");
  const { join } = await import("node:path");

  const spawnArgs = [process.argv[1]!, "--sse", "--port", String(port)];
  if (sslKey && sslCert) {
    spawnArgs.push("--ssl-key", sslKey, "--ssl-cert", sslCert);
  }
  spawnArgs.push("--daemon");

  const child = spawn(process.execPath, spawnArgs, {
    detached: true,
    stdio: "pipe",
    env: {
      ...env,
      __X_MCP_DAEMON_CHILD: "" // 允许它拉起父 spawn 流程
    }
  });

  let outputData = "";
  child.stdout?.on("data", (data) => {
    outputData += data.toString();
  });

  await new Promise<void>((resolve) => {
    child.on("close", () => resolve());
  });

  // 从子进程控制台输出中匹配 PID 
  const pidMatch = outputData.match(/后台 PID:\s*(\d+)/) || outputData.match(/PID:\s*(\d+)/);
  const childPid = pidMatch ? pidMatch[1] : "运行中";
  const logFile = join(process.cwd(), "x-mcp-daemon.log");

  const targetClientId = Object.keys(oauthClients)[0]!;
  const targetClientSecret = oauthClients[targetClientId]!;
  const credentialsBase64 = Buffer.from(`${targetClientId}:${targetClientSecret}`).toString("base64");

  const protocol = sslKey && sslCert ? "https" : "http";
  const report = [
    "🎉  x-mcp 远程后台持久化服务已成功拉起！",
    "============================================",
    `  运行协议:       \x1b[32m${protocol.toUpperCase()}\x1b[39m`,
    `  监听端口:       \x1b[32m${port}\x1b[39m`,
    `  后台 PID:       \x1b[32m${childPid}\x1b[39m`,
    `  物理日志文件:   \x1b[36m${logFile}\x1b[39m`,
    "--------------------------------------------",
    "🔒  以下为接入 Claude Connectors 所需的高级安全配置：",
    `  Server URL:     \x1b[32m${protocol}://los.942778.online${port === 80 || port === 443 ? "" : ":" + port}/sse\x1b[39m`,
    "  (⚠️ 请将 'los.942778.online' 替换为您在 Spaceship 配置的真实域名！)",
    "",
    "  [方式 A: URL 拼接极简接入 (最推荐 ⭐⭐⭐)]",
    "  在 Claude 的 Authentication 选 No authentication，",
    "  然后直接在 Server URL 中复制填入以下完整地址：",
    `  \x1b[36m${protocol}://los.942778.online${port === 80 || port === 443 ? "" : ":" + port}/sse?client_id=${targetClientId}&client_secret=${targetClientSecret}\x1b[39m`,
    "",
    "  [方式 B: 标准 Header 接入]",
    "  在 Claude 的 Authentication 选 API key，配置如下：",
    "    - Header Name  填: \x1b[36mAuthorization\x1b[39m",
    `    - Header Value 填: \x1b[36mBasic ${credentialsBase64}\x1b[39m`,
    "============================================",
    "提示：即使您现在退出此 TUI 或断开 SSH，该服务依然会在后台永久死守运行！",
    `若需停止该服务，请在终端执行: \x1b[31mkill ${childPid}\x1b[39m 或在任务管理器中结束对应进程。`
  ].join("\n");

  await pause(output, rl, report);
  return state;
}


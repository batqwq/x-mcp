#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createServer as createHttpServer } from "node:http";
import { parseCliArgs, helpText } from "./cli.js";
import { createXPostService, type XPostService } from "./service.js";
import { runTui } from "./tui.js";
import { PROVIDER_IDS } from "./types.js";
import { readOnboardingState, saveOAuthClient } from "./onboarding.js";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync } from "node:fs";

const providerSchema = z.enum(PROVIDER_IDS).describe("Provider to use. Overrides X_POST_PROVIDER when supplied.");
const queryTypeSchema = z.enum(["Latest", "Top"]).default("Latest").describe("Search result product/order.");

export function createServer(service: XPostService = createXPostService()): McpServer {
  const server = new McpServer({
    name: "x-post-mcp-server",
    version: "0.1.0"
  });

  server.registerTool(
    "x_post_get",
    {
      title: "Get X Post",
      description: "Read one X/Twitter post by numeric tweet ID or x.com/twitter.com status URL.",
      inputSchema: {
        idOrUrl: z.string().min(1).describe("Numeric tweet ID, x.com status URL, or twitter.com status URL."),
        provider: providerSchema.optional()
      },
      annotations: { readOnlyHint: true }
    },
    async (args) => runTool(() => service.getPost(args))
  );

  server.registerTool(
    "x_posts_search",
    {
      title: "Search X Posts",
      description: "Run an advanced X/Twitter search and return a normalized page of posts.",
      inputSchema: {
        query: z.string().min(1).describe("Advanced search query, such as from:OpenAI AI or #crypto min_faves:100."),
        queryType: queryTypeSchema,
        cursor: z.string().optional().describe("Pagination cursor returned as nextCursor by a previous call."),
        provider: providerSchema.optional()
      },
      annotations: { readOnlyHint: true }
    },
    async (args) => runTool(() => service.searchPosts(args))
  );

  server.registerTool(
    "x_user_info",
    {
      title: "Get X User Info",
      description: "Read X/Twitter profile information by username.",
      inputSchema: {
        userName: z.string().min(1).describe("Screen name with or without leading @."),
        provider: providerSchema.optional()
      },
      annotations: { readOnlyHint: true }
    },
    async (args) => runTool(() => service.getUserInfo(args))
  );

  server.registerTool(
    "x_user_posts",
    {
      title: "Get X User Posts",
      description: "Read a user's posts, optionally including replies, with cursor pagination.",
      inputSchema: {
        userName: z.string().optional().describe("Screen name with or without leading @. Required if userId is not supplied."),
        userId: z.string().optional().describe("Numeric user ID. Required if userName is not supplied."),
        includeReplies: z.boolean().default(false).describe("Include replies authored by the user."),
        cursor: z.string().optional().describe("Pagination cursor returned as nextCursor by a previous call."),
        provider: providerSchema.optional()
      },
      annotations: { readOnlyHint: true }
    },
    async (args) => runTool(() => service.getUserPosts(args))
  );

  server.registerTool(
    "x_account_info",
    {
      title: "Get X Provider Account Info",
      description: "Read account or credit status for the selected X data provider.",
      inputSchema: {
        provider: providerSchema.optional()
      },
      annotations: { readOnlyHint: true }
    },
    async (args) => runTool(() => service.getAccountInfo(args))
  );

  return server;
}

async function runTool<T>(operation: () => Promise<T>): Promise<CallToolResult> {
  try {
    return jsonResult(await operation());
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(serializeError(error), null, 2)
        }
      ]
    };
  }
}

function jsonResult(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const maybeProviderError = error as Error & { provider?: unknown; status?: unknown; details?: unknown };
    return {
      error: error.name,
      message: error.message,
      provider: maybeProviderError.provider,
      status: maybeProviderError.status,
      details: maybeProviderError.details
    };
  }

  return {
    error: "UnknownError",
    message: String(error)
  };
}

async function main(): Promise<void> {
  const tty = {
    stdin: Boolean(process.stdin.isTTY),
    stdout: Boolean(process.stdout.isTTY)
  };
  const config = parseCliArgs(process.argv.slice(2), tty);

  switch (config.mode) {
    case "smoke":
      createServer();
      console.log("x-post-mcp-server smoke check ok");
      return;
    case "help":
      console.log(helpText());
      return;
    case "tui":
      await runTui();
      return;
    case "server":
      await runMcpServer();
      return;
    case "sse": {
      // 如果要求以守护进程方式运行，且当前不是处于子进程中，执行脱离拉起
      if (config.daemon && process.env.__X_MCP_DAEMON_CHILD !== "true") {
        const { spawn } = await import("node:child_process");
        const { join } = await import("node:path");
        const { openSync } = await import("node:fs");

        // 过滤掉 --daemon 参数以防死循环拉起
        const childArgs = process.argv.slice(2).filter((arg) => arg !== "--daemon");
        
        const logFile = join(process.cwd(), "x-mcp-daemon.log");
        const out = openSync(logFile, "a");
        const err = openSync(logFile, "a");

        const child = spawn(process.execPath, [process.argv[1]!, ...childArgs], {
          detached: true,
          stdio: ["ignore", out, err],
          env: {
            ...process.env,
            __X_MCP_DAEMON_CHILD: "true"
          }
        });

        child.unref();

        console.log("\n==============================================================");
        console.log("🎉  x-mcp 后台守护服务已成功启动！");
        console.log("--------------------------------------------------------------");
        console.log(`  后台 PID:       ${child.pid}`);
        console.log(`  运行端口:       ${config.port}`);
        console.log(`  物理日志文件:   ${logFile}`);
        console.log("==============================================================\n");

        process.exit(0);
      }

      // 从本地读取 onboarding 状态
      const state = await readOnboardingState();
      let oauthClients = state.oauthClients ?? {};

      // 如果完全没有任何凭据，且没有配置全局 accessToken，系统自动生成默认的 Client ID & Secret
      if (Object.keys(oauthClients).length === 0 && !config.accessToken) {
        const { randomBytes } = await import("node:crypto");
        const defaultClientId = `x-mcp-client-${randomBytes(6).toString("hex")}`;
        const defaultClientSecret = `x-mcp-secret-${randomBytes(16).toString("hex")}`;
        try {
          const nextState = await saveOAuthClient(defaultClientId, defaultClientSecret);
          oauthClients = nextState.oauthClients ?? {};
        } catch {
          // 如果保存失败，在内存中维护
          oauthClients = { [defaultClientId]: defaultClientSecret };
        }
      }

      await runSseServer(
        config.port,
        config.allowedHosts,
        undefined,
        oauthClients,
        config.accessToken,
        config.sslKey,
        config.sslCert
      );
      return;
    }
  }
}

async function runMcpServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function runSseServer(
  port: number,
  allowedHosts: string[] = [],
  service?: XPostService,
  oauthClientsParam?: Record<string, string>,
  globalAccessToken?: string,
  sslKey?: string,
  sslCert?: string
): Promise<{ close: () => Promise<void> }> {
  const activeTransports = new Map<string, { transport: SSEServerTransport; clientId: string }>();

  // 1. 尝试配置原生的 HTTPS/TLS 证书
  let sslOptions: { key: Buffer; cert: Buffer } | undefined;
  if (sslKey && sslCert) {
    try {
      sslOptions = {
        key: readFileSync(sslKey),
        cert: readFileSync(sslCert)
      };
    } catch (error) {
      console.error("\n==============================================================");
      console.error("❌  SSL ERROR (原生 HTTPS 证书加载失败):");
      console.error("系统在加载配置的 HTTPS 证书或私钥文件时遇到致命错误：");
      console.error(`  私钥路径 (ssl-key):  ${sslKey}`);
      console.error(`  证书路径 (ssl-cert): ${sslCert}`);
      console.error(`  错误描述:            ${error instanceof Error ? error.message : String(error)}`);
      console.error("请仔细检查证书路径是否正确，以及当前运行账户是否有读取权限。");
      console.error("==============================================================\n");
      throw new Error(`Failed to load SSL certificates: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // HTTP 请求核心处理器
  const httpHandler = async (req: any, res: any) => {
    // 安全响应头防御
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "default-src 'none'");

    // CORS 跨域防御
    const origin = req.headers.origin;
    if (origin) {
      let allowed = true;
      if (allowedHosts.length > 0) {
        try {
          const originUrl = new URL(origin);
          allowed = allowedHosts.includes(originUrl.host);
        } catch {
          allowed = false;
        }
      }
      if (allowed) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400"
      }).end();
      return;
    }

    const host = req.headers.host ?? "localhost";
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(req.url ?? "", `http://${host}`);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain" }).end("Invalid Request URL");
      return;
    }

    // 每次请求动态读取 onboarding 状态以获取最新凭据
    let localClients: Record<string, string> = {};
    try {
      const state = await readOnboardingState();
      localClients = state.oauthClients ?? {};
    } catch {
      // ignore
    }

    const oauthClients = { ...oauthClientsParam, ...localClients };
    const globalToken = globalAccessToken ?? process.env.X_MCP_ACCESS_TOKEN;

    // 凭证提取助手
    function extractCredentials(req: any, parsedUrl: URL): { clientId?: string; clientSecret?: string } {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.toLowerCase().startsWith("basic ")) {
        try {
          const credentials = Buffer.from(authHeader.substring(6), "base64").toString("utf8");
          const colonIdx = credentials.indexOf(":");
          if (colonIdx !== -1) {
            return {
              clientId: credentials.substring(0, colonIdx),
              clientSecret: credentials.substring(colonIdx + 1)
            };
          }
        } catch {
          // ignore
        }
      }
      const cid = parsedUrl.searchParams.get("client_id") || parsedUrl.searchParams.get("clientId") || undefined;
      const secret = parsedUrl.searchParams.get("client_secret") || parsedUrl.searchParams.get("clientSecret") || undefined;
      return { clientId: cid, clientSecret: secret };
    }

    const { clientId, clientSecret } = extractCredentials(req, parsedUrl);

    // 鉴权判断逻辑
    let isAuthorized = false;
    if (clientId && clientSecret) {
      if (oauthClients[clientId] === clientSecret) {
        isAuthorized = true;
      } else if (globalToken && clientSecret === globalToken) {
        isAuthorized = true;
      }
    } else if (clientSecret && !clientId) {
      if (globalToken && clientSecret === globalToken) {
        isAuthorized = true;
      }
    }

    // 1. SSE 握手端点 (GET /sse)
    if (parsedUrl.pathname === "/sse" && req.method === "GET") {
      if (!isAuthorized) {
        res.writeHead(401, { "Content-Type": "text/plain" }).end("Unauthorized: Invalid OAuth Client ID or Client Secret");
        return;
      }

      // 将授权凭证注入到 messageEndpoint 保证 POST 时也能防伪校验
      const messageEndpoint = `/messages?client_id=${encodeURIComponent(clientId ?? "")}&client_secret=${encodeURIComponent(clientSecret ?? "")}`;

      const transport = new SSEServerTransport(messageEndpoint, res, {
        enableDnsRebindingProtection: allowedHosts.length > 0,
        allowedHosts: allowedHosts
      });

      const sessionId = transport.sessionId;
      // 强Session隔离：记录本 Session 的拥有者 Client ID
      activeTransports.set(sessionId, { transport, clientId: clientId ?? "" });

      transport.onclose = () => {
        activeTransports.delete(sessionId);
      };

      const sessionServer = createServer(service);
      await sessionServer.connect(transport);
      return;
    }

    // 2. 消息传送端点 (POST /messages)
    if (parsedUrl.pathname === "/messages" && req.method === "POST") {
      if (!isAuthorized) {
        res.writeHead(401, { "Content-Type": "text/plain" }).end("Unauthorized");
        return;
      }

      const sessionId = parsedUrl.searchParams.get("sessionId");
      if (!sessionId) {
        res.writeHead(400, { "Content-Type": "text/plain" }).end("Missing sessionId");
        return;
      }

      const sessionData = activeTransports.get(sessionId);
      if (!sessionData) {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("Session not found");
        return;
      }

      // 强安全防卫：校验会话拥有者，彻底防御 session 越权跨客户端调用
      if (sessionData.clientId !== (clientId ?? "")) {
        res.writeHead(401, { "Content-Type": "text/plain" }).end("Unauthorized: Session owner mismatch");
        return;
      }

      try {
        await sessionData.transport.handlePostMessage(req, res);
      } catch (error) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain" }).end("Internal Message Error");
        }
      }
      return;
    }

    // 3. 兜底 404
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not Found");
  };

  // 2. 根据凭证动态选用 HTTPS 或 HTTP 服务器
  const httpServer = sslOptions
    ? createHttpsServer(sslOptions, httpHandler)
    : createHttpServer(httpHandler);

  return new Promise<{ close: () => Promise<void> }>((resolve, reject) => {
    httpServer.on("error", (err) => {
      reject(err);
    });

    httpServer.listen(port, async () => {
      const protocol = sslOptions ? "https" : "http";
      console.log(`x-post-mcp-server SSE server listening on port ${port} (${protocol.toUpperCase()} mode)`);
      if (allowedHosts.length > 0) {
        console.log(`DNS Rebinding protection enabled. Allowed hosts: ${allowedHosts.join(", ")}`);
      } else {
        console.log(`Warning: DNS Rebinding protection disabled. Define allowed hosts via --allowed-hosts for production.`);
      }

      // 重新加载并渲染当前有效的客户端连接凭证
      let localClients: Record<string, string> = {};
      try {
        const state = await readOnboardingState();
        localClients = state.oauthClients ?? {};
      } catch {
        // ignore
      }
      const displayClients = { ...oauthClientsParam, ...localClients };
      if (Object.keys(displayClients).length > 0) {
        console.log("\n==============================================================");
        if (sslOptions) {
          console.log("🔒 HTTPS SECURE MODE ACTIVE (原生 HTTPS 安全模式已启动):");
        } else {
          console.log("🔒 SECURITY NOTICE (开源安全警示 - Claude 远程连接凭证):");
        }
        console.log("为了防范公网盗刷付费 API 额度，系统已启动 OAuth 凭证安全强鉴权机制。");
        console.log("请在 Claude 客户端自定义连接器 (Custom Connectors -> Add Connector) 的");
        console.log("Advanced settings (高级设置) 中配置远程 MCP，并填入以下对应信息：");
        console.log("--------------------------------------------------------------");
        console.log(`  Remote MCP URL:  ${protocol}://localhost:${port}/sse`);
        
        let idx = 1;
        for (const [cid, secret] of Object.entries(displayClients)) {
          console.log(`\n  [凭证对 #${idx++}]`);
          console.log(`  Client ID:       ${cid}`);
          console.log(`  Client Secret:   ${secret}`);
        }
        console.log("==============================================================\n");
      } else {
        console.log("\nWarning: No OAuth Clients or global access token configured. Remote endpoints are open to public.");
      }

      resolve({
        close: () => new Promise<void>((res, rej) => {
          httpServer.close((err) => {
            if (err) rej(err);
            else res();
          });
        })
      });
    });
  });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

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
      // Build final allowed MCP Users map
      const allowedUsers = { ...config.allowedMcpUsers };

      // Open-source safety default: if no whitelists are defined, enforce 'admin' default protection in SSE remote mode
      if (Object.keys(allowedUsers).length === 0 && !config.accessToken) {
        allowedUsers["admin"] = undefined;
      }

      const finalMcpUsers: Record<string, string> = {};
      const { randomBytes } = await import("node:crypto");

      for (const [user, token] of Object.entries(allowedUsers)) {
        if (token) {
          finalMcpUsers[user] = token;
        } else {
          finalMcpUsers[user] = randomBytes(16).toString("hex");
        }
      }

      // Bind legacy global accessToken for backward compatibility
      if (config.accessToken) {
        finalMcpUsers[""] = config.accessToken;
      }

      await runSseServer(config.port, config.allowedHosts, undefined, finalMcpUsers);
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
  allowedMcpUsers?: Record<string, string>
): Promise<{ close: () => Promise<void> }> {
  const activeTransports = new Map<string, { transport: SSEServerTransport; username: string }>();

  const httpServer = createHttpServer(async (req, res) => {
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

    // 1. SSE 握手端点 (GET /sse)
    if (parsedUrl.pathname === "/sse" && req.method === "GET") {
      const userParam = (parsedUrl.searchParams.get("user") || parsedUrl.searchParams.get("username") || "").toLowerCase().trim();
      const tokenParam = (parsedUrl.searchParams.get("token") || "").trim();

      if (allowedMcpUsers) {
        const expectedToken = allowedMcpUsers[userParam];
        if (!expectedToken || tokenParam !== expectedToken) {
          res.writeHead(401, { "Content-Type": "text/plain" }).end("Unauthorized: Invalid MCP User or Token");
          return;
        }
      }

      const messageEndpoint = allowedMcpUsers
        ? `/messages?user=${encodeURIComponent(userParam)}&token=${encodeURIComponent(allowedMcpUsers[userParam]!)}`
        : "/messages";

      const transport = new SSEServerTransport(messageEndpoint, res, {
        enableDnsRebindingProtection: allowedHosts.length > 0,
        allowedHosts: allowedHosts
      });

      const sessionId = transport.sessionId;
      activeTransports.set(sessionId, { transport, username: userParam });

      transport.onclose = () => {
        activeTransports.delete(sessionId);
      };

      const sessionServer = createServer(service);
      await sessionServer.connect(transport);
      return;
    }

    // 2. 消息传送端点 (POST /messages)
    if (parsedUrl.pathname === "/messages" && req.method === "POST") {
      const userParam = (parsedUrl.searchParams.get("user") || parsedUrl.searchParams.get("username") || "").toLowerCase().trim();
      const tokenParam = (parsedUrl.searchParams.get("token") || "").trim();

      if (allowedMcpUsers) {
        const expectedToken = allowedMcpUsers[userParam];
        if (!expectedToken || tokenParam !== expectedToken) {
          res.writeHead(401, { "Content-Type": "text/plain" }).end("Unauthorized");
          return;
        }
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

      // 强安全防卫：校验会话拥有者，彻底防御 session 越权跨用户调用
      if (allowedMcpUsers && sessionData.username !== userParam) {
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

    // 3. 兜底 404 (防扫描及路径探测)
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not Found");
  });

  return new Promise<{ close: () => Promise<void> }>((resolve, reject) => {
    httpServer.on("error", (err) => {
      reject(err);
    });

    httpServer.listen(port, () => {
      console.log(`x-post-mcp-server SSE server listening on port ${port}`);
      if (allowedHosts.length > 0) {
        console.log(`DNS Rebinding protection enabled. Allowed hosts: ${allowedHosts.join(", ")}`);
      } else {
        console.log(`Warning: DNS Rebinding protection disabled. Define allowed hosts via --allowed-hosts for production.`);
      }
      
      if (allowedMcpUsers && Object.keys(allowedMcpUsers).length > 0) {
        console.log("\n==============================================================");
        console.log("🔒 SECURITY NOTICE (开源安全警示 - MCP 用户白名单策略):");
        console.log("为了防范公网盗刷付费 API 额度，系统已启动用户安全接入认证。");
        console.log("请为不同的 MCP 用户配置以下专属连接 URL：\n");
        for (const [user, token] of Object.entries(allowedMcpUsers)) {
          const userStr = user ? `@${user}` : "(全局匿名模式)";
          const queryStr = user ? `user=${user}&token=${token}` : `token=${token}`;
          console.log(`👤 MCP 用户 ${userStr.padEnd(20)} 👉  http://localhost:${port}/sse?${queryStr}`);
        }
        console.log("==============================================================\n");
      } else {
        console.log("Warning: MCP User Whitelist is disabled. Protect your server by defining --allowed-mcp-users in public clouds.");
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

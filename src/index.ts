#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createXPostService, type XPostService } from "./service.js";
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
  if (process.argv.includes("--smoke")) {
    createServer();
    console.log("x-post-mcp-server smoke check ok");
    return;
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

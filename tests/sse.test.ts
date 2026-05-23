import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return {
    ...original,
    readFileSync: (path: any, options?: any) => {
      if (path === "key.pem") return Buffer.from("mock-key");
      if (path === "cert.pem") return Buffer.from("mock-cert");
      return original.readFileSync(path, options);
    }
  };
});

vi.mock("node:https", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:https")>();
  return {
    ...original,
    createServer: (opts: any, handler: any) => {
      if (opts && opts.key && opts.key.toString() === "mock-key") {
        return {
          listen: (port: number, cb: () => void) => {
            if (cb) cb();
          },
          on: () => {},
          close: (cb: () => void) => {
            if (cb) cb();
          }
        } as any;
      }
      return original.createServer(opts, handler);
    }
  };
});

import { runSseServer } from "../src/index.js";
import type { XPostService } from "../src/service.js";
import * as fs from "node:fs";
import * as https from "node:https";

const mockService: XPostService = {
  getPost: vi.fn(async () => ({ id: "123", text: "hello" })),
  searchPosts: vi.fn(),
  getUserInfo: vi.fn(),
  getUserPosts: vi.fn(),
  getAccountInfo: vi.fn(),
};

describe("SSE Remote Server - OAuth Client ID & Secret Basic Auth", () => {
  let sseServer: { close: () => Promise<void> };
  const port = 4569;
  const allowedHosts = ["localhost:4569", "localhost", "localhost:3000"];
  const oauthClients = {
    "x-mcp-client-test": "x-mcp-secret-test"
  };

  beforeAll(async () => {
    sseServer = await runSseServer(port, allowedHosts, mockService, oauthClients);
  });

  afterAll(async () => {
    await sseServer.close();
  });

  it("permits GET /sse with correct Basic Authorization header", async () => {
    const credentials = Buffer.from("x-mcp-client-test:x-mcp-secret-test").toString("base64");
    const res = await fetch(`http://localhost:${port}/sse`, {
      headers: {
        "Authorization": `Basic ${credentials}`
      }
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("No readable body");
    }

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: endpoint");
    expect(text).toContain("data: /messages?client_id=x-mcp-client-test&client_secret=x-mcp-secret-test&sessionId=");

    await reader.cancel();
  });

  it("permits GET /sse with correct URL parameters", async () => {
    const res = await fetch(`http://localhost:${port}/sse?client_id=x-mcp-client-test&client_secret=x-mcp-secret-test`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("No readable body");
    }

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: endpoint");
    expect(text).toContain("data: /messages?client_id=x-mcp-client-test&client_secret=x-mcp-secret-test&sessionId=");

    await reader.cancel();
  });

  it("rejects unauthorized clients with 401", async () => {
    // Missing credentials
    const res1 = await fetch(`http://localhost:${port}/sse`);
    expect(res1.status).toBe(401);

    // Incorrect secret
    const credentials = Buffer.from("x-mcp-client-test:wrong-secret").toString("base64");
    const res2 = await fetch(`http://localhost:${port}/sse`, {
      headers: {
        "Authorization": `Basic ${credentials}`
      }
    });
    expect(res2.status).toBe(401);

    // Non-existent client ID
    const credentials2 = Buffer.from("stranger-client:x-mcp-secret-test").toString("base64");
    const res3 = await fetch(`http://localhost:${port}/sse`, {
      headers: {
        "Authorization": `Basic ${credentials2}`
      }
    });
    expect(res3.status).toBe(401);
  });
});

describe("SSE Remote Server - POST /messages & Session Isolation", () => {
  let sseServer: { close: () => Promise<void> };
  const port = 4570;
  const allowedHosts = ["localhost:4570", "localhost"];
  const oauthClients = {
    "client-a": "secret-a",
    "client-b": "secret-b"
  };

  beforeAll(async () => {
    sseServer = await runSseServer(port, allowedHosts, mockService, oauthClients);
  });

  afterAll(async () => {
    await sseServer.close();
  });

  it("enforces Basic Auth and Session Owner matching on POST /messages", async () => {
    // 1. Get a valid session for client-a
    const credentialsA = Buffer.from("client-a:secret-a").toString("base64");
    const sseRes = await fetch(`http://localhost:${port}/sse`, {
      headers: {
        "Authorization": `Basic ${credentialsA}`
      }
    });
    const reader = sseRes.body?.getReader();
    if (!reader) throw new Error("No readable body");

    const { value } = await reader.read();
    const sseText = new TextDecoder().decode(value);
    const match = sseText.match(/sessionId=([a-f0-9-]+)/);
    if (!match || !match[1]) {
      await reader.cancel();
      throw new Error("Could not extract sessionId");
    }
    const sessionId = match[1];

    // 2. POST without credentials -> 401
    const postRes1 = await fetch(`http://localhost:${port}/messages?sessionId=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(postRes1.status).toBe(401);

    // 3. POST with credentials of client-b (cross-session hijacking) -> 401
    const credentialsB = Buffer.from("client-b:secret-b").toString("base64");
    const postRes2 = await fetch(`http://localhost:${port}/messages?sessionId=${sessionId}`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Basic ${credentialsB}`
      },
      body: JSON.stringify({}),
    });
    expect(postRes2.status).toBe(401);

    // 4. POST with correct credentials (client-a) -> 202
    const msg = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "x_post_get",
        arguments: {
          idOrUrl: "123",
        },
      },
      id: 1,
    };

    const postRes3 = await fetch(`http://localhost:${port}/messages?sessionId=${sessionId}`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Basic ${credentialsA}`
      },
      body: JSON.stringify(msg),
    });
    expect(postRes3.status).toBe(202);

    await reader.cancel();
  });
});

describe("SSE Remote Server - HTTPS Native Mode", () => {
  it("successfully creates HTTPS server when sslKey and sslCert are provided", async () => {
    // 调用 runSseServer。因为在顶部通过 vi.mock 拦截了 "key.pem" / "cert.pem"，
    // 并且模拟了 https.createServer，它不会去读取真实磁盘文件，也不会底层报错。
    const sseServer = await runSseServer(3009, [], mockService, { "client-id": "client-secret" }, undefined, "key.pem", "cert.pem");
    expect(sseServer).toBeDefined();
    
    // 正常执行关闭
    await sseServer.close();
  });
});

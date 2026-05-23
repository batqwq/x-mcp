import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runSseServer } from "../src/index.js";
import type { XPostService } from "../src/service.js";

const mockService: XPostService = {
  getPost: vi.fn(async () => ({ id: "123", text: "hello" })),
  searchPosts: vi.fn(),
  getUserInfo: vi.fn(),
  getUserPosts: vi.fn(),
  getAccountInfo: vi.fn(),
};

describe("SSE Remote Server - No Auth Configuration", () => {
  let sseServer: { close: () => Promise<void> };
  const port = 4569;
  const allowedHosts = ["localhost:4569", "localhost", "localhost:3000"];

  beforeAll(async () => {
    // Under no auth, the system defaults to "admin" auto-generated token to keep it secure
    sseServer = await runSseServer(port, allowedHosts, mockService, { admin: "secure-mcp-key" });
  });

  afterAll(async () => {
    await sseServer.close();
  });

  it("handles GET /sse with correct token parameters", async () => {
    const res = await fetch(`http://localhost:${port}/sse?user=admin&token=secure-mcp-key`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("No readable body");
    }

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: endpoint");
    expect(text).toContain("data: /messages?user=admin&token=secure-mcp-key&sessionId=");

    await reader.cancel();
  });

  it("rejects invalid tokens under default security protection", async () => {
    const res1 = await fetch(`http://localhost:${port}/sse`);
    expect(res1.status).toBe(401);

    const res2 = await fetch(`http://localhost:${port}/sse?user=admin&token=wrong-one`);
    expect(res2.status).toBe(401);
  });
});

describe("SSE Remote Server - Multi-User Whitelist", () => {
  let sseServer: { close: () => Promise<void> };
  const port = 4570;
  const allowedHosts = ["localhost:4570", "localhost"];
  const mcpUsersMap = {
    batqwq: "secret-key-1",
    guest: "secret-key-2",
  };

  beforeAll(async () => {
    sseServer = await runSseServer(port, allowedHosts, mockService, mcpUsersMap);
  });

  afterAll(async () => {
    await sseServer.close();
  });

  it("rejects unauthorized users or tokens with 401", async () => {
    // Missing credentials
    const res1 = await fetch(`http://localhost:${port}/sse`);
    expect(res1.status).toBe(401);

    // Incorrect token
    const res2 = await fetch(`http://localhost:${port}/sse?user=batqwq&token=wrong-token`);
    expect(res2.status).toBe(401);

    // Non-whitelisted user
    const res3 = await fetch(`http://localhost:${port}/sse?user=stranger&token=secret-key-1`);
    expect(res3.status).toBe(401);
  });

  it("permits whitelisted users with valid keys and appends them to messageEndpoint", async () => {
    // 1. batqwq connects
    const resUser1 = await fetch(`http://localhost:${port}/sse?user=batqwq&token=secret-key-1`);
    expect(resUser1.status).toBe(200);
    const reader1 = resUser1.body?.getReader();
    if (!reader1) throw new Error("No readable body");

    const { value: val1 } = await reader1.read();
    const text1 = new TextDecoder().decode(val1);
    expect(text1).toContain("event: endpoint");
    expect(text1).toContain("data: /messages?user=batqwq&token=secret-key-1&sessionId=");

    // 2. guest connects
    const resUser2 = await fetch(`http://localhost:${port}/sse?user=guest&token=secret-key-2`);
    expect(resUser2.status).toBe(200);
    const reader2 = resUser2.body?.getReader();
    if (!reader2) throw new Error("No readable body");

    const { value: val2 } = await reader2.read();
    const text2 = new TextDecoder().decode(val2);
    expect(text2).toContain("event: endpoint");
    expect(text2).toContain("data: /messages?user=guest&token=secret-key-2&sessionId=");

    await reader1.cancel();
    await reader2.cancel();
  });

  it("enforces tokens on POST /messages calls", async () => {
    // 1. Get a valid session for guest
    const sseRes = await fetch(`http://localhost:${port}/sse?user=guest&token=secret-key-2`);
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

    // 3. POST with credentials of other users -> 401
    const postRes2 = await fetch(`http://localhost:${port}/messages?user=batqwq&token=secret-key-1&sessionId=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(postRes2.status).toBe(401);

    // 4. POST with correct credentials -> 202
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

    const postRes3 = await fetch(`http://localhost:${port}/messages?user=guest&token=secret-key-2&sessionId=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
    });
    expect(postRes3.status).toBe(202);

    await reader.cancel();
  });
});

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

describe("SSE Remote Server - No Auth", () => {
  let sseServer: { close: () => Promise<void> };
  const port = 4569;
  const allowedHosts = ["localhost:4569", "localhost", "localhost:3000"];

  beforeAll(async () => {
    sseServer = await runSseServer(port, allowedHosts, mockService);
  });

  afterAll(async () => {
    await sseServer.close();
  });

  it("handles GET /sse and returns event-stream with sessionId", async () => {
    const res = await fetch(`http://localhost:${port}/sse`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("No readable body");
    }

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: endpoint");
    expect(text).toContain("data: /messages?sessionId=");

    await reader.cancel();
  });

  it("rejects POST /messages with 400 when missing sessionId", async () => {
    const res = await fetch(`http://localhost:${port}/messages`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toBe("Missing sessionId");
  });

  it("rejects POST /messages with 404 when sessionId is invalid", async () => {
    const res = await fetch(`http://localhost:${port}/messages?sessionId=invalid-session-id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toBe("Session not found");
  });

  it("responds to OPTIONS requests with CORS headers", async () => {
    const res = await fetch(`http://localhost:${port}/sse`, {
      method: "OPTIONS",
      headers: {
        "Origin": "http://localhost:3000",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });

  it("does not set access-control-allow-origin for unauthorized domains", async () => {
    const res = await fetch(`http://localhost:${port}/sse`, {
      method: "OPTIONS",
      headers: {
        "Origin": "http://malicious-domain.com",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("returns 404 for unmapped endpoints", async () => {
    const res = await fetch(`http://localhost:${port}/unmapped-endpoint`);
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toBe("Not Found");
  });

  it("handles valid JSON-RPC message over POST with correct sessionId", async () => {
    const sseRes = await fetch(`http://localhost:${port}/sse`);
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

    const postRes = await fetch(`http://localhost:${port}/messages?sessionId=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
    });

    expect(postRes.status).toBe(202);
    const responseText = await postRes.text();
    expect(responseText).toBe("Accepted");

    await reader.cancel();
  });
});

describe("SSE Remote Server - Authenticated", () => {
  let sseServer: { close: () => Promise<void> };
  const port = 4570;
  const allowedHosts = ["localhost:4570", "localhost"];
  const token = "secure-mcp-key-xyz";

  beforeAll(async () => {
    sseServer = await runSseServer(port, allowedHosts, mockService, token);
  });

  afterAll(async () => {
    await sseServer.close();
  });

  it("rejects GET /sse with 401 when token is missing", async () => {
    const res = await fetch(`http://localhost:${port}/sse`);
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toBe("Unauthorized");
  });

  it("rejects GET /sse with 401 when token is incorrect", async () => {
    const res = await fetch(`http://localhost:${port}/sse?token=wrong-token`);
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toBe("Unauthorized");
  });

  it("handles GET /sse with 200 and sets token on relative endpoint data when correct", async () => {
    const res = await fetch(`http://localhost:${port}/sse?token=${token}`);
    expect(res.status).toBe(200);

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No readable body");

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: endpoint");
    expect(text).toContain(`/messages?token=${token}&sessionId=`);

    await reader.cancel();
  });

  it("rejects POST /messages with 401 when token is missing or incorrect", async () => {
    // Correct token on GET, missing on POST
    const sseRes = await fetch(`http://localhost:${port}/sse?token=${token}`);
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

    // POST without token
    const postRes1 = await fetch(`http://localhost:${port}/messages?sessionId=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(postRes1.status).toBe(401);

    // POST with incorrect token
    const postRes2 = await fetch(`http://localhost:${port}/messages?sessionId=${sessionId}&token=fake-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(postRes2.status).toBe(401);

    await reader.cancel();
  });

  it("handles valid JSON-RPC message over POST with correct sessionId and token", async () => {
    const sseRes = await fetch(`http://localhost:${port}/sse?token=${token}`);
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

    const postRes = await fetch(`http://localhost:${port}/messages?token=${token}&sessionId=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
    });

    expect(postRes.status).toBe(202);
    const responseText = await postRes.text();
    expect(responseText).toBe("Accepted");

    await reader.cancel();
  });
});

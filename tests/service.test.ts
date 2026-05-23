import { describe, expect, it, vi } from "vitest";
import { InvalidInputError, ProviderConfigError, ProviderHttpError } from "../src/errors.js";
import { createProvider, createXPostService, isRetryableError, resolveProviderId, resolveProviderOrder } from "../src/service.js";
import type { FetchLike } from "../src/types.js";

describe("resolveProviderId", () => {
  it("uses explicit provider first", () => {
    expect(resolveProviderId("getxapi", { TWITTERAPI_IO_KEY: "set" })).toBe("getxapi");
  });

  it("uses X_POST_PROVIDER when no explicit provider is supplied", () => {
    expect(resolveProviderId(undefined, { X_POST_PROVIDER: "getxapi", TWITTERAPI_IO_KEY: "set", GETXAPI_KEY: "set" })).toBe("getxapi");
  });

  it("trims and normalizes X_POST_PROVIDER", () => {
    expect(resolveProviderId(undefined, { X_POST_PROVIDER: " TwitterAPI.io ", TWITTERAPI_IO_KEY: "set" })).toBe("twitterapi_io");
    expect(resolveProviderId(undefined, { X_POST_PROVIDER: "get_xapi", GETXAPI_KEY: "set" })).toBe("getxapi");
  });

  it("prefers twitterapi_io when both keys are configured", () => {
    expect(resolveProviderId(undefined, { TWITTERAPI_IO_KEY: "set", GETXAPI_KEY: "set" })).toBe("twitterapi_io");
  });

  it("ignores blank provider keys when auto-selecting", () => {
    expect(resolveProviderId(undefined, { TWITTERAPI_IO_KEY: " ", GETXAPI_KEY: "set" })).toBe("getxapi");
  });

  it("falls back to getxapi when only GetXAPI is configured", () => {
    expect(resolveProviderId(undefined, { GETXAPI_KEY: "set" })).toBe("getxapi");
  });

  it("fails clearly when no provider is configured", () => {
    expect(() => resolveProviderId(undefined, {})).toThrow(ProviderConfigError);
  });
});

describe("resolveProviderOrder", () => {
  it("returns single-element array for explicit provider", () => {
    expect(resolveProviderOrder("getxapi", { TWITTERAPI_IO_KEY: "set", GETXAPI_KEY: "set" })).toEqual(["getxapi"]);
  });

  it("returns both providers when both keys configured and no explicit choice", () => {
    expect(resolveProviderOrder(undefined, { TWITTERAPI_IO_KEY: "set", GETXAPI_KEY: "set" })).toEqual(["twitterapi_io", "getxapi"]);
  });

  it("returns primary then secondary when X_POST_PROVIDER is set and both keys configured", () => {
    expect(resolveProviderOrder(undefined, { X_POST_PROVIDER: "getxapi", TWITTERAPI_IO_KEY: "set", GETXAPI_KEY: "set" })).toEqual(["getxapi", "twitterapi_io"]);
  });

  it("returns single provider when only one key is configured", () => {
    expect(resolveProviderOrder(undefined, { GETXAPI_KEY: "set" })).toEqual(["getxapi"]);
  });

  it("returns single provider when X_POST_PROVIDER is set but only its key configured", () => {
    expect(resolveProviderOrder(undefined, { X_POST_PROVIDER: "twitterapi_io", TWITTERAPI_IO_KEY: "set" })).toEqual(["twitterapi_io"]);
  });

  it("throws on invalid X_POST_PROVIDER", () => {
    expect(() => resolveProviderOrder(undefined, { X_POST_PROVIDER: "bad" })).toThrow(ProviderConfigError);
  });

  it("throws when no keys are configured", () => {
    expect(() => resolveProviderOrder(undefined, {})).toThrow(ProviderConfigError);
  });
});

describe("isRetryableError", () => {
  it("treats ProviderConfigError as non-retryable", () => {
    expect(isRetryableError(new ProviderConfigError("missing key"))).toBe(false);
  });

  it("treats 500 as retryable", () => {
    expect(isRetryableError(new ProviderHttpError("twitterapi_io", "server error", 500))).toBe(true);
  });

  it("treats 502 as retryable", () => {
    expect(isRetryableError(new ProviderHttpError("getxapi", "bad gateway", 502))).toBe(true);
  });

  it("treats 429 as retryable", () => {
    expect(isRetryableError(new ProviderHttpError("twitterapi_io", "rate limit", 429))).toBe(true);
  });

  it("treats 400 as non-retryable", () => {
    expect(isRetryableError(new ProviderHttpError("twitterapi_io", "bad request", 400))).toBe(false);
  });

  it("treats 401 as non-retryable", () => {
    expect(isRetryableError(new ProviderHttpError("twitterapi_io", "unauthorized", 401))).toBe(false);
  });

  it("treats 404 as non-retryable", () => {
    expect(isRetryableError(new ProviderHttpError("getxapi", "not found", 404))).toBe(false);
  });

  it("treats network error (no status) as retryable", () => {
    expect(isRetryableError(new ProviderHttpError("twitterapi_io", "network error", undefined))).toBe(true);
  });

  it("treats generic errors as non-retryable", () => {
    expect(isRetryableError(new Error("something"))).toBe(false);
  });
});

describe("createProvider", () => {
  it("trims API keys before creating providers", () => {
    expect(createProvider("twitterapi_io", { TWITTERAPI_IO_KEY: " key " })).toBeTruthy();
  });

  it("rejects blank explicit provider keys", () => {
    expect(() => createProvider("twitterapi_io", { TWITTERAPI_IO_KEY: " " })).toThrow(ProviderConfigError);
  });
});

describe("createXPostService fallback", () => {
  it("rejects blank search queries before making provider calls", async () => {
    const service = createXPostService({ TWITTERAPI_IO_KEY: "key" });

    await expect(service.searchPosts({ query: "   " })).rejects.toThrow(InvalidInputError);
  });

  it("rejects usernames that become empty after @ cleanup", async () => {
    const service = createXPostService({ TWITTERAPI_IO_KEY: "key" });

    await expect(service.getUserInfo({ userName: "@@@" })).rejects.toThrow(InvalidInputError);
  });

  it("falls back to second provider on 500 error", async () => {
    let callCount = 0;
    const fetchMock = vi.fn<FetchLike>(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: "Internal Server Error" }), {
          status: 500,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ data: { id: "123", text: "hello" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    const service = createXPostService({ TWITTERAPI_IO_KEY: "key1", GETXAPI_KEY: "key2" }, fetchMock);
    const result = await service.getPost({ idOrUrl: "123" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ provider: "getxapi" });
  });

  it("falls back to second provider on 429 rate limit", async () => {
    let callCount = 0;
    const fetchMock = vi.fn<FetchLike>(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ data: { id: "123", text: "hello" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    const service = createXPostService({ TWITTERAPI_IO_KEY: "key1", GETXAPI_KEY: "key2" }, fetchMock);
    const result = await service.getPost({ idOrUrl: "123" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ provider: "getxapi" });
  });

  it("does not fall back on 400 client error", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(JSON.stringify({ error: "Bad request" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    });

    const service = createXPostService({ TWITTERAPI_IO_KEY: "key1", GETXAPI_KEY: "key2" }, fetchMock);

    await expect(service.getPost({ idOrUrl: "123" })).rejects.toThrow(ProviderHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses only one provider when only one key is configured", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      return new Response(JSON.stringify({ tweets: [{ id: "123", text: "hello" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    const service = createXPostService({ TWITTERAPI_IO_KEY: "key1" }, fetchMock);
    const result = await service.getPost({ idOrUrl: "123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ provider: "twitterapi_io" });
  });

  it("falls back on network error (no response)", async () => {
    let callCount = 0;
    const fetchMock = vi.fn<FetchLike>(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("socket closed");
      }
      return new Response(JSON.stringify({ data: { id: "123", text: "hello" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    const service = createXPostService({ TWITTERAPI_IO_KEY: "key1", GETXAPI_KEY: "key2" }, fetchMock);
    const result = await service.getPost({ idOrUrl: "123" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ provider: "getxapi" });
  });
});

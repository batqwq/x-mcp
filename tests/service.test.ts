import { describe, expect, it } from "vitest";
import { InvalidInputError, ProviderConfigError } from "../src/errors.js";
import { createProvider, createXPostService, resolveProviderId } from "../src/service.js";

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

describe("createProvider", () => {
  it("trims API keys before creating providers", () => {
    expect(createProvider("twitterapi_io", { TWITTERAPI_IO_KEY: " key " })).toBeTruthy();
  });

  it("rejects blank explicit provider keys", () => {
    expect(() => createProvider("twitterapi_io", { TWITTERAPI_IO_KEY: " " })).toThrow(ProviderConfigError);
  });
});

describe("createXPostService", () => {
  it("rejects blank search queries before making provider calls", async () => {
    const service = createXPostService({ TWITTERAPI_IO_KEY: "key" });

    await expect(service.searchPosts({ query: "   " })).rejects.toThrow(InvalidInputError);
  });

  it("rejects usernames that become empty after @ cleanup", async () => {
    const service = createXPostService({ TWITTERAPI_IO_KEY: "key" });

    await expect(service.getUserInfo({ userName: "@@@" })).rejects.toThrow(InvalidInputError);
  });
});

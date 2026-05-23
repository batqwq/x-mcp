import { describe, expect, it } from "vitest";
import { ProviderConfigError } from "../src/errors.js";
import { resolveProviderId } from "../src/service.js";

describe("resolveProviderId", () => {
  it("uses explicit provider first", () => {
    expect(resolveProviderId("getxapi", { TWITTERAPI_IO_KEY: "set" })).toBe("getxapi");
  });

  it("uses X_POST_PROVIDER when no explicit provider is supplied", () => {
    expect(resolveProviderId(undefined, { X_POST_PROVIDER: "getxapi", TWITTERAPI_IO_KEY: "set", GETXAPI_KEY: "set" })).toBe("getxapi");
  });

  it("prefers twitterapi_io when both keys are configured", () => {
    expect(resolveProviderId(undefined, { TWITTERAPI_IO_KEY: "set", GETXAPI_KEY: "set" })).toBe("twitterapi_io");
  });

  it("falls back to getxapi when only GetXAPI is configured", () => {
    expect(resolveProviderId(undefined, { GETXAPI_KEY: "set" })).toBe("getxapi");
  });

  it("fails clearly when no provider is configured", () => {
    expect(() => resolveProviderId(undefined, {})).toThrow(ProviderConfigError);
  });
});

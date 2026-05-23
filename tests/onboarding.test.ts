import { describe, expect, it } from "vitest";
import { defaultOnboardingState, onboardingStatePath, readOnboardingState, saveApiKey, loadApiKeys, saveOAuthClient } from "../src/onboarding.js";

describe("onboardingStatePath", () => {
  it("uses X_MCP_HOME when configured", () => {
    const path = onboardingStatePath({ X_MCP_HOME: "custom_home" });
    expect(path).toContain("custom_home");
  });

  it("falls back to APPDATA on Windows", () => {
    const path = onboardingStatePath({ APPDATA: "app_data_dir" });
    expect(path).toContain("app_data_dir");
  });
});

describe("saveApiKey and loadApiKeys", () => {
  it("saves encoded keys and loads them with env priority", async () => {
    const tempEnv = { X_MCP_HOME: "./test_onboard_tmp" };
    
    // Save TwitterAPI.io key
    let state = await saveApiKey("twitterapi_io", "tw-secret-key-123", tempEnv);
    expect(state.apiKeys?.twitterapi_io).toBe(Buffer.from("tw-secret-key-123").toString("base64"));

    // Save GetXAPI key
    state = await saveApiKey("getxapi", "gx-secret-key-456", tempEnv);
    expect(state.apiKeys?.getxapi).toBe(Buffer.from("gx-secret-key-456").toString("base64"));

    // Read state
    const read = await readOnboardingState(tempEnv);
    expect(read.apiKeys?.twitterapi_io).toBe(Buffer.from("tw-secret-key-123").toString("base64"));

    // Load keys into env
    const runEnv: Record<string, string | undefined> = {};
    loadApiKeys(read, runEnv);
    expect(runEnv.TWITTERAPI_IO_KEY).toBe("tw-secret-key-123");
    expect(runEnv.GETXAPI_KEY).toBe("gx-secret-key-456");

    // Env vars take precedence
    const overrideEnv = { TWITTERAPI_IO_KEY: "user-override" };
    loadApiKeys(read, overrideEnv);
    expect(overrideEnv.TWITTERAPI_IO_KEY).toBe("user-override");
  });
});

describe("saveOAuthClient", () => {
  it("saves oauth client credentials correctly", async () => {
    const tempEnv = { X_MCP_HOME: "./test_onboard_tmp" };

    const state = await saveOAuthClient("my-client-id", "my-client-secret", tempEnv);
    expect(state.oauthClients?.["my-client-id"]).toBe("my-client-secret");

    const read = await readOnboardingState(tempEnv);
    expect(read.oauthClients?.["my-client-id"]).toBe("my-client-secret");
  });
});

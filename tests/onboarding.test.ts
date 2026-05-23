import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { completeOnboarding, loadApiKeys, onboardingStatePath, readOnboardingState, saveApiKey, writeOnboardingState } from "../src/onboarding.js";
import type { EnvLike } from "../src/types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("onboarding state", () => {
  it("persists completion without storing plaintext API keys", async () => {
    const home = await mkdtemp(join(tmpdir(), "x-mcp-onboarding-"));
    tempDirs.push(home);

    const env = {
      X_MCP_HOME: home,
      TWITTERAPI_IO_KEY: "secret"
    };

    await completeOnboarding("twitterapi_io", env);
    const state = await readOnboardingState(env);
    const raw = await readFile(onboardingStatePath(env), "utf8");

    expect(state.completed).toBe(true);
    expect(state.preferredProvider).toBe("twitterapi_io");
    expect(raw).not.toContain("secret");
  });

  it("ignores blank X_MCP_HOME instead of writing to a relative path", async () => {
    const path = onboardingStatePath({ X_MCP_HOME: "", APPDATA: "C:\\Users\\Example\\AppData\\Roaming" });

    expect(path).toContain("x-mcp");
    expect(path).not.toBe("onboarding.json");
  });

  it("sanitizes invalid provider values from existing state files", async () => {
    const home = await mkdtemp(join(tmpdir(), "x-mcp-onboarding-"));
    tempDirs.push(home);
    const env = { X_MCP_HOME: home };
    const path = onboardingStatePath(env);
    await writeOnboardingState({ version: 1, completed: true, preferredProvider: "getxapi" }, env);
    await writeFile(path, '{"version":1,"completed":true,"preferredProvider":"bad"}\n', "utf8");

    const state = await readOnboardingState(env);

    expect(dirname(path)).toBe(home);
    expect(state.completed).toBe(true);
    expect(state.preferredProvider).toBeUndefined();
  });
});

describe("API key persistence", () => {
  it("saves and loads API key for twitterapi_io", async () => {
    const home = await mkdtemp(join(tmpdir(), "x-mcp-apikey-"));
    tempDirs.push(home);
    const env: EnvLike = { X_MCP_HOME: home };

    await saveApiKey("twitterapi_io", "my-twitter-key", env);

    const state = await readOnboardingState(env);
    expect(state.apiKeys?.twitterapi_io).toBeDefined();
    // Verify it's base64 encoded, not plaintext.
    expect(state.apiKeys!.twitterapi_io).not.toBe("my-twitter-key");
    expect(Buffer.from(state.apiKeys!.twitterapi_io!, "base64").toString("utf8")).toBe("my-twitter-key");

    // Loading should populate env.
    const freshEnv: EnvLike = { X_MCP_HOME: home };
    loadApiKeys(state, freshEnv);
    expect(freshEnv.TWITTERAPI_IO_KEY).toBe("my-twitter-key");
  });

  it("saves and loads API key for getxapi", async () => {
    const home = await mkdtemp(join(tmpdir(), "x-mcp-apikey-"));
    tempDirs.push(home);
    const env: EnvLike = { X_MCP_HOME: home };

    await saveApiKey("getxapi", "my-getx-key", env);

    const state = await readOnboardingState(env);
    expect(state.apiKeys?.getxapi).toBeDefined();
    expect(Buffer.from(state.apiKeys!.getxapi!, "base64").toString("utf8")).toBe("my-getx-key");

    const freshEnv: EnvLike = { X_MCP_HOME: home };
    loadApiKeys(state, freshEnv);
    expect(freshEnv.GETXAPI_KEY).toBe("my-getx-key");
  });

  it("does not overwrite existing env vars when loading", async () => {
    const home = await mkdtemp(join(tmpdir(), "x-mcp-apikey-"));
    tempDirs.push(home);
    const env: EnvLike = { X_MCP_HOME: home };

    await saveApiKey("twitterapi_io", "saved-key", env);

    const state = await readOnboardingState(env);
    const envWithExisting: EnvLike = { X_MCP_HOME: home, TWITTERAPI_IO_KEY: "env-key" };
    loadApiKeys(state, envWithExisting);
    expect(envWithExisting.TWITTERAPI_IO_KEY).toBe("env-key");
  });

  it("preserves API keys when completing onboarding", async () => {
    const home = await mkdtemp(join(tmpdir(), "x-mcp-apikey-"));
    tempDirs.push(home);
    const env: EnvLike = { X_MCP_HOME: home };

    await saveApiKey("twitterapi_io", "my-key", env);
    await completeOnboarding("twitterapi_io", env);

    const state = await readOnboardingState(env);
    expect(state.completed).toBe(true);
    expect(state.apiKeys?.twitterapi_io).toBeDefined();
    expect(Buffer.from(state.apiKeys!.twitterapi_io!, "base64").toString("utf8")).toBe("my-key");
  });

  it("saves both provider keys independently", async () => {
    const home = await mkdtemp(join(tmpdir(), "x-mcp-apikey-"));
    tempDirs.push(home);
    const env: EnvLike = { X_MCP_HOME: home };

    await saveApiKey("twitterapi_io", "twitter-key", env);
    await saveApiKey("getxapi", "getx-key", env);

    const state = await readOnboardingState(env);
    expect(Buffer.from(state.apiKeys!.twitterapi_io!, "base64").toString("utf8")).toBe("twitter-key");
    expect(Buffer.from(state.apiKeys!.getxapi!, "base64").toString("utf8")).toBe("getx-key");

    const freshEnv: EnvLike = { X_MCP_HOME: home };
    loadApiKeys(state, freshEnv);
    expect(freshEnv.TWITTERAPI_IO_KEY).toBe("twitter-key");
    expect(freshEnv.GETXAPI_KEY).toBe("getx-key");
  });

  it("handles missing apiKeys gracefully", () => {
    const env: EnvLike = {};
    loadApiKeys({ version: 1, completed: false }, env);
    expect(env.TWITTERAPI_IO_KEY).toBeUndefined();
    expect(env.GETXAPI_KEY).toBeUndefined();
  });
});

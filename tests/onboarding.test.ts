import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { completeOnboarding, onboardingStatePath, readOnboardingState, writeOnboardingState } from "../src/onboarding.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("onboarding state", () => {
  it("persists completion without storing API keys", async () => {
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

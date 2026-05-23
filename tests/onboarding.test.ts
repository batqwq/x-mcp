import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { completeOnboarding, onboardingStatePath, readOnboardingState } from "../src/onboarding.js";

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
});

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { EnvLike, ProviderId } from "./types.js";

export interface OnboardingState {
  version: 1;
  completed: boolean;
  preferredProvider?: ProviderId;
  completedAt?: string;
  lastOpenedAt?: string;
}

export function defaultOnboardingState(): OnboardingState {
  return {
    version: 1,
    completed: false
  };
}

export function onboardingStatePath(env: EnvLike = process.env): string {
  const baseDir = env.X_MCP_HOME ?? (env.APPDATA ? join(env.APPDATA, "x-mcp") : join(homedir(), ".x-mcp"));
  return join(baseDir, "onboarding.json");
}

export async function readOnboardingState(env: EnvLike = process.env): Promise<OnboardingState> {
  try {
    const raw = await readFile(onboardingStatePath(env), "utf8");
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      ...defaultOnboardingState(),
      ...parsed,
      version: 1,
      completed: Boolean(parsed.completed)
    };
  } catch {
    return defaultOnboardingState();
  }
}

export async function writeOnboardingState(state: OnboardingState, env: EnvLike = process.env): Promise<void> {
  const filePath = onboardingStatePath(env);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function touchOnboarding(state: OnboardingState, env: EnvLike = process.env): Promise<OnboardingState> {
  const next = {
    ...state,
    lastOpenedAt: new Date().toISOString()
  };
  await writeOnboardingState(next, env);
  return next;
}

export async function completeOnboarding(preferredProvider: ProviderId | undefined, env: EnvLike = process.env): Promise<OnboardingState> {
  const next: OnboardingState = {
    version: 1,
    completed: true,
    preferredProvider,
    completedAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString()
  };
  await writeOnboardingState(next, env);
  return next;
}

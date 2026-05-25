import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { EnvLike, ProviderId } from "./types.js";
import { normalizeProviderId, optionalNonBlank } from "./validation.js";

export interface OnboardingState {
  version: 1;
  completed: boolean;
  preferredProvider?: ProviderId;
  completedAt?: string;
  lastOpenedAt?: string;
  apiKeys?: {
    twitterapi_io?: string;
    getxapi?: string;
  };
  oauthClients?: Record<string, string>; // { [clientId]: clientSecret }
}

export function defaultOnboardingState(): OnboardingState {
  return {
    version: 1,
    completed: false
  };
}

export function onboardingStatePath(env: EnvLike = process.env): string {
  const configuredHome = optionalNonBlank(env.X_MCP_HOME);
  const appData = optionalNonBlank(env.APPDATA);
  const baseDir = configuredHome ?? (appData ? join(appData, "x-mcp") : join(homedir(), ".x-mcp"));
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
      completed: Boolean(parsed.completed),
      preferredProvider: normalizeProviderId(parsed.preferredProvider)
    };
  } catch {
    return defaultOnboardingState();
  }
}

export async function writeOnboardingState(state: OnboardingState, env: EnvLike = process.env): Promise<void> {
  const filePath = onboardingStatePath(env);
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(tempPath, filePath);
  try {
    await chmod(filePath, 0o600);
  } catch {
    // Some filesystems do not support POSIX-style mode changes; the write still succeeded.
  }
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
  const current = await readOnboardingState(env);
  const next: OnboardingState = {
    version: 1,
    completed: true,
    preferredProvider,
    completedAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    apiKeys: current.apiKeys,
    oauthClients: current.oauthClients
  };
  await writeOnboardingState(next, env);
  return next;
}

export async function saveApiKey(provider: ProviderId, apiKey: string, env: EnvLike = process.env): Promise<OnboardingState> {
  const state = await readOnboardingState(env);
  const encoded = Buffer.from(apiKey).toString("base64");
  const providerKey = provider === "twitterapi_io" ? "twitterapi_io" : "getxapi";
  const next: OnboardingState = {
    ...state,
    apiKeys: {
      ...state.apiKeys,
      [providerKey]: encoded
    },
    lastOpenedAt: new Date().toISOString()
  };
  await writeOnboardingState(next, env);
  return next;
}

export function loadApiKeys(state: OnboardingState, env: EnvLike): void {
  if (!state.apiKeys) {
    return;
  }

  if (state.apiKeys.twitterapi_io && !env.TWITTERAPI_IO_KEY) {
    try {
      env.TWITTERAPI_IO_KEY = Buffer.from(state.apiKeys.twitterapi_io, "base64").toString("utf8");
    } catch {
      // Ignore malformed stored key.
    }
  }

  if (state.apiKeys.getxapi && !env.GETXAPI_KEY) {
    try {
      env.GETXAPI_KEY = Buffer.from(state.apiKeys.getxapi, "base64").toString("utf8");
    } catch {
      // Ignore malformed stored key.
    }
  }
}

export async function saveOAuthClient(clientId: string, clientSecret: string, env: EnvLike = process.env): Promise<OnboardingState> {
  const state = await readOnboardingState(env);
  const next: OnboardingState = {
    ...state,
    oauthClients: {
      ...state.oauthClients,
      [clientId]: clientSecret
    },
    lastOpenedAt: new Date().toISOString()
  };
  await writeOnboardingState(next, env);
  return next;
}

export async function deleteOAuthClient(clientId: string, env: EnvLike = process.env): Promise<OnboardingState> {
  const state = await readOnboardingState(env);
  const oauthClients = { ...state.oauthClients };
  delete oauthClients[clientId];
  const next: OnboardingState = {
    ...state,
    oauthClients,
    lastOpenedAt: new Date().toISOString()
  };
  await writeOnboardingState(next, env);
  return next;
}

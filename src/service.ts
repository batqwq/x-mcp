import { ProviderConfigError, ProviderFallbackError, ProviderHttpError, XPostMcpError } from "./errors.js";
import { cleanUserName, normalizeUserName, parseTweetId } from "./xPostUrl.js";
import { GetXApiProvider } from "./providers/getxapi.js";
import { TwitterApiIoProvider } from "./providers/twitterapiIo.js";
import { PROVIDER_IDS, type EnvLike, type FetchLike, type ProviderId, type SearchProduct, type XPostProvider } from "./types.js";
import { normalizeApiKey, normalizeProviderId, normalizeSearchProduct, optionalNonBlank, requireNonBlank } from "./validation.js";

export interface XPostService {
  getPost(input: { idOrUrl: string; provider?: ProviderId }): Promise<unknown>;
  searchPosts(input: { query: string; queryType?: SearchProduct; cursor?: string; provider?: ProviderId }): Promise<unknown>;
  getUserInfo(input: { userName: string; provider?: ProviderId }): Promise<unknown>;
  getUserPosts(input: { userName?: string; userId?: string; includeReplies?: boolean; cursor?: string; provider?: ProviderId }): Promise<unknown>;
  getAccountInfo(input: { provider?: ProviderId }): Promise<unknown>;
}

export function createXPostService(
  env: EnvLike = process.env,
  fetchImpl: FetchLike = fetch,
  allowedXUsers?: string[]
): XPostService {
  // Pre-normalize whitelist for faster comparison (already handled by CLI, but double-safe)
  const normalizedWhitelist = allowedXUsers
    ? allowedXUsers.map((u) => u.toLowerCase().replace(/^@/, ""))
    : undefined;

  return {
    async getPost(input) {
      const id = parseTweetId(input.idOrUrl);
      const result = await withFallback(resolveProviderOrder(input.provider, env), env, fetchImpl, (provider) =>
        provider.getPost(id)
      ) as { provider: ProviderId; tweet: unknown; raw: unknown };

      // Apply target author whitelist validation
      if (normalizedWhitelist && normalizedWhitelist.length > 0) {
        const authorName = extractUsername(result.tweet);
        if (authorName && !normalizedWhitelist.includes(authorName.toLowerCase())) {
          throw new XPostMcpError(`The author @${authorName} of this tweet is not in the allowed X usernames whitelist.`);
        }
      }

      return result;
    },

    async searchPosts(input) {
      const query = requireNonBlank(input.query, "query");
      const queryType = normalizeSearchProduct(input.queryType);
      const cursor = optionalNonBlank(input.cursor);
      const result = await withFallback(resolveProviderOrder(input.provider, env), env, fetchImpl, (provider) =>
        provider.searchPosts({ query, queryType, cursor })
      ) as { provider: ProviderId; tweets: unknown[]; hasMore: boolean; nextCursor: string | null; raw: unknown };

      // Filter search results dynamically
      if (normalizedWhitelist && normalizedWhitelist.length > 0) {
        result.tweets = result.tweets.filter((tweet) => {
          const authorName = extractUsername(tweet);
          return authorName ? normalizedWhitelist.includes(authorName.toLowerCase()) : false;
        });
      }

      return result;
    },

    async getUserInfo(input) {
      const userName = cleanUserName(input.userName);
      if (normalizedWhitelist && normalizedWhitelist.length > 0 && !normalizedWhitelist.includes(userName.toLowerCase())) {
        throw new XPostMcpError(`User @${userName} is not in the allowed X usernames whitelist.`);
      }

      const result = await withFallback(resolveProviderOrder(input.provider, env), env, fetchImpl, (provider) =>
        provider.getUserInfo(userName)
      ) as { provider: ProviderId; user: unknown; raw: unknown };

      // Double-check returned payload just in case of provider aliases
      if (normalizedWhitelist && normalizedWhitelist.length > 0) {
        const returnedName = extractUsername(result.user);
        if (returnedName && !normalizedWhitelist.includes(returnedName.toLowerCase())) {
          throw new XPostMcpError(`User @${returnedName} is not in the allowed X usernames whitelist.`);
        }
      }

      return result;
    },

    async getUserPosts(input) {
      const userName = normalizeUserName(input.userName);
      if (userName && normalizedWhitelist && normalizedWhitelist.length > 0 && !normalizedWhitelist.includes(userName.toLowerCase())) {
        throw new XPostMcpError(`User @${userName} is not in the allowed X usernames whitelist.`);
      }

      if (!userName && !optionalNonBlank(input.userId)) {
        throw new XPostMcpError("Pass either userName or userId.");
      }
      const includeReplies = input.includeReplies ?? false;
      const cursor = optionalNonBlank(input.cursor);
      
      const result = await withFallback(resolveProviderOrder(input.provider, env), env, fetchImpl, (provider) =>
        provider.getUserPosts({ userName, userId: input.userId, includeReplies, cursor })
      ) as { provider: ProviderId; tweets: unknown[]; hasMore: boolean; nextCursor: string | null; raw: unknown };

      // Dynamic post stream filtering
      if (normalizedWhitelist && normalizedWhitelist.length > 0) {
        result.tweets = result.tweets.filter((tweet) => {
          const authorName = extractUsername(tweet);
          return authorName ? normalizedWhitelist.includes(authorName.toLowerCase()) : false;
        });
      }

      return result;
    },

    async getAccountInfo(input) {
      return withFallback(resolveProviderOrder(input.provider, env), env, fetchImpl, (provider) =>
        provider.getAccountInfo()
      );
    }
  };
}

/**
 * Heuristically extracts username/screen_name from user profiles or tweet payloads.
 * Supports recursive scanning for nested structures like tweet.user or tweet.author.
 */
export function extractUsername(obj: unknown): string | undefined {
  if (!obj || typeof obj !== "object") {
    return undefined;
  }
  const asRecord = obj as Record<string, unknown>;

  // 1. Directly check username / screen_name
  if (typeof asRecord.username === "string" && asRecord.username) return asRecord.username;
  if (typeof asRecord.screen_name === "string" && asRecord.screen_name) return asRecord.screen_name;

  // 2. Check nested user / author structures
  if (asRecord.user && typeof asRecord.user === "object") {
    const userResult = extractUsername(asRecord.user);
    if (userResult) return userResult;
  }
  if (asRecord.author && typeof asRecord.author === "object") {
    const authorResult = extractUsername(asRecord.author);
    if (authorResult) return authorResult;
  }

  return undefined;
}

/**
 * Determines whether a provider error is transient and should trigger a fallback attempt.
 * Only HTTP 5xx, 429 (rate limit), and network errors are considered retryable.
 * Client errors (4xx except 429) and config errors are not.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ProviderConfigError) {
    return false;
  }

  if (error instanceof ProviderHttpError) {
    if (error.status === undefined) {
      // Network error (no status code).
      return true;
    }
    return error.status === 429 || error.status >= 500;
  }

  return false;
}

/**
 * Returns an ordered list of providers to attempt for a given request.
 * When both providers are configured and no explicit provider is requested,
 * the primary provider is tried first, with the other available as a fallback.
 */
export function resolveProviderOrder(requested: ProviderId | undefined, env: EnvLike): ProviderId[] {
  if (requested) {
    return [requested];
  }

  const envDefault = env.X_POST_PROVIDER;
  const primaryFromEnv = envDefault ? normalizeProviderId(envDefault) : undefined;

  if (envDefault && !primaryFromEnv) {
    throw new ProviderConfigError(`Invalid X_POST_PROVIDER "${envDefault}". Expected one of: ${PROVIDER_IDS.join(", ")}.`);
  }

  const hasTwitter = Boolean(normalizeApiKey(env.TWITTERAPI_IO_KEY));
  const hasGetx = Boolean(normalizeApiKey(env.GETXAPI_KEY));

  if (primaryFromEnv) {
    // Use the env-configured primary first, then fall back to the other if also configured.
    const secondary: ProviderId = primaryFromEnv === "twitterapi_io" ? "getxapi" : "twitterapi_io";
    const secondaryConfigured = secondary === "twitterapi_io" ? hasTwitter : hasGetx;
    return secondaryConfigured ? [primaryFromEnv, secondary] : [primaryFromEnv];
  }

  if (hasTwitter && hasGetx) {
    return ["twitterapi_io", "getxapi"];
  }

  if (hasTwitter) {
    return ["twitterapi_io"];
  }

  if (hasGetx) {
    return ["getxapi"];
  }

  throw new ProviderConfigError("No X Post provider API key is configured. Set TWITTERAPI_IO_KEY or GETXAPI_KEY.");
}

/** Backwards-compatible helper: returns the first (primary) provider ID. */
export function resolveProviderId(requested: ProviderId | undefined, env: EnvLike): ProviderId {
  return resolveProviderOrder(requested, env)[0]!;
}

export function createProvider(providerId: ProviderId, env: EnvLike, fetchImpl: FetchLike = fetch): XPostProvider {
  if (providerId === "twitterapi_io") {
    const apiKey = normalizeApiKey(env.TWITTERAPI_IO_KEY);
    if (!apiKey) {
      throw new ProviderConfigError("TWITTERAPI_IO_KEY is required for provider twitterapi_io.");
    }
    return new TwitterApiIoProvider(apiKey, fetchImpl);
  }

  const apiKey = normalizeApiKey(env.GETXAPI_KEY);
  if (!apiKey) {
    throw new ProviderConfigError("GETXAPI_KEY is required for provider getxapi.");
  }
  return new GetXApiProvider(apiKey, fetchImpl);
}

/**
 * Attempts an operation using each provider in order.
 * Falls back to the next provider only when the error is transient (5xx, 429, network).
 */
async function withFallback<T>(
  providerIds: ProviderId[],
  env: EnvLike,
  fetchImpl: FetchLike,
  operation: (provider: XPostProvider) => Promise<T>
): Promise<T> {
  const attempts: Array<{ provider: ProviderId; error: Error }> = [];

  for (const providerId of providerIds) {
    let provider: XPostProvider;
    try {
      provider = createProvider(providerId, env, fetchImpl);
    } catch (error) {
      if (error instanceof ProviderConfigError && providerIds.length > 1) {
        // Skip unconfigured fallback providers silently.
        attempts.push({ provider: providerId, error });
        continue;
      }
      throw error;
    }

    try {
      return await operation(provider);
    } catch (error) {
      const asError = error instanceof Error ? error : new Error(String(error));
      attempts.push({ provider: providerId, error: asError });

      if (!isRetryableError(error) || providerId === providerIds[providerIds.length - 1]) {
        // Non-retryable error or last provider: throw immediately.
        throw error;
      }

      // Retryable error — fall through to next provider.
    }
  }

  // All providers exhausted (should not reach here unless all were config errors).
  throw new ProviderFallbackError(attempts);
}

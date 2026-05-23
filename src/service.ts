import { ProviderConfigError, XPostMcpError } from "./errors.js";
import { cleanUserName, parseTweetId } from "./xPostUrl.js";
import { GetXApiProvider } from "./providers/getxapi.js";
import { TwitterApiIoProvider } from "./providers/twitterapiIo.js";
import { PROVIDER_IDS, type EnvLike, type FetchLike, type ProviderId, type SearchProduct, type XPostProvider } from "./types.js";

export interface XPostService {
  getPost(input: { idOrUrl: string; provider?: ProviderId }): Promise<unknown>;
  searchPosts(input: { query: string; queryType?: SearchProduct; cursor?: string; provider?: ProviderId }): Promise<unknown>;
  getUserInfo(input: { userName: string; provider?: ProviderId }): Promise<unknown>;
  getUserPosts(input: { userName?: string; userId?: string; includeReplies?: boolean; cursor?: string; provider?: ProviderId }): Promise<unknown>;
  getAccountInfo(input: { provider?: ProviderId }): Promise<unknown>;
}

export function createXPostService(env: EnvLike = process.env, fetchImpl: FetchLike = fetch): XPostService {
  return {
    async getPost(input) {
      const provider = createProvider(resolveProviderId(input.provider, env), env, fetchImpl);
      return provider.getPost(parseTweetId(input.idOrUrl));
    },

    async searchPosts(input) {
      const provider = createProvider(resolveProviderId(input.provider, env), env, fetchImpl);
      return provider.searchPosts({
        query: input.query,
        queryType: input.queryType ?? "Latest",
        cursor: input.cursor
      });
    },

    async getUserInfo(input) {
      const provider = createProvider(resolveProviderId(input.provider, env), env, fetchImpl);
      return provider.getUserInfo(cleanUserName(input.userName));
    },

    async getUserPosts(input) {
      const provider = createProvider(resolveProviderId(input.provider, env), env, fetchImpl);
      const userName = input.userName ? cleanUserName(input.userName) : undefined;

      if (!userName && !input.userId) {
        throw new XPostMcpError("Pass either userName or userId.");
      }

      return provider.getUserPosts({
        userName,
        userId: input.userId,
        includeReplies: input.includeReplies ?? false,
        cursor: input.cursor
      });
    },

    async getAccountInfo(input) {
      const provider = createProvider(resolveProviderId(input.provider, env), env, fetchImpl);
      return provider.getAccountInfo();
    }
  };
}

export function resolveProviderId(requested: ProviderId | undefined, env: EnvLike): ProviderId {
  if (requested) {
    return requested;
  }

  const envDefault = env.X_POST_PROVIDER;
  if (envDefault) {
    if (isProviderId(envDefault)) {
      return envDefault;
    }
    throw new ProviderConfigError(`Invalid X_POST_PROVIDER "${envDefault}". Expected one of: ${PROVIDER_IDS.join(", ")}.`);
  }

  if (env.TWITTERAPI_IO_KEY) {
    return "twitterapi_io";
  }

  if (env.GETXAPI_KEY) {
    return "getxapi";
  }

  throw new ProviderConfigError("No X Post provider API key is configured. Set TWITTERAPI_IO_KEY or GETXAPI_KEY.");
}

export function createProvider(providerId: ProviderId, env: EnvLike, fetchImpl: FetchLike = fetch): XPostProvider {
  if (providerId === "twitterapi_io") {
    if (!env.TWITTERAPI_IO_KEY) {
      throw new ProviderConfigError("TWITTERAPI_IO_KEY is required for provider twitterapi_io.");
    }
    return new TwitterApiIoProvider(env.TWITTERAPI_IO_KEY, fetchImpl);
  }

  if (!env.GETXAPI_KEY) {
    throw new ProviderConfigError("GETXAPI_KEY is required for provider getxapi.");
  }
  return new GetXApiProvider(env.GETXAPI_KEY, fetchImpl);
}

function isProviderId(value: string): value is ProviderId {
  return PROVIDER_IDS.includes(value as ProviderId);
}

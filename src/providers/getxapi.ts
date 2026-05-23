import { ProviderEmptyResultError, XPostMcpError } from "../errors.js";
import { arrayField, booleanField, buildUrl, dataField, fetchJson, requiredArrayField, stringField } from "../http.js";
import type { FetchLike, ProviderAccountResult, ProviderPostResult, ProviderPostsResult, ProviderUserResult, SearchPostsInput, UserPostsInput, XPostProvider } from "../types.js";

const BASE_URL = "https://api.getxapi.com";

export class GetXApiProvider implements XPostProvider {
  readonly id = "getxapi" as const;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async getPost(id: string): Promise<ProviderPostResult> {
    const raw = await this.get("/twitter/tweet/detail", { id });
    const tweet = dataField(raw);
    if (!tweet) {
      throw new ProviderEmptyResultError(this.id, `tweet for id ${id}`);
    }
    return {
      provider: this.id,
      tweet,
      raw
    };
  }

  async searchPosts(input: SearchPostsInput): Promise<ProviderPostsResult> {
    const raw = await this.get("/twitter/tweet/advanced_search", {
      q: input.query,
      product: input.queryType,
      cursor: input.cursor
    });
    return this.normalizeTweets(raw);
  }

  async getUserInfo(userName: string): Promise<ProviderUserResult> {
    const raw = await this.get("/twitter/user/info", { userName });
    const user = dataField(raw);
    if (!user) {
      throw new ProviderEmptyResultError(this.id, `user profile for ${userName}`);
    }
    return {
      provider: this.id,
      user,
      raw
    };
  }

  async getUserPosts(input: UserPostsInput): Promise<ProviderPostsResult> {
    if (input.includeReplies && !input.userName) {
      throw new XPostMcpError("GetXAPI tweets_and_replies requires userName.");
    }
    if (!input.userName && !input.userId) {
      throw new XPostMcpError("GetXAPI user posts require userName or userId.");
    }
    const path = input.includeReplies ? "/twitter/user/tweets_and_replies" : "/twitter/user/tweets";
    const raw = await this.get(path, {
      userName: input.userName,
      userId: input.userId,
      cursor: input.cursor
    });
    return this.normalizeTweets(raw);
  }

  async getAccountInfo(): Promise<ProviderAccountResult> {
    const raw = await this.get("/account/me", {});
    return {
      provider: this.id,
      account: raw,
      raw
    };
  }

  private async get(path: string, params: Record<string, string | number | boolean | undefined>): Promise<unknown> {
    return fetchJson(this.id, this.fetchImpl, buildUrl(BASE_URL, path, params), {
      Authorization: `Bearer ${this.apiKey}`
    });
  }

  private normalizeTweets(raw: unknown): ProviderPostsResult {
    return {
      provider: this.id,
      tweets: requiredArrayField(this.id, raw, "tweets"),
      hasMore: booleanField(raw, "has_more"),
      nextCursor: stringField(raw, "next_cursor"),
      raw
    };
  }
}

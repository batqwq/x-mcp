import { arrayField, booleanField, buildUrl, dataField, fetchJson, stringField } from "../http.js";
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
    return {
      provider: this.id,
      tweet: dataField(raw),
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
    return {
      provider: this.id,
      user: dataField(raw),
      raw
    };
  }

  async getUserPosts(input: UserPostsInput): Promise<ProviderPostsResult> {
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
      tweets: arrayField(raw, "tweets"),
      hasMore: booleanField(raw, "has_more"),
      nextCursor: stringField(raw, "next_cursor"),
      raw
    };
  }
}

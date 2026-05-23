import { arrayField, booleanField, buildUrl, dataField, fetchJson, stringField } from "../http.js";
import type { FetchLike, ProviderAccountResult, ProviderPostResult, ProviderPostsResult, ProviderUserResult, SearchPostsInput, UserPostsInput, XPostProvider } from "../types.js";

const BASE_URL = "https://api.twitterapi.io";

export class TwitterApiIoProvider implements XPostProvider {
  readonly id = "twitterapi_io" as const;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async getPost(id: string): Promise<ProviderPostResult> {
    const raw = await this.get("/twitter/tweets", { tweet_ids: id });
    const tweets = arrayField(raw, "tweets");
    return {
      provider: this.id,
      tweet: tweets.find((tweet) => isTweetId(tweet, id)) ?? tweets[0] ?? null,
      raw
    };
  }

  async searchPosts(input: SearchPostsInput): Promise<ProviderPostsResult> {
    const raw = await this.get("/twitter/tweet/advanced_search", {
      query: input.query,
      queryType: input.queryType,
      cursor: input.cursor
    });
    return this.normalizeTweets(raw, "has_next_page");
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
    const raw = await this.get("/twitter/user/last_tweets", {
      userName: input.userName,
      userId: input.userId,
      includeReplies: input.includeReplies,
      cursor: input.cursor
    });
    return this.normalizeTweets(raw, "has_next_page");
  }

  async getAccountInfo(): Promise<ProviderAccountResult> {
    const raw = await this.get("/oapi/my/info", {});
    return {
      provider: this.id,
      account: raw,
      raw
    };
  }

  private async get(path: string, params: Record<string, string | number | boolean | undefined>): Promise<unknown> {
    return fetchJson(this.id, this.fetchImpl, buildUrl(BASE_URL, path, params), {
      "X-API-Key": this.apiKey
    });
  }

  private normalizeTweets(raw: unknown, hasMoreField: string): ProviderPostsResult {
    return {
      provider: this.id,
      tweets: arrayField(raw, "tweets"),
      hasMore: booleanField(raw, hasMoreField),
      nextCursor: stringField(raw, "next_cursor"),
      raw
    };
  }
}

function isTweetId(tweet: unknown, id: string): boolean {
  return Boolean(tweet && typeof tweet === "object" && "id" in tweet && (tweet as { id?: unknown }).id === id);
}

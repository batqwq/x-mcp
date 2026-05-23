export const PROVIDER_IDS = ["twitterapi_io", "getxapi"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type SearchProduct = "Latest" | "Top";

export interface SearchPostsInput {
  query: string;
  queryType: SearchProduct;
  cursor?: string;
}

export interface UserPostsInput {
  userName?: string;
  userId?: string;
  includeReplies: boolean;
  cursor?: string;
}

export interface XPostProvider {
  readonly id: ProviderId;
  getPost(id: string): Promise<ProviderPostResult>;
  searchPosts(input: SearchPostsInput): Promise<ProviderPostsResult>;
  getUserInfo(userName: string): Promise<ProviderUserResult>;
  getUserPosts(input: UserPostsInput): Promise<ProviderPostsResult>;
  getAccountInfo(): Promise<ProviderAccountResult>;
}

export interface ProviderPostResult {
  provider: ProviderId;
  tweet: unknown;
  raw: unknown;
}

export interface ProviderPostsResult {
  provider: ProviderId;
  tweets: unknown[];
  hasMore: boolean;
  nextCursor: string | null;
  raw: unknown;
}

export interface ProviderUserResult {
  provider: ProviderId;
  user: unknown;
  raw: unknown;
}

export interface ProviderAccountResult {
  provider: ProviderId;
  account: unknown;
  raw: unknown;
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type EnvLike = Record<string, string | undefined>;

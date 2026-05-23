import { describe, expect, it, vi } from "vitest";
import { ProviderEmptyResultError, ProviderHttpError, XPostMcpError } from "../src/errors.js";
import { GetXApiProvider } from "../src/providers/getxapi.js";
import { TwitterApiIoProvider } from "../src/providers/twitterapiIo.js";
import type { FetchLike } from "../src/types.js";

describe("TwitterApiIoProvider", () => {
  it("constructs advanced search requests and normalizes pagination", async () => {
    const fetchMock = jsonFetch({
      tweets: [{ id: "1", text: "hello" }],
      has_next_page: true,
      next_cursor: "cursor-1"
    });

    const provider = new TwitterApiIoProvider("twitter-key", fetchMock);
    const result = await provider.searchPosts({
      query: "from:OpenAI AI",
      queryType: "Latest",
      cursor: "cursor-0"
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect((url as URL).origin).toBe("https://api.twitterapi.io");
    expect((url as URL).pathname).toBe("/twitter/tweet/advanced_search");
    expect((url as URL).searchParams.get("query")).toBe("from:OpenAI AI");
    expect((url as URL).searchParams.get("queryType")).toBe("Latest");
    expect((url as URL).searchParams.get("cursor")).toBe("cursor-0");
    expect((init?.headers as Record<string, string>)["X-API-Key"]).toBe("twitter-key");
    expect(result).toMatchObject({
      provider: "twitterapi_io",
      tweets: [{ id: "1", text: "hello" }],
      hasMore: true,
      nextCursor: "cursor-1"
    });
  });

  it("reads one tweet through the batch tweet endpoint", async () => {
    const fetchMock = jsonFetch({
      status: "success",
      message: "success",
      tweets: [{ id: "12345", text: "selected" }]
    });

    const provider = new TwitterApiIoProvider("twitter-key", fetchMock);
    const result = await provider.getPost("12345");

    const [url] = fetchMock.mock.calls[0]!;
    expect((url as URL).pathname).toBe("/twitter/tweets");
    expect((url as URL).searchParams.get("tweet_ids")).toBe("12345");
    expect(result).toMatchObject({
      provider: "twitterapi_io",
      tweet: { id: "12345", text: "selected" }
    });
  });
});

describe("GetXApiProvider", () => {
  it("constructs advanced search requests and normalizes pagination", async () => {
    const fetchMock = jsonFetch({
      tweets: [{ id: "2", text: "world" }],
      has_more: false,
      next_cursor: ""
    });

    const provider = new GetXApiProvider("getx-key", fetchMock);
    const result = await provider.searchPosts({
      query: "from:OpenAI",
      queryType: "Top"
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect((url as URL).origin).toBe("https://api.getxapi.com");
    expect((url as URL).pathname).toBe("/twitter/tweet/advanced_search");
    expect((url as URL).searchParams.get("q")).toBe("from:OpenAI");
    expect((url as URL).searchParams.get("product")).toBe("Top");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer getx-key");
    expect(result).toMatchObject({
      provider: "getxapi",
      tweets: [{ id: "2", text: "world" }],
      hasMore: false,
      nextCursor: null
    });
  });

  it("uses tweets or tweets_and_replies based on includeReplies", async () => {
    const fetchMock = jsonFetch({
      tweets: [],
      has_more: false
    });
    const provider = new GetXApiProvider("getx-key", fetchMock);

    await provider.getUserPosts({ userName: "OpenAI", includeReplies: false });
    await provider.getUserPosts({ userName: "OpenAI", includeReplies: true });

    expect((fetchMock.mock.calls[0]![0] as URL).pathname).toBe("/twitter/user/tweets");
    expect((fetchMock.mock.calls[1]![0] as URL).pathname).toBe("/twitter/user/tweets_and_replies");
  });
});

describe("provider error handling", () => {
  it("turns provider error JSON into ProviderHttpError", async () => {
    const fetchMock = jsonFetch({ error: "Missing required query param: id" }, 400);
    const provider = new GetXApiProvider("getx-key", fetchMock);

    await expect(provider.getPost("12345")).rejects.toThrow(ProviderHttpError);
  });

  it("wraps network failures in ProviderHttpError", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      throw new Error("socket closed");
    });
    const provider = new GetXApiProvider("getx-key", fetchMock);

    await expect(provider.getPost("12345")).rejects.toThrow(ProviderHttpError);
  });

  it("rejects non-JSON success responses", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => new Response("not json", { status: 200 }));
    const provider = new GetXApiProvider("getx-key", fetchMock);

    await expect(provider.getPost("12345")).rejects.toThrow(ProviderHttpError);
  });

  it("rejects empty tweet detail results", async () => {
    const fetchMock = jsonFetch({ status: "success", data: null });
    const provider = new GetXApiProvider("getx-key", fetchMock);

    await expect(provider.getPost("12345")).rejects.toThrow(ProviderEmptyResultError);
  });

  it("rejects GetXAPI replies by userId because that endpoint requires userName", async () => {
    const fetchMock = jsonFetch({ tweets: [] });
    const provider = new GetXApiProvider("getx-key", fetchMock);

    await expect(provider.getUserPosts({ userId: "123", includeReplies: true })).rejects.toThrow(XPostMcpError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed search responses missing tweets", async () => {
    const fetchMock = jsonFetch({ has_more: false });
    const provider = new GetXApiProvider("getx-key", fetchMock);

    await expect(provider.searchPosts({ query: "from:OpenAI", queryType: "Latest" })).rejects.toThrow(ProviderHttpError);
  });
});

function jsonFetch(body: unknown, status = 200): ReturnType<typeof vi.fn<FetchLike>> {
  return vi.fn<FetchLike>(async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" }
    });
  });
}

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";
import type { XPostService } from "../src/service.js";

const noisyTweet = {
  id: "1",
  type: "tweet",
  text: "hello",
  created_at: "Mon May 25 10:45:36 +0000 2026",
  conversationId: "1",
  twitterUrl: "https://twitter.com/example/status/1",
  author: {
    id: "42",
    type: "user",
    name: "Example",
    userName: "example",
    description: "duplicate profile text",
    location: "Earth",
    followers: 10,
    coverPicture: "https://pbs.twimg.com/cover.jpg",
    canDm: false,
    isVerified: false
  },
  entities: {
    media: [
      {
        type: "photo",
        media_url_https: "https://pbs.twimg.com/media/photo.jpg",
        expanded_url: "https://x.com/example/status/1/photo/1",
        indices: [0, 5],
        video_url: null
      }
    ],
    urls: [],
    user_mentions: [{ screen_name: "mentioned", name: "Mentioned User", id_str: "99", indices: [6, 16] }],
    hashtags: [],
    symbols: [],
    timestamps: []
  },
  extended_entities: {
    media: [
      {
        id_str: "extended-media-1",
        type: "photo",
        media_url_https: "https://pbs.twimg.com/media/photo.jpg",
        focus_rects: [{ x: 0, y: 0, w: 100, h: 80 }],
        media_results: {
          result: {
            id: "extended-result-1"
          }
        }
      }
    ]
  },
  hashtags: [],
  symbols: [],
  timestamps: [],
  lang: "en",
  source: "Twitter Web App",
  coverPicture: "https://pbs.twimg.com/cover.jpg",
  canDm: false,
  isVerified: false,
  description: "duplicate profile text",
  location: "Earth",
  video_url: null
};

const service: XPostService = {
  getPost: async () => ({ provider: "getxapi", tweet: noisyTweet, raw: { tweets: [noisyTweet] } }),
  searchPosts: async () => ({ provider: "getxapi", tweets: [noisyTweet], hasMore: false, nextCursor: null, raw: { tweets: [noisyTweet] } }),
  getUserInfo: async () => ({ provider: "getxapi", user: noisyTweet.author, raw: { data: noisyTweet.author } }),
  getUserPosts: async () => ({ provider: "getxapi", tweets: [noisyTweet], hasMore: false, nextCursor: null, raw: { tweets: [noisyTweet] } }),
  getAccountInfo: async () => ({ provider: "getxapi", account: { credits: 1, raw: { duplicate: true } }, raw: { credits: 1 } })
};

describe("createServer tool output", () => {
  const clients: Client[] = [];
  const servers: Array<ReturnType<typeof createServer>> = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it("routes tool calls through the compact output transformer", async () => {
    const server = createServer(service);
    const client = new Client({ name: "test-client", version: "0.0.0" });
    servers.push(server);
    clients.push(client);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({ name: "x_posts_search", arguments: { query: "hello" } });
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";

    expect(JSON.parse(text)).toEqual({
      media: {
        m1: { type: "photo", url: "https://pbs.twimg.com/media/photo.jpg" }
      },
      authors: {
        "42": { name: "Example", userName: "example", followers: 10 }
      },
      tweets: [
        {
          id: "1",
          text: "hello",
          authorId: "42",
          createdAt: "2026-05-25T10:45:36Z",
          mediaIds: ["m1"],
          mentions: [{ screenName: "mentioned", name: "Mentioned User" }]
        }
      ]
    });
    expect(text).not.toMatch(/raw|twitterUrl|entities|indices|id_str|expanded_url|user_mentions|urls|lang|source|coverPicture|canDm|isVerified|description|location|video_url|conversationId/);
    expect(text).not.toContain('"type":"tweet"');
    expect(text).not.toContain('"type":"user"');
    expect(text).not.toContain('"hashtags":[]');
    expect(text).not.toContain('"symbols":[]');
    expect(text).not.toContain('"timestamps":[]');
  });

  it("returns extended entities only when include_extended is true", async () => {
    const server = createServer(service);
    const client = new Client({ name: "test-client", version: "0.0.0" });
    servers.push(server);
    clients.push(client);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const defaultResult = await client.callTool({ name: "x_posts_search", arguments: { query: "hello" } });
    const defaultText = defaultResult.content[0]?.type === "text" ? defaultResult.content[0].text : "";
    expect(defaultText).not.toMatch(/extendedEntities|focus_rects|media_results/);

    const extendedResult = await client.callTool({
      name: "x_posts_search",
      arguments: { query: "hello", include_extended: true }
    });
    const extendedText = extendedResult.content[0]?.type === "text" ? extendedResult.content[0].text : "";
    const extendedOutput = JSON.parse(extendedText) as { tweets: Array<{ extendedEntities?: unknown }> };

    expect(extendedOutput.tweets[0]?.extendedEntities).toEqual({
      media: [
        {
          id_str: "extended-media-1",
          type: "photo",
          media_url_https: "https://pbs.twimg.com/media/photo.jpg",
          focus_rects: [{ x: 0, y: 0, w: 100, h: 80 }],
          media_results: {
            result: {
              id: "extended-result-1"
            }
          }
        }
      ]
    });
  });
});

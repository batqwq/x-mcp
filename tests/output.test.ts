import { describe, expect, it } from "vitest";
import { createTransformedJsonToolResult, transformResponse } from "../src/output.js";

describe("transformResponse", () => {
  it("optimizes x_post_get with inline author and extracted tweet fields", () => {
    const input = {
      provider: "twitterapi_io",
      tweet: {
        type: "tweet",
        id: "20578496591",
        url: "https://twitter.com/Raz_09_/status/20578496591",
        twitterUrl: "https://twitter.com/Raz_09_/status/20578496591",
        text: "hello @openai #ai",
        author: {
          id: "157792279",
          name: "Raz",
          userName: "Raz_09_",
          description: "",
          location: "Earth",
          followers: 2459,
          following: 0,
          isBlueVerified: false,
          profilePicture: "https://pbs.twimg.com/profile.jpg",
          url: "https://example.com",
          pinnedTweetIds: ["drop-outside-user-info"]
        },
        createdAt: "2026-05-22T15:42:46Z",
        lang: "en",
        source: '&lt;a href="http://twitter.com/download/iphone"&gt;Twitter for iPhone&lt;/a&gt;',
        likeCount: 5,
        retweetCount: 0,
        replyCount: 0,
        quoteCount: 0,
        viewCount: 2536,
        bookmarkCount: 0,
        isReply: false,
        inReplyToId: "drop-when-not-reply",
        entities: {
          media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/photo.jpg" }],
          user_mentions: [{ screen_name: "openai", name: "OpenAI", id_str: "1" }],
          hashtags: [{ text: "ai", indices: [0, 2] }]
        },
        extendedEntities: {
          media: [
            { type: "photo", media_url_https: "https://pbs.twimg.com/media/photo.jpg" },
            {
              type: "video",
              media_url_https: "https://pbs.twimg.com/media/video.jpg",
              video_info: {
                variants: [
                  { content_type: "video/mp4", bitrate: 832000, url: "https://video.twimg.com/low.mp4" },
                  { content_type: "video/mp4", bitrate: 2176000, url: "https://video.twimg.com/high.mp4" }
                ]
              }
            }
          ]
        }
      },
      raw: { duplicate: true }
    };

    const output = transformResponse("x_post_get", input);

    expect(output).toEqual({
      statKeys: ["like", "rt", "reply", "quote", "view", "bm"],
      tweet: {
        id: "20578496591",
        url: "https://x.com/Raz_09_/status/20578496591",
        text: "hello @openai #ai",
        author: {
          id: "157792279",
          name: "Raz",
          userName: "Raz_09_",
          followers: 2459,
          profilePicture: "https://pbs.twimg.com/profile.jpg"
        },
        createdAt: "2026-05-22T15:42:46Z",
        stats: [5, 0, 0, 0, 2536],
        media: [
          { type: "photo", url: "https://pbs.twimg.com/media/photo.jpg" },
          { type: "video", url: "https://video.twimg.com/high.mp4" }
        ],
        mentions: [{ screenName: "openai", name: "OpenAI" }],
        hashtags: ["ai"]
      }
    });
    expect(JSON.stringify(output)).not.toMatch(/raw|twitterUrl|entities|extendedEntities|retweetCount|replyCount|quoteCount|bookmarkCount|likeCount|viewCount|inReplyToId|lang|source|videoUrl|indices|id_str|description|location/);
  });

  it("keeps extended entities out by default and returns them when requested", () => {
    const input = {
      tweet: {
        id: "30",
        text: "with extended entities",
        author: { id: "31", userName: "extended_user" },
        extended_entities: {
          media: [
            {
              id_str: "media-1",
              type: "photo",
              media_url_https: "https://pbs.twimg.com/media/extended-photo.jpg",
              focus_rects: [{ x: 0, y: 0, w: 100, h: 80 }],
              media_results: {
                result: {
                  id: "media-result-1"
                }
              }
            }
          ]
        }
      },
      raw: { duplicate: true }
    };

    expect(JSON.stringify(transformResponse("x_post_get", input))).not.toMatch(/extendedEntities|focus_rects|media_results/);

    const output = transformResponse("x_post_get", input, { includeExtended: true }) as { tweet?: { extendedEntities?: unknown } };

    expect(output.tweet?.extendedEntities).toEqual({
      media: [
        {
          id_str: "media-1",
          type: "photo",
          media_url_https: "https://pbs.twimg.com/media/extended-photo.jpg",
          focus_rects: [{ x: 0, y: 0, w: 100, h: 80 }],
          media_results: {
            result: {
              id: "media-result-1"
            }
          }
        }
      ]
    });
  });

  it("optimizes x_user_posts and deduplicates all tweet authors into a map", () => {
    const input = {
      provider: "getxapi",
      tweets: [
        {
          id: "1",
          text: "top",
          author: { id: "157792279", name: "Raz", userName: "Raz_09_", followers: 2459, type: "user" },
          likeCount: 0,
          viewCount: 10,
          quotedTweet: {
            id: "2",
            text: "quote",
            twitterUrl: "https://twitter.com/white/status/2",
            author: { id: "194084670", name: "White", userName: "white", followers: 100 }
          }
        },
        {
          id: "3",
          text: "again",
          created_at: "Mon May 25 10:45:36 +0000 2026",
          author: { id: "157792279", name: "Raz", userName: "Raz_09_", followers: 2459 },
          entities: {
            media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/outer.jpg" }],
            user_mentions: [{ screen_name: "outer", name: "Outer Mention" }]
          },
          retweetedTweet: {
            id: "4",
            text: "retweeted",
            author: { id: "777", name: "Retweeted", userName: "retweeted_user" }
          }
        }
      ],
      hasMore: true,
      nextCursor: "cursor-1",
      raw: { tweets: ["duplicated"] }
    };

    const output = transformResponse("x_user_posts", input);

    expect(output).toEqual({
      statKeys: ["like", "rt", "reply", "quote", "view", "bm"],
      authors: {
        "157792279": { name: "Raz", userName: "Raz_09_", followers: 2459 },
        "194084670": { name: "White", userName: "white", followers: 100 },
        "777": { name: "Retweeted", userName: "retweeted_user" }
      },
      tweets: [
        {
          id: "1",
          type: "qt",
          text: "top",
          authorId: "157792279",
          stats: [0, 0, 0, 0, 10],
          quotedTweetId: "2"
        },
        {
          type: "rt",
          authorId: "157792279",
          createdAt: "2026-05-25T10:45:36Z",
          srcId: "4"
        }
      ],
      includes: {
        tweets: [
          {
            id: "2",
            text: "quote",
            authorId: "194084670"
          },
          {
            id: "4",
            text: "retweeted",
            authorId: "777"
          }
        ]
      },
      hasMore: true,
      nextCursor: "cursor-1"
    });
    expect(JSON.stringify(output)).not.toMatch(/raw|twitterUrl|likeCount|viewCount|retweetedTweet|"quotedTweet":/);
  });

  it("optimizes x_posts_search with the same list shape", () => {
    const output = transformResponse("x_posts_search", {
      tweets: [{ id: "1", text: "search", conversationId: "1", author: { id: "42", userName: "searcher" }, isReply: true, inReplyToId: "0" }],
      hasMore: false,
      nextCursor: null,
      raw: {}
    });

    expect(output).toEqual({
      authors: {
        "42": { userName: "searcher" }
      },
      tweets: [{ id: "1", text: "search", authorId: "42", isReply: true, inReplyToId: "0" }]
    });
  });

  it("does not drop provider-shaped raw data when service-normalized aliases are absent", () => {
    const output = transformResponse("x_posts_search", {
      data: {
        tweets: [
          {
            id_str: "10",
            full_text: "provider shaped",
            author_id_str: "99",
            created_at: "Mon May 25 10:45:36 +0000 2026",
            favorite_count: "6",
            views: { count: "100" },
            in_reply_to_status_id_str: "9",
            conversation_id_str: "8",
            user: {
              id_str: "99",
              screen_name: "provider_user",
              followers_count: "7",
              profile_image_url: "https://pbs.twimg.com/profile_normal.jpg"
            },
            entities: {
              media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/entity.jpg" }],
              user_mentions: [{ screenName: "someone", name: "Someone" }],
              hashtags: [{ hashtag: "fallback" }]
            },
            extended_entities: {
              media: [
                { type: "photo", media_url_https: "https://pbs.twimg.com/media/extended.jpg" },
                {
                  type: "video",
                  media_url_https: "https://pbs.twimg.com/media/video.jpg",
                  video_info: {
                    variants: [
                      { content_type: "video/mp4", bitrate: 256000, url: "https://video.twimg.com/list-low.mp4" },
                      { content_type: "video/mp4", bitrate: 1024000, url: "https://video.twimg.com/list-high.mp4" }
                    ]
                  }
                }
              ]
            }
          }
        ]
      },
      raw: {}
    });

    expect(output).toEqual({
      statKeys: ["like", "rt", "reply", "quote", "view", "bm"],
      media: {
        m1: { type: "photo", url: "https://pbs.twimg.com/media/extended.jpg" },
        m2: { type: "video", url: "https://video.twimg.com/list-high.mp4" },
        m3: { type: "photo", url: "https://pbs.twimg.com/media/entity.jpg" }
      },
      authors: {
        "99": {
          userName: "provider_user",
          followers: 7,
          profilePicture: "https://pbs.twimg.com/profile_normal.jpg"
        }
      },
      tweets: [
        {
          id: "10",
          text: "provider shaped",
          authorId: "99",
          createdAt: "2026-05-25T10:45:36Z",
          stats: [6, 0, 0, 0, 100],
          isReply: true,
          inReplyToId: "9",
          conversationId: "8",
          mediaIds: ["m1", "m2", "m3"],
          mentions: [{ screenName: "someone", name: "Someone" }],
          hashtags: ["fallback"]
        }
      ]
    });
  });

  it("compresses type-only media and truncates only trailing zero stats", () => {
    const output = transformResponse("x_posts_search", {
      tweets: [
        {
          id: "type-media",
          text: "media counts",
          author: { id: "author-1", name: "Author One" },
          likeCount: 15,
          retweetCount: 1,
          replyCount: 0,
          quoteCount: 0,
          viewCount: 0,
          bookmarkCount: 0,
          media: [
            { type: "photo" },
            { type: "photo" },
            { type: "video" }
          ]
        }
      ]
    });

    expect(output).toEqual({
      statKeys: ["like", "rt", "reply", "quote", "view", "bm"],
      authors: {
        "author-1": { name: "Author One" }
      },
      tweets: [
        {
          id: "type-media",
          text: "media counts",
          authorId: "author-1",
          stats: [15, 1],
          media: { photo: 2, video: 1 }
        }
      ]
    });
  });

  it("references quoted tweets already present in the same response without duplicating them", () => {
    const output = transformResponse("x_posts_search", {
      tweets: [
        {
          id: "1",
          text: "quoting",
          author: { id: "10", userName: "quoter" },
          quotedTweet: {
            id: "2",
            text: "already present",
            author: { id: "20", userName: "quoted" }
          }
        },
        {
          id: "2",
          text: "already present",
          author: { id: "20", userName: "quoted" }
        }
      ]
    });

    expect(output).toEqual({
      authors: {
        "10": { userName: "quoter" },
        "20": { userName: "quoted" }
      },
      tweets: [
        {
          type: "qt",
          id: "1",
          text: "quoting",
          authorId: "10",
          quotedTweetId: "2"
        },
        {
          id: "2",
          text: "already present",
          authorId: "20"
        }
      ]
    });
    expect(JSON.stringify(output)).not.toContain("includes");
  });

  it("can transform raw provider detail and user-info data wrappers", () => {
    expect(transformResponse("x_post_get", {
      data: {
        id_str: "11",
        full_text: "detail fallback",
        user: { id_str: "12", screen_name: "detail_user" }
      }
    })).toEqual({
      tweet: {
        id: "11",
        url: "https://x.com/detail_user/status/11",
        text: "detail fallback",
        author: { id: "12", userName: "detail_user" }
      }
    });

    expect(transformResponse("x_user_info", {
      raw: {
        data: {
          id_str: "12",
          screen_name: "detail_user",
          statuses_count: "3",
          created_at: "Mon May 25 10:45:36 +0000 2026",
          pinned_tweet_ids: ["11"]
        }
      }
    })).toEqual({
      user: {
        id: "12",
        userName: "detail_user",
        statusesCount: 3,
        createdAt: "2026-05-25T10:45:36Z",
        pinnedTweetIds: ["11"]
      }
    });
  });

  it("does not mistake a raw data tweets wrapper for a single tweet", () => {
    expect(transformResponse("x_post_get", {
      data: {
        tweets: [
          {
            id_str: "13",
            full_text: "twitterapi wrapper",
            user: { id_str: "14", screen_name: "wrapped_user" }
          }
        ]
      }
    })).toEqual({
      tweet: {
        id: "13",
        url: "https://x.com/wrapped_user/status/13",
        text: "twitterapi wrapper",
        author: { id: "14", userName: "wrapped_user" }
      }
    });
  });

  it("optimizes x_user_info with user-info-only author fields", () => {
    const output = transformResponse("x_user_info", {
      provider: "twitterapi_io",
      user: {
        id: "157792279",
        name: "Raz",
        userName: "Raz_09_",
        description: "drop profile bio",
        location: "drop profile location",
        followersCount: 2459,
        followingCount: 51,
        isBlueVerified: true,
        favouritesCount: 7,
        statusesCount: 8,
        mediaCount: 9,
        createdAt: "2020-01-01T00:00:00Z",
        pinnedTweetIds: ["10"],
        type: "user",
        url: "https://example.com",
        twitterUrl: "https://twitter.com/Raz_09_",
        entities: { url: {} },
        isVerified: false
      },
      raw: { duplicate: true }
    });

    expect(output).toEqual({
      user: {
        id: "157792279",
        name: "Raz",
        userName: "Raz_09_",
        followers: 2459,
        following: 51,
        isBlueVerified: true,
        favouritesCount: 7,
        statusesCount: 8,
        mediaCount: 9,
        createdAt: "2020-01-01T00:00:00Z",
        pinnedTweetIds: ["10"]
      }
    });
    expect(JSON.stringify(output)).not.toMatch(/raw|twitterUrl|entities|isVerified|description|location/);
  });

  it("optimizes x_account_info as a flat account object", () => {
    const output = transformResponse("x_account_info", {
      provider: "getxapi",
      account: {
        rechargeCredits: 0,
        totalBonusCredits: 7519,
        disabled: false,
        note: "",
        nested: {},
        raw: { duplicate: true },
        twitterUrl: "https://twitter.com/account"
      },
      raw: { duplicate: true }
    });

    expect(output).toEqual({ rechargeCredits: 0, totalBonusCredits: 7519 });
  });

  it("creates compact transformed MCP tool text", () => {
    const input = {
      provider: "twitterapi_io",
      tweets: [{ id: "1", text: "hello", author: { id: "2", userName: "u" } }],
      raw: { duplicate: true }
    };

    const result = createTransformedJsonToolResult("x_user_posts", input);
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";

    expect(text).toBe('{"authors":{"2":{"userName":"u"}},"tweets":[{"id":"1","text":"hello","authorId":"2"}]}');
    expect(text).not.toContain("\n");
    expect(text.length).toBeLessThan(JSON.stringify(input).length);
  });
});

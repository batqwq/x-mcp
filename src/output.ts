import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type XToolName = "x_post_get" | "x_posts_search" | "x_user_info" | "x_user_posts" | "x_account_info";

type JsonRecord = Record<string, unknown>;

export interface TransformOptions {
  readonly includeExtended?: boolean;
}

interface TweetTransformContext {
  readonly inlineAuthor: boolean;
  readonly authors?: Map<string, JsonRecord>;
  readonly includes?: IncludeState;
  readonly includeExtended: boolean;
  readonly mediaCatalog?: MediaCatalog;
  readonly rootTweetIds?: Set<string>;
  readonly state: TransformState;
}

interface PruneOptions {
  readonly keepZero?: boolean;
}

interface TransformState {
  hasStats: boolean;
}

interface IncludeState {
  readonly tweets: JsonRecord[];
  readonly tweetIds: Set<string>;
}

interface MediaCatalog {
  readonly items: Map<string, JsonRecord>;
  readonly keys: Map<string, string>;
  nextId: number;
}

interface NormalizedMedia {
  readonly type?: string;
  readonly url?: string;
  readonly key?: string;
}

interface MediaOutput {
  readonly media?: unknown;
  readonly mediaIds?: string[];
}

const STAT_KEYS = ["like", "rt", "reply", "quote", "view", "bm"] as const;

const TWEET_AUTHOR_FIELDS = [
  "id",
  "name",
  "userName",
  "followers",
  "following",
  "isBlueVerified",
  "profilePicture"
] as const;

const USER_INFO_FIELDS = TWEET_AUTHOR_FIELDS;

const USER_INFO_EXTRA_FIELDS = ["favouritesCount", "statusesCount", "mediaCount", "createdAt", "pinnedTweetIds"] as const;

const TWITTER_MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11
};

export function createTransformedJsonToolResult(toolName: XToolName, value: unknown, options: TransformOptions = {}): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(transformResponse(toolName, value, options))
      }
    ]
  };
}

export function compactJsonText(value: unknown): string {
  return JSON.stringify(pruneValue(value) ?? {});
}

export function transformResponse(toolName: XToolName, rawData: unknown, options: TransformOptions = {}): unknown {
  const data = asRecord(rawData);
  const contextOptions = {
    includeExtended: options.includeExtended === true
  };

  switch (toolName) {
    case "x_post_get": {
      const tweetSource = findSingleTweet(data);
      const state = createTransformState();
      const includes = createIncludeState();
      const tweetId = getTweetId(tweetSource);
      const tweet = normalizeTweet(tweetSource, {
        ...contextOptions,
        inlineAuthor: true,
        includes,
        rootTweetIds: tweetId ? new Set([tweetId]) : undefined,
        state
      });
      return finalizeTweetResponse({ tweet }, state, { includes, keepZero: contextOptions.includeExtended });
    }

    case "x_posts_search":
    case "x_user_posts":
      return transformTweetList(data, contextOptions);

    case "x_user_info":
      return pruneValue({
        user: normalizeAuthor(firstRecord(data?.user, data?.data, asRecord(data?.raw)?.data), { includeUserInfoExtra: true })
      }) ?? {};

    case "x_account_info":
      return normalizeAccount(data?.account ?? rawData);
  }
}

function transformTweetList(data: JsonRecord | null, options: Pick<TweetTransformContext, "includeExtended">): unknown {
  const tweetSources = findTweetArray(data);
  const state = createTransformState();
  const authors = new Map<string, JsonRecord>();
  const includes = createIncludeState();
  const mediaCatalog = createMediaCatalog();
  const rootTweetIds = new Set(tweetSources.map(getTweetId).filter((id): id is string => Boolean(id)));
  const tweets = tweetSources
    .map((tweet) => normalizeTweet(tweet, { ...options, inlineAuthor: false, authors, includes, mediaCatalog, rootTweetIds, state }))
    .filter((tweet): tweet is JsonRecord => isRecord(tweet));

  const authorsObject = Object.fromEntries(authors.entries());

  return finalizeTweetResponse({
    authors: authorsObject,
    tweets,
    hasMore: data?.hasMore,
    nextCursor: data?.nextCursor
  }, state, { includes, mediaCatalog, keepZero: options.includeExtended });
}

function createTransformState(): TransformState {
  return { hasStats: false };
}

function createIncludeState(): IncludeState {
  return { tweets: [], tweetIds: new Set<string>() };
}

function createMediaCatalog(): MediaCatalog {
  return { items: new Map<string, JsonRecord>(), keys: new Map<string, string>(), nextId: 1 };
}

function finalizeTweetResponse(
  body: JsonRecord,
  state: TransformState,
  options: { includes?: IncludeState; mediaCatalog?: MediaCatalog; keepZero: boolean }
): unknown {
  const includes = options.includes && options.includes.tweets.length > 0 ? { tweets: options.includes.tweets } : undefined;
  const media = options.mediaCatalog && options.mediaCatalog.items.size > 0 ? Object.fromEntries(options.mediaCatalog.items.entries()) : undefined;

  return pruneValue({
    statKeys: state.hasStats ? STAT_KEYS : undefined,
    media,
    ...body,
    includes
  }, { keepZero: options.keepZero }) ?? {};
}

function findSingleTweet(data: JsonRecord | null): unknown {
  const raw = asRecord(data?.raw);
  const dataRecord = asRecord(data?.data);
  const rawData = asRecord(raw?.data);
  return (
    firstRecord(data?.tweet, dataRecord?.tweet, rawData?.tweet) ??
    (dataRecord && !Array.isArray(dataRecord.tweets) ? dataRecord : undefined) ??
    (rawData && !Array.isArray(rawData.tweets) ? rawData : undefined) ??
    findTweetArray(data)[0]
  );
}

function findTweetArray(data: JsonRecord | null): unknown[] {
  const raw = asRecord(data?.raw);
  const dataRecord = asRecord(data?.data);
  const rawData = asRecord(raw?.data);
  return firstNonEmptyArray(data?.tweets, dataRecord?.tweets, rawData?.tweets, raw?.tweets, data?.data) ?? [];
}

function getTweetId(tweet: unknown): string | undefined {
  const source = asRecord(tweet);
  return firstString(source?.id, source?.id_str, source?.tweetId, source?.tweet_id);
}

function normalizeStats(source: JsonRecord, state: TransformState): number[] | undefined {
  const stats = [
    firstNumber(source.likeCount, source.favoriteCount, source.favorite_count, source.favourites_count, source.likes) ?? 0,
    firstNumber(source.retweetCount, source.retweet_count, source.retweets) ?? 0,
    firstNumber(source.replyCount, source.reply_count, source.replies) ?? 0,
    firstNumber(source.quoteCount, source.quote_count, source.quotes) ?? 0,
    firstNumber(source.viewCount, source.view_count, source.views, asRecord(source.views)?.count) ?? 0,
    firstNumber(source.bookmarkCount, source.bookmark_count, source.bookmarks) ?? 0
  ];

  while (stats.length > 0 && stats[stats.length - 1] === 0) {
    stats.pop();
  }

  if (stats.length === 0) {
    return undefined;
  }

  state.hasStats = true;
  return stats;
}

function addIncludedTweet(tweet: unknown, context: TweetTransformContext): string | undefined {
  const id = getTweetId(tweet);
  if (!id) {
    return undefined;
  }

  if (context.rootTweetIds?.has(id)) {
    return id;
  }

  if (!context.includes || context.includes.tweetIds.has(id)) {
    return id;
  }

  context.includes.tweetIds.add(id);
  const normalized = normalizeTweet(tweet, context);
  if (normalized) {
    context.includes.tweets.push(normalized);
  }
  return id;
}

function normalizeTweet(tweet: unknown, context: TweetTransformContext): JsonRecord | undefined {
  const source = asRecord(tweet);
  if (!source) {
    return undefined;
  }

  const authorSource = firstRecord(source.author, source.user);
  const authorId = firstString(
    source.authorId,
    source.author_id,
    source.userId,
    source.user_id,
    source.author_id_str,
    source.authorIdStr,
    source.userIdStr,
    authorSource?.id,
    authorSource?.rest_id,
    authorSource?.id_str,
    authorSource?.userId,
    authorSource?.user_id
  );
  const author = normalizeAuthor(authorSource, { includeUserInfoExtra: false });
  const authorUserName = stringField(author, "userName");

  let authorOutput: unknown;
  let authorIdOutput: unknown;
  if (context.inlineAuthor) {
    authorOutput = author;
    authorIdOutput = authorOutput ? undefined : authorId;
  } else {
    authorIdOutput = addAuthor(context.authors, authorId, author);
    if (!authorIdOutput && author) {
      authorOutput = author;
    }
  }

  const retweetedTweetSource = firstRecord(source.retweetedTweet, source.retweeted_tweet, source.retweeted_status, source.retweeted);
  if (retweetedTweetSource) {
    const srcId = addIncludedTweet(retweetedTweetSource, context);
    return pruneValue({
      type: "rt",
      authorId: authorIdOutput,
      author: authorOutput,
      createdAt: normalizeCreatedAt(firstString(source.createdAt, source.created_at, source.creation_date)),
      srcId,
      src: srcId ? undefined : normalizeTweet(retweetedTweetSource, context)
    }, { keepZero: context.includeExtended }) as JsonRecord | undefined;
  }

  const id = firstString(source.id, source.id_str, source.tweetId, source.tweet_id);
  const inReplyToId = firstString(
    source.inReplyToId,
    source.in_reply_to_status_id,
    source.in_reply_to_status_id_str,
    source.inReplyToStatusId,
    source.inReplyToTweetId
  );
  const isReply = source.isReply === true || (source.isReply !== false && Boolean(inReplyToId));
  const conversationId = firstString(source.conversationId, source.conversation_id, source.conversation_id_str);
  const stats = normalizeStats(source, context.state);
  const media = normalizeTweetMedia(source, context);
  const quotedTweetSource = firstRecord(source.quotedTweet, source.quoted_tweet, source.quoted_status, source.quoted);
  const quotedTweetId = quotedTweetSource ? addIncludedTweet(quotedTweetSource, context) : undefined;

  return pruneValue({
    type: quotedTweetSource ? "qt" : undefined,
    id,
    url: (context.inlineAuthor || !id) ? normalizeUrl(firstString(source.url, source.twitterUrl) ?? buildTweetUrl(authorUserName, id)) : undefined,
    text: firstString(source.text, source.fullText, source.full_text),
    authorId: authorIdOutput,
    author: authorOutput,
    createdAt: normalizeCreatedAt(firstString(source.createdAt, source.created_at, source.creation_date)),
    stats,
    isReply: isReply ? true : undefined,
    inReplyToId: isReply ? inReplyToId : undefined,
    conversationId: isReply && conversationId !== id ? conversationId : undefined,
    media: media.media,
    mediaIds: media.mediaIds,
    mentions: normalizeMentions(source),
    hashtags: normalizeHashtags(source),
    extendedEntities: context.includeExtended ? normalizeExtendedEntities(source) : undefined,
    quotedTweetId,
    quotedTweet: quotedTweetSource && !quotedTweetId ? normalizeTweet(quotedTweetSource, context) : undefined
  }, { keepZero: context.includeExtended }) as JsonRecord | undefined;
}

function normalizeAuthor(author: unknown, options: { includeUserInfoExtra: boolean }): JsonRecord | undefined {
  const source = asRecord(author);
  if (!source) {
    return undefined;
  }

  const base: JsonRecord = {
    id: firstString(source.id, source.rest_id, source.id_str, source.userId, source.user_id),
    name: firstString(source.name),
    userName: firstString(source.userName, source.username, source.user_name, source.screenName, source.screen_name),
    description: firstString(source.description, source.profile_bio),
    location: firstString(source.location),
    followers: firstNumber(source.followers, source.followersCount, source.followers_count),
    following: firstNumber(source.following, source.followingCount, source.friends_count),
    isBlueVerified: source.isBlueVerified,
    profilePicture: firstString(source.profilePicture, source.profile_picture, source.profile_image_url_https, source.profile_image_url, source.profileImageUrl)
  };

  if (options.includeUserInfoExtra) {
    base.favouritesCount = firstNumber(source.favouritesCount, source.favoritesCount, source.favourites_count);
    base.statusesCount = firstNumber(source.statusesCount, source.statuses_count);
    base.mediaCount = firstNumber(source.mediaCount, source.media_count);
    base.createdAt = normalizeCreatedAt(firstString(source.createdAt, source.created_at));
    base.pinnedTweetIds = source.pinnedTweetIds ?? source.pinned_tweet_ids;
  }

  return pruneValue(pickKnownFields(base, options.includeUserInfoExtra)) as JsonRecord | undefined;
}

function pickKnownFields(source: JsonRecord, includeUserInfoExtra: boolean): JsonRecord {
  const output: JsonRecord = {};
  const fields: readonly string[] = includeUserInfoExtra ? [...USER_INFO_FIELDS, ...USER_INFO_EXTRA_FIELDS] : TWEET_AUTHOR_FIELDS;
  for (const field of fields) {
    output[field] = source[field];
  }
  return output;
}

function addAuthor(authors: Map<string, JsonRecord> | undefined, id: string | undefined, author: JsonRecord | undefined): string | undefined {
  if (!id || !authors) {
    return id;
  }

  if (author) {
    const authorWithoutId = { ...author };
    delete authorWithoutId.id;
    const existing = authors.get(id);
    const merged = pruneValue({ ...existing, ...authorWithoutId }) as JsonRecord | undefined;
    authors.set(id, merged ?? {});
  } else if (!authors.has(id)) {
    authors.set(id, {});
  }

  return id;
}

function normalizeTweetMedia(tweet: JsonRecord, context: TweetTransformContext): MediaOutput {
  const mediaItems = collectMedia(tweet);
  if (mediaItems.length === 0) {
    return {};
  }

  if (context.mediaCatalog && mediaItems.some((item) => item.url)) {
    const mediaIds: string[] = [];
    const seenMediaIds = new Set<string>();
    const typeOnly: string[] = [];

    for (const item of mediaItems) {
      if (item.url) {
        const mediaId = addMedia(context.mediaCatalog, item);
        if (!seenMediaIds.has(mediaId)) {
          seenMediaIds.add(mediaId);
          mediaIds.push(mediaId);
        }
      } else {
        typeOnly.push(item.type ?? "media");
      }
    }

    return {
      media: compactMediaTypes(typeOnly),
      mediaIds: mediaIds.length > 0 ? mediaIds : undefined
    };
  }

  if (context.inlineAuthor) {
    const detailed = mediaItems.map((item) => pruneValue({ type: item.type, url: item.url }) as JsonRecord | undefined).filter((item): item is JsonRecord => Boolean(item));
    return { media: detailed.length > 0 ? detailed : compactMediaTypes(mediaItems.map((item) => item.type ?? "media")) };
  }

  return { media: compactMediaTypes(mediaItems.map((item) => item.type ?? "media")) };
}

function collectMedia(tweet: JsonRecord): NormalizedMedia[] {
  const extendedEntities = asRecord(tweet.extendedEntities ?? tweet.extended_entities);
  const entities = asRecord(tweet.entities);
  const mediaItems = mergeArrays(extendedEntities?.media, entities?.media, tweet.media);
  const seen = new Set<string>();
  const output: NormalizedMedia[] = [];

  for (const item of mediaItems) {
    const media = asRecord(item);
    if (!media) {
      continue;
    }

    const type = firstString(media.type, media.mediaType, media.media_type);
    const url = normalizeUrl(
      isVideoType(type)
        ? firstString(bestVideoVariant(media.video_info), media.videoUrl, media.video_url, media.media_url_https, media.media_url, media.preview_image_url, media.previewImageUrl, media.url)
        : firstString(media.media_url_https, media.media_url, media.preview_image_url, media.previewImageUrl, media.url)
    );
    const key = firstString(media.id, media.id_str, media.media_key, media.mediaKey) ?? (url ? `${type ?? ""}:${url}` : undefined);
    if (key && seen.has(key)) {
      continue;
    }
    if (key) {
      seen.add(key);
    }

    output.push({ type: type ?? "media", url, key });
  }

  return output;
}

function compactMediaTypes(types: string[]): unknown {
  if (types.length === 0) {
    return undefined;
  }

  const counts: Record<string, number> = {};
  for (const type of types) {
    counts[type] = (counts[type] ?? 0) + 1;
  }

  const entries = Object.entries(counts);
  if (entries.length === 1 && entries[0]?.[1] === 1) {
    return entries[0][0];
  }

  return counts;
}

function addMedia(catalog: MediaCatalog, media: NormalizedMedia): string {
  const key = `${media.type ?? ""}:${media.url ?? ""}`;
  const existing = catalog.keys.get(key);
  if (existing) {
    return existing;
  }

  const id = `m${catalog.nextId++}`;
  catalog.keys.set(key, id);
  catalog.items.set(id, pruneValue({ type: media.type, url: media.url }) as JsonRecord);
  return id;
}

function normalizeMentions(tweet: JsonRecord): JsonRecord[] {
  const entities = asRecord(tweet.entities);
  const mentionItems = mergeArrays(entities?.user_mentions, entities?.mentions, tweet.mentions);
  const seen = new Set<string>();
  const output: JsonRecord[] = [];

  for (const item of mentionItems) {
    const mention = asRecord(item);
    if (!mention) {
      continue;
    }

    const userName = firstString(mention.userName, mention.username, mention.screenName, mention.screen_name);
    if (!userName || seen.has(userName)) {
      continue;
    }

    seen.add(userName);
    const normalized = pruneValue({
      screenName: userName,
      name: firstString(mention.name)
    }) as JsonRecord | undefined;
    if (normalized) {
      output.push(normalized);
    }
  }

  return output;
}

function normalizeHashtags(tweet: JsonRecord): string[] {
  const entities = asRecord(tweet.entities);
  const hashtagItems = mergeArrays(entities?.hashtags, tweet.hashtags);
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of hashtagItems) {
    const text = typeof item === "string" ? item : firstString(asRecord(item)?.text, asRecord(item)?.tag, asRecord(item)?.hashtag);
    if (!text || seen.has(text)) {
      continue;
    }

    seen.add(text);
    output.push(text);
  }

  return output;
}

function normalizeExtendedEntities(tweet: JsonRecord): unknown {
  const extendedEntities = asRecord(tweet.extendedEntities ?? tweet.extended_entities);
  if (!extendedEntities) {
    return undefined;
  }

  return pruneValue(sanitizeFreeform(extendedEntities, { keepZero: true }), { keepZero: true });
}

function normalizeAccount(account: unknown): unknown {
  const source = asRecord(account);
  if (!source) {
    return pruneValue({ account }, { keepZero: true }) ?? {};
  }

  const data = asRecord(source.data);
  const sourceKeys = Object.keys(source);
  const canFlattenData =
    data && sourceKeys.every((key) => ["data", "status", "message", "msg", "code"].includes(key));

  return pruneValue(sanitizeFreeform(canFlattenData ? data : source, { keepZero: true }), { keepZero: true }) ?? {};
}

function sanitizeFreeform(value: unknown, options: PruneOptions = {}): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeFreeform(item, options));
  }

  if (!isRecord(value)) {
    return value;
  }

  const output: JsonRecord = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (key === "raw" || key === "twitterUrl") {
      continue;
    }
    output[key] = sanitizeFreeform(fieldValue, options);
  }
  return pruneValue(output, options);
}

function normalizeCreatedAt(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return value;
  }

  const twitterDate = /^([A-Z][a-z]{2}) ([A-Z][a-z]{2})\s+(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4}) (\d{4})$/.exec(value);
  if (twitterDate) {
    const [, , monthName, day, hour, minute, second, offset, year] = twitterDate;
    const month = monthName ? TWITTER_MONTHS[monthName] : undefined;
    if (month !== undefined && day && hour && minute && second && offset && year) {
      const offsetSign = offset.startsWith("-") ? -1 : 1;
      const offsetHours = Number(offset.slice(1, 3));
      const offsetMinutes = Number(offset.slice(3, 5));
      const timestamp = Date.UTC(Number(year), month, Number(day), Number(hour), Number(minute), Number(second));
      const adjusted = timestamp - offsetSign * (offsetHours * 60 + offsetMinutes) * 60_000;
      return new Date(adjusted).toISOString().replace(/\.000Z$/, "Z");
    }
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().replace(/\.000Z$/, "Z");
  }

  return value;
}

function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value
    .replace(/^https?:\/\/(?:mobile\.)?twitter\.com\//i, "https://x.com/")
    .replace(/^https?:\/\/(?:www\.)?x\.com\//i, "https://x.com/");
}

function buildTweetUrl(userName: string | undefined, id: string | undefined): string | undefined {
  return userName && id ? `https://x.com/${userName}/status/${id}` : undefined;
}

function bestVideoVariant(value: unknown): string | undefined {
  const videoInfo = asRecord(value);
  const variants = arrayValue(videoInfo?.variants)
    .map((variant) => asRecord(variant))
    .filter((variant): variant is JsonRecord => Boolean(variant && firstString(variant.url)))
    .filter((variant) => !firstString(variant.content_type) || firstString(variant.content_type) === "video/mp4")
    .sort((left, right) => (firstNumber(right.bitrate) ?? -1) - (firstNumber(left.bitrate) ?? -1));

  return firstString(variants[0]?.url);
}

function isVideoType(type: string | undefined): boolean {
  return type === "video" || type === "animated_gif";
}

function pruneValue(value: unknown, options: PruneOptions = {}): unknown {
  if (value === null || value === undefined || value === "" || value === false) {
    return undefined;
  }

  if (typeof value === "number" && value === 0 && !options.keepZero) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const output = value.map((item) => (typeof item === "number" ? item : pruneValue(item, options))).filter((item) => item !== undefined);
    return output.length > 0 ? output : undefined;
  }

  if (isRecord(value)) {
    const output: JsonRecord = {};
    for (const [key, fieldValue] of Object.entries(value)) {
      const pruned = pruneValue(fieldValue, options);
      if (pruned !== undefined) {
        output[key] = pruned;
      }
    }
    return Object.keys(output).length > 0 ? output : undefined;
  }

  return value;
}

function firstRecord(...values: unknown[]): JsonRecord | undefined {
  return values.find(isRecord);
}

function mergeArrays(...values: unknown[]): unknown[] {
  return values.flatMap((value) => (Array.isArray(value) ? value : []));
}

function firstNonEmptyArray(...values: unknown[]): unknown[] | undefined {
  const arrays = values.filter(Array.isArray);
  return arrays.find((value) => value.length > 0) ?? arrays[0];
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function stringField(record: JsonRecord | undefined, key: string): string | undefined {
  return firstString(record?.[key]);
}

function asRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

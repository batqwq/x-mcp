import { describe, expect, it } from "vitest";
import { InvalidTweetIdentifierError } from "../src/errors.js";
import { cleanUserName, parseTweetId } from "../src/xPostUrl.js";

describe("parseTweetId", () => {
  it("accepts raw numeric tweet IDs", () => {
    expect(parseTweetId("2019264360682778716")).toBe("2019264360682778716");
  });

  it("extracts IDs from x.com status URLs", () => {
    expect(parseTweetId("https://x.com/elonmusk/status/2019264360682778716?s=20")).toBe("2019264360682778716");
  });

  it("extracts IDs from twitter.com status URLs", () => {
    expect(parseTweetId("https://twitter.com/elonmusk/statuses/2019264360682778716")).toBe("2019264360682778716");
  });

  it("fails clearly when a status ID is missing", () => {
    expect(() => parseTweetId("https://x.com/elonmusk")).toThrow(InvalidTweetIdentifierError);
  });
});

describe("cleanUserName", () => {
  it("removes a leading @", () => {
    expect(cleanUserName("@OpenAI")).toBe("OpenAI");
  });
});

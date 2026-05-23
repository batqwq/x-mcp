import { InvalidTweetIdentifierError } from "./errors.js";
import { normalizeUserName, requireUserName } from "./validation.js";

const NUMERIC_ID_RE = /^\d{1,30}$/;

export function parseTweetId(idOrUrl: string): string {
  const value = idOrUrl.trim();

  if (NUMERIC_ID_RE.test(value)) {
    return value;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidTweetIdentifierError(idOrUrl);
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "x.com" && host !== "twitter.com" && host !== "mobile.twitter.com") {
    throw new InvalidTweetIdentifierError(idOrUrl);
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const statusIndex = parts.findIndex((part) => part === "status" || part === "statuses");
  const id = statusIndex >= 0 ? parts[statusIndex + 1] : undefined;

  if (!id || !NUMERIC_ID_RE.test(id)) {
    throw new InvalidTweetIdentifierError(idOrUrl);
  }

  return id;
}

export function cleanUserName(userName: string): string {
  return requireUserName(userName);
}

export { normalizeUserName };

import { InvalidInputError } from "./errors.js";
import type { ProviderId, SearchProduct } from "./types.js";

export function normalizeApiKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeProviderId(value: string | undefined): ProviderId | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[.-]/g, "_");
  if (!normalized) {
    return undefined;
  }

  if (normalized === "twitterapi_io" || normalized === "twitterapi") {
    return "twitterapi_io";
  }

  if (normalized === "getxapi" || normalized === "get_xapi") {
    return "getxapi";
  }

  return undefined;
}

export function normalizeSearchProduct(value: SearchProduct | undefined): SearchProduct {
  return value === "Top" ? "Top" : "Latest";
}

export function requireNonBlank(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new InvalidInputError(`${label} is required.`);
  }
  return trimmed;
}

export function optionalNonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeUserName(value: string | undefined): string | undefined {
  const trimmed = optionalNonBlank(value);
  if (!trimmed) {
    return undefined;
  }

  const userName = trimmed.replace(/^@+/, "").trim();
  if (!userName) {
    throw new InvalidInputError("userName must contain characters after @.");
  }
  return userName;
}

export function requireUserName(value: string): string {
  return normalizeUserName(value) ?? requireNonBlank(undefined, "userName");
}

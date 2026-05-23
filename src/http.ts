import { ProviderHttpError } from "./errors.js";
import type { FetchLike, ProviderId } from "./types.js";

export function buildUrl(baseUrl: string, path: string, params: Record<string, string | number | boolean | undefined>): URL {
  const url = new URL(path, baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url;
}

export async function fetchJson(
  provider: ProviderId,
  fetchImpl: FetchLike,
  url: URL,
  headers: Record<string, string>
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...headers
    }
  });

  const text = await response.text();
  const body = parseJson(text);

  if (!response.ok) {
    throw new ProviderHttpError(provider, formatHttpError(provider, response.status, response.statusText, body), response.status, body);
  }

  const bodyError = extractBodyError(body);
  if (bodyError) {
    throw new ProviderHttpError(provider, `${provider} returned an error: ${bodyError}`, response.status, body);
  }

  return body;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function arrayField(body: unknown, key: string): unknown[] {
  const record = asRecord(body);
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
}

export function booleanField(body: unknown, key: string): boolean {
  const record = asRecord(body);
  return Boolean(record?.[key]);
}

export function stringField(body: unknown, key: string): string | null {
  const record = asRecord(body);
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function dataField(body: unknown): unknown {
  const record = asRecord(body);
  return record?.data ?? null;
}

function parseJson(text: string): unknown {
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractBodyError(body: unknown): string | null {
  const record = asRecord(body);
  if (!record) {
    return null;
  }

  if (record.status === "error") {
    return stringifyMessage(record.msg ?? record.message ?? "status=error");
  }

  if ("error" in record) {
    return stringifyMessage(record.message ?? record.msg ?? record.error);
  }

  return null;
}

function formatHttpError(provider: ProviderId, status: number, statusText: string, body: unknown): string {
  const message = extractBodyError(body) ?? stringifyMessage(body) ?? statusText;
  return `${provider} request failed with HTTP ${status}: ${message}`;
}

function stringifyMessage(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

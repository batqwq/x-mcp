import { ProviderHttpError } from "./errors.js";
import type { FetchLike, ProviderId } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

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
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        ...headers
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
  } catch (error) {
    throw new ProviderHttpError(provider, `${provider} request failed before receiving a response: ${errorMessage(error)}`, undefined, {
      url: url.toString()
    });
  }

  const text = await response.text();
  const body = parseJson(provider, text, response.ok, url);

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

export function requiredArrayField(provider: ProviderId, body: unknown, key: string): unknown[] {
  const record = asRecord(body);
  const value = record?.[key];
  if (!Array.isArray(value)) {
    throw new ProviderHttpError(provider, `${provider} response is missing array field "${key}".`, undefined, body);
  }
  return value;
}

export function booleanField(body: unknown, key: string): boolean {
  const record = asRecord(body);
  const value = record?.[key];
  return value === true || value === "true" || value === 1;
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

function parseJson(provider: ProviderId, text: string, ok: boolean, url: URL): unknown {
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (ok) {
      throw new ProviderHttpError(provider, `${provider} returned a non-JSON response.`, undefined, {
        url: url.toString(),
        bodyPreview: text.slice(0, 200)
      });
    }
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

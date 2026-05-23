import type { ProviderId } from "./types.js";

export class XPostMcpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XPostMcpError";
  }
}

export class ProviderConfigError extends XPostMcpError {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

export class ProviderHttpError extends XPostMcpError {
  readonly provider: ProviderId;
  readonly status?: number;
  readonly details?: unknown;

  constructor(provider: ProviderId, message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "ProviderHttpError";
    this.provider = provider;
    this.status = status;
    this.details = details;
  }
}

export class ProviderEmptyResultError extends XPostMcpError {
  readonly provider: ProviderId;

  constructor(provider: ProviderId, resource: string) {
    super(`${provider} returned no ${resource}.`);
    this.name = "ProviderEmptyResultError";
    this.provider = provider;
  }
}

export class InvalidTweetIdentifierError extends XPostMcpError {
  constructor(input: string) {
    super(`Could not find a tweet status ID in "${input}". Pass a numeric tweet ID or an x.com/twitter.com status URL.`);
    this.name = "InvalidTweetIdentifierError";
  }
}

export class InvalidInputError extends XPostMcpError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

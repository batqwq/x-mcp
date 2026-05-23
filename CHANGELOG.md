# Changelog

## Unreleased

- Added TUI direct API Key input: users can now set API keys directly from the TUI menu without relying on environment variables.
- Added provider fallback: when both providers are configured, the server automatically tries the secondary provider on transient failures (5xx, 429, network errors).
- API keys entered in TUI are persisted locally (base64-encoded) and restored on next startup; environment variables take precedence.
- Added first-use onboarding and TUI.
- Added explicit `--server` MCP stdio mode.
- Added one-command GitHub `npx` usage.
- Hardened provider configuration, input validation, HTTP failure handling, package metadata, and project documentation.

## 0.1.0

- Initial read-only X/Twitter MCP server with TwitterAPI.io and GetXAPI providers.

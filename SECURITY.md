# Security Policy

## Supported Scope

This project is a read-only MCP server. It should not store API keys, login cookies, or X account credentials.

## Secrets

Configure provider keys only through environment variables:

- `TWITTERAPI_IO_KEY`
- `GETXAPI_KEY`

Do not paste secrets into issues, logs, screenshots, or committed files.

## Reporting

Open a private GitHub security advisory or contact the repository owner if you find a vulnerability involving secret handling, unintended write actions, or provider request leakage.

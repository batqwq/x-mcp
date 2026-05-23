# Contributing

## Development

```bash
npm install
npm test
npm run build
npm run smoke
```

Use `npm run server` for MCP stdio mode and `npm run tui` for the local setup UI.

## Rules

- Do not add write actions such as posting, liking, retweeting, following, or sending DMs.
- Do not commit API keys or generated `.env` files.
- Keep provider differences normalized behind the shared response fields.
- Add tests for each provider mapping or input edge case changed.

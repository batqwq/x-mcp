# x-mcp

Read-only MCP server for X/Twitter posts. It lets an LLM client read posts, search posts, inspect users, fetch user posts/replies, and check provider account status through two supported providers:

- TwitterAPI.io
- GetXAPI

No write actions are implemented. This server does not post, like, retweet, send DMs, or store API keys.

## Tools

- `x_post_get`: read one post by tweet ID or `x.com`/`twitter.com` status URL.
- `x_posts_search`: advanced search with cursor pagination.
- `x_user_info`: read profile information by username.
- `x_user_posts`: read a user's posts, optionally including replies.
- `x_account_info`: read selected provider account/credit info.

## Configuration

Set one or both provider keys in the MCP client environment:

```bash
TWITTERAPI_IO_KEY=your_twitterapi_io_key
GETXAPI_KEY=your_getxapi_key
X_POST_PROVIDER=twitterapi_io
```

Provider selection order:

1. Tool input `provider`
2. `X_POST_PROVIDER`
3. First configured provider, preferring `twitterapi_io`

Valid provider values are `twitterapi_io` and `getxapi`.

## Development

```bash
npm install
npm run build
npm test
npm run smoke
```

## MCP Client Example

```json
{
  "mcpServers": {
    "x-post": {
      "command": "node",
      "args": ["F:/wd/x_MCP/dist/index.js"],
      "env": {
        "TWITTERAPI_IO_KEY": "your_twitterapi_io_key",
        "GETXAPI_KEY": "your_getxapi_key",
        "X_POST_PROVIDER": "twitterapi_io"
      }
    }
  }
}
```

## Provider Endpoints

TwitterAPI.io:

- `GET /twitter/tweets`
- `GET /twitter/tweet/advanced_search`
- `GET /twitter/user/info`
- `GET /twitter/user/last_tweets`
- `GET /oapi/my/info`

GetXAPI:

- `GET /twitter/tweet/detail`
- `GET /twitter/tweet/advanced_search`
- `GET /twitter/user/info`
- `GET /twitter/user/tweets`
- `GET /twitter/user/tweets_and_replies`
- `GET /account/me`

## License

MIT

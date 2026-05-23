# x-mcp

只读 X/Twitter MCP 服务器。它让支持 MCP 的 LLM 客户端读取 X Post、搜索 Post、查看用户资料、读取用户发帖/回复，并查看 provider 账号额度信息。

支持两个数据提供商：

- TwitterAPI.io
- GetXAPI

本项目只做读取能力，不实现发帖、点赞、转推、私信或其他写入动作。API Key 可通过 TUI 直接输入并持久化保存。

## 一键运行

Node.js 22+ 环境下，可以直接从 GitHub 运行，不需要手动 clone：

```bash
npx -y github:batqwq/x-mcp
```

终端直接运行会打开首次使用 TUI 引导。运行 MCP server 时需要至少设置一个 provider key。

PowerShell 示例：

```powershell
$env:TWITTERAPI_IO_KEY="your_twitterapi_io_key"
$env:X_POST_PROVIDER="twitterapi_io"
npx -y github:batqwq/x-mcp --server
```

也可以使用 GetXAPI：

```powershell
$env:GETXAPI_KEY="your_getxapi_key"
$env:X_POST_PROVIDER="getxapi"
npx -y github:batqwq/x-mcp --server
```

MCP 客户端配置示例：

```json
{
  "mcpServers": {
    "x-post": {
      "command": "npx",
      "args": ["-y", "github:batqwq/x-mcp", "--server"],
      "env": {
        "TWITTERAPI_IO_KEY": "your_twitterapi_io_key",
        "GETXAPI_KEY": "your_getxapi_key",
        "X_POST_PROVIDER": "twitterapi_io"
      }
    }
  }
}
```

## 工具

- `x_post_get`: 通过 tweet ID 或 `x.com`/`twitter.com` status URL 读取单条 Post。
- `x_posts_search`: 高级搜索 Post，支持 cursor 翻页。
- `x_user_info`: 通过用户名读取用户资料。
- `x_user_posts`: 读取用户发帖，可选择包含回复。
- `x_account_info`: 读取所选 provider 的账号/额度信息。

## 配置

环境变量：

```bash
TWITTERAPI_IO_KEY=your_twitterapi_io_key
GETXAPI_KEY=your_getxapi_key
X_POST_PROVIDER=twitterapi_io
```

Provider 选择顺序：

1. 工具调用参数里的 `provider`
2. `X_POST_PROVIDER`
3. 已配置的第一个 provider，优先 `twitterapi_io`

合法 provider 值：

- `twitterapi_io`
- `getxapi`

### Provider Fallback

当两个 provider 都配置了 API Key 时，如果主 provider 出现瞬态故障（HTTP 5xx、429 速率限制、网络错误），会自动尝试备用 provider。客户端错误（4xx，429 除外）不会触发 fallback。

### TUI 直接设置 API Key

在 TUI 中选择 `6. 设置 API Key` 可以直接输入 API Key：

- 输入后立即在当前会话生效
- 自动保存到本地配置文件（base64 编码）
- 下次启动 TUI 时自动加载
- 环境变量优先级高于保存的 Key

## 本地开发

```bash
npm install
npm test
npm run build
npm run smoke
```

本地直接运行：

```bash
npm start
```

本地 TUI：

```bash
npm run tui
```

本地 MCP server：

```bash
npm run server
```

## 维护

- 质量修复清单：[docs/QUALITY_FIXES.md](docs/QUALITY_FIXES.md)
- 贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md)
- 安全策略：[SECURITY.md](SECURITY.md)
- 更新日志：[CHANGELOG.md](CHANGELOG.md)

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

## English

Read-only MCP server for X/Twitter posts. It lets MCP-compatible LLM clients read posts, search posts, inspect users, fetch user posts/replies, and check provider account status through TwitterAPI.io or GetXAPI.

One-command GitHub run:

```bash
npx -y github:batqwq/x-mcp
```

Running in a terminal opens the first-use TUI. Use `--server` for MCP stdio mode. Set `TWITTERAPI_IO_KEY` or `GETXAPI_KEY` before starting the server. Optional `X_POST_PROVIDER` values are `twitterapi_io` and `getxapi`.

**Provider fallback**: When both providers are configured, the server automatically tries the secondary provider on transient failures (5xx, 429, network errors). Client errors (4xx except 429) do not trigger fallback.

**TUI API Key input**: Use menu option 6 in the TUI to enter API keys directly. Keys are persisted locally (base64-encoded) and restored on next TUI launch. Environment variables take precedence over saved keys.

## License

MIT

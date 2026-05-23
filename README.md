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

### 远程 MCP 运行 (SSE 传输)

除了本地集成的 Stdio 管道模式外，本项目还支持开启一个远程 SSE 服务器。这允许任何人在本地或云端远程连接您的 MCP 节点，并且支持多 AI 客户端多路并发连接：

```bash
npx -y github:batqwq/x-mcp --sse --port 3000
```

当部署在公网环境时，强烈建议配置允许连接的域名（Allowed Hosts）以强制启用高级的 **DNS 重绑定 (DNS Rebinding) 防御**和 **CORS 跨域安全策略**：

```bash
npx -y github:batqwq/x-mcp --sse --port 3000 --allowed-hosts your-x-mcp-server.com
```

* `GET /sse` — SSE 长连接握手端点。在 Claude 远程连接器（Remote Connector）中填写此 URL（例如 `http://localhost:3000/sse`）。
* `POST /messages` — 消息接收与处理端点。
* `--port, -p` — 端口，默认为 `3000` 或读取 `PORT` 环境变量。
* `--allowed-hosts` — 逗号分割的允许请求主机，或配置 `ALLOWED_HOSTS` 环境变量。

#### 🛡️ 远程访问控制鉴权 (OAuth Client ID & Secret 开源部署防盗刷)

在公网环境（如云主机或 Render、Docker）部署此开源项目时，任何人都可以通过 SSE 匿名调用您的工具有可能盗刷您配置的 TwitterAPI.io / GetXAPI 额度。为此项目内置了标准的 **OAuth Client ID & OAuth Client Secret 安全凭证体系**：

* **系统自动生成凭证 (默认强保护)**：若启动远程 SSE 服务器时本地未保存任何 OAuth 凭据且未设置全局 `--access-token`，服务器会**自动随机生成一个高强度的 Client ID 和 Client Secret**，并持久化到本地 `onboarding.json` 中。这保障了在任何公网匿名的部署场景下，服务默认即是 100% 绝对安全的。
* **TUI 极简管理凭证**：您可以在 TUI 交互界面选择 `2. 管理 Claude 连接凭证 (OAuth Credentials)` 来生成新凭证、查看已有凭证（已自动做安全脱敏保护）或删除作废凭据。
* **Claude Connectors 标准安全配置**：当您在 Claude 客户端自定义连接器 (Custom Connectors -> Add Connector) 的 **Advanced settings (高级设置)** 中配置远程 MCP 时，请分别填入生成的 **Client ID** 和 **Client Secret**。
* **支持 Basic 强校验与 Session 隔离**：服务端在 GET `/sse` 握手和 POST `/messages` 中会双端执行基于 HTTP `Authorization: Basic` 的强安全凭证比对。同时，服务端自动隔离多 Session 会话，并在会话中强绑定 Client ID，彻底防御越权会话劫持（Session Hijacking）。
* **降级 URL 认证支持**：如果客户端限制导致 Header 无法传输，亦可在连接 URL 栏中以查询参数传入凭证进行握手连接：
   ```
   https://your-x-mcp-server.com/sse?client_id=your_client_id&client_secret=your_client_secret
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

**TUI API Key input**: Use menu option 1 in the TUI to enter API keys directly. Keys are persisted locally (base64-encoded) and restored on next TUI launch. Environment variables take precedence over saved keys.

**Remote MCP server (SSE)**: Start a high-performance SSE server for remote MCP integration (e.g. into custom connectors in Claude Web or distributed AI clients):
```bash
npx -y github:batqwq/x-mcp --sse --port 3000
```
For production deployments, pass `--allowed-hosts` to automatically enable DNS Rebinding protection and strict CORS validation against unauthorized origins:
```bash
npx -y github:batqwq/x-mcp --sse --port 3000 --allowed-hosts your-x-mcp-server.com
```
* Use `http://localhost:3000/sse` in Claude's Remote Connector setup to start streaming.

**Access Token Authentication & MCP User Whitelist (Anti-Abuse protection)**: Protect your server's API provider keys from unauthorized billing/abuse in public environments.
* **Whitelist configuration**: Pass `--allowed-mcp-users <users>` or set `ALLOWED_MCP_USERS` environment variable (comma-separated, e.g. `batqwq:secret1,guest:secret2` or just `batqwq,guest` for automatic token assignment).
* **System-Generated Token (Secure Default)**: If only usernames are supplied (or no auth options are specified at all, which defaults to `admin`), the server will **automatically generate a 32-character secure token** on startup for each user and print the connection URLs on your terminal.
* **Client connection**: In Claude Web custom connector setup, specify the target user and token credentials in your Server URL:
   ```
   https://your-x-mcp-server.com/sse?user=batqwq&token=secret1
   ```
   *Any requests lacking correct tokens, invalid users, or attempting session hijacking are immediately blocked with `401 Unauthorized` responses.*




## License

MIT

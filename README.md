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

#### 🛡️ 远程访问控制鉴权 (开源部署防盗刷)

在公网环境（如云主机或 Render、Docker）部署此开源项目时，任何人都可以通过 SSE 匿名调用您的工具有可能盗刷您配置的 TwitterAPI.io / GetXAPI 额度。为此项目内置了**访问密钥验证**：

* **系统默认生成强随机 Token**：若启动远程 SSE 服务器时未手动设置 `--access-token` 凭据，系统会在启动时**自动随机生成一个高强度的安全 Token** 并在控制台打印对应的连接引导 URL。这保障了在任何公网匿名的部署场景下，本服务默认即是 100% 绝对安全的。
* **自定义鉴权密钥**：启动服务时传递 `--access-token` 参数或设置 `X_MCP_ACCESS_TOKEN` 环境变量：
   ```bash
   npx -y github:batqwq/x-mcp --sse --port 3000 --access-token my-secure-token
   ```
* **安全客户端连接**：在 Claude 远程连接器配置弹窗的 URL 栏中，**必须**将安全 token 拼在参数中连接：
   ```
   https://your-x-mcp-server.com/sse?token=my-secure-token
   ```
   *建立连接后，系统会自动在随后的所有 JSON-RPC 通信 (POST /messages) 中执行会话级 Token 校验。未授权的连接均直接返回 `401 Unauthorized` 拒绝服务。*

#### 🔒 目标 X 用户白名单过滤策略

如果您不希望别人通过您的 MCP 节点查询任意敏感用户的 Twitter 数据，可以通过启动参数限制只允许查询特定的 Twitter 账号（如您自己的账号）：
* **启动参数**：传递 `--allowed-x-users <usernames>`，或者配置 `ALLOWED_X_USERS` 环境变量（用户名以逗号分隔，不区分大小写，如 `@batqwq,elonmusk`）。
* **安全过滤效能**：
  * `getUserInfo` 与 `getUserPosts`：限制只能读取白名单内用户的信息与发帖。
  * `getPost` (读取单帖)：若被读取推文的作者不属于白名单，直接在返回前予以 403 阻断拦截。
  * `searchPosts` (推文搜索)：自动切片过滤搜索结果，只保留白名单作者的推文，强力防御数据越权外泄。

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

**Remote MCP server (SSE)**: Start a high-performance SSE server for remote MCP integration (e.g. into custom connectors in Claude Web or distributed AI clients):
```bash
npx -y github:batqwq/x-mcp --sse --port 3000
```
For production deployments, pass `--allowed-hosts` to automatically enable DNS Rebinding protection and strict CORS validation against unauthorized origins:
```bash
npx -y github:batqwq/x-mcp --sse --port 3000 --allowed-hosts your-x-mcp-server.com
```
* Use `http://localhost:3000/sse` in Claude's Remote Connector setup to start streaming.

**Access Token Authentication (Anti-Abuse protection)**: Protect your server's API provider keys from unauthorized billing/abuse in public environments. 
* **System-Generated Token (Secure Default)**: If `--access-token` or `X_MCP_ACCESS_TOKEN` is not defined when running in SSE mode, the server will **automatically generate a 32-character cryptographically secure token** on startup and display the connection URLs on your terminal.
* **Custom Token**: Start with `--access-token` option or set `X_MCP_ACCESS_TOKEN` environment variable:
   ```bash
   npx -y github:batqwq/x-mcp --sse --port 3000 --access-token my-secure-token
   ```
* **Client connection**: In Claude Web custom connector setup, append the token to your Server URL:
   ```
   https://your-x-mcp-server.com/sse?token=my-secure-token
   ```
   *Any requests lacking or specifying an incorrect token are immediately blocked with `401 Unauthorized` responses.*

**Allowed X Usernames Whitelist (Privacy Protection)**: Limit the accounts your MCP node can query (e.g. restrict to your own handle):
* **Configuration**: Pass `--allowed-x-users <users>` or set `ALLOWED_X_USERS` environment variable (comma-separated, case-insensitive, e.g. `@batqwq,elonmusk`).
* **Enforcement**:
  * Blocks any `getUserInfo` and `getUserPosts` requests outside the whitelist.
  * Blocks single tweet retrieval (`getPost`) at the edge if the tweet's author is not whitelisted.
  * Silently filters `searchPosts` results to only yield tweets authored by whitelisted handles, protecting privacy.



## License

MIT

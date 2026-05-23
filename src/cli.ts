export type StartupMode = "smoke" | "help" | "tui" | "server" | "sse";

const TUI_ARGS = new Set(["--tui", "tui", "--setup", "setup", "--onboard", "onboard", "onboarding"]);

export interface TtyState {
  stdin: boolean;
  stdout: boolean;
}

export interface CliConfig {
  mode: StartupMode;
  port: number;
  allowedHosts: string[];
  accessToken?: string;
  allowedMcpUsers?: Record<string, string | undefined>;
}

export function getStartupMode(args: string[], tty: TtyState): StartupMode {
  if (args.includes("--smoke")) {
    return "smoke";
  }

  if (args.includes("--help") || args.includes("-h")) {
    return "help";
  }

  if (args.includes("--sse")) {
    return "sse";
  }

  if (args.includes("--server")) {
    return "server";
  }

  if (args.some((arg) => TUI_ARGS.has(arg))) {
    return "tui";
  }

  return tty.stdin && tty.stdout ? "tui" : "server";
}

export function parseCliArgs(args: string[], tty: TtyState, env: Record<string, string | undefined> = process.env): CliConfig {
  const mode = getStartupMode(args, tty);

  // Parse --port / -p
  let port = 3000;
  let parsedPort: number | undefined;

  const portIdx = args.findIndex((arg) => arg === "--port" || arg === "-p");
  if (portIdx !== -1 && portIdx + 1 < args.length) {
    const val = parseInt(args[portIdx + 1]!, 10);
    if (!isNaN(val) && val > 0 && val < 65536) {
      parsedPort = val;
    }
  }

  if (parsedPort === undefined && env.PORT) {
    const val = parseInt(env.PORT, 10);
    if (!isNaN(val) && val > 0 && val < 65536) {
      parsedPort = val;
    }
  }

  port = parsedPort ?? 3000;

  // Parse --allowed-hosts
  let allowedHosts: string[] = [];
  const hostsIdx = args.indexOf("--allowed-hosts");
  if (hostsIdx !== -1 && hostsIdx + 1 < args.length) {
    const val = args[hostsIdx + 1]!;
    allowedHosts = val.split(",").map((h) => h.trim()).filter(Boolean);
  } else if (env.ALLOWED_HOSTS) {
    allowedHosts = env.ALLOWED_HOSTS.split(",").map((h) => h.trim()).filter(Boolean);
  }

  // Parse --access-token
  let accessToken: string | undefined;
  const tokenIdx = args.indexOf("--access-token");
  if (tokenIdx !== -1 && tokenIdx + 1 < args.length) {
    accessToken = args[tokenIdx + 1]!;
  } else if (env.X_MCP_ACCESS_TOKEN) {
    accessToken = env.X_MCP_ACCESS_TOKEN;
  }

  // Parse --allowed-mcp-users
  let allowedMcpUsers: Record<string, string | undefined> | undefined;
  let rawUsers: string | undefined;
  const mcpUsersIdx = args.indexOf("--allowed-mcp-users");
  if (mcpUsersIdx !== -1 && mcpUsersIdx + 1 < args.length) {
    rawUsers = args[mcpUsersIdx + 1]!;
  } else if (env.ALLOWED_MCP_USERS) {
    rawUsers = env.ALLOWED_MCP_USERS;
  }

  if (rawUsers) {
    allowedMcpUsers = {};
    const parts = rawUsers.split(",");
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx !== -1) {
        const username = trimmed.substring(0, colonIdx).trim().toLowerCase();
        const tokenVal = trimmed.substring(colonIdx + 1).trim();
        if (username) {
          allowedMcpUsers[username] = tokenVal || undefined;
        }
      } else {
        const username = trimmed.toLowerCase();
        if (username) {
          allowedMcpUsers[username] = undefined;
        }
      }
    }
  }

  return { mode, port, allowedHosts, accessToken, allowedMcpUsers };
}

export function helpText(): string {
  return `x-mcp - read-only X/Twitter MCP server

Usage:
  x-post-mcp --server                   Start the MCP stdio server
  x-post-mcp --sse [--port <number>]    Start the remote MCP SSE server (port defaults to 3000 or process.env.PORT)
  x-post-mcp                            Open the TUI when run in a terminal; start stdio server when run by an MCP client
  x-post-mcp onboard                    Open first-use onboarding TUI
  x-post-mcp setup                      Open setup TUI
  x-post-mcp --smoke                    Run a startup smoke check

Options:
  --port, -p <number>                   Port for SSE server (default: 3000)
  --allowed-hosts <hosts>               Comma-separated hosts allowed to connect, for DNS rebinding protection (e.g. localhost,x-mcp.render.com)
  --access-token <token>                Access Token to protect the SSE server (global mode)
  --allowed-mcp-users <users>           Whitelist of authorized MCP users/tokens (e.g. batqwq:key1,guest:key2 or just batqwq,guest)

Environment:
  TWITTERAPI_IO_KEY                     TwitterAPI.io API key
  GETXAPI_KEY                           GetXAPI API key
  X_POST_PROVIDER                       twitterapi_io or getxapi
  PORT                                  Default port for SSE server
  ALLOWED_HOSTS                         Default allowed hosts for SSE server (comma-separated)
  X_MCP_ACCESS_TOKEN                    Access Token to secure SSE and message HTTP endpoints (legacy global mode)
  ALLOWED_MCP_USERS                     Comma-separated MCP users whitelist (username:token pairs or usernames only)
`;
}

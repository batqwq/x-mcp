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

  return { mode, port, allowedHosts };
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

Environment:
  TWITTERAPI_IO_KEY                     TwitterAPI.io API key
  GETXAPI_KEY                           GetXAPI API key
  X_POST_PROVIDER                       twitterapi_io or getxapi
  PORT                                  Default port for SSE server
  ALLOWED_HOSTS                         Default allowed hosts for SSE server (comma-separated)
`;
}

export type StartupMode = "smoke" | "help" | "tui" | "server";

const TUI_ARGS = new Set(["--tui", "tui", "--setup", "setup", "--onboard", "onboard", "onboarding"]);

export interface TtyState {
  stdin: boolean;
  stdout: boolean;
}

export function getStartupMode(args: string[], tty: TtyState): StartupMode {
  if (args.includes("--smoke")) {
    return "smoke";
  }

  if (args.includes("--help") || args.includes("-h")) {
    return "help";
  }

  if (args.includes("--server")) {
    return "server";
  }

  if (args.some((arg) => TUI_ARGS.has(arg))) {
    return "tui";
  }

  return tty.stdin && tty.stdout ? "tui" : "server";
}

export function helpText(): string {
  return `x-mcp - read-only X/Twitter MCP server

Usage:
  x-post-mcp --server       Start the MCP stdio server
  x-post-mcp                Open the TUI when run in a terminal; start server when run by an MCP client
  x-post-mcp onboard        Open first-use onboarding TUI
  x-post-mcp setup          Open setup TUI
  x-post-mcp --smoke        Run a startup smoke check

Environment:
  TWITTERAPI_IO_KEY         TwitterAPI.io API key
  GETXAPI_KEY               GetXAPI API key
  X_POST_PROVIDER           twitterapi_io or getxapi
`;
}

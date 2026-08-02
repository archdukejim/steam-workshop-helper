import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

/**
 * Steam Workshop Helper MCP — configuration.
 *
 * Everything runs locally. The MCP server is launched over stdio by the MCP
 * client (see the repo's .mcp.json), and it reaches the Chrome extension over
 * the machine's loopback interface (127.0.0.1) — traffic never leaves the box.
 * Defaults work out of the box; a mcp-config/config.json or environment
 * variables can override the loopback port and timeouts.
 */
export interface MCPConfig {
  /** Loopback host the bridge binds to. Always a local address. */
  bridgeHost: string;
  /** Loopback TCP port the extension connects to. */
  bridgePort: number;
  /** How long (ms) the extension's long-poll is held open before a 204. */
  pollTimeoutMs: number;
  /** How long (ms) a tool call waits for the extension to answer. */
  callTimeoutMs: number;
}

const DEFAULT_CONFIG: MCPConfig = {
  bridgeHost: "127.0.0.1",
  bridgePort: 8766,
  pollTimeoutMs: 25000,
  callTimeoutMs: 30000,
};

function applyEnv(cfg: MCPConfig): MCPConfig {
  const out = { ...cfg };
  const port = process.env.SWH_MCP_PORT?.trim();
  if (port && /^\d+$/.test(port)) out.bridgePort = parseInt(port, 10);
  const host = process.env.SWH_MCP_HOST?.trim();
  if (host) out.bridgeHost = host;
  const callTimeout = process.env.SWH_MCP_CALL_TIMEOUT?.trim();
  if (callTimeout && /^\d+$/.test(callTimeout)) out.callTimeoutMs = parseInt(callTimeout, 10);
  return out;
}

/**
 * Load config. Mirrors rimsynapse's approach: check the mcp-config/config.json
 * at both the source layout (server/build -> repo) and the packed .mcpb layout
 * (server -> extension root), merge over defaults, then apply env overrides.
 */
export function loadConfig(): MCPConfig {
  const candidates = [
    path.join(__dirname, "..", "..", "mcp-config", "config.json"), // source: server/build -> mcp/
    path.join(__dirname, "..", "mcp-config", "config.json"), // bundle: server -> root
    path.join(__dirname, "..", "..", "..", "mcp-config", "config.json"),
  ];

  for (const configPath of candidates) {
    if (!fs.existsSync(configPath)) continue;
    try {
      const fromFile = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Partial<MCPConfig>;
      return applyEnv({ ...DEFAULT_CONFIG, ...fromFile });
    } catch (err) {
      console.error(
        `Ignoring unreadable config at ${configPath}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return applyEnv({ ...DEFAULT_CONFIG });
}

// ---- GitHub token (for the issue tools) --------------------------------
//
// Optional overall: the Steam tools need nothing from GitHub, so absence is
// reported per-call by requireGitHubToken rather than crashing the server.
// Sourced from GITHUB_TOKEN, else a gitignored github_token.txt in mcp/ (raw
// token, or a `TOKEN=...` line — matching rimsynapse's format).
export function getGitHubToken(): string {
  const fromEnv = process.env.GITHUB_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const candidates = [
    path.join(__dirname, "..", "..", "github_token.txt"), // source: server/build -> mcp/
    path.join(__dirname, "..", "github_token.txt"), // bundle: server -> root
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const content = fs.readFileSync(p, "utf-8").trim();
      const tokenLine = content.split("\n").find((l) => l.startsWith("TOKEN="));
      const token = tokenLine ? tokenLine.slice("TOKEN=".length).trim() : content;
      if (token) return token;
    } catch {
      /* try next */
    }
  }

  // Last resort: reuse the gh CLI's authenticated token from the OS keyring, so
  // no plaintext token needs to be stored anywhere. No-op if gh is absent or
  // not logged in. (env GITHUB_TOKEN / github_token.txt still take precedence.)
  try {
    const out = execSync("gh auth token", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (out) return out;
  } catch {
    /* gh not installed or not authenticated */
  }

  return "";
}

export function requireGitHubToken(token: string, toolName: string): void {
  if (!token) {
    throw new Error(
      `The '${toolName}' tool needs a GitHub token, and none is available. ` +
        `Log in with 'gh auth login' (the token is reused from your keyring automatically), ` +
        `or set GITHUB_TOKEN in the MCP env, or put a PAT with 'repo' scope in mcp/github_token.txt. ` +
        `The Steam tools work without it.`
    );
  }
}

// ---- Steam item -> GitHub repo map -------------------------------------

export interface RepoRef {
  owner: string;
  repo: string;
  title?: string;
}

export function loadRepoMap(): Record<string, RepoRef> {
  const candidates = [
    path.join(__dirname, "..", "..", "mcp-config", "repo-map.json"),
    path.join(__dirname, "..", "mcp-config", "repo-map.json"),
    path.join(__dirname, "..", "..", "..", "mcp-config", "repo-map.json"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
      return (parsed && parsed.items) || {};
    } catch (err) {
      console.error(
        `Ignoring unreadable repo-map at ${p}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return {};
}

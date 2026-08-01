import * as fs from "fs";
import * as path from "path";

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

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { loadConfig } from "./config";
import { startBridge, Bridge } from "./bridge";
import { swhTools, handleSwhTool } from "./tools/workshop";
import { githubTools, handleGithubTool } from "./tools/github";

// 1. Config
const config = loadConfig();

// 2. MCP server
const server = new Server(
  {
    name: "steam-workshop-helper-mcp",
    version: "0.1.0",
  },
  {
    capabilities: { tools: {} },
  }
);

const ALL_TOOLS = [...swhTools, ...githubTools];

let bridge: Bridge | null = null;

// 3. Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: ALL_TOOLS as any };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params as any;

  // GitHub tools talk to the API directly and don't need the browser bridge.
  if (githubTools.some((t) => t.name === name)) {
    return await handleGithubTool(name, args);
  }

  if (swhTools.some((t) => t.name === name)) {
    if (!bridge) throw new Error("Loopback bridge not started yet.");
    return await handleSwhTool(name, args, bridge);
  }

  throw new Error(`Unknown tool: ${name}`);
});

// 4. Start
async function main() {
  bridge = await startBridge(config);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[swh-mcp] Steam Workshop Helper MCP server running on stdio");
}

main().catch((err) => {
  console.error("[swh-mcp] Fatal error:", err);
  process.exit(1);
});

# Steam Workshop Helper — MCP server

A local [MCP](https://modelcontextprotocol.io) server that exposes the Steam
Workshop Helper extension's `window.SWH` API as MCP tools, so any MCP client
(Claude Desktop, Claude Code, etc.) can manage your workshop comments and item
descriptions — not just *Claude in Chrome*.

It follows the same layout and conventions as rimsynapse's `Repo-MCP`
(TypeScript server, `tools/*.ts` modules, `.mcp.json`, `.mcpb` packaging).

## Everything is local

```
MCP client ──stdio──▶ MCP server (node)  ──HTTP on 127.0.0.1──▶ Chrome extension ──▶ Steam
                         (this folder)         (loopback only)        (window.SWH)
```

- The server is launched locally by your MCP client via [`.mcp.json`](../.mcp.json)
  (exactly like rimsynapse's server), over stdio.
- It reaches the extension over the machine's **loopback interface**
  (`127.0.0.1:8766`). Loopback traffic never leaves the computer, so it is as
  local as a file drop — it's used here because a Chrome extension is sandboxed
  and cannot read files off disk the way rimsynapse's RimWorld C# side can.
- The server holds **no Steam credentials**. Every action runs against the
  logged-in Steam session in your browser; with no `steamcommunity.com` tab
  open, tools return a clear "extension not connected" / "not logged in" error.

## Tools

| Tool | window.SWH | Notes |
| --- | --- | --- |
| `swh_open_item` | *(background)* | Open/focus a tab on a mod; works logged in or not. Bootstraps the "no tab open" case |
| `swh_get_auth` | `getAuth` | Login state: `{ loggedIn, steamId, accountName }` |
| `swh_get_context` | `getContext` | The item open in the active tab |
| `swh_review_notifications` | `reviewNotifications` | Recent comments across **all** your items, enriched with comment text |
| `swh_get_notifications` | `getNotifications` | Raw list of items with new activity (no text) |
| `swh_list_comments` | `listComments` | `{ fileId, start?, count? }` |
| `swh_post_comment` | `postComment` | `{ fileId, text }` — owner/login required |
| `swh_delete_comment` | `deleteComment` | `{ fileId, commentId }` — irreversible |
| `swh_get_item` | `getItem` | Read title/description (owner) |
| `swh_update_description` | `updateDescription` | `{ fileId, description }` — replaces whole body |
| `swh_update_title` | `updateTitle` | `{ fileId, title }` |
| `swh_repo_for_item` | *(GitHub)* | Resolve a fileId → its GitHub repo (repo-map.json) |
| `swh_find_issue` | *(GitHub)* | Search a repo's issues for dedup |
| `swh_create_issue` | *(GitHub)* | Create an issue for a triaged comment |

The `swh_*_issue` / `swh_repo_for_item` tools talk to the GitHub API directly
(no browser bridge) and need a `GITHUB_TOKEN` (PAT with `repo` scope) via
`.mcp.json` env or a gitignored `mcp/github_token.txt`. Steam item → repo comes
from [`mcp-config/repo-map.json`](mcp-config/repo-map.json).

## Comment triage routine

A draft-first routine reviews comments across all your items, classifies them
(bug / feature_request / qol / ignore), dedupes against existing issues, and —
after your approval — files issues and replies on Steam as you with the link.
It's defined in [`../docs/COMMENT-TRIAGE.md`](../docs/COMMENT-TRIAGE.md) and
scheduled locally per [`../docs/SCHEDULING.md`](../docs/SCHEDULING.md).

See [`../docs/API.md`](../docs/API.md) for argument/return shapes and the BBCode note.

## Setup

1. **Build the server:**
   ```bash
   cd mcp/server
   npm install
   npm run build
   ```
2. **Register it** with your MCP client. [`.mcp.json`](../.mcp.json) at the repo
   root already points at `mcp/server/build/index.js`. Adjust the path if your
   checkout differs.
3. **Install/reload the extension** (repo root as an unpacked extension) and open
   a `steamcommunity.com` tab. The extension auto-connects to the loopback
   bridge; a green ● badge means logged in.
4. **Call a tool**, e.g. `swh_get_auth`, then
   `swh_list_comments { "fileId": "3775191933" }`.

## Configuration

Defaults work out of the box (port `8766`). Override via environment (set in
`.mcp.json`) or [`mcp-config/config.json`](mcp-config/config.json):

| Setting | Env | Default |
| --- | --- | --- |
| Loopback port | `SWH_MCP_PORT` | `8766` |
| Loopback host | `SWH_MCP_HOST` | `127.0.0.1` |
| Tool call timeout (ms) | `SWH_MCP_CALL_TIMEOUT` | `30000` |

> The port must match the extension's `host_permissions` in
> [`../manifest.json`](../manifest.json). If you change it, update both.

## Packaging (.mcpb)

```powershell
cd mcp
.\pack-mcpb.ps1
```
Compiles, stages, installs production deps into the bundle, and verifies the
packed server completes an MCP handshake before zipping to
`steam-workshop-helper-mcp.mcpb`.

## Safety

`swh_delete_comment`, `swh_update_description`, and `swh_update_title` change
live public content and cannot be undone from here. Treat them as destructive:
read first (`swh_get_item` / `swh_list_comments`), confirm, then write.

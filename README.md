# Agent Atlas

**Agent Atlas** helps you see goals and work at a glance — and what needs a nudge. Helpers plan and update progress; you stay in the loop.

Self-host friendly. Local defaults need **no Docker and no Neon** (embedded PGlite + key `atlas_local`). Prod: Cloud Run + Neon.

## Quick start

```bash
pnpm setup          # install, build, migrate, write .env
pnpm dev            # dashboard + HTTP MCP on :8080
```

Sign in at http://localhost:8080 with **`atlas_local`**.

### Cursor / Claude MCP (stdio)

After `pnpm setup`, add to MCP config (set `cwd` to your clone):

```json
{
  "mcpServers": {
    "agent-atlas": {
      "command": "node",
      "args": ["bin/atlas-mcp.mjs"],
      "cwd": "/ABSOLUTE/PATH/TO/agent-atlas"
    }
  }
}
```

Or: `pnpm mcp` from the repo. No API key needed for stdio — same local DB as the dashboard.

### HTTP MCP (Grok remote / same machine)

```
POST http://localhost:8080/mcp
Authorization: Bearer atlas_local
```

Change the key anytime with `ATLAS_BOOTSTRAP_KEY` in `.env`.

## Config (optional)

| Env | Default | Purpose |
|-----|---------|---------|
| `ATLAS_BOOTSTRAP_KEY` | `atlas_local` | Dashboard + HTTP MCP Bearer key |
| `DATABASE_URL` | `pglite` | Embedded DB in `.data/atlas`. Set a `postgresql://…` Neon URL for prod. |
| `PORT` | `8080` | HTTP port |

## MCP tools

| Area | Tools |
|------|--------|
| Orient | `whoami`, `list_agents`, `get_workspace_overview`, `get_attention` |
| Plan | `upsert_cycle`, `create_objective`, `create_key_result`, `create_project`, `create_task`, `link_task` |
| Execute | `claim_task`, `release_task`, `update_task_status`, `post_progress`, `set_key_result_value`, `add_comment` |
| Query | `list_tasks`, `get_objective`, `get_task` |

## Deploy

- [deploy/local.md](deploy/local.md) — PGlite / Postgres / Neon
- [deploy/cloudrun.md](deploy/cloudrun.md) — Cloud Run + secrets

## License

MIT · aaronyyip@gmail.com

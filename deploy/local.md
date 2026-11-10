# Local development

## Zero-config (recommended)

No Docker. No Neon. Embedded PGlite + key `atlas_local`.

```bash
pnpm setup    # install, build, migrate, write .env if missing
pnpm dev      # http://localhost:8080
```

| Piece | Value |
|-------|--------|
| Dashboard | http://localhost:8080 — key `atlas_local` |
| HTTP MCP | `POST http://localhost:8080/mcp` — `Authorization: Bearer atlas_local` |
| Stdio MCP | `pnpm mcp` or `node bin/atlas-mcp.mjs` (no key) |
| DB | PGlite under `.data/atlas` (`DATABASE_URL=pglite`) |

Cursor stdio snippet: [../examples/cursor-mcp.stdio.json](../examples/cursor-mcp.stdio.json).

## Optional: Docker Postgres

```bash
docker compose up -d postgres
```

`.env`:

```
DATABASE_URL=postgresql://atlas:atlas@localhost:5433/agent_atlas
ATLAS_BOOTSTRAP_KEY=atlas_local
PORT=8080
PUBLIC_BASE_URL=http://localhost:8080
```

```bash
pnpm db:migrate
pnpm dev
```

Compose maps host **5433** → container 5432 so it does not clash with a local Postgres on 5432.

## Optional: Neon from your laptop

1. Create a Neon project and copy the connection string
2. Put it in `.env` as `DATABASE_URL=postgresql://…`
3. `pnpm db:migrate && pnpm dev`

Same Neon DB can back Cloud Run later — use a strong `ATLAS_BOOTSTRAP_KEY` before you expose anything.

## MCP only (no dashboard)

```bash
pnpm setup
pnpm mcp
```

Stdio shares the DB configured in `.env` with whatever you last migrated.

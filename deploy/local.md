# Local development

## Zero-config (recommended)

```bash
pnpm setup
pnpm dev
```

- DB: embedded **PGlite** at `.data/atlas` (no Docker)
- Key: **`atlas_local`**
- MCP: `node bin/atlas-mcp.mjs` (see `examples/cursor-mcp.json`)

## Optional: Postgres / Neon

Put a connection string in `.env`:

```
DATABASE_URL=postgresql://…
ATLAS_BOOTSTRAP_KEY=atlas_local
```

Or local Docker Postgres:

```bash
docker compose up -d postgres
# DATABASE_URL=postgresql://atlas:atlas@localhost:5433/agent_atlas
pnpm db:migrate
pnpm dev
```

## MCP only

```bash
pnpm setup
pnpm mcp
```

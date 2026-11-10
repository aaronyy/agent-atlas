# Agent Atlas

**Agent Atlas** helps you see goals and work at a glance — and what needs a nudge. Helpers plan and update progress; you stay in the loop.

| Surface | What it is |
|---------|------------|
| **Dashboard** | Browser UI at `/` — sign in with the bootstrap key |
| **HTTP MCP** | `POST /mcp` — Cursor, Grok, or any remote MCP client |
| **Stdio MCP** | `node bin/atlas-mcp.mjs` — local Cursor/Claude without HTTP |
| **DB** | Local: embedded PGlite. Prod: Neon Postgres |

Self-host friendly. Local defaults need **no Docker and no Neon**.

---

## Prerequisites

- **Node.js 22+**
- **pnpm 9** (`corepack enable` is enough)
- For Cloud Run: **gcloud**, **Docker**, a **GCP project**, and a **Neon** database

---

## 1. Local setup (dashboard + DB)

```bash
pnpm setup          # install, build, migrate, write .env
pnpm dev            # dashboard + HTTP MCP on :8080
```

Open **http://localhost:8080** and sign in with **`atlas_local`**.

`pnpm setup` creates `.env` if missing:

| Env | Default | Purpose |
|-----|---------|---------|
| `ATLAS_BOOTSTRAP_KEY` | `atlas_local` | Dashboard login + HTTP MCP Bearer token |
| `DATABASE_URL` | `pglite` | Embedded DB under `.data/atlas` |
| `PORT` | `8080` | HTTP port |
| `PUBLIC_BASE_URL` | `http://localhost:8080` | Canonical URL (MCP / links) |
| `WORKSPACE_NAME` | `Agent Atlas` | Display name |
| `STALE_HOURS` | `24` | Stale-work attention window |

Change the key anytime by editing `ATLAS_BOOTSTRAP_KEY` in `.env` and restarting.

### Optional: local Postgres instead of PGlite

```bash
docker compose up -d postgres
```

In `.env`:

```
DATABASE_URL=postgresql://atlas:atlas@localhost:5433/agent_atlas
ATLAS_BOOTSTRAP_KEY=atlas_local
```

Then:

```bash
pnpm db:migrate
pnpm dev
```

### Optional: point local at Neon

Create a Neon project → copy the connection string → set in `.env`:

```
DATABASE_URL=postgresql://USER:PASS@HOST/neondb?sslmode=require
```

Run `pnpm db:migrate` (or rely on server boot migrate) and `pnpm dev`. Prefer a non-owner role for anything internet-facing.

More detail: [deploy/local.md](deploy/local.md).

---

## 2. MCP clients (local)

### Cursor / Claude — stdio (recommended locally)

After `pnpm setup`, add to your MCP config. Set `cwd` to your clone:

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

Or run `pnpm mcp` from the repo. Stdio uses the same local DB as the dashboard and needs **no API key**.

Example file: [examples/cursor-mcp.stdio.json](examples/cursor-mcp.stdio.json).

### HTTP MCP (same machine / Grok)

With `pnpm dev` running:

```
POST http://localhost:8080/mcp
Authorization: Bearer atlas_local
```

Example: [examples/grok-mcp.json](examples/grok-mcp.json).

---

## 3. Production: Neon + Cloud Run

End state: one Cloud Run service serves the **dashboard** and **HTTP MCP**. Neon holds the data. Auth is the bootstrap Bearer key on `/mcp` and `/api/*` (static dashboard assets are public; data paths are not).

### 3.1 Neon

1. Create a project at [console.neon.tech](https://console.neon.tech)
2. Copy a Postgres connection string (`postgresql://…`)
3. Prefer a dedicated app role (not the Neon owner URL) for the runtime

### 3.2 GCP secrets

```bash
export PROJECT_ID=your-gcp-project
export REGION=us-central1

echo -n 'postgresql://…' | gcloud secrets create DATABASE_URL --data-file=- --project=$PROJECT_ID
echo -n "$(openssl rand -hex 32)" | gcloud secrets create ATLAS_BOOTSTRAP_KEY --data-file=- --project=$PROJECT_ID
```

Grant the Cloud Run runtime service account `roles/secretmanager.secretAccessor` on both secrets if deploy cannot read them.

### 3.3 Build, push, deploy

One-shot script (builds `linux/amd64`, deploys, sets `PUBLIC_BASE_URL`):

```bash
PROJECT_ID=your-gcp-project REGION=us-central1 ./deploy/cloudrun.sh
```

Or manually:

```bash
export IMAGE=gcr.io/$PROJECT_ID/agent-atlas:latest

gcloud auth configure-docker
docker build --platform=linux/amd64 -t $IMAGE .
docker push $IMAGE

# Public URL + in-app Bearer on data paths.
# Prefer --no-invoker-iam-check over --allow-unauthenticated (allUsers).
gcloud run deploy agent-atlas \
  --image=$IMAGE \
  --region=$REGION \
  --project=$PROJECT_ID \
  --no-allow-unauthenticated \
  --no-invoker-iam-check \
  --set-env-vars="STALE_HOURS=24,WORKSPACE_NAME=Agent Atlas" \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,ATLAS_BOOTSTRAP_KEY=ATLAS_BOOTSTRAP_KEY:latest" \
  --memory=512Mi \
  --cpu=1 \
  --max-instances=3
```

Then set the real service URL:

```bash
URL=$(gcloud run services describe agent-atlas --project=$PROJECT_ID --region=$REGION --format='value(status.url)')
gcloud run services update agent-atlas \
  --project=$PROJECT_ID --region=$REGION \
  --update-env-vars="PUBLIC_BASE_URL=${URL}"
```

Always build with `--platform=linux/amd64` from Apple Silicon; Cloud Run rejects arm64-only images.

### 3.4 Migrations

The container `CMD` runs DB migrate on boot, then starts the server. For a one-shot job instead, see [deploy/cloudrun.md](deploy/cloudrun.md).

### 3.5 Verify

| Check | How |
|-------|-----|
| Dashboard | Open `$URL/` → sign in with `ATLAS_BOOTSTRAP_KEY` |
| MCP | `POST $URL/mcp` with `Authorization: Bearer <key>` |
| Health | Unauthenticated calls to `/mcp` or `/api/*` must fail |

Full notes: [deploy/cloudrun.md](deploy/cloudrun.md).

---

## 4. Remote MCP after deploy

### Cursor (HTTP)

Copy [examples/cursor-mcp.json](examples/cursor-mcp.json):

```json
{
  "mcpServers": {
    "agent-atlas": {
      "url": "https://YOUR_CLOUD_RUN_URL/mcp",
      "headers": {
        "Authorization": "Bearer ${env:ATLAS_MCP_TOKEN}"
      }
    }
  }
}
```

Set `ATLAS_MCP_TOKEN` (or paste the key) to the same value as Cloud Run secret `ATLAS_BOOTSTRAP_KEY`.

### Grok / other HTTP clients

```
URL:     https://<cloud-run-url>/mcp
Header:  Authorization: Bearer <ATLAS_BOOTSTRAP_KEY>
```

---

## Architecture (prod)

```text
Browser / Cursor / Grok
  → Cloud Run (public edge, invoker check off)
      → Bearer ATLAS_BOOTSTRAP_KEY on /mcp and /api/*
      → Neon (DATABASE_URL from Secret Manager)
```

Do **not** expose a raw SQL / Postgres MCP with the Neon URL. Agent Atlas is a named tool surface plus app auth — not a database proxy.

---

## MCP tools

| Area | Tools |
|------|--------|
| Orient | `whoami`, `list_agents`, `get_workspace_overview`, `get_attention`, `get_operator_digest`, `get_intent_context` |
| Plan | `upsert_cycle`, `create_objective`, `create_key_result`, `create_project`, `create_task`, `link_task` |
| Intent | `upsert_principle`, `list_principles`, `upsert_tradeoff`, `list_tradeoffs`, `register_signal`, `ingest_signal`, `list_signals` |
| Execute | `get_next_work`, `claim_task`, `release_task`, `block_task`, `unblock_task`, `update_task_status`, `post_progress`, `set_key_result_value`, `add_comment` |
| Approvals | `propose_action`, `list_approvals`, `resolve_approval`, `intervene` |
| Autonomy | `update_agent_profile`, `record_outcome`, `list_autonomy_ledgers`, `resolve_autonomy_promotion` |
| Query | `list_tasks`, `get_objective`, `get_task` |

### Control-plane rules

- **Tasks** must link to a `key_result_id`, or set `unaligned=true` (surfaces in attention).
- **Done** requires `evidence_url` (PR, link, artifact).
- **Agents** pull work via `get_next_work` (ranked by KR lag × weight × priority).
- **High-risk** actions use `propose_action`; a human clears via `resolve_approval` / `intervene` / digest.
- **Autonomy** starts at T1 per action type; failures demote instantly; promotions need human approve.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm setup` | Install, build, migrate, write `.env` |
| `pnpm dev` | Dashboard + HTTP MCP |
| `pnpm mcp` | Stdio MCP server |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm build` | Build all packages |
| `./deploy/cloudrun.sh` | Build/push/deploy to Cloud Run |

---

## Deploy docs

- [deploy/local.md](deploy/local.md) — PGlite / Docker Postgres / Neon locally
- [deploy/cloudrun.md](deploy/cloudrun.md) — Cloud Run + secrets + migrate job

## License

MIT · aaronyyip@gmail.com

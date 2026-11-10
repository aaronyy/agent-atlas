# Deploy Agent Atlas to GCP Cloud Run + Neon

One service: dashboard at `/` + HTTP MCP at `/mcp`. Neon is the database. App auth is Bearer `ATLAS_BOOTSTRAP_KEY` on `/mcp` and `/api/*`.

## Checklist

- [ ] Neon project + connection string (prefer non-owner role)
- [ ] GCP project, `gcloud` auth, Docker
- [ ] Secrets `DATABASE_URL` and `ATLAS_BOOTSTRAP_KEY` in Secret Manager
- [ ] Image built for **linux/amd64**
- [ ] Deploy with public edge + **in-app** Bearer (not a raw DB proxy)
- [ ] `PUBLIC_BASE_URL` set to the live HTTPS URL
- [ ] Dashboard login works; unauthenticated `/mcp` fails

## 1. Neon

1. Create a project at [console.neon.tech](https://console.neon.tech)
2. Copy the connection string (`DATABASE_URL`)
3. Prefer a dedicated app role; do not put the Neon owner URL on a public edge if you can avoid it

## 2. Secrets

```bash
export PROJECT_ID=your-gcp-project
export REGION=us-central1

echo -n 'postgresql://…' | gcloud secrets create DATABASE_URL --data-file=- --project=$PROJECT_ID
echo -n "$(openssl rand -hex 32)" | gcloud secrets create ATLAS_BOOTSTRAP_KEY --data-file=- --project=$PROJECT_ID
```

To rotate later:

```bash
echo -n 'new-value' | gcloud secrets versions add DATABASE_URL --data-file=-
echo -n 'new-key' | gcloud secrets versions add ATLAS_BOOTSTRAP_KEY --data-file=-
```

Ensure the Cloud Run runtime service account can access both (`roles/secretmanager.secretAccessor`).

## 3. Build & push

```bash
export IMAGE=gcr.io/$PROJECT_ID/agent-atlas:latest

gcloud auth configure-docker
docker build --platform=linux/amd64 -t $IMAGE .
docker push $IMAGE
```

Or Artifact Registry:

```bash
export REPO=$REGION-docker.pkg.dev/$PROJECT_ID/agent-atlas/agent-atlas:latest
docker build --platform=linux/amd64 -t $REPO .
docker push $REPO
```

Always use `--platform=linux/amd64` from Apple Silicon; Cloud Run rejects arm64-only manifests.

## 4. Cloud Run

Fast path:

```bash
PROJECT_ID=your-gcp-project REGION=us-central1 ./deploy/cloudrun.sh
```

Manual:

```bash
# Intentional public edge: invoker IAM check off (URL reachable) + app Bearer
# on /mcp and /api/*. Prefer this over --allow-unauthenticated (allUsers).
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

URL=$(gcloud run services describe agent-atlas --project=$PROJECT_ID --region=$REGION --format='value(status.url)')
gcloud run services update agent-atlas \
  --project=$PROJECT_ID --region=$REGION \
  --update-env-vars="PUBLIC_BASE_URL=${URL}"
```

| Flag | Why |
|------|-----|
| `--no-allow-unauthenticated` | Avoids granting `allUsers` invoker |
| `--no-invoker-iam-check` | URL is reachable without a Google identity; **app** Bearer still required on data paths |
| Secrets for `DATABASE_URL` / `ATLAS_BOOTSTRAP_KEY` | Keep DSN and key out of git and image layers |

Dashboard static assets are public. `/mcp` and `/api/*` require the bootstrap key.

## 5. Migrations

The container `CMD` runs `node packages/db/dist/migrate.js` then starts the server. For a one-shot job instead, remove migrate from `CMD` and run:

```bash
gcloud run jobs create agent-atlas-migrate \
  --image=$IMAGE \
  --region=$REGION \
  --project=$PROJECT_ID \
  --command=node \
  --args=packages/db/dist/migrate.js \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest
```

## 6. Connect clients

| Client | Config |
|--------|--------|
| Browser | `$URL/` — sign in with `ATLAS_BOOTSTRAP_KEY` |
| Cursor HTTP | [../examples/cursor-mcp.json](../examples/cursor-mcp.json) — URL `$URL/mcp`, Bearer key |
| Grok / HTTP | `POST $URL/mcp` + `Authorization: Bearer <key>` |

Store the key in an env var (e.g. `ATLAS_MCP_TOKEN`) rather than committing it.

## 7. Security notes

- This is a **named MCP + dashboard**, not a Postgres bridge. Never attach a generic SQL MCP to the same Neon URL on the public internet.
- Rotate `ATLAS_BOOTSTRAP_KEY` if it leaks; redeploy or refresh the secret version and restart the service.
- Prefer private Cloud Run (invoker IAM **on**) if only Google-authenticated callers need access; then drop `--no-invoker-iam-check` and grant `roles/run.invoker` to those callers only.

# Deploy Agent Atlas to GCP Cloud Run + Neon

## 1. Neon

1. Create a project at [console.neon.tech](https://console.neon.tech)
2. Copy the connection string (`DATABASE_URL`)

## 2. Build & push image

```bash
export PROJECT_ID=your-gcp-project
export REGION=us-central1
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

Always build `--platform=linux/amd64` from Apple Silicon; Cloud Run rejects arm64-only manifests.

## 3. Cloud Run

```bash
# Intentional public edge: invoker IAM check off (URL reachable) + app Bearer
# auth on /mcp and /api/*. Prefer this over --allow-unauthenticated (allUsers).
gcloud run deploy agent-atlas \
  --image=$IMAGE \
  --region=$REGION \
  --no-allow-unauthenticated \
  --no-invoker-iam-check \
  --set-env-vars="PUBLIC_BASE_URL=https://YOUR_CLOUD_RUN_URL,STALE_HOURS=24,WORKSPACE_NAME=Agent Atlas" \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,ATLAS_BOOTSTRAP_KEY=ATLAS_BOOTSTRAP_KEY:latest" \
  --memory=512Mi \
  --cpu=1 \
  --max-instances=3
```

Create secrets first:

```bash
echo -n 'postgresql://...' | gcloud secrets create DATABASE_URL --data-file=-
echo -n 'atlas_your_long_random_key' | gcloud secrets create ATLAS_BOOTSTRAP_KEY --data-file=-
```

After first deploy, set `PUBLIC_BASE_URL` to the actual Cloud Run HTTPS URL and redeploy (or update env).

API key auth still protects `/mcp` and `/api/*` even if Cloud Run allows unauthenticated ingress.

## 4. Migrations

The container `CMD` runs `pnpm --filter @agent-atlas/db migrate` on boot. For a one-shot job instead, remove migrate from CMD and run:

```bash
gcloud run jobs create agent-atlas-migrate \
  --image=$IMAGE \
  --region=$REGION \
  --command=pnpm \
  --args=--filter,@agent-atlas/db,migrate \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest
```

## 5. Connect Grok / Cursor

See [../examples/](../examples/) for MCP config snippets. Use:

- URL: `https://<cloud-run-url>/mcp`
- Header: `Authorization: Bearer <ATLAS_BOOTSTRAP_KEY>`

#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   PROJECT_ID=my-proj REGION=us-central1 ./deploy/cloudrun.sh
#
# Prerequisites: gcloud auth, Docker, secrets DATABASE_URL + ATLAS_BOOTSTRAP_KEY

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-agent-atlas}"
IMAGE="${IMAGE:-gcr.io/${PROJECT_ID}/agent-atlas:latest}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Building $IMAGE (linux/amd64 for Cloud Run)"
docker build --platform=linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"

# Public edge + in-app Bearer auth on /mcp and /api/* (prefer invoker-check-off
# over allUsers invoker). Dashboard static assets are public; data paths require key.
echo "Deploying $SERVICE to Cloud Run ($REGION)"
gcloud run deploy "$SERVICE" \
  --project="$PROJECT_ID" \
  --image="$IMAGE" \
  --region="$REGION" \
  --no-allow-unauthenticated \
  --no-invoker-iam-check \
  --memory=512Mi \
  --cpu=1 \
  --max-instances=3 \
  --set-env-vars="STALE_HOURS=24,WORKSPACE_NAME=Agent Atlas" \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,ATLAS_BOOTSTRAP_KEY=ATLAS_BOOTSTRAP_KEY:latest"

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
echo "Service URL: $URL"
echo "Updating PUBLIC_BASE_URL…"
gcloud run services update "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="PUBLIC_BASE_URL=${URL}"

echo "Done. MCP: ${URL}/mcp"
echo "Dashboard: ${URL}/"

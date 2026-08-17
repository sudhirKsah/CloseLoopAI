#!/usr/bin/env bash
# Rebuild and redeploy CloseAI API only
# Usage: ./deploy/deploy-api.sh
set -euo pipefail

PROJECT_ID="closeloopai"
REGION="us-central1"
REGISTRY="us-central1-docker.pkg.dev/${PROJECT_ID}/closeloop"
ENV_DIR="$(dirname "$0")/env"

echo "[1/3] Building CloseAI API image..."
docker build -t "${REGISTRY}/api:latest" ./backend

echo "[2/3] Pushing image..."
docker push "${REGISTRY}/api:latest"

echo "[3/3] Deploying to Cloud Run..."
gcloud run deploy closeloop-api \
  --image="${REGISTRY}/api:latest" \
  --region="${REGION}" \
  --port=8080 \
  --timeout=300 \
  --min-instances=0 \
  --max-instances=3 \
  --memory=512Mi \
  --cpu=1 \
  --allow-unauthenticated \
  --env-vars-file="${ENV_DIR}/closeloop-api.yaml" \
  --project="${PROJECT_ID}"

API_URL=$(gcloud run services describe closeloop-api --region="${REGION}" --format="value(status.url)" --project="${PROJECT_ID}")
echo ""
echo "Deployed: ${API_URL}"
echo "Health: $(curl -s --max-time 10 "${API_URL}/health")"

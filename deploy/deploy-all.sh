#!/usr/bin/env bash
# Deploy all CloseLoop services to Google Cloud Run
# Usage: ./deploy/deploy-all.sh
set -euo pipefail

PROJECT_ID="closeloopai"
REGION="us-central1"
REGISTRY="us-central1-docker.pkg.dev/${PROJECT_ID}/closeloop"
ENV_DIR="$(dirname "$0")/env"

echo "=========================================="
echo "  CloseLoop AI — Full Deployment"
echo "=========================================="

# Check prerequisites
if ! command -v gcloud &>/dev/null; then
  echo "ERROR: gcloud CLI not installed. Install from https://cloud.google.com/sdk"
  exit 1
fi

if [[ -z "$(gcloud config get-value project 2>/dev/null)" ]]; then
  echo "ERROR: No project set. Run: gcloud config set project ${PROJECT_ID}"
  exit 1
fi

echo ""
echo "[1/5] Building and pushing Docker images..."
echo "  - CloseAI API..."
docker build -t "${REGISTRY}/api:latest" ./backend
docker push "${REGISTRY}/api:latest"

echo "  - kgmemory API..."
docker build -t "${REGISTRY}/kgmemory:latest" ../memory-pinchfast
docker push "${REGISTRY}/kgmemory:latest"

echo ""
echo "[2/5] Deploying CloseAI API to Cloud Run..."
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

echo ""
echo "[3/5] Deploying kgmemory API to Cloud Run..."
gcloud run deploy kgmemory-api \
  --image="${REGISTRY}/kgmemory:latest" \
  --region="${REGION}" \
  --port=8080 \
  --timeout=300 \
  --min-instances=0 \
  --max-instances=3 \
  --memory=1Gi \
  --cpu=1 \
  --allow-unauthenticated \
  --env-vars-file="${ENV_DIR}/kgmemory-api.yaml" \
  --project="${PROJECT_ID}"

echo ""
echo "[4/5] Recreating Cloud Run jobs..."
for job in closeloop-monitor closeloop-reports closeloop-sync; do
  gcloud run jobs delete "${job}" --region="${REGION}" --project="${PROJECT_ID}" --quiet 2>/dev/null || true
done

gcloud run jobs create closeloop-monitor \
  --image="${REGISTRY}/api:latest" \
  --region="${REGION}" \
  --command=python --args=run_job.py,monitor.organizations \
  --task-timeout=300 --max-retries=1 --memory=512Mi --cpu=1 \
  --env-vars-file="${ENV_DIR}/closeloop-job.yaml" \
  --project="${PROJECT_ID}"

gcloud run jobs create closeloop-reports \
  --image="${REGISTRY}/api:latest" \
  --region="${REGION}" \
  --command=python --args=run_job.py,reports.generate_weekly \
  --task-timeout=300 --max-retries=1 --memory=512Mi --cpu=1 \
  --env-vars-file="${ENV_DIR}/closeloop-job.yaml" \
  --project="${PROJECT_ID}"

gcloud run jobs create closeloop-sync \
  --image="${REGISTRY}/api:latest" \
  --region="${REGION}" \
  --command=python --args=run_job.py,integrations.sync_all \
  --task-timeout=300 --max-retries=1 --memory=512Mi --cpu=1 \
  --env-vars-file="${ENV_DIR}/closeloop-job.yaml" \
  --project="${PROJECT_ID}"

echo ""
echo "[5/5] Verifying deployment..."
API_URL=$(gcloud run services describe closeloop-api --region="${REGION}" --format="value(status.url)" --project="${PROJECT_ID}")
KG_URL=$(gcloud run services describe kgmemory-api --region="${REGION}" --format="value(status.url)" --project="${PROJECT_ID}")

echo "  CloseAI health: $(curl -s --max-time 10 "${API_URL}/health")"
echo "  kgmemory health: $(curl -s --max-time 10 "${KG_URL}/v1/health/")"

echo ""
echo "=========================================="
echo "  Deployment complete!"
echo "=========================================="
echo "  Frontend:    https://pathayo.com"
echo "  CloseAI API: ${API_URL}"
echo "  kgmemory API: ${KG_URL}"
echo ""
echo "  Next: update Vercel NEXT_PUBLIC_API_URL if API URL changed"
echo "=========================================="

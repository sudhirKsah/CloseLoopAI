#!/usr/bin/env bash
# Recreate Cloud Run jobs and Cloud Scheduler triggers
# Usage: ./deploy/deploy-jobs.sh
set -euo pipefail

PROJECT_ID="closeloopai"
REGION="us-central1"
REGISTRY="us-central1-docker.pkg.dev/${PROJECT_ID}/closeloop"
ENV_DIR="$(dirname "$0")/env"
SA="$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')-compute@developer.gserviceaccount.com"

echo "[1/2] Recreating Cloud Run jobs..."

# Delete existing jobs
for job in closeloop-monitor closeloop-reports closeloop-sync; do
  gcloud run jobs delete "${job}" --region="${REGION}" --project="${PROJECT_ID}" --quiet 2>/dev/null || true
done

# Create jobs
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
echo "[2/2] Recreating Cloud Scheduler triggers..."

# Delete existing schedules
for sched in closeloop-daily-monitor closeloop-weekly-reports closeloop-hourly-sync; do
  gcloud scheduler jobs delete "${sched}" --location="${REGION}" --project="${PROJECT_ID}" --quiet 2>/dev/null || true
done

# Create schedules
gcloud scheduler jobs create http closeloop-daily-monitor \
  --schedule="0 3 * * *" \
  --uri="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/closeloop-monitor:run" \
  --http-method=POST \
  --oauth-service-account-email="${SA}" \
  --location="${REGION}" --project="${PROJECT_ID}"

gcloud scheduler jobs create http closeloop-weekly-reports \
  --schedule="0 4 * * 5" \
  --uri="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/closeloop-reports:run" \
  --http-method=POST \
  --oauth-service-account-email="${SA}" \
  --location="${REGION}" --project="${PROJECT_ID}"

gcloud scheduler jobs create http closeloop-hourly-sync \
  --schedule="10 * * * *" \
  --uri="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/closeloop-sync:run" \
  --http-method=POST \
  --oauth-service-account-email="${SA}" \
  --location="${REGION}" --project="${PROJECT_ID}"

echo ""
echo "Jobs and schedules created."
echo "  - closeloop-monitor:   daily 3 AM UTC"
echo "  - closeloop-reports:   Friday 4 AM UTC"
echo "  - closeloop-sync:      hourly at :10"
echo ""
echo "Test a job manually:"
echo "  gcloud run jobs execute closeloop-monitor --region=${REGION} --project=${PROJECT_ID} --wait"

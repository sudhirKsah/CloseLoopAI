# CloseLoop AI — Deployment Guide

All services run on free tiers. Everything in `us-central1` to minimize latency.

## Architecture

```
Vercel (frontend, pathayo.com)
    ↓
Cloud Run: closeloop-api (scales to zero, 300s timeout)
Cloud Run: kgmemory-api  (scales to zero, 300s timeout)
Cloud Run Jobs: monitor / reports / sync (triggered by Cloud Scheduler)
    ↓
Neon PostgreSQL (us-east-1) — two separate projects for CloseAI and kgmemory
Upstash Redis (us-central1) — task queue, no polling
Compute Engine e2-micro (us-central1-a) — FalkorDB + SAQ worker, always on
```

## Live Deployment URLs

| Service | URL |
|---|---|
| Frontend | https://pathayo.com |
| CloseAI API | https://closeloop-api-59086497510.us-central1.run.app |
| kgmemory API | https://kgmemory-api-59086497510.us-central1.run.app |
| FalkorDB | 34.132.212.100:6379 (Compute Engine) |

## Prerequisites

- Google Cloud account with project `closeloopai`
- gcloud CLI installed and authenticated (`gcloud auth login`)
- Docker installed locally for building images
- Neon account (https://neon.tech)
- Upstash account (https://upstash.com)
- Vercel account (https://vercel.com)

---

## Step 1: Neon PostgreSQL

1. Create two Neon projects in AWS us-east-1 (closest to GCP us-central1)
2. Note the connection strings:
   ```
   CloseAI:  postgresql+psycopg://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
   kgmemory: postgres://user:pass@ep-xxx.neon.tech/neondb?ssl=require
   ```

   **Important:** asyncpg (used by Tortoise ORM in kgmemory) does NOT support
   `sslmode` or `channel_binding` params. Use `ssl=require` instead.
   SQLAlchemy/psycopg (CloseAI) uses `sslmode=require`.

3. Run migrations:
   ```bash
   # CloseAI
   cd backend && source venv/bin/activate
   DATABASE_URL="postgresql+psycopg://..." alembic upgrade head

   # kgmemory
   cd memory-pinchfast && source .venv/bin/activate
   DATABASE_URI="postgres://..." aerich upgrade
   ```

---

## Step 2: Upstash Redis

1. Create an Upstash Redis database in us-central1
2. Note the connection URL (use `rediss://` for TLS):
   ```
   rediss://default:xxxxx@us1-xxx.upstash.io:6379
   ```
3. Free tier = 10K commands/day. Our architecture only touches Redis
   when API requests enqueue tasks or Cloud Run jobs process them.

---

## Step 3: Compute Engine — FalkorDB + SAQ Worker

### Create the VM

```bash
gcloud compute instances create falkordb-worker \
  --zone=us-central1-a \
  --machine-type=e2-micro \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-size=20GB \
  --tags=falkordb \
  --project=closeloopai
```

### Open firewall for FalkorDB

```bash
gcloud compute firewall-rules create allow-falkordb \
  --network=default \
  --allow=tcp:6379 \
  --source-ranges=0.0.0.0/0 \
  --target-tags=falkordb \
  --project=closeloopai
```

> **Security note:** For production, replace `0.0.0.0/0` with Cloud Run's
> egress IP range or use a VPC connector.

### Set up the VM

```bash
# SSH into the VM
gcloud compute ssh falkordb-worker --zone=us-central1-a --project=closeloopai

# Install Docker
sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER  # log out and back in

# Copy source code to VM (from your local machine)
tar czf /tmp/kgmemory-src.tar.gz --exclude='.venv' --exclude='.git' --exclude='__pycache__' --exclude='.env' kgmemory pyproject.toml uv.lock manage.py gunicorn.conf.py docker-compose.worker.yml Dockerfile
gcloud compute scp /tmp/kgmemory-src.tar.gz falkordb-worker:~/ --zone=us-central1-a --project=closeloopai

# On the VM: extract and create .env
mkdir -p ~/memory-pinchfast && cd ~/memory-pinchfast
tar xzf ~/kgmemory-src.tar.gz
# Create .env with production values (see kgmemory env vars section below)

# Start FalkorDB + worker
sudo docker compose -f docker-compose.worker.yml up -d --build
```

### Note the VM's external IP for Cloud Run env vars

```bash
gcloud compute instances describe falkordb-worker --zone=us-central1-a --format="value(networkInterfaces[0].accessConfigs[0].natIP)" --project=closeloopai
```

---

## Step 4: Deploy CloseAI Backend to Cloud Run

### Build and push the image

```bash
cd backend

# Configure Docker for GCP (one-time)
gcloud auth configure-docker us-central1-docker.pkg.dev

# Create Artifact Registry repo (one-time)
gcloud artifacts repositories create closeloop \
  --repository-format=docker \
  --location=us-central1 \
  --project=closeloopai

# Build and push
docker build -t us-central1-docker.pkg.dev/closeloopai/closeloop/api:latest .
docker push us-central1-docker.pkg.dev/closeloopai/closeloop/api:latest
```

### Deploy the API service

```bash
gcloud run deploy closeloop-api \
  --image=us-central1-docker.pkg.dev/closeloopai/closeloop/api:latest \
  --region=us-central1 \
  --port=8080 \
  --timeout=300 \
  --min-instances=0 \
  --max-instances=3 \
  --memory=512Mi \
  --cpu=1 \
  --allow-unauthenticated \
  --env-vars-file=deploy/env/closeloop-api.yaml \
  --project=closeloopai
```

---

## Step 5: Deploy memory-pinchfast API to Cloud Run

```bash
cd memory-pinchfast

# Build and push
docker build -t us-central1-docker.pkg.dev/closeloopai/closeloop/kgmemory:latest .
docker push us-central1-docker.pkg.dev/closeloopai/closeloop/kgmemory:latest

# Deploy
gcloud run deploy kgmemory-api \
  --image=us-central1-docker.pkg.dev/closeloopai/closeloop/kgmemory:latest \
  --region=us-central1 \
  --port=8080 \
  --timeout=300 \
  --min-instances=0 \
  --max-instances=3 \
  --memory=1Gi \
  --cpu=1 \
  --allow-unauthenticated \
  --env-vars-file=deploy/env/kgmemory-api.yaml \
  --project=closeloopai
```

> **Note:** kgmemory needs 1Gi memory (not 512Mi) because Gunicorn + Tortoise
> ORM + FalkorDB client use more memory than CloseAI.

### Update CloseAI with kgmemory URL

After both services are deployed, update CloseAI's `KGMEMORY_BASE_URL`:
```bash
gcloud run services update closeloop-api \
  --region=us-central1 \
  --update-env-vars="KGMEMORY_BASE_URL=https://kgmemory-api-XXXX.run.app/v1" \
  --project=closeloopai
```

---

## Step 6: Deploy Cloud Run Jobs (cron tasks)

```bash
# Create jobs (uses same image as API, but with CELERY_ALWAYS_EAGER=true)
gcloud run jobs create closeloop-monitor \
  --image=us-central1-docker.pkg.dev/closeloopai/closeloop/api:latest \
  --region=us-central1 \
  --command=python \
  --args=run_job.py,monitor.organizations \
  --task-timeout=300 --max-retries=1 --memory=512Mi --cpu=1 \
  --env-vars-file=deploy/env/closeloop-job.yaml \
  --project=closeloopai

gcloud run jobs create closeloop-reports \
  --image=us-central1-docker.pkg.dev/closeloopai/closeloop/api:latest \
  --region=us-central1 \
  --command=python \
  --args=run_job.py,reports.generate_weekly \
  --task-timeout=300 --max-retries=1 --memory=512Mi --cpu=1 \
  --env-vars-file=deploy/env/closeloop-job.yaml \
  --project=closeloopai

gcloud run jobs create closeloop-sync \
  --image=us-central1-docker.pkg.dev/closeloopai/closeloop/api:latest \
  --region=us-central1 \
  --command=python \
  --args=run_job.py,integrations.sync_all \
  --task-timeout=300 --max-retries=1 --memory=512Mi --cpu=1 \
  --env-vars-file=deploy/env/closeloop-job.yaml \
  --project=closeloopai
```

### Schedule with Cloud Scheduler (3 jobs max on free tier)

```bash
SA="59086497510-compute@developer.gserviceaccount.com"

# Daily monitoring at 3 AM UTC
gcloud scheduler jobs create http closeloop-daily-monitor \
  --schedule="0 3 * * *" \
  --uri="https://run.googleapis.com/v2/projects/closeloopai/locations/us-central1/jobs/closeloop-monitor:run" \
  --http-method=POST \
  --oauth-service-account-email=$SA \
  --location=us-central1 --project=closeloopai

# Weekly reports on Friday at 4 AM UTC
gcloud scheduler jobs create http closeloop-weekly-reports \
  --schedule="0 4 * * 5" \
  --uri="https://run.googleapis.com/v2/projects/closeloopai/locations/us-central1/jobs/closeloop-reports:run" \
  --http-method=POST \
  --oauth-service-account-email=$SA \
  --location=us-central1 --project=closeloopai

# Hourly sync at :10
gcloud scheduler jobs create http closeloop-hourly-sync \
  --schedule="10 * * * *" \
  --uri="https://run.googleapis.com/v2/projects/closeloopai/locations/us-central1/jobs/closeloop-sync:run" \
  --http-method=POST \
  --oauth-service-account-email=$SA \
  --location=us-central1 --project=closeloopai
```

---

## Step 7: Deploy Frontend to Vercel

1. Connect the GitHub repo to Vercel
2. Set build root to `frontend`
3. Set environment variable:
   ```
   NEXT_PUBLIC_API_URL=https://closeloop-api-XXXX.run.app/api/v1
   ```
4. Deploy

### Custom domain (pathayo.com)

1. In Vercel → Project → Settings → Domains
2. Add `pathayo.com` and `www.pathayo.com`
3. Add DNS records at your domain registrar:
   ```
   A     @           76.76.21.21
   CNAME www         cname.vercel-dns.com
   ```

---

## Step 8: Run Database Migrations

### CloseAI backend

```bash
cd backend && source venv/bin/activate
DATABASE_URL="postgresql+psycopg://user:pass@ep-xxx.neon.tech/neondb?sslmode=require" alembic upgrade head
```

### memory-pinchfast

```bash
cd memory-pinchfast && source .venv/bin/activate
DATABASE_URI="postgres://user:pass@ep-xxx.neon.tech/neondb?ssl=require" aerich upgrade
```

---

## Deploy Scripts

Automated deploy scripts are in `deploy/`:
- `deploy/deploy-all.sh` — full redeploy (build, push, deploy all services + jobs)
- `deploy/deploy-api.sh` — rebuild and redeploy CloseAI API only
- `deploy/deploy-kgmemory.sh` — rebuild and redeploy kgmemory API only
- `deploy/deploy-jobs.sh` — recreate Cloud Run jobs
- `deploy/update-vm.sh` — update code on Compute Engine VM and restart worker

---

## Verification Checklist

- [ ] `curl https://closeloop-api-XXXX.run.app/health` returns `{"status":"ok"}`
- [ ] `curl https://kgmemory-api-XXXX.run.app/v1/health/` returns healthy
- [ ] Frontend loads at https://pathayo.com
- [ ] Signup works and sends verification email
- [ ] Login works and dashboard loads
- [ ] kg-memory connection shows as connected in settings
- [ ] Cloud Scheduler jobs show as successful in GCP console
- [ ] FalkorDB worker running on Compute Engine (`docker compose ps`)

---

## Free Tier Limits

| Service | Free tier | Our usage |
|---|---|---|
| Cloud Run services | 50 vCPU-hrs/mo | ~5 hrs (request-driven) |
| Cloud Run jobs | same pool | ~1 hr (seconds per run) |
| Cloud Scheduler | 3 jobs | 3 jobs |
| Compute Engine e2-micro | always free (us-central1) | 24/7 FalkorDB |
| Neon PostgreSQL | 0.5 GB | small data |
| Upstash Redis | 10K commands/day | ~500/day (no polling) |
| Vercel | 100 GB bandwidth | low traffic |
| Gemini API | 1500 req/day | low volume |

---

## Troubleshooting

### Container fails to start on Cloud Run

Check logs:
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=SERVICE_NAME" --limit=20 --format="value(textPayload)" --project=closeloopai
```

Common causes:
- **`uvicorn: not found`** — use `python -m uvicorn` in Dockerfile CMD
- **Missing Python packages** — check requirements.txt has all imports
- **Memory limit exceeded** — increase `--memory` or reduce Gunicorn workers
- **Pydantic validation error** — check env var values match schema (e.g. `ENVIRONMENT` must be `dev` or `prod`, not `production`)

### Cloud Run can't reach FalkorDB

Cloud Run cannot access Compute Engine internal IPs directly. Use the external IP:
```bash
gcloud compute instances describe falkordb-worker --zone=us-central1-a --format="value(networkInterfaces[0].accessConfigs[0].natIP)" --project=closeloopai
```

Set `FALKORDB_HOST` to this external IP in the kgmemory Cloud Run env vars.

### CORS errors

CORS errors with a 500 status code mean the request failed before CORS headers
were added. Check the actual error in Cloud Logging — fixing the 500 will fix
the CORS error.

### asyncpg connection errors

asyncpg (Tortoise ORM) does not support `sslmode` or `channel_binding` params.
Use `ssl=require` instead of `sslmode=require` in the connection string.

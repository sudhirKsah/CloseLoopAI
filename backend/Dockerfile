FROM python:3.12-slim AS builder

WORKDIR /tmp

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --target=/install -r requirements.txt

FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local/lib/python3.12/site-packages/

COPY . /app

EXPOSE 8080

# Default: run the API server (Cloud Run service)
# Override with: python run_job.py <task_name>  (Cloud Run job)
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 2 --timeout-keep-alive 300"]

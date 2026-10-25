# Recurance worker: the Python pipeline, run on a schedule (scripts/scheduler.py).
# Build from the repository root:  docker build -f deploy/worker.Dockerfile .
FROM python:3.11-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY pipeline ./pipeline
COPY scripts ./scripts
ENV PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8
# data/ (SQLite working database, ledger, caches) is mounted as a volume.
CMD ["python", "scripts/scheduler.py"]

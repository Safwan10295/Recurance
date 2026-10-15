#!/usr/bin/env bash
# Wait for the ingestion loop, then run the rest of the pipeline and rebuild the site.
cd "$(dirname "$0")/.."
until grep -q "=== loop done" data/logs/incremental.log 2>/dev/null; do sleep 30; done
echo "=== finish_pipeline start $(date +%T)"
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe scripts/finish_pipeline.py 2>&1 | grep -vE "^\[(A|B|C)\] |ToUnicode|\[pdftext\]"
echo "=== docs and checks $(date +%T)"
.venv/Scripts/python.exe scripts/write_evaluation_md.py
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe scripts/check_demo_chains.py
echo "=== web build $(date +%T)"
(cd web && npm run build 2>&1 | tail -25)
echo "=== after_ingest done $(date +%T)"

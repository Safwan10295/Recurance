#!/usr/bin/env bash
# Run the orchestrator from a given step, then docs, checks and the web build. Logs are unbuffered.
cd "$(dirname "$0")/.."
FROM="${1:-responses}"
echo "=== finish_pipeline from $FROM $(date +%T)"
PYTHONIOENCODING=utf-8 PYTHONUNBUFFERED=1 .venv/Scripts/python.exe -u scripts/finish_pipeline.py --from "$FROM"
echo "=== docs and checks $(date +%T)"
.venv/Scripts/python.exe scripts/write_evaluation_md.py
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe scripts/check_demo_chains.py
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe -m pipeline.cli dossiers-export
echo "=== web build $(date +%T)"
(cd web && npm run build 2>&1 | tail -25)
echo "=== run_rest done $(date +%T)"

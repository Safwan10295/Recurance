#!/usr/bin/env bash
# Run both secret scans on what is staged. Exits non-zero on any finding.
set -euo pipefail
cd "$(dirname "$0")/.."
.venv/Scripts/python.exe scripts/secret_scan.py
GL="${GITLEAKS:-$HOME/go/bin/gitleaks.exe}"
"$GL" protect --staged --redact --no-banner
echo "precommit: both scans clean"

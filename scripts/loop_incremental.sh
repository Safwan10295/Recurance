#!/usr/bin/env bash
# Repeat the incremental pass while the scraper runs, then one final pass.
cd "$(dirname "$0")/.."
alive() { powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { \$_.CommandLine -like '*pipeline.scrape.run*' }).Count" | tr -d '\r'; }
while [ "$(alive)" != "0" ] && [ -n "$(alive)" ]; do
  echo "=== pass $(date +%T)"
  PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe scripts/incremental.py "${1:-0.00014}" 2>&1 | grep -vE "^\[A\]|ToUnicode|\[pdftext\]"
  sleep 60
done
echo "=== final pass $(date +%T)"
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe scripts/incremental.py "${1:-0.00014}" 2>&1 | grep -vE "^\[A\]|ToUnicode|\[pdftext\]"
echo "=== loop done $(date +%T)"

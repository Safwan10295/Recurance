#!/usr/bin/env bash
# Run once before making the repo public. Removes files with unredacted or unreviewed text
# from every earlier commit (they were committed locally before being gitignored).
# This rewrites local history; it is safe because nothing has been pushed yet.
set -euo pipefail
cd "$(dirname "$0")/.."
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch data/exports/hand_labels.csv data/exports/systemic.json data/exports/dossiers_for_review.md' \
  --prune-empty -- --all
rm -rf .git/refs/original
git reflog expire --expire=now --all
git gc --prune=now
echo "purged; check with: git log --all --oneline -- data/exports/hand_labels.csv data/exports/systemic.json"

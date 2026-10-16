#!/usr/bin/env bash
# Back up Recurrence Watch on the server: a PostgreSQL dump and an archive of data/ (the source of truth).
# Run from deploy/:  bash backup.sh      Keeps the last 7 of each in ~/rw-backups. Copy them off the server too.
set -euo pipefail
cd "$(dirname "$0")"
DEST="${BACKUP_DIR:-$HOME/rw-backups}"
STAMP="$(date +%F-%H%M)"
mkdir -p "$DEST"

docker compose --env-file .env exec -T db pg_dump -U rw recurrence | gzip > "$DEST/rw-db-$STAMP.sql.gz"
echo "database: $DEST/rw-db-$STAMP.sql.gz ($(du -h "$DEST/rw-db-$STAMP.sql.gz" | cut -f1))"

# Pause the worker so the SQLite files are not mid-write, then archive data/.
docker compose --env-file .env stop worker >/dev/null
tar -czf "$DEST/rw-data-$STAMP.tar.gz" -C .. data
docker compose --env-file .env start worker >/dev/null
echo "data:     $DEST/rw-data-$STAMP.tar.gz ($(du -h "$DEST/rw-data-$STAMP.tar.gz" | cut -f1))"

# Keep the last 7 of each.
ls -1t "$DEST"/rw-db-*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm --
ls -1t "$DEST"/rw-data-*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm --
echo "done"

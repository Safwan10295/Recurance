#!/bin/bash
# Runs once, when the database volume is first created.
# Creates pgvector and a restricted role for the web app (rw_web). The pipeline's publish step
# grants rw_web SELECT on the published tables and write access to brief_kv only.
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE EXTENSION IF NOT EXISTS vector;
DO \$\$BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rw_web') THEN
    CREATE ROLE rw_web LOGIN PASSWORD '${WEB_DB_PASSWORD}';
  END IF;
END\$\$;
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO rw_web;
GRANT USAGE ON SCHEMA public TO rw_web;
SQL

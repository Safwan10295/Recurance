# Running Recurrence Watch on a server

One Linux server runs four containers with Docker Compose:

- db: PostgreSQL 16 with pgvector. The site reads from here.
- web: the Next.js app. It connects as a restricted role that can read the published tables and write only the live brief's store.
- worker: the Python pipeline. It publishes on first boot, then refreshes from judiciary.uk on a schedule and republishes.
- caddy: HTTPS in front of the web app.

The target is a small CPU virtual machine on Nebius AI Cloud. Any Linux VPS works the same way.

## 1. Create the server

1. In the Nebius AI Cloud console, create a Compute virtual machine with no GPU. 4 vCPUs, 16 GB memory and a 100 GB disk is comfortable.
2. Choose an Ubuntu 22.04 or 24.04 image.
3. Give it a public IP address and add your SSH key.
4. Allow inbound ports 22, 80 and 443.

## 2. Install Docker

SSH in, then:

```
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Log out and back in so the group change applies.

## 3. Copy the code and data

On your own PC, from the repository root, build the data archive (about 320 MB, 1.3 GB unpacked):

```
python scripts/pack_server_data.py
```

It holds the SQLite working database, the ledger with the paid-call cache, the scraped pages and the PDF text cache. Copy the code and the archive to the server:

```
git clone <repo-url> recurrence-watch
scp server-data.tar.gz <user>@<server-ip>:recurrence-watch/
```

On the server, unpack it into the repository root, which creates data/:

```
cd recurrence-watch
tar -xzf server-data.tar.gz
```

## 4. Configure

```
cd deploy
cp .env.example .env
nano .env
```

Fill in:

- POSTGRES_PASSWORD and WEB_DB_PASSWORD: two long random strings of letters and digits. Generate one with `openssl rand -hex 24`.
- SITE_ADDRESS: your domain, or the server's IP written with dashes plus .sslip.io (for example 203-0-113-5.sslip.io). Caddy gets an HTTPS certificate for either. Use :80 for plain HTTP while testing.
- NEBIUS_LIVE_API_KEY: a Token Factory key made only for the hosted live brief. Without it the site works and the brief shows a paused notice.
- NEBIUS_API_KEY, TAVILY_API_KEY and SCRAPER_CONTACT_EMAIL: used by the worker's scheduled refresh.
- CORRECTIONS_EMAIL and REPO_URL: shown on the methodology page.

The live brief's limits (LIVE_*) and the refresh schedule (REFRESH_*) have working defaults.

## 5. Start

```
docker compose --env-file .env up -d --build
docker compose logs -f worker
```

On first boot the worker publishes data/recurrence.sqlite into Postgres. Wait for it to log `publish` counts (two to five minutes). Until then pages say they could not load just now.

Check the site:

```
curl -s https://<SITE_ADDRESS>/api/health
```

## 6. Day to day

- Refresh: the worker runs scripts/refresh.py every REFRESH_EVERY_HOURS (default weekly), with REFRESH_MAX_SPEND as the ceiling for each run, then republishes. The site picks up new data within two minutes, with no rebuild.
- Refresh now: `docker compose exec worker python scripts/refresh.py --max-spend 0.50`
- Pause the live brief: set LIVE_BRIEF_PAUSED=1 in .env, then `docker compose up -d web`.
- Pause refreshes: set REFRESH_PAUSED=1, then `docker compose up -d worker`.
- Update the code: `git pull`, then `docker compose --env-file .env up -d --build`.

## 7. Backups

data/ is the source of truth. Postgres holds only published copies, which `python -m pipeline.cli publish` rebuilds, plus the live brief's cache and spend counters.

```
docker compose stop worker
tar -czf ~/rw-data-$(date +%F).tar.gz -C .. data
docker compose start worker
docker compose exec -T db pg_dump -U rw recurrence | gzip > ~/rw-db-$(date +%F).sql.gz
```

Copy both files off the server.

## Notes

- The database port is not exposed outside Docker.
- The initdb script runs only when the database volume is first created. To change WEB_DB_PASSWORD later, run `ALTER ROLE rw_web PASSWORD '...'` in `docker compose exec db psql -U rw recurrence`.
- Starting from empty: `docker compose down -v` removes the database volume. The next start publishes again from data/.

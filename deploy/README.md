# Running Recurance on a server

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
- SITE_URL: the same address with https:// in front. Share previews of chain pages use it.
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
bash backup.sh
```

It writes a database dump and an archive of data/ to ~/rw-backups and keeps the last 7 of each. Copy them off the server, for example with scp to your own machine. To run it every night at 03:00, add this line with `crontab -e`:

```
0 3 * * * cd /home/<user>/recurrence-watch/deploy && bash backup.sh >> ~/rw-backups/backup.log 2>&1
```

## 8. Check it works

```
bash smoke.sh https://<SITE_ADDRESS>
```

It checks every page, the not-found and redirect codes, the APIs, the health check and one live agent run (about $0.006, or nothing if that brief is already saved). Add --no-agent to skip the live run.

For outside monitoring, add https://<SITE_ADDRESS>/api/health to a free uptime checker (UptimeRobot or Better Stack) with a 5-minute interval. It returns 200 when the database is up and data is published, and 503 otherwise.

## 9. Runbook, 1 to 15 December

1. On 1 Dec, run smoke.sh and open the site on a phone.
2. Each morning, glance at the uptime checker. If it is down, run `docker compose ps`, then `docker compose logs --tail 50 web`, then `docker compose up -d`.
3. Each Monday, after the weekly refresh, check the "Data updated" date in the sidebar.
4. If live spend looks high, check it with `docker compose exec db psql -U rw recurrence -c "select key, value from brief_kv where key like 'spend%' or key like 'tavily-credits%'"`. To stop live calls at once, set LIVE_BRIEF_PAUSED=1 in .env, then run `docker compose up -d web`. The site keeps working, and the brief shows examples instead.
5. If the agent misbehaves, set LIVE_AGENT=off. The brief falls back to the fixed pipeline.
6. Before changing anything, run backup.sh.
7. After 15 Dec, set LIVE_BRIEF_PAUSED=1, then delete the live key in the Token Factory console.

## Notes

- The database port is not exposed outside Docker.
- The initdb script runs only when the database volume is first created. To change WEB_DB_PASSWORD later, run `ALTER ROLE rw_web PASSWORD '...'` in `docker compose exec db psql -U rw recurrence`.
- Starting from empty: `docker compose down -v` removes the database volume. The next start publishes again from data/.

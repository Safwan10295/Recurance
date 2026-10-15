# Deploying the web app

Nothing here has been run yet. These are the steps for Pilot.

## What the deployed app needs

1. A separate Nebius Token Factory key for the live brief. Never the pipeline key.
2. A Supabase project for the live brief's cache, ledger and daily limits.
3. A Vercel project pointing at the web/ folder.

Pages render from the JSON in web/data/, so they work even if the live brief is paused.

## Step 1: create the live key

1. In the Token Factory console, create a new API key named recurrence-watch-live.
2. Keep it out of every file in the repo. It goes only into Vercel.
3. Token Factory has no per-key spend limit, so the app enforces its own ceiling (step 4).

## Step 2: Supabase

1. Open the Supabase project, then the SQL editor.
2. Run only the section of pipeline/db/schema_postgres.sql under "Web app: key-value store".
3. From Project settings, API, copy the project URL and the service role key.
4. The service role key is server-side only. It must never be given a NEXT_PUBLIC_ name.

## Step 3: Vercel project

1. Import the GitHub repo in Vercel.
2. Set Root Directory to web.
3. Framework preset: Next.js. Build command and output: defaults.

## Step 4: environment variables in Vercel

| Name | Value |
|---|---|
| NEBIUS_LIVE_API_KEY | the key from step 1 |
| SUPABASE_URL | from step 2 |
| SUPABASE_SERVICE_ROLE_KEY | from step 2 |
| SCRAPER_CONTACT_EMAIL | contact address sent in the User-Agent when the brief reads a report page |
| LIVE_COST_CEILING_USD | 4.50 (stops live calls before the $5 reserve is used) |
| LIVE_GLOBAL_DAILY_CAP | 40 |
| LIVE_PER_IP_DAILY_CAP | 5 |
| NEXT_PUBLIC_CORRECTIONS_EMAIL | the corrections address shown on the methodology page |
| NEXT_PUBLIC_REPO_URL | the public GitHub URL |

## Step 5: deploy and test

1. Deploy from Vercel.
2. Open /brief and run one known report, for example a smart motorways report.
3. Run the same input again. The second run should say it used a saved brief and cost nothing.
4. In Supabase, check rw_kv for spend:total and today's count key.

## How the live brief degrades

1. No live key, or no Supabase on Vercel: the brief shows "paused" with precomputed examples.
2. Daily cap, per-IP cap or cost ceiling reached: the same paused message, with the reason.
3. Any error during a run: the same paused message. Judges never see an error page.
4. To pause it by hand, set LIVE_BRIEF_PAUSED to 1 and redeploy.

## Refreshing the data

1. Run the pipeline locally (README, "Running the pipeline").
2. Run python -m pipeline.cli export. This rewrites web/data/.
3. Commit web/data/ and push. Vercel rebuilds.

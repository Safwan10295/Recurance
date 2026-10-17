# Submission checklist (deadline 29 Oct)

Status as of 16 Oct 2026. "Pilot" marks steps only Pilot can do.

## Handoff section 12

| Step | Status |
|---|---|
| 1. Repo public, MIT licence in About, secret scan clean, .env never committed | Scans clean on every commit; .env never committed; private files purged from history. Making it public: Pilot, below |
| 2. README: what, why, setup, pipeline, Nemotron routing and ledger, Tavily, prior art, limitations | Done |
| 3. Demo URL live, live brief limits in place, graceful degradation tested | Limits and fallback tested locally and in Docker. Server and URL: Pilot (deploy/README.md) |
| 4. YouTube video public, under 3 minutes | Shot list ready (docs/VIDEO_SHOT_LIST.md). Recording and upload: Pilot |
| 5. Devpost form with feedback from docs/FEEDBACK.md | Text ready (docs/DEVPOST_DRAFT.md, docs/FEEDBACK.md). Submitting: Pilot |
| 6. Final spend report, live reserve intact | In docs/MORNING_REPORT.md. The $5 live reserve has not been touched |

## Definition of done

| Item | Status |
|---|---|
| At least 3 human-reviewed chains with quotes, promises and follow-up | Done: 6 approved (smart motorways, emollients, platform ends, prison first aid, young drivers, patient records) |
| Live brief works on a real new report within limits | Done, with the tool-calling agent and the fixed pipeline as fallback |
| Evaluation shows the Nemotron stage beating the baselines, with numbers | Done, with 95% intervals and every miss explained. Precision waits on hand labels (optional) |
| Total Nebius spend under $20, live reserve untouched | Done |

## Making the repo public (Pilot, when you submit)

The three private files were purged from history on 16 Oct, and the repo was pushed to GitHub as private. They stay git-ignored.

1. Check that they are still absent from history. This should print nothing:

```
git log --all --oneline -- data/exports/hand_labels.csv data/exports/systemic.json data/exports/dossiers_for_review.md
```

2. Scan the whole history for secrets. It should say "no leaks found":

```
gitleaks detect --config .gitleaks.toml
```

3. On GitHub, open Settings, then change the visibility to public.
4. In the repository's About panel, check that the licence shows as MIT.

## Before submitting (Pilot)

1. The credit expiry date, if you can find it in the Token Factory console (Billing or Credits). It cannot be read from the API (docs/RESEARCH_LOG.md).
2. A separate Token Factory key for the server, set as NEBIUS_LIVE_API_KEY in deploy/.env only.
3. The demo URL opens on a phone and a laptop, and `bash smoke.sh https://<address>` passes.
4. The video is public on YouTube and under 3 minutes.
5. The Devpost form: Best Apps and Agents track, the three links, the description, and the feedback field.

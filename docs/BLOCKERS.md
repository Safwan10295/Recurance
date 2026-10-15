# Blocker notes

Every blocker hit during the unattended run, what was done, and the result. All are resolved.

## B1. Stage A pilot below 90% quote verification (resolved)

- When: 2026-10-15, about 01:45.
- What: the a2 pilot on 20 hard reports verified 47 of 56 quotes (84%).
- Action: Stage A paused, causes found, deterministic fixes made (DECISIONS D12).
- Result: 56 of 56 verified on re-check. Stage A resumed. No extra spend.

## B2. First orchestrator run stopped at the responses step (resolved)

- When: 2026-10-15, about 04:23.
- What: one corrupt response PDF raised a PDFium error during text extraction. The step stopped before saving any response text, and its open transaction then locked the database ("database is locked") for Stage C and chain building.
- Effect: Stage B found nothing to do, Stage C did not run, and later steps ran on empty inputs. Spend was negligible ($0.04, mostly cached work).
- Fix: corrupt PDFs now give empty text instead of an error, response text is committed as it goes, connections wait up to 30 seconds for a lock, and a failed step's connections are released.
- Result: the orchestrator was re-run from the responses step. Fetched PDFs and earlier model calls were reused from cache.

## B3. Stage C pilot at 85% quote verification (resolved)

- When: 2026-10-15, about 04:55.
- What: 17 of 20 pilot verdicts verified. The full run was skipped automatically.
- Cause and fix: DECISIONS D16. The optional promise quote no longer fails a verdict, and coroner template lines are no longer treated as promises.
- Result: the re-pilot verified 20 of 20, and the full run then verified 98.5%.

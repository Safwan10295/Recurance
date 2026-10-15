# Blocker notes

## B1. Stage A pilot below 90% quote verification (resolved)

- When: 2026-10-15, about 01:45.
- What: the a2 pilot on 20 reports verified 47 of 56 quotes (84%).
- Action: Stage A paused, causes found, deterministic fixes made (DECISIONS D12).
- Result: 56 of 56 verified on re-check. Stage A resumed. No extra spend.

## Step responses raised PdfiumError

- When: 2026-10-15T03:23+00:00
- Failed to load document (PDFium: Data format error).

## Step stage_c raised OperationalError

- When: 2026-10-15T03:23+00:00
- database is locked

## Step chains raised OperationalError

- When: 2026-10-15T03:23+00:00
- database is locked

## B2. First orchestrator run stopped at the responses step (resolved)

- When: 2026-10-15, about 04:23.
- What: one corrupt response PDF raised a PDFium error during text extraction. The step stopped before saving any response text, and its open transaction then locked the database for Stage C and chain building.
- Effect: Stage B found nothing to do, Stage C did not run, and later steps ran on empty inputs. Spend was negligible ($0.04, mostly cached work).
- Fix: corrupt PDFs now give empty text instead of an error, response text is committed as it goes, connections have a 30-second busy timeout, and a failed step's connections are released.
- Result: the orchestrator was re-run from the responses step. Fetched PDFs and earlier model calls were reused from cache.

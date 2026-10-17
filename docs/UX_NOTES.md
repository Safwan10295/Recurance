# UX notes (front-end round, 17 Oct 2026)

Navigation, animation and polish only. No change to the pipeline, the database or any model call, and no Nebius or Tavily spend. The audit that started the round is in docs/UX_AUDIT.md; the decisions are D37 and D38 in docs/DECISIONS.md.

## What changed

### Navigation

1. How we know is one section with three tabs: Nemotron, Evaluation, Methodology. The old addresses redirect.
2. The sidebar has 8 items. Check a report, You be the judge and Hazard map are marked as the things to try, and appear as three large cards under the home hero.
3. The home page always tells the smart motorway case.
4. A dismissible Step 1 of 4 strip walks through a chain, the agent, the evidence and the cost.
5. Phones get a bottom tab bar: Home, Check, Chains, Map.
6. The Check a report tabs no longer wrap on phones; the example chips replay recorded briefs at once.

### Animation

1. Home: the smart motorway chain draws itself, with a coroner counter and a closing line from the data (A1). 100 dots show the two lost-memory shares (A2). A cost odometer (A5). A muted preview of the real map (A8).
2. Check a report: step cards slide in with a colour per model, counters tick, kept quotes get a verified mark, dropped ones fade with their reason (A3).
3. How we know: a narrowing funnel with each step's ledger cost (A4), the odometer, and What surprised us, four findings each linked to its evidence (A10).
4. Every quote of a shown link can be opened in its source, with the quote lighting up word by word (A6).
5. You be the judge: the verdict turns over, an agreement meter, and a share card with only the score (A7).
6. Hazard map: a short intro that draws the smart motorway chain, and hover that lights a chain and dims the rest (A8).
7. Chain page: reports reveal as you scroll, long gaps take longer to draw, and a quote bridge shows the repeated words (A9).
8. Methodology: grey bars sweep over names in an invented sentence (A11).
9. Page fade after navigation, card lift, theme crossfade, Ctrl K fade, friendlier 404 and error pages (A12).

Every animation plays once, ends on a still frame, and shows its final frame straight away with reduced motion. Add ?replay to an address to play it again.

## Lighthouse (mobile preset)

Before is the build from the start of the round; after is the final build. Both were measured warm, one after the other, under the same machine conditions.

| Page | Performance before | Performance after | Accessibility before | Accessibility after |
|---|---|---|---|---|
| / | 97 | 96 | 100 | 100 |
| /brief | 96 | 95 | 100 | 100 |
| /chains | 89 | 96 | 100 | 100 |
| /chains/c52cded99f756309 | 95 | 95 | 100 | 100 |
| /map | 98 | 97 | 100 | 100 |
| /how-we-know/evaluation (was /evaluation) | 98 | 97 | 100 | 100 |
| /how-we-know (was /nemotron) | 97 | 96 | 100 | 100 |
| /judge | 97 | 97 | 100 | 100 |

Single runs vary by a few points; /chains changed only in the shared shell, so its gain is noise.

For part of the day the laptop was busy with another program, and both builds scored in the 70s and 80s. Measuring them side by side in those conditions is how the one real regression was found: the first version of the home timeline repainted the whole drawing on every frame (about 1.5 s of paint under Lighthouse's CPU slowdown). Moving every moving part onto its own layer, animating only opacity and transform, cut paint to about 0.13 s. Starting animations when the browser is idle stopped them competing with page start-up.

## Animations cut or changed, and why

1. The hero's arcs reach out from the first warning rather than being drawn along their length. Drawing a line repaints it on every frame; reaching is composited and costs almost nothing.
2. The map preview shows about 860 points, not every concern, to keep the home page light.
3. What surprised us has no OCR finding: the share of scanned reports is not in the published data, and adding it would change the database.
4. Page changes inside the site use a short CSS fade rather than the View Transitions API, which Next.js does not yet drive for client navigation. The API is used for the theme crossfade and for full page loads where supported.
5. The quote bridge shows the shared words rising into the later report, rather than words flying across the page, which would be hard to follow and costly to animate.
6. The running step in the agent trace breathes slowly instead of pinging, to stay calm.

## Tests

1. 67 Python and 15 TypeScript tests pass offline.
2. web/e2e/smoke.mjs: 17 browser tests, all passing. Every route at desktop and phone width, the redirects, the tabs, the sidebar, the guided path, the phone tab bar, the hero and its replay, reduced motion, the 100 dots, a chip replay, the source check, the judge game and share card, the map intro, the redaction example, and no banned wording in the site's own text. They check behaviour, not pixels, so styling changes do not need snapshot updates. Playwright is not a project dependency; the file says how to run it.
3. Keyboard: every new control can be reached with Tab and has a visible focus ring. Badge colours pass 4.5:1 contrast in both themes.

## What to record for the video

Each step, with its address and click, is in docs/VIDEO_SHOT_LIST.md. The moments that carry the most:

1. The home timeline drawing itself: localhost:3000/?replay.
2. The 100 dots, scrolling down the same page.
3. "Check it in the source" on a chain page quote, as the words light up.
4. The agent trace replaying from the smart motorway chip on Check a report.
5. The judge's verdict turning over, and the share card.
6. The map intro: localhost:3000/map?replay.
7. The funnel and the odometer: localhost:3000/how-we-know?replay.

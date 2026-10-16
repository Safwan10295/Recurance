# UX audit (17 Oct 2026, before the front-end round)

The site was run locally from a production build (next start), reading the published PostgreSQL. No code was changed for this audit.

## Screenshots

18 routes at 1440, 768 and 390 px wide, light and dark: 108 screenshots, taken with Playwright driving Edge.

1. Every route returned 200, apart from the intended 404 page.
2. No page scrolls sideways at any width.
3. No browser errors on any page.
4. Pages finished loading in 0.7 to 1.1 s on a warm local server.

## Lighthouse (mobile preset, warm server)

| Page | Performance | Accessibility | Best practices |
|---|---|---|---|
| / | 97 | 100 | 100 |
| /brief | 98 | 100 | 100 |
| /chains | 96 | 100 | 100 |
| /chains/c52cded99f756309 | 95 | 100 | 100 |
| /map | 97 | 100 | 100 |
| /evaluation | 98 | 100 | 100 |

A first run straight after a server restart scored 82 to 84 on three pages, all from blocking time while caches filled. Repeat runs on a warm server scored 96 to 98. Every score in this round is taken warm, so before and after compare like with like.

## Slow, broken, cramped or confusing

### Navigation

1. The sidebar has 11 items in three groups. The three "How we know" pages (Nemotron, Evaluation, Methodology) are separate destinations that a judge reads as one question: why should I trust this?
2. Nothing marks the three hands-on features (Check a report, You be the judge, Hazard map) as the main things to try. On the home page they sit among six equal Explore cards, below the fold.
3. On a phone everything is behind the hamburger. There is no quick way between the main pages.
4. There is no sense of a path through the site, apart from the guided tour, which takes over the screen.
5. At 1440 by 900 the sidebar's last lines (data source) are cut off at the bottom.
6. At 768 px the header truncates the wordmark to "Recurrenc".

### Home page

1. The hero timeline animates, but has no replay control, no counter and no link from each repeat back to the first warning.
2. The 99% and 85% figures are plain numbers. Nothing shows their scale.
3. The case in "How a warning gets lost" follows the first featured chain, so it changes when featured.yaml changes. The hero is fixed to smart motorways, so two different cases sit one above the other.
4. There is no preview of the hazard map, the most visual feature.

### Check a report

1. The example chips run instantly from recorded briefs, and autocomplete has a spinner and arrow-key navigation (done last round).
2. Trace steps appear as plain cards. Model names are text only, and token and cost figures appear at once rather than accumulating.
3. At 390 px the three input tabs wrap to two lines ("Pick a / report").

### Chain page

1. The story timeline is static, and long gaps look the same as short ones until read closely.
2. At 390 px the tab row scrolls sideways, so "How it was found" is hidden off-screen with no cue.

### You be the judge

1. On a phone the page opens scrolled past its heading: the game scrolls itself into view on first load, not only when a round changes.
2. The verdict appears at once, with no agreement measure during play, and the end screen has nothing to share.

### How we know

1. The Nemotron funnel bars are static, and the total cost is plain text.
2. Findings worth leading with (OCR share, quote match rate, the cost per chain) are spread across three pages.
3. The methodology describes redaction in words only.

### General

1. Pages change without a transition. The theme toggle switches colours instantly.
2. The 404 page is plain.
3. Small touch targets remain inside dense lists (the across-organisations view and report pages have links under 24 px). They pass Lighthouse because they are spaced, but are fiddly on a phone.

# Handoff: Recurrence Watch — "Spine" redesign (home + navigation)

## Overview
New visual direction for the Recurrence Watch home page and global navigation, replacing the current teal sidebar + card grid. Core idea: **distance down the page is time**. The hero is a vertical timeline of the smart-motorway chain (7 reports to National Highways, Oct 2019 → Feb 2025) where the gap between reports is drawn to scale. Navigation moves to a slim dark **icon rail** (desktop) / **bottom tab bar** (phone).

Target codebase: `recurrence-watch/web` (Next.js App Router, Tailwind v4, `lucide-react`). Implement inside the existing `AppShell`, `app/page.tsx` and `globals.css` — reuse existing data queries (`getChain(HERO_CHAIN)`, `getMeta()`).

## About the design files
`Spine reference.html` is a **design reference built in HTML**, not production code. Recreate it with the app's existing patterns (React server/client components, Tailwind utilities, CSS variables in `globals.css`, `lucide-react` icons). Don't paste the HTML in.

## Fidelity
**High-fidelity.** Colours, type, spacing and copy are final. The middle-report dates/areas in the mock are placeholders — use real data from `getChain`.

---

## Screens

### 1. App shell — desktop (≥ 900px)
Layout: `display:flex`, full viewport height.

**Icon rail** (left, sticky, `width: 84px`, `height: 100vh`, bg `--rail` `#161A17`, text `#E8EBE6`)
- Column, items centred, `padding: 20px 0`, `gap: 6px`.
- Logo tile top: 40×40, radius 12, bg `--accent-bright`, icon `Repeat2` 20px colour `#161A17`, `margin-bottom: 18px`.
- 7 nav items, each a link: column, `gap: 4px`, width 72, `padding: 6px 0`.
  - Icon pill 48×32, radius 16, icon 20px, stroke 2.
  - Label: 11px / 600, Figtree.
  - Inactive: colour `#A9B0A9`, pill transparent. Hover: pill bg `rgba(255,255,255,0.08)`, colour `#fff`.
  - Active (`aria-current="page"`): colour `#fff`, pill bg `--accent-bright`, icon colour `#161A17`.
  - Items (label → route → lucide icon):
    Home `/` `Home` · Check `/brief` `ScanSearch` · Judge `/judge` `Gavel` · Map `/map` `Map` · Chains `/chains` `Link2` · Promises `/promises` `MessageSquareQuote` · How `/how-we-know` `ShieldCheck`
  - Each item needs `title`/tooltip with the full name + hint from `nav.ts` (e.g. "Check a report — Watch the agent find earlier warnings").
- Bottom (`margin-top:auto`): theme toggle, same item style, icon `Moon`/`Sun`, label "Theme".
- Keep Ctrl/⌘K command palette (existing `CommandPalette`) — add a Search item to the rail (icon `Search`, label "Search") just under the logo, or keep the shortcut only.

**Main** `flex:1`, bg `--paper`.

### 2. App shell — phone (< 900px)
- Top bar: height 56–60, `padding: 0 18px`, wordmark "Recurrence Watch" Figtree 16/700, right: `Search` icon button 44×44 (opens palette).
- **Bottom tab bar**: fixed bottom, bg `#161A17`, `grid-template-columns: repeat(5,1fr)`, `padding: 8px 6px 14px` (+ `env(safe-area-inset-bottom)`).
  - Tabs: Home, Check, Judge, Map, Chains (same icons). Pill 48×30 r15; label 11/600; min tap height 44. Active/inactive as rail.
  - Promises / How we know live in the palette and in page links.

### 3. Home — desktop
Main area: `display:grid; grid-template-columns: 1fr 600px; gap: 56px; padding: 0 64px`.

**Left column** (`padding-top: 72px`, column, `gap: 24px`)
1. Org chip: inline-flex, `gap 8`, bg `--surface` `#fff`, border `1px solid --rule` `#D3D8D1`, radius 999, `padding 6px 14px`, 13.5/600. Icon `Building2` 14. Text: "National Highways · 7 reports".
2. H1: Figtree **76px / 800**, line-height 0.98, letter-spacing −0.04em, colour `--ink` `#161A17`. Three lines: "Raised in 2019." / "Raised again." / "And again." (Build the year from `hero.first_date`.)
3. Lede: 19px / 400, line-height 1.55, colour `--ink-2` `#3E463F`, max-width 520. Copy: "No hard shoulder on smart motorways leading to unsafe stops. Seven coroners, five years. None of the later reports cited the first. The space on the right is time, to scale." (Hazard + counts from data.)
4. Actions (max-width 520, column, gap 10, margin-top 8):
   - **Primary** "Check a report" → `/brief`: flex, gap 14, bg `#161A17`, colour `#fff`, radius 16, `padding 18px 20px`. Left tile 40×40 r10 bg `--accent-bright` icon `ScanSearch` 18 colour `#161A17`. Text column: title 18/700, sub 14/400 `#C9CFC8` "Watch the agent work, step by step". Right: `ArrowRight` 18. Hover: bg `#232924`; arrow translateX(2px).
   - Row of two (grid 1fr 1fr, gap 10): "You be the judge" → `/judge` (icon `Gavel`), "Hazard map" → `/map` (icon `Map`). Each: bg `#fff`, border `1px solid #D3D8D1`, radius 16, padding 16, gap 12, icon colour `--accent` , label 16/700. Hover: border `#161A17`.
5. Stats (`margin-top:auto; padding-bottom:40px`, flex gap 32, 14px `#3E463F`). Each: value 24/700 `#161A17` on its own line, then label. Values: "99%" later reports don't cite · "85%" different coroner · "$5.65" whole archive. (From `meta.site`.)

**Right column — the spine** (ordered list, `padding-top: 48px`, position relative)
- Vertical line: absolute, `left: 120px`, `top: 56px`, bottom 0, width 2, bg `#161A17`.
- Each report = `<li>`:
  - **Gap spacer** above it (except first): height `months_since_previous × 9px − 28px`; contains the gap label right-aligned in a 104px box left of the line: 12.5/700 colour `--accent` e.g. "15 months".
  - **Dot** on the line: 16×16 circle, `left:113px`, border `3px solid --paper`; first report fill `#161A17`, others `--accent`.
  - Row (`padding-left:144px`, min-height 28, flex, gap 14, align centre): date 14/700 width 72 ("Oct 2019"), "Report N · {coroner area}" 14.5/400, tag 12/700 radius 6 padding 2×8 — first: bg `#161A17` text `#fff` "First warning"; later: bg `#fff`, border `1px solid #D3D8D1`, text `oklch(0.38 0.08 155)` "Not cited" (only when `later_cites_earlier` is false; otherwise "Cites R1").
  - Whole row is a link to `/chains/{key}#report-N`. Hover: row bg `#fff`, radius 8.
- Scale: **9px per month** desktop. Compute months from real dates. If the chain is longer than ~90 months, clamp scale so the spine fits ≈ 640px tall.
- Report labels: "Report N", year and coroner area only — **never names**.

### 4. Home — phone
- H1 Figtree 42/800, lh 0.98, ls −0.035em, margin 16px 18px 0. Same copy on one flow.
- Spine: `<ol>` with `border-left: 2px solid #161A17`, `padding-left: 22px`, margin 24px 18px 0. Gap spacer height `max(months × 5px − 20px, 4px)`. Dot 12×12 at `left:-29px`. Row text 14px: "**Oct 2019** · South Yorkshire".
- Below spine (not in the mock but required): primary "Check a report" full-width button (same style as desktop primary), then Judge / Map pair.
- Bottom tab bar as §2; add bottom padding to main so content clears it.

---

## Interactions & behaviour
- **Signature motion** (respect `prefers-reduced-motion` → show final frame; reuse existing `useMotion` / `rw-seen` session logic so it plays once per session):
  1. The spine line draws top → bottom (`transform: scaleY(0→1)`, origin top).
  2. Each dot + row fades/slides in (`opacity 0→1`, `translateY(6px→0)`, 220ms ease-out) when the line reaches it — i.e. the delay is proportional to its month position. Total ≈ 2.4s for 64 months.
  3. Gap labels fade in after their dot.
- Rail/tab active state follows `usePathname()` (existing `isActive` helper).
- Focus: visible `outline: 2px solid var(--accent); outline-offset: 2px` on every link/button. Rail items must be reachable by Tab in order.
- Command palette: Ctrl/⌘K and "/" (already implemented) — keep.

## State
No new state on home. Shell: `pathname`, `paletteOpen`, `theme` (existing `ThemeToggle`, `rw-theme` localStorage).

## Design tokens (add to `globals.css`, replace the teal set)

Light
```
--paper:        #EEF0EC
--surface:      #FFFFFF
--ink:          #161A17
--ink-2:        #3E463F
--muted:        #5E665F
--rule:         #D3D8D1
--rail:         #161A17
--rail-ink:     #A9B0A9
--accent:       oklch(0.48 0.08 155)   /* dots, gap labels, icons */
--accent-text:  oklch(0.38 0.08 155)   /* accent used as text on white */
--accent-bright:oklch(0.78 0.09 155)   /* active pill / logo tile on dark rail */
```
Dark
```
--paper:        #111412
--surface:      #181C19
--ink:          #E8EBE6
--ink-2:        #BFC6BE
--muted:        #8F978F
--rule:         #2A302B
--rail:         #0B0D0C
--rail-ink:     #8F978F
--accent:       oklch(0.74 0.09 155)
--accent-text:  oklch(0.80 0.09 155)
--accent-bright:oklch(0.78 0.09 155)
```
(In dark, the primary button becomes bg `--accent-bright`, text `#161A17`; first-report dot becomes `--ink`.)

Check 4.5:1 for all text; `--muted` on `--paper` passes in both.

Type — **Figtree** (Google, weights 400/500/600/700/800) replaces Source Sans/Serif. Load via `next/font/google`.
- Display 76/800 (phone 42), lh 0.98, ls −0.04em
- Lede 19/400 lh 1.55
- Action title 18/700, body 14–16
- Labels 12–14.5; rail label 11/600

Radii: 6 (tags), 8, 10 (icon tiles), 12 (logo), 16 (action cards), 999 (chips/pills).
Spacing: 4-based; page padding 64 desktop / 18 phone; column gap 56.
Shadows: none (flat; borders do the work).

## Assets
Icons: `lucide-react` (already a dependency) — Home, ScanSearch, Gavel, Map, Link2, MessageSquareQuote, ShieldCheck, Search, Building2, ArrowRight, Repeat2, Moon, Sun. Size 18–20, stroke 2. No images.

## Content rules (keep)
No alarm red, no rankings, never "ignored / caused / failed to act / is responsible". Quotes always sit with source link, relation and confidence. No staff/family names.

## Files
- `Spine reference.html` — the static mock (desktop 1440 + phone 390). Open in a browser.
- Map to code: shell → `components/shell/AppShell.tsx` + `nav.ts`; home → `app/page.tsx` (replace `HeroTimeline` with a new `SpineTimeline` client component); tokens → `app/globals.css`; font → `app/layout.tsx`.

# Video shot list (one pass, under 3 minutes)

Built on docs/DEMO_SCRIPT.md, which has the words. This file has the addresses and clicks. Replace localhost:3000 with the demo address if recording against the server.

Setup:

1. A private window at 1280 by 800, light mode, zoom 110%.
2. Hide the guided path strip once with its cross.
3. Close other tabs. Keep the address bar tidy.

| Time | Address | Clicks | On screen |
|---|---|---|---|
| 0:00 | localhost:3000/?replay | None. Let the spine finish (about 3 s) | "Raised in 2019. Raised again. And again." The line draws down the right-hand side, each report appearing as it is reached, the months between them to scale |
| 0:20 | same page | Scroll to "The agent checks a real report" and let the run play (about 7 s) | The recorded run steps through; the three earlier warnings appear with their quotes and links |
| 0:35 | localhost:3000/chains/c52cded99f756309 | Click "See a repeated warning" in the hero. Scroll the Summary story | Each report reveals as it scrolls in; long gaps draw for longer; the "Repeated from the earlier report" words rise in |
| 0:50 | same page | Click "Check it in the source" under one quote | The source text opens; the quoted words light up in order; "Found word for word" lands, beside the link to judiciary.uk |
| 1:00 | localhost:3000/brief | Click the chip "A smart motorway death, 2023" | The trace replays: step cards slide in with coloured model badges; token and cost counters tick; kept quotes get a verified mark; dropped verdicts fade with their reason; the brief appears on the right |
| 1:40 | localhost:3000/judge | Start; click Same hazard or Not the same; then Stop and see what this means | The verdict turns over with Super's reason; the agreement meter fills; the end screen shows "You agreed with Nemotron on X of Y" and the share card |
| 2:05 | localhost:3000/map?replay | None at first; after the intro, hover a point in a cluster | The view zooms to the smart motorway chain and draws its lines, then returns; on hover, that point's chain lights and the rest dims |
| 2:25 | localhost:3000/how-we-know?replay | Scroll to What surprised us, then the funnel | The total spend rolls up beside the cost per chain; the four findings; each funnel step grows and narrows as it scrolls in, with its cost and tokens |
| 2:42 | localhost:3000/how-we-know/evaluation | Click the Evaluation tab | The recall chart with 95% ranges; the post-hoc row kept apart |
| 2:50 | localhost:3000/ | Click Start here in the sidebar | Close on the home page |

If something stalls, every animation has a still final frame, and ?replay on the address plays it again cleanly.

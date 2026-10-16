# Video shot list (under 3 minutes)

Built on docs/DEMO_SCRIPT.md. Every number on screen is read live from the database by the page itself; none is typed into the video.

Setup:

1. Browser at 1280 by 800, light mode, zoom 110%, a private window, so no saved brief is replayed unless planned.
2. Have the address bar hidden or tidy. Close other tabs.
3. Choose the live report in advance: one you have not run before, from the last year, sent to an organisation with chains. Note its name for step 4.
4. Optional: review the smart motorways dossier first (python -m pipeline.cli review --featured) so its Dossier tab appears.

| Time | Page and clicks | On screen | Voice |
|---|---|---|---|
| 0:00 to 0:08 | / (Start here), top of page | The headline and the "problem, in a real case" card | "When a death reveals a risk, a coroner writes to the organisation that can act. It must reply with what it will do." |
| 0:08 to 0:22 | / , scroll to the four figures | Chains, share with a different coroner, share with no published response, raised again after a stated action | "Years later the same concern comes back, before a different coroner. In most of the recurrences we found, the later coroner was different and did not cite the earlier report. The memory is lost." |
| 0:22 to 0:30 | Click "See a recurrence" | /chains/c52cded99f756309, Summary tab | "One example: smart motorways, seven reports, seven coroners." |
| 0:30 to 0:50 | Scroll the story slowly; open the Evidence tab and expand one row | First warning, the response and its stated action, raised again six times; two quotes side by side | "Each link shows the exact words from both reports, checked by code word for word, with a relation and a confidence." |
| 0:50 to 1:00 | Click "Check a report" in the top bar; pick the chosen report; press Check | The agent's steps begin | "Now a new report. An agent built on NVIDIA Nemotron, on Nebius Token Factory, investigates it." |
| 1:00 to 1:35 | Stay on /brief while the trace fills | Round by round: Super choosing tools, the search results with similarity, judge_candidate kept and dropped, promises read, the web check | "Nemotron Super decides what to do next: search earlier warnings, judge each candidate, read what was promised, check the web with Tavily. Every quote is verified in code before it is shown." |
| 1:35 to 1:50 | Scroll to the brief on the right | The earlier warnings, what was promised, any web evidence | "In under twenty seconds, for about half a cent: the earlier warnings, what was promised, and what we could find about what happened next." |
| 1:50 to 2:10 | /evaluation | The three bars with their ranges; then scroll to "Where it fails" | "We tested it on recurrences that coroners themselves flagged, with the citation removed. At the same number of links, the Nemotron system found the most. And here is exactly where it fails." |
| 2:10 to 2:25 | /nemotron, the funnel and model cards | Archive to evidence; Nano, Super, Ultra; tokens and cost | "Small models read, a larger one judges. The whole archive cost about five dollars." |
| 2:25 to 2:40 | /chains?view=across, open one cluster; then /map, press "Replay the years" | The same hazard across organisations; the map filling year by year | "The same hazards come up across organisations too. Every concern, placed by meaning, with the recurrences drawn in." |
| 2:40 to 2:55 | / , the Explore cards | Check a report, Promises, Hazard map, You be the judge | "For coroners before an inquest, for families, lawyers and safety teams. It updates itself every week." |
| 2:55 to 3:00 | Hold on the home page | The wordmark | "PFD Monitor groups concerns. The Tracker chases deadlines. Recurrence Watch tests whether promises held." |

If the live run is slow or paused, use the shared link of a brief recorded earlier (its trace replays, marked as a replay) and say so.

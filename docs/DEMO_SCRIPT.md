# Demo script (under 3 minutes)

Pilot records and narrates in their own voice. Tone: respectful, about organisations' patterns, not individuals' tragedies. Times are targets.

Before recording:

1. Review the smart motorways dossier (python -m pipeline.cli review), then publish, so the chain's Dossier tab appears. The chain works without it.
2. Use a browser window 1280 wide, light mode, zoom 110%.
3. For the live run, choose a report you have not run before, so the steps run live rather than replay. Have a second one ready.

## 0:00 to 0:20. The problem

On screen: Start here. The card on the right tells the problem in a real case.

Say:

1. "A coroner warns an organisation about a risk to life. It responds with what it will do."
2. "Years later the same concern comes up again, in front of a different coroner."
3. "In 99% of the links we found, the later report does not cite the earlier one. Recurrence Watch connects the record."

## 0:20 to 1:05. One chain

On screen: "See a recurrence", which opens /chains/c52cded99f756309.

Say:

1. National Highways, 7 reports from 7 coroners, 2019 to 2025.
2. Scroll the story: first warning, the response and its stated action, then "raised again" six times. The spacing grows with the time between reports.
3. Open Evidence and expand one row: "Both quotes are checked by code, word for word, against the original reports."

## 1:05 to 1:50. Watch the agent

On screen: Check a report. Pick a report and press Check for earlier warnings.

Say:

1. "A coroner, family or lawyer preparing for an inquest starts here."
2. As the steps light up: Nemotron Nano extracts the concerns; Qwen3 embeddings and pgvector search the organisation's earlier warnings; Nemotron Super judges the closest three, with reasoning.
3. Point to one verdict that was kept and one that was dropped, and why.
4. Point to the tokens and cost: "about a fifth of a cent".

## 1:50 to 2:20. Promises and the map

On screen: Promises, then again. Then the Hazard map.

Say:

1. "508 times, a response stated an action and a later coroner raised the same concern. It shows the concern came back, not why."
2. On the map: "Every concern, placed by meaning. The lines are recurrences the judge confirmed." Hover a cluster, then click into a chain.

## 2:20 to 2:45. How we know

On screen: How Nemotron did the work, then Evaluation.

Say:

1. The funnel: 6,454 reports, 15,366 concerns, 4,061 pairs judged, 1,217 links shown, for about $5 on Token Factory. Nano reads, Super judges, Ultra drafts dossiers.
2. The blind test: at the same number of shown links, TF-IDF found 34%, embeddings 41%, and the hybrid with the Nemotron judge 52% of the recurrences coroners themselves flagged.

## 2:45 to 3:00. Close

Say:

1. "For coroners, families, lawyers and safety teams."
2. "PFD Monitor groups concerns. The Tracker chases deadlines. Recurrence Watch tests whether promises held."

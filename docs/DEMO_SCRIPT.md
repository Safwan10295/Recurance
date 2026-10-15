# Demo script (under 3 minutes)

Pilot records and narrates in their own voice. Tone: respectful, about organisations' patterns, not individuals' tragedies. Times are targets.

Before recording:

1. Review the smart motorways dossier (python -m pipeline.cli review), then publish, so the chain's Dossier tab appears. The chain works without it.
2. Use a browser window 1280 wide, light mode, zoom 110%.
3. Run the brief once with the chosen report so the take is quick. For a live run on camera, choose a different report.

## 0:00 to 0:20. The problem

On screen: Start here.

Say:

1. "When a death reveals a risk, a coroner writes a Prevention of Future Deaths report."
2. "The organisation must reply with what it will change."
3. "Years later, a similar death happens in front of a different coroner."
4. "Nobody connects the record. Recurrence Watch does."

Point to the three live numbers: verified chains, recent reports that repeat an earlier warning, and the share where the later coroner was different.

## 0:20 to 1:10. One chain

On screen: the featured card "No hard shoulder on smart motorways causing unsafe stops", which opens /chains/c52cded99f756309.

Say:

1. On Summary: National Highways, 7 reports from 7 different coroners, 2019 to 2025. Move along the timeline strip.
2. Open Evidence: read one pair of quotes side by side. "Both quotes are checked by code, word for word, against the original reports."
3. Open Promises and follow-up: what the response said it would do, and what the web search found. "No evidence found is never treated as did not happen."
4. Open How it was found: the scores, and which Nemotron model judged it.

## 1:10 to 1:50. Check a report

On screen: the "Check a report" button in the top bar.

Say:

1. "A coroner, family or lawyer preparing for an inquest starts here."
2. Pick a report from the archive by name, or paste a web address.
3. Let the steps tick through: organisation found, concerns extracted by Nemotron Nano, earlier concerns retrieved, Nemotron Super judging.
4. Read one match: the earlier warning, what was promised, and the link to share the brief.

## 1:50 to 2:20. Evaluation and routing

On screen: Evaluation, in the sidebar under "How we know".

Say:

1. The test set: pairs where coroners themselves cited the earlier report, with the citation hidden from the system.
2. The chart: at the same number of shown links, TF-IDF found 34%, embeddings 41%, and the hybrid with the Nemotron judge 52%.
3. In most shown links, the later coroner was different and did not cite the earlier report.
4. The routing: Nano extracts, Super judges, Ultra drafts dossiers, all on Token Factory, for about $5 in total.

## 2:20 to 2:45. Across organisations and what's new

On screen: Explore chains, the "Across organisations" tab, then Recent.

Say:

1. "The same hazard raised with different organisations, checked the same way."
2. "Every week the server reads new reports and links them. Here is what is new."

## 2:45 to 3:00. Close

Say:

1. "For coroners, families, lawyers and safety teams."
2. "PFD Monitor groups concerns. The Tracker chases deadlines. Recurrence Watch tests whether promises held."

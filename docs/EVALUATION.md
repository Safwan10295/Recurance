# Evaluation

Generated 2026-10-15T05:23:24+00:00 by scripts/write_evaluation_md.py from data/exports/evaluation.json.

## Test set

1. A later report acknowledges an earlier one when its own text names the earlier report's reference number or the earlier deceased person's full name. No labels were invented.
2. Pairs found: 227. Sharing an organisation: 42. Of those, at least six months apart: 29. Evaluated (both reports have extracted concerns): 29.
3. Evidence types: name 219, ref 8.
4. Blind test: every sentence of the later report that carries the acknowledgement was removed before scoring and before judging.

## Systems compared

Each baseline is cut at the number of links the hybrid + Nemotron system shows across the whole corpus, so all three show the same number of links.

| System | Recall on the blind test | Earlier report in the top 5 | Links shown | Precision |
|---|---|---|---|---|
| TF-IDF only | 34% | 76% | 1217 | pending |
| Embeddings only | 41% | 69% | 1217 | pending |
| Hybrid + Nemotron Super judge | 52% | 69% | 1217 | pending |

Thresholds used: TF-IDF 0.137, embedding 0.726.

For the hybrid system, the top-5 column means the pair passed the candidate rule and reached the judge.

95% Wilson intervals on recall, with only these pairs:

- TF-IDF only: 10 of 29, from 20% to 53%.
- Embeddings only: 12 of 29, from 26% to 59%.
- Hybrid + Nemotron Super judge: 15 of 29, from 34% to 69%.

The intervals overlap. The ordering is consistent, but the gap is not yet statistically settled.

## A change made after seeing the misses

This is not part of the comparison above, and it is not an independent test.

- Hybrid + report route + Nemotron Super judge: Adds a second candidate route: each later report's top 3 earlier reports by whole-report wording. Added after seeing the misses. 15 of 29 (52%, from 34% to 69%), with 1360 links shown.

Post-hoc: the report route was added after seeing that most misses never reached the judge, so its result is not an independent test. It finds 15 of 29 (52%): 0 more than before, 0 fewer. It shows 1360 links; at that larger budget the baselines find tf-idf only 45%, embeddings only 52%. No other test set of coroner-acknowledged pairs exists, so it has not been validated on held-out pairs.

## Where it fails

The hybrid + Nemotron system missed 14 pairs: 9 not candidate, 5 judge rejected.

- Donna Williamson to Alex Malcolm (Department of Health and Social Care): Never reached the judge: no single pair of concerns passed the candidate filter (similarity thresholds and the per-organisation pair cap), although as whole reports it ranked 2 by meaning and 1 by wording among 341 earlier reports to the organisation.
- David Kirsch to Geoffrey Hutton (HMP Long Lartin): Never reached the judge: no single pair of concerns passed the candidate filter (similarity thresholds and the per-organisation pair cap), although as whole reports it ranked 1 by meaning and 1 by wording among 2 earlier reports to the organisation.
- Geoffrey Toase and Michael Midgley: Prevention of Future Deaths Report to Christopher Sampson: Prevention of future deaths report (Driver and Vehicle Licensing Agency): Judged related (confidence 0.70): a related but different hazard.
- Leon Briggs: Prevention of future deaths report to Andrew McCleary: Prevention of future death report (Bedfordshire Police): Judged related (confidence 0.80): a related but different hazard.
- Shona Campbell: Prevention of future deaths report to Ruairi Stewart: Prevention of future deaths report (Alternative Futures Group): Judged related (confidence 0.80): a related but different hazard.
- Piotr Kierzkowski to Timothy De Boos: Prevention of Future Deaths Report (Department of Health and Social Care): Never reached the judge: no single pair of concerns passed the candidate filter (similarity thresholds and the per-organisation pair cap), although as whole reports it ranked 7 by meaning and 2 by wording among 586 earlier reports to the organisation.
- Nicola Rayner: Prevention of future deaths report to Timothy De Boos: Prevention of Future Deaths Report (Department of Health and Social Care): Never reached the judge: no single pair of concerns passed the candidate filter (similarity thresholds and the per-organisation pair cap), although as whole reports it ranked 12 by meaning and 1 by wording among 586 earlier reports to the organisation.
- Connor Wellsted: Prevention of future deaths report to Mia Gauci-Lamport: Prevention of Future Deaths Report (Care Quality Commission): Judged related (confidence 0.80): a related but different hazard.
- Deborah Headspeath to Kim Robinson: Prevention of Future Deaths Report (Department of Health and Social Care): Never reached the judge: no single pair of concerns passed the candidate filter (similarity thresholds and the per-organisation pair cap), although as whole reports it ranked 2 by meaning and 1 by wording among 607 earlier reports to the organisation.
- Daniel Klosi: Prevention of Future Deaths Report to Billie Wicks: Prevention of Future Deaths Report (Royal College of Emergency Medicine): Judged related (confidence 0.80): a related but different hazard.
- Freeda Glausiusz: Prevention of future deaths report to Heather Findlay: Prevention of future deaths report (East London NHS Foundation Trust): Never reached the judge: no single pair of concerns passed the candidate filter (similarity thresholds and the per-organisation pair cap), although as whole reports it ranked 71 by meaning and 9 by wording among 312 earlier reports to the organisation.
- Louis Thorold: Prevention of Future Deaths Report to Peter Westwell, Mary Cunningham, Grace Foulds, Anne Ferguson: Prevention of Future Deaths Report (Department for Transport): Never reached the judge: no single pair of concerns passed the candidate filter (similarity thresholds and the per-organisation pair cap), although as whole reports it ranked 2 by meaning and 1 by wording among 89 earlier reports to the organisation.
- Sarah Clarke: Prevention of future deaths report to Alice Litman: Prevention of future deaths report (NHS England): Never reached the judge: no single pair of concerns passed the candidate filter (similarity thresholds and the per-organisation pair cap), although as whole reports it ranked 94 by meaning and 29 by wording among 258 earlier reports to the organisation.
- Leroy Medford to Neal Saunders: Prevention of future deaths report (College of Policing): Never reached the judge: no single pair of concerns passed the candidate filter (similarity thresholds and the per-organisation pair cap), although as whole reports it ranked 9 by meaning and 2 by wording among 19 earlier reports to the organisation.

## Precision

Status: pending: no labels filled in yet. Labelled pairs: 0.

1. Pilot labels the 80 pairs in data/exports/hand_labels.csv with python -m pipeline.cli label.
2. Then python -m pipeline.cli evaluate recomputes everything. The judge calls are answered from the cache, so it costs nothing.
3. Then python scripts/write_evaluation_md.py and python -m pipeline.cli publish refresh this file and the site.

## Lost memory among shown links

1. Links shown: 1360.
2. Later report from a different coroner: 85%.
3. From a different coroner area: 80%.
4. Later report does not cite the earlier one: 99%.
5. All three at once: 75%.

## Cost

1. Total Token Factory spend so far: $5.6516.
2. Analysis cost (development, embeddings, Stages A to C): $4.3838.
3. Verified chains: 666. Cost per verified chain: $0.0085.
4. By stage: A $0.7729, B $0.2321, C $3.3670, D $0.9660, F $0.0451, dev $0.2568, embed $0.0117.

## Weak spots

1. The acknowledged test set is small and skewed towards coroners who write cross-references, so recall on it may not match recall on silent recurrences.
2. Many acknowledged pairs are under six months apart and fall outside the six-month rule from the handoff.
3. Precision is pending hand labels, so the share of shown links that a person would accept is not yet measured.
4. Linking is within one organisation, so recurrences after renames or across different bodies are missed unless a rename is known.

## Acknowledged pairs the full system did not show

- https://www.judiciary.uk/prevention-of-future-death-reports/donna-williamson/ -> https://www.judiciary.uk/prevention-of-future-death-reports/alex-malcolm/: TF-IDF rank 1, embedding rank 2, judge not judged 
- https://www.judiciary.uk/prevention-of-future-death-reports/david-kirsch/ -> https://www.judiciary.uk/prevention-of-future-death-reports/geoffrey-hutton/: TF-IDF rank 1, embedding rank 1, judge not judged 
- https://www.judiciary.uk/prevention-of-future-death-reports/geoffrey-toase-and-michael-midgley-prevention-of-future-deaths-report/ -> https://www.judiciary.uk/prevention-of-future-death-reports/christopher-sampson-prevention-of-future-deaths-report/: TF-IDF rank 14, embedding rank 3, judge related 0.7
- https://www.judiciary.uk/prevention-of-future-death-reports/leon-briggs-prevention-of-future-deaths-report/ -> https://www.judiciary.uk/prevention-of-future-death-reports/andrew-mccleary-prevention-of-future-death-report/: TF-IDF rank 1, embedding rank 1, judge related 0.8
- https://www.judiciary.uk/prevention-of-future-death-reports/shona-campbell-prevention-of-future-deaths-report/ -> https://www.judiciary.uk/prevention-of-future-death-reports/ruairi-stewart-prevention-of-future-deaths-report/: TF-IDF rank 1, embedding rank 1, judge related 0.8
- https://www.judiciary.uk/prevention-of-future-death-reports/piotr-kierzkowski/ -> https://www.judiciary.uk/prevention-of-future-death-reports/timothy-de-boos-prevention-of-future-deaths-report/: TF-IDF rank 2, embedding rank 7, judge not judged 
- https://www.judiciary.uk/prevention-of-future-death-reports/nicola-rayner-prevention-of-future-deaths-report/ -> https://www.judiciary.uk/prevention-of-future-death-reports/timothy-de-boos-prevention-of-future-deaths-report/: TF-IDF rank 1, embedding rank 12, judge not judged 
- https://www.judiciary.uk/prevention-of-future-death-reports/connor-wellsted-prevention-of-future-deaths-report/ -> https://www.judiciary.uk/prevention-of-future-death-reports/mia-gauci-lamport-prevention-of-future-deaths-report/: TF-IDF rank 1, embedding rank 6, judge related 0.8
- https://www.judiciary.uk/prevention-of-future-death-reports/deborah-headspeath/ -> https://www.judiciary.uk/prevention-of-future-death-reports/kim-robinson-prevention-of-future-deaths-report/: TF-IDF rank 1, embedding rank 2, judge not judged 
- https://www.judiciary.uk/prevention-of-future-death-reports/daniel-klosi-prevention-of-future-deaths-report/ -> https://www.judiciary.uk/prevention-of-future-death-reports/billie-wicks-prevention-of-future-deaths-report/: TF-IDF rank 2, embedding rank 3, judge related 0.8
- https://www.judiciary.uk/prevention-of-future-death-reports/freeda-glausiusz-prevention-of-future-deaths-report/ -> https://www.judiciary.uk/prevention-of-future-death-reports/heather-findlay-prevention-of-future-deaths-report/: TF-IDF rank 9, embedding rank 71, judge not judged 
- https://www.judiciary.uk/prevention-of-future-death-reports/louis-thorold-prevention-of-future-deaths-report/ -> https://www.judiciary.uk/prevention-of-future-death-reports/peter-westwell-mary-cunningham-grace-foulds-anne-ferguson-prevention-of-future-deaths-report/: TF-IDF rank 1, embedding rank 2, judge not judged 
- https://www.judiciary.uk/prevention-of-future-death-reports/sarah-clarke-prevention-of-future-deaths-report/ -> https://www.judiciary.uk/prevention-of-future-death-reports/alice-litman-prevention-of-future-deaths-report/: TF-IDF rank 29, embedding rank 94, judge not judged 
- https://www.judiciary.uk/prevention-of-future-death-reports/leroy-medford/ -> https://www.judiciary.uk/prevention-of-future-death-reports/neal-saunders-prevention-of-future-deaths-report/: TF-IDF rank 2, embedding rank 9, judge not judged 

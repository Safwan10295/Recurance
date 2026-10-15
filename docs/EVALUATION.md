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

## Precision

Status: pending: no labels filled in yet. Labelled pairs: 0.

1. Pilot labels the 80 pairs in data/exports/hand_labels.csv with python -m pipeline.cli label.
2. Then python -m pipeline.cli evaluate recomputes everything. The judge calls are answered from the cache, so it costs nothing.
3. Then python scripts/write_evaluation_md.py and python -m pipeline.cli export refresh this file and the site.

## Lost memory among shown links

1. Links shown: 1217.
2. Later report from a different coroner: 84%.
3. From a different coroner area: 79%.
4. Later report does not cite the earlier one: 99%.
5. All three at once: 73%.

## Cost

1. Total Token Factory spend so far: $4.7636.
2. Analysis cost (development, embeddings, Stages A to C): $4.0698.
3. Verified chains: 619. Cost per verified chain: $0.0066.
4. By stage: A $0.7729, B $0.1943, C $3.0227, D $0.6802, F $0.0135, dev $0.0682, embed $0.0117.

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

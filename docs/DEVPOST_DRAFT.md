# Devpost submission (as pasted)

Track: Best Apps and Agents. All three links are in.

Demo: https://recurance.com
Code: https://github.com/Safwan10295/Recurance
Video: https://youtu.be/1kQE0O57DMo

## Tagline

Coroners warn. Organisations promise. Recurance checks whether the same concern came back.

## Inspiration

When a death reveals a risk to others, a coroner in England or Wales writes a Prevention of Future Deaths report to the organisation that can act, and it must reply with what it will do. Years later, the same concern can come back to the same organisation through a different coroner, who has no practical way to know it was raised before. In 99% of the repeats we found, the later report never cited the earlier one.

## What it does

Recurance reads all 6,454 reports published since 2013 and links later concerns to earlier warnings sent to the same organisation: 666 repeated warnings, each shown in the exact words of both reports, with a verdict and a confidence.

- **Check a report:** an agent checks any report live in about 20 seconds, for under a cent, showing every step.
- **Repeated warnings:** each hazard told report by report, with what the organisation promised in between.
- **Verified word for word:** every quote opens inside its original report on judiciary.uk.
- **You be the judge:** make the call on two concerns, then see Nemotron's verdict and reasoning.
- **Hazard map:** 15,044 concerns placed by meaning, with the repeats drawn between them.

## How we built it

Every model call runs on Nebius Token Factory, routed to the smallest model that does the job:

- **Nemotron Nano** extracts each concern with an exact quote.
- **Qwen3 embeddings** with pgvector find earlier concerns sent to the same organisation.
- **Nemotron Super** judges whether each pair is the same hazard, and drives the live agent through tool calling.
- **Nemotron Ultra** drafts dossiers for the strongest chains, reviewed by a person.
- **Plain code** checks every quote word for word. The model never writes the quotes we show.
- **Tavily** checks what happened after a promise.

A Python pipeline with OCR, a request cache and a cost ledger feeds PostgreSQL, and a Next.js app serves it at recurance.com. Processing the whole archive cost **$5.65**.

## How we know it works

We used the coroners as ground truth. Where a later report names an earlier one, we hid that citation and asked each system to find it. At the same number of links, TF-IDF found 10 of 29, embeddings 12, and the Nemotron judge 15. Every miss is listed on the site. Most never reached the judge, so the next gain is in retrieval.

## Responsible use

A link shows that a similar concern was raised again, not why. There are no rankings of organisations, staff and family names are redacted, and the deceased are named only in the report title.

## Challenges

- Our first agent reworded quotes inside its tool calls. Moving the judgement into a judge tool that returns checked quotes fixed it.
- Chains at large national bodies first merged different hazards. Linking only through shared concerns fixed it.
- Nano sometimes looped under guided JSON. Bounding the schema fixed it.

## Accomplishments that we're proud of

- Every quote on the site is an exact substring of its source, across 15,044 concerns.
- A whole national archive processed for $5.65, with every call in a ledger.
- An honest evaluation, misses included.

## What we learned

Small models are enough for reading. The judgement is where a bigger model earns its cost: 66% of the pairs that looked alike were not the same hazard. And when a model writes quotes, the wording drifts. Tools that return checked quotes are the fix.

## What's next

Human labels to measure precision, other jurisdictions with the same duty, and alerts when a new report repeats an earlier warning.

## Built with

NVIDIA Nemotron 3 (Nano, Super, Ultra), Nebius Token Factory, Qwen3-Embedding-8B, Tavily, Python, PostgreSQL, pgvector, Next.js, Tailwind, Docker, nginx.

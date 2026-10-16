# Gap analysis (16 Oct 2026)

What a judge meets on the demo URL, what was weak, and what this round changed. Checked against the four judging criteria and the handoff rules.

## The first two minutes

1. Start here loads in under 0.2 s from a warm cache. It offers three ways in: Check a report, See a recurrence, and the guided tour.
2. The guided tour visits nine real pages with a spotlight, and works on a phone as a bottom card.
3. Check a report shows every step the agent takes. Before this round it was a fixed pipeline, which showed its steps but made no decisions.
4. One chain (smart motorways) reads as a story from first warning to the sixth recurrence.

## Weaknesses found, and what changed

| Area | Before | Now |
|---|---|---|
| Agent behaviour | A fixed sequence: retrieve, judge the closest three | Nemotron Super chooses tools in up to 5 rounds (D29); the fixed sequence is the fallback |
| Tavily use | 82 promises checked; 250-credit cap from an unconfirmed assumption | Budget from the real balance (D28). The demo and dossier chains are covered first, and the live agent can check the web |
| Evaluation honesty | Recall only | 95% intervals, every miss with its reason, and current per-model cost and tokens |
| Credit expiry | Unknown | Confirmed unreadable from the API (RESEARCH_LOG). It has to be checked in the console |
| Deployment | Healthcheck and restart policies | Plus backup.sh, smoke.sh, an uptime check and a 1 to 15 Dec runbook |
| Reuse by others | None | A read-only JSON API with the same display rules |

## Rule checks

1. Wording: every model sentence shown passes the blaming-word check. That covers explanations, titles, follow-up summaries and the agent's explanations. No breach found.
2. Quote verification: every shown quote is an exact substring of its source. The agent cannot cite text its tools did not return. A quote that differs only in letter case is shown in the source's own words.
3. Redaction: staff, family and the deceased are redacted in report quotes. One gap was found and fixed this round: quotes from web sources (follow-up evidence) were not redacted, and now pass the same redaction.
4. Secrets: keys come from the environment only. The secret scan and gitleaks run before each commit. Nothing secret is sent to the browser.
5. One wrapper per language: every model call goes through pipeline/llm.py or web/lib/llm.ts, including the agent's tool calls.

## Slow or confusing spots still open

1. The fixed fallback, and the agent's first run on a new report, take 15 to 20 seconds. The trace shows progress throughout, and repeated inputs replay instantly.
2. Precision is still marked pending until Pilot labels the 80 pairs.
3. Dossiers stay hidden until Pilot approves them.

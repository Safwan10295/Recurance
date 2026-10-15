# Token Factory and Nemotron feedback

Notes for the Devpost feedback field, from building Recurrence Watch: about 6,400 coroners' reports, 15,000 extracted concerns, 1,500 response letters and 3,300 judged report pairs, all on Nebius Token Factory. Dated observations from the build on 15 Oct 2026.

## What worked well

1. GET /v1/models?verbose=true gives context length, per-token prices, quantisation and per-model rate limits in one call. It made exact budget planning possible on day one.
2. json_schema structured output is enforced by guided decoding on all three Nemotron 3 models (Nano, Super, Ultra). The models returned schema-conforming JSON even when the prompt asked for something else.
3. maxItems and maxLength are enforced inside json_schema. They are the most effective cure for repetition loops (see below).
4. chat_template_kwargs pass straight through. enable_thinking switches Nemotron reasoning off for extraction, and low_effort cut Super's reasoning about five-fold on a simple prompt with the same answer.
5. Nemotron 3 Nano copies verbatim quotes well. About 98% of extracted quotes were exact, or near-exact, substrings of the source across HTML, PDF and OCR text, at about $0.00012 per report.
6. Nemotron 3 Super with low_effort reasoning cost about $0.00076 per recurrence judgement, below our planning estimate, and it was appropriately conservative about calling two concerns the same hazard.
7. The rate-limit headers (limit, remaining, dynamic scale, period usage) let a client pace itself under both request and token limits, and across 13,004 paid calls in one night we recorded no failed calls and no 429s.
8. Qwen3-Embedding-8B's dimensions parameter matches truncation of the full vector (cosine 0.99994 between 1,024 truncated to 256 and a direct 256 request), so one stored embedding serves several index sizes.

## Friction

1. The supported_features field in /v1/models leaves out structured_outputs and json_mode for the Nemotron models, although both work. A client that trusts the listing would wrongly turn structured output off.
2. Under guided JSON decoding at temperature 0, Nano sometimes loops, repeating one array item or a whole object until max_tokens. About 7% of extraction calls hit this before we added schema bounds. Documenting maxItems and maxLength as recommended practice for Nemotron structured output would save others the debugging.
3. A frequency penalty also stopped the loops, but it made Nano drop real items, so schema bounds are the better fix. That trade-off is worth stating in the docs.
4. In guided JSON mode Nano emits a lot of whitespace between tokens unless told to be compact, which inflates output tokens.
5. Batch job creation returned 403 "Creating new batch job is temporarily unavailable" throughout the night, the batch documentation URL returned 404, and /v1/batches is missing from the public OpenAPI spec. We could not confirm the discount or turnaround from official sources.
6. Nano does not report reasoning_tokens in usage.completion_tokens_details, while Super does. Consistent reporting would make cost accounting easier.
7. There is no per-key spend limit. For a public demo key this is the most-wanted feature: a hard cap per key would remove the need for an app-side cost ceiling.
8. There is no balance or credit-expiry endpoint, so a pipeline cannot check its remaining credit or a promotional expiry date programmatically.
9. No NVIDIA embedding model is served, so a fully NVIDIA retrieval stack is not possible on Token Factory today.

# Token Factory and Nemotron feedback

Running notes for the Devpost feedback field. Each item is something observed during the build, with the date.

## Wins

- 2026-10-15. GET /v1/models?verbose=true is excellent: context length, per-token prices, quantisation, per-model RPM and TPM in one call. It made budget planning exact on day 1.
- 2026-10-15. json_schema structured output is enforced on all three Nemotron 3 models (Nano, Super, Ultra), even though the model listing does not advertise structured_outputs for them.
- 2026-10-15. chat_template_kwargs pass straight through. enable_thinking and low_effort work as documented by NVIDIA, and low_effort cut Super's reasoning about five-fold on a simple prompt.
- 2026-10-15. Rate-limit headers are rich (dynamic scale, period usage), which lets a client pace itself instead of hitting 429s.

## Friction

- 2026-10-15. The supported_features field in /v1/models omits structured_outputs and json_mode for the Nemotron models although both work. A client that trusts the listing would wrongly disable structured output.
- 2026-10-15. Batch job creation returned 403 "Creating new batch job is temporarily unavailable". The batch documentation URL returns 404 and /v1/batches is absent from the public OpenAPI spec, so the discount and turnaround cannot be confirmed from official sources.
- 2026-10-15. Nano does not report reasoning_tokens in usage.completion_tokens_details, while Super does. Consistent reporting would help cost accounting.
- 2026-10-15. In guided JSON mode Nano emits a lot of whitespace and newlines between tokens, which inflates output tokens.
- 2026-10-15. There is no per-key spend limit. For a public demo key this is the most-wanted feature: a hard cap per key would remove the need for app-side cost ceilings.
- 2026-10-15. There is no balance or credit-expiry endpoint, so a pipeline cannot check remaining credit or promo expiry programmatically.

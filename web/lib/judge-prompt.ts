// The recurrence judge's prompt and schema (Nemotron Super), shared by the fixed pipeline and the agent's
// judge_candidate tool, so both judge in exactly the same way.
export const JUDGE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "brief_verdict",
    strict: true,
    schema: {
      type: "object",
      properties: {
        relation: { type: "string", enum: ["identical", "closely_related", "related", "different"] },
        same_hazard_explanation: { type: "string", maxLength: 400 },
        earlier_quote: { type: "string", maxLength: 500 },
        later_quote: { type: "string", maxLength: 500 },
        confidence: { type: "number" },
      },
      required: ["relation", "same_hazard_explanation", "earlier_quote", "later_quote", "confidence"],
      additionalProperties: false,
    },
  },
};

export const JUDGE_SYSTEM =
  "You compare a concern from an earlier coroner's Prevention of Future Deaths report with new concerns about the same " +
  "organisation, and decide whether the new concerns raise the same hazard. Output one compact JSON object.\n" +
  "relation: identical (same specific hazard and mechanism), closely_related (same specific hazard, different setting, " +
  "channel or emphasis), related (same broad area, different specific hazard), different.\n" +
  "Shared generic words are not enough for identical or closely_related.\n" +
  "same_hazard_explanation: two short neutral sentences. Never say an organisation ignored, caused, failed, neglected, " +
  "is responsible or is to blame.\n" +
  "earlier_quote: copy 10 to 45 words character for character from EARLIER CONCERN. later_quote: copy 10 to 45 words " +
  "character for character from NEW CONCERNS.\nconfidence: 0 to 1. Keep reasoning short.";

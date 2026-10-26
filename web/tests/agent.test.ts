// The live agent's loop and checks, offline: a scripted fake model, no database, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFollowup, checkMatches, runLoop, SUBMIT, type ChatFn, type ModelTurn } from "../lib/agent-core.ts";

const turn = (calls: { name: string; args: Record<string, unknown> }[], cost = 0.001): ModelTurn => ({
  toolCalls: calls.map((c, i) => ({ id: `call-${i}`, ...c })),
  content: "",
  assistant: { role: "assistant", content: "" },
  cost,
  tokensIn: 100,
  tokensOut: 20,
  reasoningTokens: 10,
  ms: 5,
  cached: false,
});

function scripted(turns: ModelTurn[]): { chat: ChatFn; forced: boolean[] } {
  const forced: boolean[] = [];
  let i = 0;
  return {
    forced,
    chat: async (_messages, forceSubmit) => {
      forced.push(forceSubmit);
      return turns[Math.min(i++, turns.length - 1)];
    },
  };
}

const MATCH = {
  candidate_id: "E1",
  relation: "identical",
  confidence: 0.9,
  explanation: "Both concern stopped vehicles in a live lane.",
  earlier_quote: "there is no hard shoulder so stopped vehicles are struck",
  new_quote: "nowhere for the driver of the first vehicle to park safely",
};

test("the agent searches, then submits; tool results go back to the model", async () => {
  const s = scripted([turn([{ name: "search_earlier_concerns", args: { concern_index: 1 } }]), turn([{ name: SUBMIT, args: { matches: [MATCH] } }])]);
  const seen: string[] = [];
  const out = await runLoop({
    chat: s.chat,
    impls: { search_earlier_concerns: async () => ({ summary: "2 found", data: [{ candidate_id: "E1" }] }) },
    messages: [{ role: "user", content: "x" }],
    maxRounds: 5,
    maxCost: 0.01,
    onEvent: (e) => seen.push(e.kind === "tool" ? `tool:${e.call.name}` : e.kind),
  });
  assert.equal(out.stop, "submitted");
  assert.equal(out.rounds, 2);
  assert.equal(out.submission?.matches[0].candidate_id, "E1");
  assert.deepEqual(seen, ["model", "tool:search_earlier_concerns", "model"]);
});

test("the last round forces a submission, and running out of rounds stops the loop", async () => {
  const s = scripted([turn([{ name: "get_chain", args: { candidate_id: "E1" } }])]);
  const out = await runLoop({
    chat: s.chat,
    impls: { get_chain: async () => ({ summary: "none", data: [] }) },
    messages: [],
    maxRounds: 3,
    maxCost: 1,
    onEvent: () => undefined,
  });
  assert.equal(out.stop, "rounds");
  assert.deepEqual(s.forced, [false, false, true]);
});

test("the cost limit stops the loop", async () => {
  const s = scripted([turn([{ name: "get_chain", args: {} }], 0.006)]);
  const out = await runLoop({ chat: s.chat, impls: { get_chain: async () => ({ summary: "", data: [] }) }, messages: [], maxRounds: 5, maxCost: 0.01, onEvent: () => undefined });
  assert.equal(out.stop, "cost");
  assert.equal(out.rounds, 2);
});

test("a tool error is reported to the model, not thrown", async () => {
  const s = scripted([turn([{ name: "nonexistent_tool", args: {} }]), turn([{ name: SUBMIT, args: { matches: [] } }])]);
  const kinds: string[] = [];
  const out = await runLoop({ chat: s.chat, impls: {}, messages: [], maxRounds: 5, maxCost: 1, onEvent: (e) => kinds.push(e.kind) });
  assert.equal(out.stop, "submitted");
  assert.ok(kinds.includes("tool_error"));
});

test("a model failure ends the loop so the fixed pipeline can take over", async () => {
  const out = await runLoop({
    chat: async () => {
      throw new Error("HTTP 500");
    },
    impls: {},
    messages: [],
    maxRounds: 5,
    maxCost: 1,
    onEvent: () => undefined,
  });
  assert.equal(out.stop, "error");
  assert.equal(out.submission, null);
});

test("submitted matches pass the same display rules as the fixed pipeline", () => {
  const candidates = new Map([["E1", { quote: "Officers said there is no hard shoulder so stopped vehicles are struck at night." }]]);
  const newText = "There was nowhere for the driver of the first vehicle to park safely on the smart motorway.";
  const checks = checkMatches(
    {
      matches: [
        MATCH,
        { ...MATCH, candidate_id: "E9" },
        { ...MATCH, relation: "related" },
        { ...MATCH, confidence: 0.6 },
        { ...MATCH, earlier_quote: "words that are not in the earlier report at all" },
      ],
    },
    candidates,
    newText,
  );
  assert.equal(checks[0].ok, true);
  assert.match(checks[1].why, /Not one of the earlier concerns/);
  assert.match(checks[2].why, /Duplicate|not the same hazard/);
  assert.equal(checks.filter((c) => c.ok).length, 1);
  // Blaming wording is never shown.
  const blame = checkMatches({ matches: [{ ...MATCH, explanation: "The organisation ignored the warning." }] }, candidates, newText);
  assert.equal(blame[0].ok, true);
  assert.equal(blame[0].match.explanation, undefined);
});

test("web evidence needs a quote found in a source the agent was given", () => {
  const sources = new Map([["https://example.org/a", "In March 2021 the trust installed new barriers at the end of every platform."]]);
  assert.equal(checkFollowup({ classification: "evidence_found", source_url: "https://example.org/a", quote: "installed new barriers at the end of every platform" }, sources).classification, "evidence_found");
  assert.equal(checkFollowup({ classification: "evidence_found", source_url: "https://example.org/a", quote: "made up words" }, sources).classification, "not_found");
  assert.equal(checkFollowup({ classification: "contradicting", source_url: "https://other.org" }, sources).classification, "not_found");
});

test("a quote that differs only in letter case is shown in the source's own words", () => {
  const candidates = new Map([["E1", { quote: "there is no hard shoulder so stopped vehicles are struck at night" }]]);
  const newText = "THERE WAS NOWHERE FOR THE DRIVER OF THE FIRST VEHICLE TO PARK SAFELY";
  const [c] = checkMatches({ matches: [{ ...MATCH, new_quote: "There was nowhere for the driver of the first vehicle to park safely" }] }, candidates, newText);
  assert.equal(c.ok, true);
  assert.equal(c.match.new_quote, "THERE WAS NOWHERE FOR THE DRIVER OF THE FIRST VEHICLE TO PARK SAFELY");
});

test("a tool's own model cost (the judge) counts towards the run's limit", async () => {
  const s = scripted([turn([{ name: "judge_candidate", args: { candidate_ids: ["E1"] } }], 0.001)]);
  const out = await runLoop({
    chat: s.chat,
    impls: { judge_candidate: async () => ({ summary: "judged", data: [], cost: 0.02 }) },
    messages: [],
    maxRounds: 5,
    maxCost: 0.01,
    onEvent: () => undefined,
  });
  assert.equal(out.stop, "cost");
  assert.ok(out.cost >= 0.021);
});

test("a submission without the web check runs it once, returns the result and asks again", async () => {
  const s = scripted([
    turn([{ name: "get_response_promises", args: { candidate_id: "E1" } }]),
    turn([{ name: SUBMIT, args: { matches: [MATCH] } }]),
    turn([{ name: SUBMIT, args: { matches: [{ ...MATCH, followups: [{ promise_id: "P7", classification: "not_found" }] }] } }]),
  ]);
  const seen: string[] = [];
  let checks = 0;
  const out = await runLoop({
    chat: s.chat,
    impls: {
      get_response_promises: async () => ({ summary: "1 action", data: [{ promise_id: "P7" }] }),
      tavily_check: async (args) => {
        checks++;
        return { summary: "2 sources", data: { promise: args.promise_id, sources: [] } };
      },
    },
    messages: [],
    maxRounds: 5,
    maxCost: 1,
    onEvent: (e) => seen.push(e.kind === "tool" ? `tool:${e.call.name}` : e.kind),
    beforeSubmit: () => (checks ? null : { id: "auto", name: "tavily_check", args: { promise_id: "P7" } }),
  });
  assert.equal(out.stop, "submitted");
  assert.equal(out.rounds, 3);
  assert.equal(checks, 1);
  assert.deepEqual(seen, ["model", "tool:get_response_promises", "model", "tool:tavily_check", "model"]);
  assert.equal(out.submission?.matches[0].followups?.[0].promise_id, "P7");
});

test("before the forced final round, a missing web check runs once and its result reaches the model", async () => {
  const s = scripted([
    turn([{ name: "get_response_promises", args: { candidate_id: "E1" } }]),
    turn([{ name: "get_chain", args: { candidate_id: "E1" } }]),
    turn([{ name: SUBMIT, args: { matches: [MATCH] } }]),
  ]);
  const seen: string[] = [];
  let checks = 0;
  const out = await runLoop({
    chat: s.chat,
    impls: {
      get_response_promises: async () => ({ summary: "1 action", data: [{ promise_id: "P7" }] }),
      get_chain: async () => ({ summary: "none", data: [] }),
      tavily_check: async () => {
        checks++;
        return { summary: "2 sources", data: { sources: [] } };
      },
    },
    messages: [],
    maxRounds: 3,
    maxCost: 1,
    onEvent: (e) => seen.push(e.kind === "tool" ? `tool:${e.call.name}` : e.kind),
    beforeSubmit: () => (checks ? null : { id: "auto", name: "tavily_check", args: { promise_id: "P7" } }),
  });
  assert.equal(out.stop, "submitted");
  assert.equal(checks, 1);
  assert.deepEqual(s.forced, [false, false, true]);
  assert.deepEqual(seen, ["model", "tool:get_response_promises", "model", "tool:get_chain", "tool:tavily_check", "model"]);
});

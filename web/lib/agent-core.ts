// The live agent's loop and checks, with no database or network imports, so they can be tested
// offline with a fake model. web/lib/agent-tools.ts supplies the real tools; web/lib/brief.ts runs it.
import { snapQuote, wordingClean } from "./text.ts";

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

export type ModelTurn = {
  toolCalls: ToolCall[];
  content: string;
  assistant: Record<string, unknown>;
  cost: number;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number;
  ms: number;
  cached: boolean;
};

export type ChatFn = (messages: Record<string, unknown>[], forceSubmit: boolean) => Promise<ModelTurn>;

export type ToolResult = { summary: string; data: unknown; cost?: number; items?: { label: string; sub?: string; score?: number; verdict?: "info" | "sent" | "kept" | "dropped"; note?: string }[] };
export type ToolImpl = (args: Record<string, unknown>) => Promise<ToolResult>;

export type LoopEvent =
  | { kind: "model"; round: number; turn: ModelTurn; calls: string[] }
  | { kind: "tool"; round: number; call: ToolCall; result: ToolResult; ms: number }
  | { kind: "tool_error"; round: number; call: ToolCall; error: string };

export type LoopOutcome = {
  submission: Submission | null;
  stop: "submitted" | "rounds" | "cost" | "no_tool" | "error";
  rounds: number;
  cost: number;
};

export type SubmittedMatch = {
  candidate_id: string;
  relation: string;
  confidence: number;
  explanation?: string;
  earlier_quote: string;
  new_quote: string;
  promise_ids?: string[];
  followups?: { promise_id: string; classification: string; source_url?: string; quote?: string }[];
};
export type Submission = { matches: SubmittedMatch[]; summary?: string };

export const SUBMIT = "submit_findings";

// One agent run: the model picks tools until it submits, or a limit stops it.
export async function runLoop(opts: {
  chat: ChatFn;
  impls: Record<string, ToolImpl>;
  messages: Record<string, unknown>[];
  maxRounds: number;
  maxCost: number;
  onEvent: (e: LoopEvent) => void;
  // Asked once, when the model first tries to submit with rounds to spare: a tool call it should have made
  // first (the web check on a promise it read). The loop runs it, returns the result and asks again.
  beforeSubmit?: () => ToolCall | null;
}): Promise<LoopOutcome> {
  const messages = [...opts.messages];
  let cost = 0;
  let asked = false;
  for (let round = 1; round <= opts.maxRounds; round++) {
    // Before the forced final round, the same check: run it and show the model the result.
    if (round === opts.maxRounds && round > 1 && !asked && opts.beforeSubmit) {
      asked = true;
      const first = opts.beforeSubmit();
      const impl = first ? opts.impls[first.name] : undefined;
      if (first && impl) {
        const t0 = Date.now();
        try {
          const result = await impl(first.args);
          cost += result.cost ?? 0;
          opts.onEvent({ kind: "tool", round, call: first, result, ms: Date.now() - t0 });
          messages.push({
            role: "user",
            content: `Before you submit: ${first.name} ran on ${JSON.stringify(first.args)}. Result: ${JSON.stringify(result.data).slice(0, 5000)} Add any web follow-up it supports.`,
          });
        } catch (e) {
          opts.onEvent({ kind: "tool_error", round, call: first, error: e instanceof Error ? e.message : String(e) });
        }
      }
    }
    let turn: ModelTurn;
    try {
      turn = await opts.chat(messages, round === opts.maxRounds);
    } catch {
      return { submission: null, stop: "error", rounds: round, cost };
    }
    cost += turn.cost;
    opts.onEvent({ kind: "model", round, turn, calls: turn.toolCalls.map((c) => c.name) });
    if (!turn.toolCalls.length) return { submission: null, stop: "no_tool", rounds: round, cost };
    messages.push(turn.assistant);
    for (const [i, call] of turn.toolCalls.entries()) {
      if (call.name === SUBMIT) {
        const first = !asked && round < opts.maxRounds && opts.beforeSubmit ? opts.beforeSubmit() : null;
        asked = true;
        const impl = first ? opts.impls[first.name] : undefined;
        if (!first || !impl) return { submission: normaliseSubmission(call.args), stop: "submitted", rounds: round, cost };
        const t0 = Date.now();
        let data: unknown;
        try {
          const result = await impl(first.args);
          cost += result.cost ?? 0;
          opts.onEvent({ kind: "tool", round, call: first, result, ms: Date.now() - t0 });
          data = result.data;
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          opts.onEvent({ kind: "tool_error", round, call: first, error });
          data = { error: error.slice(0, 200) };
        }
        const content = JSON.stringify({
          not_submitted_yet: `Ran ${first.name} first: ${JSON.stringify(first.args)}. Add any web follow-up it supports, then call ${SUBMIT} again.`,
          result: data,
        }).slice(0, 6000);
        messages.push({ role: "tool", tool_call_id: call.id, content });
        for (const rest of turn.toolCalls.slice(i + 1)) messages.push({ role: "tool", tool_call_id: rest.id, content: JSON.stringify({ skipped: true }) });
        break;
      }
      const impl = opts.impls[call.name];
      const t0 = Date.now();
      let content: string;
      try {
        if (!impl) throw new Error(`unknown tool ${call.name}`);
        const result = await impl(call.args);
        cost += result.cost ?? 0;
        opts.onEvent({ kind: "tool", round, call, result, ms: Date.now() - t0 });
        content = JSON.stringify(result.data).slice(0, 6000);
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        opts.onEvent({ kind: "tool_error", round, call, error });
        content = JSON.stringify({ error: error.slice(0, 200) });
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
    if (cost >= opts.maxCost) return { submission: null, stop: "cost", rounds: round, cost };
  }
  return { submission: null, stop: "rounds", rounds: opts.maxRounds, cost };
}

function normaliseSubmission(args: Record<string, unknown>): Submission {
  const raw = Array.isArray(args.matches) ? args.matches : [];
  const matches = raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => ({
      candidate_id: String(m.candidate_id ?? ""),
      relation: String(m.relation ?? ""),
      confidence: Number(m.confidence ?? 0),
      explanation: typeof m.explanation === "string" ? m.explanation : undefined,
      earlier_quote: String(m.earlier_quote ?? ""),
      new_quote: String(m.new_quote ?? ""),
      promise_ids: Array.isArray(m.promise_ids) ? m.promise_ids.map(String) : [],
      followups: Array.isArray(m.followups)
        ? (m.followups as Record<string, unknown>[]).map((f) => ({
            promise_id: String(f.promise_id ?? ""),
            classification: String(f.classification ?? ""),
            source_url: typeof f.source_url === "string" ? f.source_url : undefined,
            quote: typeof f.quote === "string" ? f.quote : undefined,
          }))
        : [],
    }));
  return { matches, summary: typeof args.summary === "string" ? args.summary : undefined };
}

export type Checked = { match: SubmittedMatch; ok: boolean; why: string };

// The same display rules as the fixed pipeline: identical or closely related, confidence of at least
// 0.70, both quotes found word for word, neutral wording. The model cannot cite anything it was not shown.
export function checkMatches(
  sub: Submission,
  candidates: Map<string, { quote: string }>,
  newText: string,
): Checked[] {
  const seen = new Set<string>();
  return sub.matches.map((m) => {
    const c = candidates.get(m.candidate_id);
    let why = "";
    if (!c) why = "Not one of the earlier concerns the agent retrieved";
    else if (seen.has(m.candidate_id)) why = "Duplicate";
    else if (m.relation !== "identical" && m.relation !== "closely_related") why = `Judged ${m.relation.replace("_", " ")}: not the same hazard`;
    else if (!(m.confidence >= 0.7)) why = `Confidence ${m.confidence.toFixed(2)} is below 0.70`;
    const eq = c ? snapQuote(m.earlier_quote, c.quote) : null;
    const nq = snapQuote(m.new_quote, newText);
    if (!why && !eq) why = "Earlier quote not found word for word";
    else if (!why && !nq) why = "New quote not found word for word";
    seen.add(m.candidate_id);
    const ok = !why;
    return {
      match: {
        ...m,
        earlier_quote: eq ?? m.earlier_quote,
        new_quote: nq ?? m.new_quote,
        explanation: m.explanation && wordingClean(m.explanation) ? m.explanation : undefined,
      },
      ok,
      why: ok ? `Judged ${m.relation.replace("_", " ")}, confidence ${m.confidence.toFixed(2)}, both quotes verified` : why,
    };
  });
}

// Follow-up evidence the agent reports: shown only with a quote found word for word in a source it was given.
export function checkFollowup(
  f: { classification: string; source_url?: string; quote?: string },
  sources: Map<string, string>,
): { classification: "evidence_found" | "not_found" | "contradicting"; source_url?: string; quote?: string } {
  const cls = f.classification === "evidence_found" || f.classification === "contradicting" ? f.classification : "not_found";
  if (cls === "not_found") return { classification: "not_found" };
  const text = f.source_url ? sources.get(f.source_url) : undefined;
  const q = text && f.quote ? snapQuote(f.quote, text) : null;
  if (!q) return { classification: "not_found" };
  return { classification: cls, source_url: f.source_url, quote: q };
}

import "server-only";
import { checkFollowup, checkMatches, runLoop, SUBMIT, type ChatFn, type LoopEvent, type ToolImpl } from "./agent-core";
import type { BriefMatch, Step, TraceItem } from "./brief";
import { q } from "./db";
import { chat, embed } from "./llm";
import { tavilySearch, TavilyUnavailable } from "./tavily";
import { JUDGE_SCHEMA, JUDGE_SYSTEM } from "./judge-prompt";
import { normForMatch, redactNames } from "./text";

// The live agent: Nemotron Super chooses tools until it submits its findings (native tool calling on
// Nebius Token Factory). Limits: 5 rounds, $0.015 per run. Any failure returns null and the caller
// falls back to the fixed pipeline.
const MAX_ROUNDS = Number(process.env.LIVE_AGENT_MAX_ROUNDS ?? "5");
const MAX_COST = Number(process.env.LIVE_AGENT_MAX_COST_USD ?? "0.015");
const DIM = 256;

const toVec = (v: ArrayLike<number>) => "[" + Array.from(v, (x) => x.toFixed(5)).join(",") + "]";
const short = (t: string, n = 140) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);
const stripTitle = (t: string) => t.replace(/\s*[:\-–]\s*Prevention of future deaths? report\s*$/i, "");

type Candidate = { id: string; report_url: string; date: string; quote: string; hazard: string; title: string; d: number };

const TOOL_LABEL: Record<string, string> = {
  search_earlier_concerns: "Search earlier warnings",
  get_response_promises: "Read what was promised",
  get_chain: "Look up the recurrence chain",
  judge_candidate: "Judge the closest matches",
  tavily_check: "Check the web for what happened next",
};

const SYSTEM = [
  "You investigate whether a new coroner's Prevention of Future Deaths report repeats a hazard that coroners raised earlier with the same organisation.",
  "Use the tools. A good order: search_earlier_concerns (once per new concern, or with your own query); judge_candidate on the three to five closest candidates in one call; get_response_promises and get_chain for the candidates judged the same hazard; optionally tavily_check for at most two of their promises.",
  "judge_candidate runs the recurrence judge and checks its quotes word for word. Only candidates it marks kept can be reported.",
  `You have at most ${MAX_ROUNDS} rounds of tool calls. Call ${SUBMIT} before you run out.`,
  "Never say an organisation ignored, caused, failed, neglected, is responsible or is to blame. Lack of web evidence is not_found, never contradicting.",
  "In submit_findings, list the kept candidates, the promise ids you looked at, and any web follow-up. Keep reasoning short.",
].join("\n");

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_earlier_concerns",
      description: "Find the earlier concerns sent to this organisation that are closest in meaning. Give concern_index to search with one of the new concerns, or query for your own words.",
      parameters: {
        type: "object",
        properties: {
          concern_index: { type: "integer", description: "1-based index of a new concern" },
          query: { type: "string", description: "Your own search words, if not using concern_index" },
          k: { type: "integer", description: "How many to return, 1 to 8" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_response_promises",
      description: "The actions the organisation stated in its published response to an earlier report.",
      parameters: { type: "object", properties: { candidate_id: { type: "string" } }, required: ["candidate_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_chain",
      description: "Whether this earlier report is already part of a recurrence chain, and how many reports that chain has.",
      parameters: { type: "object", properties: { candidate_id: { type: "string" } }, required: ["candidate_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "judge_candidate",
      description: "Judge whether earlier candidates raise the same hazard as the new concerns (Nemotron Super, structured verdict), with both quotes checked word for word. Judge several at once.",
      parameters: {
        type: "object",
        properties: { candidate_ids: { type: "array", items: { type: "string" }, maxItems: 5 } },
        required: ["candidate_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tavily_check",
      description: "Search the web (Tavily) for evidence of whether a stated action was carried out. Uses an earlier check if one exists.",
      parameters: { type: "object", properties: { promise_id: { type: "string" } }, required: ["promise_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: SUBMIT,
      description: "Submit your findings. Call this once, last.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "One neutral sentence" },
          matches: {
            type: "array",
            maxItems: 3,
            items: {
              type: "object",
              properties: {
                candidate_id: { type: "string", description: "A candidate judge_candidate marked kept" },
                promise_ids: { type: "array", items: { type: "string" } },
                followups: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      promise_id: { type: "string" },
                      classification: { type: "string", enum: ["evidence_found", "not_found", "contradicting"] },
                      source_url: { type: "string" },
                      quote: { type: "string", description: "Copied character for character from the source" },
                    },
                    required: ["promise_id", "classification"],
                  },
                },
              },
              required: ["candidate_id"],
            },
          },
        },
        required: ["matches"],
      },
    },
  },
];

export type AgentContext = {
  org: { id: number; name: string };
  url?: string;
  reportDate: string | null;
  concerns: { quote: string; hazard: string; vec?: Float32Array }[];
  concernsText: string;
};

export type AgentOutput = {
  matches: BriefMatch[];
  other_earlier: { url: string; slug: string; title: string; date: string; hazard: string }[];
  searched: number;
  cost: number;
  rounds: number;
};

export async function runAgent(ctx: AgentContext, emit: (s: Step) => void): Promise<AgentOutput | null> {
  const candidates = new Map<string, Candidate>();
  const byUrl = new Map<string, string>();
  const promises = new Map<string, { id: number; quote: string; timescale: string | null; report_url: string }>();
  const web = new Map<string, string>();
  const verdicts = new Map<string, ReturnType<typeof checkMatches>[number]>();
  const newText = ctx.concerns.map((c) => c.quote).join("\n") + "\n" + ctx.concernsText;
  let searched = 0;
  let toolN = 0;
  const t0 = Date.now();
  emit({ id: "agent", label: "Investigate with tools", tool: "Nemotron Super, tool calling", status: "running", detail: `Up to ${MAX_ROUNDS} rounds` });

  const impls: Record<string, ToolImpl> = {
    search_earlier_concerns: async (args) => {
      const idx = Number(args.concern_index);
      let vec: Float32Array | undefined;
      let what: string;
      if (Number.isInteger(idx) && idx >= 1 && idx <= ctx.concerns.length) {
        vec = ctx.concerns[idx - 1].vec;
        what = `new concern ${idx}: ${short(ctx.concerns[idx - 1].hazard, 60)}`;
      }
      if (!vec) {
        const query = String(args.query ?? ctx.concerns[0]?.hazard ?? "").slice(0, 300);
        vec = Float32Array.from((await embed("brief-embed", [query], DIM))[0]);
        what = `"${short(query, 60)}"`;
      }
      const k = Math.min(8, Math.max(1, Number(args.k) || 6));
      const rows = await q<{ report_url: string; date: string; quote: string; hazard: string; title: string; d: number }>(
        `SELECT c.report_url, c.date::text, c.quote, c.hazard, r.title, (c.embedding <=> $2::vector) AS d
         FROM pub_brief_concerns c JOIN pub_reports r ON r.url = c.report_url
         WHERE c.org_id = $1 AND c.report_url <> $3 AND ($4::date IS NULL OR c.date < $4::date)
         ORDER BY c.embedding <=> $2::vector LIMIT 24`,
        [ctx.org.id, toVec(vec), ctx.url ?? "", ctx.reportDate]);
      if (!searched) {
        const n = await q<{ n: number }>("SELECT COUNT(*)::int n FROM pub_brief_concerns WHERE org_id = $1", [ctx.org.id]);
        searched = n[0]?.n ?? 0;
      }
      const best = new Map<string, (typeof rows)[number]>();
      for (const r of rows) if (!best.has(r.report_url)) best.set(r.report_url, r);
      const top = [...best.values()].slice(0, k);
      const out = top.map((r) => {
        let id = byUrl.get(r.report_url);
        if (!id) {
          id = `E${candidates.size + 1}`;
          byUrl.set(r.report_url, id);
          candidates.set(id, { id, ...r });
        }
        return { candidate_id: id, date: r.date, report: stripTitle(r.title), hazard: r.hazard, quote: r.quote.slice(0, 420), similarity: Number((1 - r.d).toFixed(3)) };
      });
      return {
        summary: `${what!}: ${out.length} closest of ${searched.toLocaleString("en-GB")} earlier concerns`,
        data: out,
        items: out.map((o) => ({ label: `${o.candidate_id} · ${o.report}`, sub: `${o.date} · ${o.hazard}`, score: o.similarity, verdict: "info" as const })),
      };
    },
    get_response_promises: async (args) => {
      const c = candidates.get(String(args.candidate_id));
      if (!c) return { summary: "Unknown candidate", data: { error: "unknown candidate_id; use an id from search_earlier_concerns" } };
      const rows = await q<{ pdf_url: string; promises: { id: number; quote: string; timescale: string | null }[] }>(
        "SELECT pdf_url, promises FROM pub_responses WHERE report_url = $1 AND org_id = $2 AND NOT unmatched", [c.report_url, ctx.org.id]);
      const ps = rows.flatMap((r) => r.promises.map((p) => ({ ...p, pdf: r.pdf_url })));
      for (const p of ps) promises.set(`P${p.id}`, { id: p.id, quote: p.quote, timescale: p.timescale, report_url: c.report_url });
      const data = rows.length
        ? { response_found: true, promises: ps.slice(0, 6).map((p) => ({ promise_id: `P${p.id}`, stated_action: p.quote.slice(0, 400), timescale: p.timescale })) }
        : { response_found: false, note: "No published response to this report was found on judiciary.uk. It may exist elsewhere." };
      return {
        summary: rows.length ? `${c.id}: ${ps.length} stated ${ps.length === 1 ? "action" : "actions"} in the response` : `${c.id}: no published response found`,
        data,
        items: ps.slice(0, 4).map((p) => ({ label: `P${p.id}`, sub: short(p.quote), verdict: "info" as const })),
      };
    },
    get_chain: async (args) => {
      const c = candidates.get(String(args.candidate_id));
      if (!c) return { summary: "Unknown candidate", data: { error: "unknown candidate_id" } };
      const rows = await q<{ key: string; hazard: string; n_reports: number; first_date: string; last_date: string }>(
        `SELECT ch.key, ch.hazard, ch.n_reports, ch.first_date::text, ch.last_date::text FROM pub_chain_reports cr
         JOIN pub_chains ch ON ch.key = cr.chain_key WHERE cr.report_url = $1 AND ch.org_id = $2`, [c.report_url, ctx.org.id]);
      return {
        summary: rows.length ? `${c.id} is in ${rows.length === 1 ? "a chain" : `${rows.length} chains`}: ${short(rows[0].hazard, 70)} (${rows[0].n_reports} reports)` : `${c.id} is not in a chain yet`,
        data: rows.map((r) => ({ chain: r.key, hazard: r.hazard, reports: r.n_reports, years: `${r.first_date.slice(0, 4)}-${r.last_date.slice(0, 4)}` })),
      };
    },
    judge_candidate: async (args) => {
      const ids = (Array.isArray(args.candidate_ids) ? args.candidate_ids : [args.candidate_id]).map(String).slice(0, 5);
      const todo = ids.map((id) => candidates.get(id)).filter((c): c is Candidate => !!c);
      if (!todo.length) return { summary: "No known candidates", data: { error: "use candidate ids from search_earlier_concerns" } };
      let cost = 0;
      const out = await Promise.all(
        todo.map(async (c) => {
          const r = await chat({
            stage: "brief-judge",
            model: "super",
            maxTokens: 1500,
            thinking: true,
            lowEffort: true,
            responseFormat: JUDGE_SCHEMA,
            messages: [
              { role: "system", content: JUDGE_SYSTEM },
              { role: "user", content: `ORGANISATION: ${ctx.org.name}\n\nEARLIER REPORT dated ${c.date}\nEARLIER CONCERN: ${c.quote}\n(hazard: ${c.hazard})\n\nNEW CONCERNS:\n${ctx.concernsText}` },
            ],
          });
          cost += r.cost;
          const v = r.parsed as { relation: string; same_hazard_explanation: string; earlier_quote: string; later_quote: string; confidence: number } | null;
          const match = v
            ? { candidate_id: c.id, relation: v.relation, confidence: Number(v.confidence), explanation: v.same_hazard_explanation, earlier_quote: v.earlier_quote, new_quote: v.later_quote }
            : null;
          const [chk] = match ? checkMatches({ matches: [match] }, candidates, newText) : [null];
          if (chk) verdicts.set(c.id, chk);
          return { c, chk, v };
        }),
      );
      const kept = out.filter((o) => o.chk?.ok).length;
      return {
        summary: `${kept} of ${out.length} judged the same or a closely related hazard, quotes verified`,
        cost,
        data: out.map((o) => ({
          candidate_id: o.c.id,
          relation: o.v?.relation ?? "no verdict",
          confidence: o.v?.confidence ?? null,
          kept: !!o.chk?.ok,
          reason: o.chk?.why ?? "No usable verdict",
        })),
        items: out.map((o) => ({
          label: `${o.c.id} · ${stripTitle(o.c.title)}`,
          sub: `${o.c.date} · ${o.c.hazard}`,
          verdict: o.chk?.ok ? ("kept" as const) : ("dropped" as const),
          note: o.chk?.why ?? "No usable verdict",
        })),
      };
    },
    tavily_check: async (args) => {
      const pid = String(args.promise_id);
      const p = promises.get(pid);
      if (!p) return { summary: "Unknown promise", data: { error: "unknown promise_id; use an id from get_response_promises" } };
      // An earlier pipeline check (Stage F) is reused at no cost.
      const prior = await q<{ f: { classification: string; summary: string | null; sources: { url: string; title: string; quote: string }[] } }>(
        `SELECT f FROM pub_chains, jsonb_array_elements(detail->'followups') f WHERE (f->>'promise_id')::int = $1 LIMIT 1`, [p.id]);
      if (prior.length) {
        const f = prior[0].f;
        for (const s of f.sources) web.set(s.url, s.quote);
        return {
          summary: `${pid}: earlier web check found "${f.classification.replace("_", " ")}" (reused, no new search)`,
          data: { earlier_check: f.classification, sources: f.sources.map((s) => ({ url: s.url, title: s.title, content: s.quote })) },
          items: f.sources.slice(0, 2).map((s) => ({ label: s.title || s.url, sub: short(s.quote), verdict: "info" as const })),
        };
      }
      try {
        const words = p.quote.split(/\s+/).slice(0, 18).join(" ");
        const res = await tavilySearch(`${ctx.org.name} ${words}`);
        for (const s of res.sources) web.set(s.url, s.content);
        return {
          summary: `${pid}: ${res.sources.length} web sources${res.cached ? " (cached)" : ""}`,
          data: { sources: res.sources.map((s) => ({ url: s.url, title: s.title, content: s.content.slice(0, 900) })) },
          items: res.sources.slice(0, 3).map((s) => ({ label: s.title || s.url, sub: short(s.content), verdict: "info" as const })),
        };
      } catch (e) {
        const msg = e instanceof TavilyUnavailable ? e.message : "web search failed";
        return { summary: `${pid}: ${msg}`, data: { note: `${msg}; treat as not_found` } };
      }
    },
  };

  const chatFn: ChatFn = async (messages, forceSubmit) => {
    const r = await chat({
      stage: "brief-agent",
      model: "super",
      maxTokens: 1800,
      thinking: true,
      lowEffort: true,
      messages,
      tools: TOOLS,
      toolChoice: forceSubmit ? { type: "function", function: { name: SUBMIT } } : "auto",
    });
    return { toolCalls: r.toolCalls, content: r.content, assistant: r.assistant, cost: r.cost, tokensIn: r.tokensIn, tokensOut: r.tokensOut, reasoningTokens: r.reasoningTokens, ms: r.ms, cached: r.cacheHit };
  };

  const user = [
    `ORGANISATION: ${ctx.org.name}`,
    ctx.reportDate ? `NEW REPORT DATE: ${ctx.reportDate}` : "",
    "NEW CONCERNS:",
    ...ctx.concerns.map((c, i) => `${i + 1}. [${c.hazard}] ${c.quote}`),
  ].filter(Boolean).join("\n");

  const outcome = await runLoop({
    chat: chatFn,
    impls,
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
    maxRounds: MAX_ROUNDS,
    maxCost: MAX_COST,
    onEvent: (e: LoopEvent) => {
      if (e.kind === "model") {
        const chose = e.calls.map((n) => (n === SUBMIT ? "submit its findings" : n)).join(", ");
        emit({
          id: `think-${e.round}`,
          label: `Round ${e.round}: Nemotron Super decides`,
          tool: "Nemotron Super",
          status: "done",
          detail: chose ? `Chose: ${chose}` : "Gave no tool call",
          ms: e.turn.ms,
          tokensIn: e.turn.tokensIn,
          tokensOut: e.turn.tokensOut,
          reasoningTokens: e.turn.reasoningTokens,
          cost: e.turn.cost,
          cached: e.turn.cached,
        });
      } else if (e.kind === "tool") {
        toolN++;
        emit({ id: `tool-${toolN}`, label: TOOL_LABEL[e.call.name] ?? e.call.name, tool: `${e.call.name}()`, status: "done", detail: e.result.summary, ms: e.ms, cost: e.result.cost, items: e.result.items as TraceItem[] | undefined });
      } else {
        toolN++;
        emit({ id: `tool-${toolN}`, label: TOOL_LABEL[e.call.name] ?? e.call.name, tool: `${e.call.name}()`, status: "done", detail: `Error: ${short(e.error, 80)}` });
      }
    },
  });

  if (!outcome.submission) {
    const why = { rounds: "ran out of rounds", cost: "reached its cost limit", no_tool: "stopped without submitting", error: "could not be reached", submitted: "" }[outcome.stop];
    emit({ id: "agent", label: "Investigate with tools", tool: "Nemotron Super, tool calling", status: "done", detail: `The agent ${why}; switching to the fixed pipeline`, ms: Date.now() - t0 });
    return null;
  }

  // Verdicts come from judge_candidate, already checked in code. Every verified verdict is reported, and
  // the agent's submission adds the promises and web follow-ups it looked at.
  const submitted = new Map(outcome.submission.matches.map((m) => [m.candidate_id, m]));
  const checked = [...verdicts.values()].map((v) => ({ ...v, match: { ...v.match, followups: submitted.get(v.match.candidate_id)?.followups ?? [] } }));
  const listedNotKept = [...submitted.keys()].filter((id) => !verdicts.get(id)?.ok);
  emit({
    id: "verify",
    label: "Check every claim",
    tool: "Quote checks",
    status: "done",
    detail: `${checked.filter((x) => x.ok).length} verified ${checked.filter((x) => x.ok).length === 1 ? "match" : "matches"} reported${listedNotKept.length ? `; ${listedNotKept.length} listed by the agent without a verified verdict, left out` : ""}`,
    items: checked.map((x) => {
      const c = candidates.get(x.match.candidate_id);
      return { label: c ? `${c.id} · ${stripTitle(c.title)}` : x.match.candidate_id, sub: c ? `${c.date} · ${c.hazard}` : undefined, verdict: x.ok ? "kept" : "dropped", note: x.why };
    }),
  });

  const kept = checked.filter((x) => x.ok);
  const urls = [...candidates.values()].map((c) => c.report_url);
  const meta = new Map(
    (await q<{ url: string; slug: string; title: string; date: string; coroner: string | null; area: string | null }>(
      "SELECT url, slug, title, date::text, coroner, area FROM pub_reports WHERE url = ANY($1)", [urls])).map((r) => [r.url, r]));
  const promisesOf = new Map<string, BriefMatch["promises"]>();
  for (const r of await q<{ report_url: string; promises: { id: number; quote: string; timescale: string | null }[] }>(
    "SELECT report_url, promises FROM pub_responses WHERE report_url = ANY($1) AND org_id = $2 AND NOT unmatched", [urls, ctx.org.id])) {
    promisesOf.set(r.report_url, [...(promisesOf.get(r.report_url) ?? []), ...r.promises].slice(0, 3));
  }
  const chainsOf = new Map<string, BriefMatch["chains"]>();
  for (const r of await q<{ report_url: string; key: string; hazard: string }>(
    `SELECT cr.report_url, c.key, c.hazard FROM pub_chain_reports cr JOIN pub_chains c ON c.key = cr.chain_key
     WHERE cr.report_url = ANY($1) AND c.org_id = $2`, [urls, ctx.org.id])) {
    chainsOf.set(r.report_url, [...(chainsOf.get(r.report_url) ?? []), { key: r.key, hazard: r.hazard }]);
  }

  const matches: BriefMatch[] = [];
  for (const { match } of kept) {
    const c = candidates.get(match.candidate_id)!;
    const m = meta.get(c.report_url);
    if (!m) continue;
    const followups = (match.followups ?? [])
      .filter((f) => promises.has(f.promise_id))
      .map((f) => {
        const ok = checkFollowup(f, web);
        const p = promises.get(f.promise_id)!;
        // Web sources can name staff: redact them like every other displayed quote.
        return { promise: p.quote, ...ok, ...(ok.quote ? { quote: redactNames(ok.quote) } : {}) };
      });
    matches.push({
      earlier: m,
      relation: match.relation,
      confidence: Math.round(Math.min(1, Math.max(0, match.confidence)) * 100) / 100,
      explanation: match.explanation ?? null,
      earlier_quote: normForMatch(match.earlier_quote),
      later_quote: normForMatch(match.new_quote),
      promises: promisesOf.get(c.report_url) ?? [],
      chains: chainsOf.get(c.report_url) ?? [],
      followups,
    });
  }
  const matchedUrls = new Set(kept.map((k) => candidates.get(k.match.candidate_id)!.report_url));
  const other_earlier = [...candidates.values()]
    .filter((c) => !matchedUrls.has(c.report_url))
    .sort((a, b) => a.d - b.d)
    .slice(0, 5)
    .flatMap((c) => {
      const m = meta.get(c.report_url);
      return m ? [{ url: m.url, slug: m.slug, title: m.title, date: m.date, hazard: c.hazard }] : [];
    });
  emit({
    id: "agent",
    label: "Investigate with tools",
    tool: "Nemotron Super, tool calling",
    status: "done",
    detail: `${outcome.rounds} ${outcome.rounds === 1 ? "round" : "rounds"}, ${toolN} tool ${toolN === 1 ? "call" : "calls"}`,
    ms: Date.now() - t0,
  });
  return { matches, other_earlier, searched, cost: outcome.cost, rounds: outcome.rounds };
}

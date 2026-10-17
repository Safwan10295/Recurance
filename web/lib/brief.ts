import "server-only";
import type { QuoteContext } from "./types";
import { cached, q, q1 } from "./db";
import { runAgent } from "./agent";
import { JUDGE_SCHEMA, JUDGE_SYSTEM } from "./judge-prompt";
import { chat, embed } from "./llm";
import {
  htmlToText,
  normForMatch,
  orgKey,
  redactNames,
  splitSections,
  stripBoilerplate,
  tokenSetSimilarity,
  verifyQuote,
  wordingClean,
} from "./text";

// The live pre-inquest brief agent (handoff section 9.9), on PostgreSQL + pgvector.
// Steps: get the report (archive or judiciary.uk) -> resolve organisation -> concerns (stored or Nano)
// -> nearest earlier concerns for that organisation (pgvector) -> judge the closest with Super
// -> brief with verified quotes, promises and links to chains.

// One line in a step's trace: a concern found, a candidate retrieved, a verdict.
export type TraceItem = {
  label: string;
  sub?: string;
  score?: number; // similarity 0..1 for retrieved candidates
  verdict?: "kept" | "dropped" | "sent" | "info";
  note?: string;
};

// A step of the agent, streamed as it happens. The trace fields show what each tool or model used.
export type Step = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "skipped";
  detail?: string;
  tool?: string;
  ms?: number;
  tokensIn?: number;
  tokensOut?: number;
  reasoningTokens?: number;
  cost?: number;
  cached?: boolean;
  items?: TraceItem[];
};
export type Emit = (s: Step) => void;

const DIM = 256;

export interface BriefMatch {
  earlier: { url: string; slug: string; title: string; date: string; coroner: string | null; area: string | null };
  relation: string;
  confidence: number;
  explanation: string | null;
  earlier_quote: string;
  later_quote: string;
  // Archive briefs only: the published, redacted source window around each quote.
  earlier_context?: QuoteContext | null;
  later_context?: QuoteContext | null;
  promises: { id: number; quote: string; timescale: string | null }[];
  chains: { key: string; hazard: string }[];
  // From the agent's web check (Tavily): shown only with a verified quote; "not_found" never means "did not happen".
  followups?: { promise: string; classification: "evidence_found" | "not_found" | "contradicting"; source_url?: string; quote?: string }[];
}

export interface BriefResult {
  organisation: { id: number; name: string } | null;
  report: { url: string; slug?: string; title: string; date: string | null; known: boolean } | null;
  concerns: { quote: string; hazard: string }[];
  matches: BriefMatch[];
  other_earlier: { url: string; slug: string; title: string; date: string; hazard: string }[];
  searched: number;
  cost: number;
  notes: string[];
  mode?: "agent" | "fixed" | "archive";
}

const toVec = (v: ArrayLike<number>) => "[" + Array.from(v, (x) => x.toFixed(5)).join(",") + "]";
const parseVec = (s: string) => Float32Array.from(JSON.parse(s) as number[]);

const orgIndex = () =>
  cached(
    "brief-org-index",
    async () => {
      const aliases = await q<{ alias_key: string; org_id: number }>("SELECT alias_key, org_id FROM pub_org_aliases");
      const orgs = await q<{ id: number; name: string }>("SELECT id, name FROM pub_orgs");
      return { aliases: new Map(aliases.map((a) => [a.alias_key, a.org_id])), names: new Map(orgs.map((o) => [o.id, o.name])) };
    },
    600_000,
  );

export async function resolveOrg(name: string): Promise<{ id: number; name: string } | null> {
  const idx = await orgIndex();
  const k = orgKey(name);
  if (!k) return null;
  const exact = idx.aliases.get(k);
  if (exact !== undefined) return { id: exact, name: idx.names.get(exact) ?? name };
  let best: [number, number] | null = null;
  for (const [alias, id] of idx.aliases) {
    const s = tokenSetSimilarity(k, alias);
    if (!best || s > best[1]) best = [id, s];
  }
  if (best && best[1] >= 0.8) return { id: best[0], name: idx.names.get(best[0]) ?? name };
  return null;
}

const EXTRACT_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "brief_concerns",
    strict: true,
    schema: {
      type: "object",
      properties: {
        concerns: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            properties: { quote: { type: "string", maxLength: 500 }, hazard: { type: "string", maxLength: 120 } },
            required: ["quote", "hazard"],
            additionalProperties: false,
          },
        },
      },
      required: ["concerns"],
      additionalProperties: false,
    },
  },
};

async function fetchReport(url: string): Promise<{ title: string; date: string | null; sentTo: string | null; concerns: string } | null> {
  if (!/^https:\/\/www\.judiciary\.uk\/prevention-of-future-death-reports\/[a-z0-9-]+\/?$/.test(url)) return null;
  const contact = process.env.SCRAPER_CONTACT_EMAIL ?? "";
  const r = await fetch(url, {
    headers: { "User-Agent": `RecurrenceWatch/0.1 (live brief; contact: ${contact})` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) return null;
  const html = await r.text();
  const art = html.match(/<article[\s\S]*?<\/article>/)?.[0] ?? html;
  const title = htmlToText(art.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
  const text = htmlToText(art.match(/<div class="flow">([\s\S]*?)<div class="related-content/)?.[1] ?? art);
  const meta = (k: RegExp) => text.match(k)?.[1]?.trim() ?? null;
  const dateRaw = meta(/Date of report:\s*([^\n]+)/i);
  let date: string | null = null;
  const dm = dateRaw?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dm) date = `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
  const sec = splitSections(text);
  return { title, date, sentTo: meta(/This report is being sent to:\s*([^\n]+)/i), concerns: stripBoilerplate(sec.concerns ?? "") };
}

interface Candidate {
  report_url: string;
  date: string;
  quote: string;
  hazard: string;
  d: number;
}

const LABELS: Record<string, string> = {
  agent: "Investigate with tools",
  fetch: "Read the report",
  org: "Identify the organisation",
  extract: "Extract the concerns",
  retrieve: "Search earlier warnings",
  judge: "Judge each match",
  brief: "Write the brief",
};
const TOOLS: Record<string, string> = {
  agent: "Nemotron Super, tool calling",
  fetch: "Archive or judiciary.uk",
  org: "Organisation index",
  extract: "Nemotron Nano",
  retrieve: "Qwen3 embeddings + pgvector",
  judge: "Nemotron Super (reasoning)",
  brief: "Quote checks",
};
const short = (t: string, n = 140) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);
const stripTitle = (t: string) => t.replace(/\s*[:\-–]\s*Prevention of future deaths? report\s*$/i, "");

export async function runBrief(
  input: { reportUrl?: string; reportSlug?: string; concerns?: string; organisation?: string; orgId?: number },
  emit: Emit,
): Promise<BriefResult> {
  const result: BriefResult = { organisation: null, report: null, concerns: [], matches: [], other_earlier: [], searched: 0, cost: 0, notes: [] };
  const started: Record<string, number> = {};
  const step = (id: string, status: Step["status"], extra: Partial<Step> = {}) => {
    if (status === "running" && !started[id]) started[id] = Date.now();
    const ms = status === "done" && started[id] ? Date.now() - started[id] : undefined;
    emit({ id, label: LABELS[id], tool: TOOLS[id], status, ...(ms !== undefined ? { ms } : {}), ...extra });
  };

  // 1. The report: from the archive if we have it, otherwise read judiciary.uk.
  let concernsText = (input.concerns ?? "").trim();
  let orgName = (input.organisation ?? "").trim();
  let reportDate: string | null = null;
  let url = input.reportUrl?.trim() ? input.reportUrl.trim().replace(/\/?$/, "/") : undefined;
  let knownOrgIds: number[] = [];
  if (input.reportSlug) {
    const r = await q1<{ url: string }>("SELECT url FROM pub_reports WHERE slug = $1", [input.reportSlug]);
    if (r) url = r.url;
  }
  // Show the whole plan first, so the steps light up as the agent works through them.
  const agentOn = process.env.LIVE_AGENT !== "off";
  const plan = agentOn ? ["org", "extract", "agent", "brief"] : ["org", "extract", "retrieve", "judge", "brief"];
  for (const id of [...(url ? ["fetch"] : []), ...plan]) step(id, "pending");

  if (url) {
    step("fetch", "running");
    const known = await q1<{ url: string; slug: string; title: string; date: string; concerns: { quote: string }[] }>(
      "SELECT url, slug, title, date, concerns FROM pub_reports WHERE url = $1", [url]);
    if (known) {
      result.report = { url, slug: known.slug, title: known.title, date: known.date, known: true };
      reportDate = known.date;
      knownOrgIds = (await q<{ org_id: number }>(
        `SELECT ro.org_id FROM pub_report_orgs ro JOIN pub_orgs o ON o.id = ro.org_id WHERE ro.report_url = $1
         ORDER BY o.n_chains DESC, o.n_reports DESC`, [url])).map((r) => r.org_id);
      if (!concernsText) concernsText = known.concerns.map((c) => c.quote).join("\n");
      step("fetch", "done", { detail: `${stripTitle(known.title)}, already in the archive` });
    } else {
      const rep = await fetchReport(url);
      if (!rep) {
        step("fetch", "done", { detail: "Could not read that page" });
        result.notes.push("That address could not be read as a Prevention of Future Deaths report page on judiciary.uk.");
        return result;
      }
      result.report = { url, title: rep.title, date: rep.date, known: false };
      reportDate = rep.date;
      if (!concernsText) concernsText = rep.concerns;
      if (!orgName && rep.sentTo) orgName = rep.sentTo.split(/;|\|/)[0];
      step("fetch", "done", { detail: `${stripTitle(rep.title)}, read from judiciary.uk` });
      if (!concernsText) {
        result.notes.push("This report's text is only in a PDF. Paste its concerns section instead.");
        return result;
      }
    }
  }

  // 2. The organisation.
  step("org", "running");
  let org: { id: number; name: string } | null = null;
  const idx = await orgIndex();
  if (input.orgId && idx.names.has(input.orgId)) org = { id: input.orgId, name: idx.names.get(input.orgId)! };
  else if (orgName) org = await resolveOrg(orgName);
  else if (knownOrgIds.length) org = { id: knownOrgIds[0], name: idx.names.get(knownOrgIds[0]) ?? "" };
  result.organisation = org;
  step("org", "done", { detail: org ? org.name : `No match for "${orgName}"` });
  if (!org) {
    result.notes.push(orgName ? "That organisation was not found among those that have received reports." : "Please name the organisation the concerns are addressed to.");
    return result;
  }
  if (concernsText.length < 40) {
    result.notes.push("Please give the concerns text (at least a sentence or two).");
    return result;
  }
  concernsText = concernsText.slice(0, 7000);

  // 3. Concerns: reuse the pipeline's extraction for an archived report, otherwise Nano.
  step("extract", "running");
  let newConcerns: { quote: string; hazard: string; vec?: Float32Array }[] = [];
  if (url && result.report?.known) {
    const rows = await q<{ quote: string; hazard: string; e: string }>(
      "SELECT DISTINCT ON (id) quote, hazard, embedding::text AS e FROM pub_brief_concerns WHERE report_url = $1", [url]);
    newConcerns = rows.map((r) => ({ quote: r.quote, hazard: r.hazard, vec: parseVec(r.e) }));
  }
  // Quotes from a report read fresh from judiciary.uk are redacted before they are shown in the trace.
  const titles = result.report?.title ? [result.report.title] : [];
  const concernItems = (): TraceItem[] =>
    newConcerns.map((c) => ({ label: c.hazard, sub: short(result.report?.known ? c.quote : redactNames(c.quote, titles)), verdict: "info" }));
  if (newConcerns.length) {
    step("extract", "done", {
      detail: `${newConcerns.length} ${newConcerns.length === 1 ? "concern" : "concerns"}, extracted by Nano when the archive was built`,
      cached: true,
      items: concernItems(),
    });
  } else {
    const r = await chat({
      stage: "brief-extract",
      model: "nano",
      maxTokens: 600,
      responseFormat: EXTRACT_SCHEMA,
      messages: [
        {
          role: "system",
          content:
            "Extract the separate concerns from this coroner's concerns text. Output compact JSON. For each: quote = one " +
            "contiguous passage of 10 to 45 words copied character for character; hazard = neutral noun phrase of at most 12 words.",
        },
        { role: "user", content: `CONCERNS:\n${concernsText}` },
      ],
    });
    result.cost += r.cost;
    const parsed = (r.parsed as { concerns?: { quote: string; hazard: string }[] }) ?? {};
    const all = parsed.concerns ?? [];
    newConcerns = all.filter((c) => verifyQuote(c.quote, concernsText)).slice(0, 6);
    const dropped = all.length - newConcerns.length;
    if (!newConcerns.length) newConcerns = [{ quote: concernsText.slice(0, 400), hazard: "concerns as written" }];
    step("extract", "done", {
      detail: `${newConcerns.length} ${newConcerns.length === 1 ? "concern" : "concerns"}, each quote checked word for word${dropped > 0 ? ` (${dropped} dropped: not found in the text)` : ""}`,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      cost: r.cost,
      cached: r.cacheHit,
      items: concernItems(),
    });
  }
  result.concerns = newConcerns.map(({ quote, hazard }) => ({ quote, hazard }));

  const missing = newConcerns.filter((c) => !c.vec);
  if (missing.length) {
    const vecs = await embed("brief-embed", missing.map((c) => `${c.hazard}. ${c.quote}`), DIM);
    missing.forEach((c, i) => (c.vec = Float32Array.from(vecs[i])));
  }

  // 4a. The agent: Nemotron Super chooses tools until it submits (web/lib/agent.ts). If it fails or hits a
  // limit, the fixed steps below run instead, so a brief is always produced.
  if (agentOn) {
    const out = await runAgent({ org, url, reportDate, concerns: newConcerns, concernsText }, emit).catch(() => null);
    if (out) {
      result.mode = "agent";
      result.matches = out.matches;
      result.other_earlier = out.other_earlier;
      result.searched = out.searched;
      result.cost += out.cost;
      step("brief", "running");
      step("brief", "done", {
        detail: `${result.matches.length} earlier warning${result.matches.length === 1 ? "" : "s"} with verified quotes · cost $${result.cost.toFixed(4)}`,
      });
      return result;
    }
  }
  result.mode = "fixed";

  // 4b. Fixed pipeline: nearest earlier concerns for this organisation (pgvector).
  step("retrieve", "running");
  const total = await q1<{ n: number }>("SELECT COUNT(*)::int n FROM pub_brief_concerns WHERE org_id = $1", [org.id]);
  result.searched = total?.n ?? 0;
  const best = new Map<string, Candidate>();
  for (const c of newConcerns) {
    const rows = await q<Candidate>(
      `SELECT report_url, date::text, quote, hazard, (embedding <=> $2::vector) AS d FROM pub_brief_concerns
       WHERE org_id = $1 AND report_url <> $3 AND ($4::date IS NULL OR date < $4::date)
       ORDER BY embedding <=> $2::vector LIMIT 15`,
      [org.id, toVec(c.vec!), url ?? "", reportDate]);
    for (const r of rows) {
      const prev = best.get(r.report_url);
      if (!prev || r.d < prev.d) best.set(r.report_url, r);
    }
  }
  const top = [...best.values()].sort((a, b) => a.d - b.d).slice(0, 6);

  // Report details, promises and chains for the candidates.
  const urls = top.map((t) => t.report_url);
  const meta = new Map(
    (await q<{ url: string; slug: string; title: string; date: string; coroner: string | null; area: string | null }>(
      "SELECT url, slug, title, date, coroner, area FROM pub_reports WHERE url = ANY($1)", [urls])).map((r) => [r.url, r]));
  const titleOf = (u: string) => stripTitle(meta.get(u)?.title ?? u);
  step("retrieve", "done", {
    detail: `${result.searched.toLocaleString("en-GB")} earlier concerns to ${org.name} searched by meaning; the ${Math.min(3, top.length)} closest go to the judge`,
    items: top.map((t, i): TraceItem => ({
      label: titleOf(t.report_url),
      sub: `${t.date} · ${t.hazard}`,
      score: Math.max(0, Math.min(1, 1 - t.d)),
      verdict: i < 3 ? "sent" : "info",
    })),
  });
  const promises = new Map<string, BriefMatch["promises"]>();
  for (const r of await q<{ report_url: string; promises: { id: number; quote: string; timescale: string | null }[] }>(
    "SELECT report_url, promises FROM pub_responses WHERE report_url = ANY($1) AND org_id = $2 AND NOT unmatched", [urls, org.id])) {
    promises.set(r.report_url, [...(promises.get(r.report_url) ?? []), ...r.promises].slice(0, 3));
  }
  const chainsOf = new Map<string, BriefMatch["chains"]>();
  for (const r of await q<{ report_url: string; key: string; hazard: string }>(
    `SELECT cr.report_url, c.key, c.hazard FROM pub_chain_reports cr JOIN pub_chains c ON c.key = cr.chain_key
     WHERE cr.report_url = ANY($1) AND c.org_id = $2`, [urls, org.id])) {
    chainsOf.set(r.report_url, [...(chainsOf.get(r.report_url) ?? []), { key: r.key, hazard: r.hazard }]);
  }

  // 5. Judge the closest three with Super. Each verdict is streamed as it arrives.
  step("judge", "running");
  const newText = newConcerns.map((c) => c.quote).join("\n") + "\n" + concernsText;
  const judgeItems: TraceItem[] = [];
  const usage = { tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cost: 0, cached: true };
  type Verdict = { relation: string; same_hazard_explanation: string; earlier_quote: string; later_quote: string; confidence: number };
  const toJudge = top.slice(0, 3);
  const judged = await Promise.all(
    toJudge.map(async (s) => {
      const r = await chat({
        stage: "brief-judge",
        model: "super",
        maxTokens: 1500,
        thinking: true,
        lowEffort: true,
        responseFormat: JUDGE_SCHEMA,
        messages: [
          { role: "system", content: JUDGE_SYSTEM },
          { role: "user", content: `ORGANISATION: ${org!.name}\n\nEARLIER REPORT dated ${s.date}\nEARLIER CONCERN: ${s.quote}\n(hazard: ${s.hazard})\n\nNEW CONCERNS:\n${concernsText}` },
        ],
      });
      result.cost += r.cost;
      usage.tokensIn += r.tokensIn;
      usage.tokensOut += r.tokensOut;
      usage.reasoningTokens += r.reasoningTokens;
      usage.cost += r.cost;
      usage.cached = usage.cached && r.cacheHit;
      const v = r.parsed as Verdict | null;
      const rel = v?.relation ? v.relation.replace("_", " ") : "no verdict";
      let why: string;
      let ok = false;
      if (!v) why = "No usable verdict";
      else if (v.relation !== "identical" && v.relation !== "closely_related") why = `Judged ${rel}: not the same hazard`;
      else if (v.confidence < 0.7) why = `Confidence ${v.confidence.toFixed(2)} is below 0.70`;
      else if (!verifyQuote(v.earlier_quote, s.quote)) why = "Earlier quote not found word for word";
      else if (!verifyQuote(v.later_quote, newText)) why = "New quote not found word for word";
      else {
        ok = true;
        why = `Judged ${rel}, confidence ${v.confidence.toFixed(2)}, both quotes verified`;
      }
      judgeItems.push({ label: titleOf(s.report_url), sub: `${s.date} · ${s.hazard}`, verdict: ok ? "kept" : "dropped", note: why, score: Math.max(0, 1 - s.d) });
      step("judge", "running", { items: [...judgeItems], detail: `${judgeItems.length} of ${toJudge.length} verdicts in` });
      return { s, v, ok };
    }),
  );
  for (const { s, v, ok } of judged) {
    const m = meta.get(s.report_url);
    if (!m) continue;
    if (ok && v) {
      result.matches.push({
        earlier: m,
        relation: v.relation,
        confidence: Math.round(Math.min(1, Math.max(0, v.confidence)) * 100) / 100,
        explanation: wordingClean(v.same_hazard_explanation) ? v.same_hazard_explanation : null,
        earlier_quote: normForMatch(v.earlier_quote),
        later_quote: normForMatch(v.later_quote),
        promises: promises.get(s.report_url) ?? [],
        chains: chainsOf.get(s.report_url) ?? [],
      });
    } else {
      result.other_earlier.push({ url: m.url, slug: m.slug, title: m.title, date: m.date, hazard: s.hazard });
    }
  }
  for (const s of top.slice(3)) {
    const m = meta.get(s.report_url);
    if (m) result.other_earlier.push({ url: m.url, slug: m.slug, title: m.title, date: m.date, hazard: s.hazard });
  }
  step("judge", "done", {
    detail: `${result.matches.length} of ${judged.length} judged the same or a closely related hazard`,
    items: judgeItems,
    tokensIn: usage.tokensIn,
    tokensOut: usage.tokensOut,
    reasoningTokens: usage.reasoningTokens,
    cost: usage.cost,
    cached: judged.length ? usage.cached : undefined,
  });
  step("brief", "running");
  step("brief", "done", {
    detail: `${result.matches.length} earlier warning${result.matches.length === 1 ? "" : "s"} with verified quotes · cost $${result.cost.toFixed(4)}`,
  });
  return result;
}

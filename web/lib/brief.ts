import "server-only";
import fs from "node:fs";
import path from "node:path";
import { chat, embed } from "./llm";
import {
  htmlToText,
  normForMatch,
  orgKey,
  splitSections,
  stripBoilerplate,
  tokenSetSimilarity,
  verifyQuote,
  wordingClean,
} from "./text";

// The live pre-inquest brief agent (handoff section 9.9).
// Steps: resolve organisation -> get concerns (cached or Nano) -> retrieve earlier concerns
// (embeddings) -> judge the closest with Super -> assemble a brief with verified quotes and links.

const DATA = path.join(process.cwd(), "data");

export type Step = { id: string; label: string; status: "running" | "done" | "skipped"; detail?: string };
export type Emit = (s: Step) => void;

interface ShardItem {
  id: number;
  url: string;
  title: string;
  date: string;
  coroner: string | null;
  area: string | null;
  quote: string;
  hazard: string;
  e: string;
  chains: string[];
  promises: { id: number; quote: string; summary: string | null; timescale: string | null }[];
}

interface BriefIndex {
  aliases: Record<string, number>;
  orgs: Record<string, string>;
  known_reports: Record<string, number[] | number>;
  dim: number;
}

export interface BriefMatch {
  earlier: { url: string; title: string; date: string; coroner: string | null; area: string | null };
  relation: string;
  confidence: number;
  explanation: string | null;
  earlier_quote: string;
  later_quote: string;
  promises: ShardItem["promises"];
  chains: string[];
}

export interface BriefResult {
  organisation: { id: number; name: string } | null;
  report: { url: string; title: string; date: string | null } | null;
  concerns: { quote: string; hazard: string }[];
  matches: BriefMatch[];
  other_earlier: { url: string; title: string; date: string; hazard: string }[];
  cost: number;
  notes: string[];
}

function readJson<T>(rel: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf-8")) as T;
  } catch {
    return null;
  }
}

function decode(b64: string): Float32Array {
  const bytes = Buffer.from(b64, "base64");
  const v = new Float32Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    const x = (bytes[i] << 24) >> 24; // int8
    v[i] = x;
    n += x * x;
  }
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>) {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
  return s;
}

export function resolveOrg(name: string, idx: BriefIndex): { id: number; name: string } | null {
  const k = orgKey(name);
  if (!k) return null;
  if (idx.aliases[k] !== undefined) return { id: idx.aliases[k], name: idx.orgs[String(idx.aliases[k])] };
  let best: [number, number] | null = null;
  for (const [alias, id] of Object.entries(idx.aliases)) {
    const s = tokenSetSimilarity(k, alias);
    if (!best || s > best[1]) best = [id, s];
  }
  if (best && best[1] >= 0.8) return { id: best[0], name: idx.orgs[String(best[0])] };
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
          items: {
            type: "object",
            properties: { quote: { type: "string" }, hazard: { type: "string" } },
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

const JUDGE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "brief_verdict",
    strict: true,
    schema: {
      type: "object",
      properties: {
        relation: { type: "string", enum: ["identical", "closely_related", "related", "different"] },
        same_hazard_explanation: { type: "string" },
        earlier_quote: { type: "string" },
        later_quote: { type: "string" },
        confidence: { type: "number" },
      },
      required: ["relation", "same_hazard_explanation", "earlier_quote", "later_quote", "confidence"],
      additionalProperties: false,
    },
  },
};

const JUDGE_SYSTEM =
  "You compare a concern from an earlier coroner's Prevention of Future Deaths report with new concerns about the same " +
  "organisation, and decide whether the new concerns raise the same hazard. Output one compact JSON object.\n" +
  "relation: identical (same specific hazard and mechanism), closely_related (same specific hazard, different emphasis), " +
  "related (same broad area, different specific hazard), different.\n" +
  "Shared generic words are not enough for identical or closely_related.\n" +
  "same_hazard_explanation: two short neutral sentences. Never say an organisation ignored, caused, failed, neglected, " +
  "is responsible or is to blame.\n" +
  "earlier_quote: copy 10 to 45 words character for character from EARLIER CONCERN. later_quote: copy 10 to 45 words " +
  "character for character from NEW CONCERNS.\nconfidence: 0 to 1.";

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

export async function runBrief(
  input: { reportUrl?: string; concerns?: string; organisation?: string },
  emit: Emit,
): Promise<BriefResult> {
  const idx = readJson<BriefIndex>("brief_index.json");
  const result: BriefResult = { organisation: null, report: null, concerns: [], matches: [], other_earlier: [], cost: 0, notes: [] };
  if (!idx) {
    result.notes.push("The analysis data is not available on this deployment.");
    return result;
  }

  // 1. Get the new report's text and its organisation.
  let concernsText = (input.concerns ?? "").trim();
  let orgName = (input.organisation ?? "").trim();
  let reportDate: string | null = null;
  const url = input.reportUrl?.trim().replace(/\/?$/, "/");
  if (url) {
    emit({ id: "fetch", label: "Reading the report on judiciary.uk", status: "running" });
    const rep = await fetchReport(url);
    if (!rep) {
      emit({ id: "fetch", label: "Reading the report on judiciary.uk", status: "done", detail: "Could not read that page" });
      result.notes.push("That address could not be read as a Prevention of Future Deaths report page.");
      return result;
    }
    result.report = { url, title: rep.title, date: rep.date };
    reportDate = rep.date;
    if (!concernsText) concernsText = rep.concerns;
    if (!orgName && rep.sentTo) orgName = rep.sentTo.split(/;|\|/)[0];
    emit({ id: "fetch", label: "Reading the report on judiciary.uk", status: "done", detail: rep.title });
    if (!concernsText) {
      result.notes.push("This report's text is only in a PDF. Paste the concerns section instead.");
      return result;
    }
  }
  if (concernsText.length < 40 || !orgName) {
    result.notes.push("Please give the concerns text and the organisation it is addressed to.");
    return result;
  }
  concernsText = concernsText.slice(0, 7000);

  emit({ id: "org", label: "Resolving the organisation", status: "running" });
  const org = resolveOrg(orgName, idx);
  result.organisation = org;
  emit({ id: "org", label: "Resolving the organisation", status: "done", detail: org ? org.name : `No match for "${orgName}"` });
  if (!org) {
    result.notes.push("The organisation was not found among those that have received reports.");
    return result;
  }
  const shard = readJson<ShardItem[]>(`brief/${org.id}.json`) ?? [];

  // 2. Concerns: reuse the pipeline's extraction for a known report, otherwise Nano.
  emit({ id: "extract", label: "Extracting concerns (Nemotron Nano)", status: "running" });
  const known = url ? shard.filter((s) => s.url === url) : [];
  let newConcerns: { quote: string; hazard: string; vec?: Float32Array }[] = [];
  if (known.length) {
    newConcerns = known.map((k) => ({ quote: k.quote, hazard: k.hazard, vec: decode(k.e) }));
    emit({ id: "extract", label: "Extracting concerns (Nemotron Nano)", status: "done", detail: `${known.length} concerns already analysed` });
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
    newConcerns = (parsed.concerns ?? []).filter((c) => verifyQuote(c.quote, concernsText)).slice(0, 6);
    if (!newConcerns.length) newConcerns = [{ quote: concernsText.slice(0, 400), hazard: "concerns as written" }];
    emit({ id: "extract", label: "Extracting concerns (Nemotron Nano)", status: "done", detail: `${newConcerns.length} concerns` });
  }
  result.concerns = newConcerns.map(({ quote, hazard }) => ({ quote, hazard }));

  // 3. Retrieve earlier concerns for this organisation.
  emit({ id: "retrieve", label: "Searching earlier reports to this organisation", status: "running" });
  const missing = newConcerns.filter((c) => !c.vec);
  if (missing.length) {
    const vecs = await embed("brief-embed", missing.map((c) => `${c.hazard}. ${c.quote}`), idx.dim);
    missing.forEach((c, i) => (c.vec = Float32Array.from(vecs[i])));
  }
  const candidates = shard
    .filter((s) => s.url !== url && (!reportDate || s.date < reportDate))
    .map((s) => {
      const v = decode(s.e);
      const score = Math.max(...newConcerns.map((c) => dot(c.vec!, v)));
      return { s, score };
    })
    .sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const top: { s: ShardItem; score: number }[] = [];
  for (const c of candidates) {
    if (seen.has(c.s.url)) continue;
    seen.add(c.s.url);
    top.push(c);
    if (top.length >= 6) break;
  }
  emit({ id: "retrieve", label: "Searching earlier reports to this organisation", status: "done",
    detail: `${shard.length} earlier concerns searched; ${Math.min(3, top.length)} closest sent to the judge` });

  // 4. Judge the closest three with Super.
  emit({ id: "judge", label: "Judging the closest matches (Nemotron Super)", status: "running" });
  const newText = newConcerns.map((c) => c.quote).join("\n") + "\n" + concernsText;
  const judged = await Promise.all(
    top.slice(0, 3).map(async ({ s }) => {
      const r = await chat({
        stage: "brief-judge",
        model: "super",
        maxTokens: 1500,
        thinking: true,
        lowEffort: true,
        responseFormat: JUDGE_SCHEMA,
        messages: [
          { role: "system", content: JUDGE_SYSTEM },
          {
            role: "user",
            content: `ORGANISATION: ${org.name}\n\nEARLIER REPORT dated ${s.date}\nEARLIER CONCERN: ${s.quote}\n(hazard: ${s.hazard})\n\nNEW CONCERNS:\n${concernsText}`,
          },
        ],
      });
      result.cost += r.cost;
      const v = r.parsed as { relation: string; same_hazard_explanation: string; earlier_quote: string; later_quote: string; confidence: number } | null;
      return { s, v };
    }),
  );
  for (const { s, v } of judged) {
    const ok =
      v &&
      (v.relation === "identical" || v.relation === "closely_related") &&
      v.confidence >= 0.7 &&
      verifyQuote(v.earlier_quote, s.quote) &&
      verifyQuote(v.later_quote, newText);
    if (ok) {
      result.matches.push({
        earlier: { url: s.url, title: s.title, date: s.date, coroner: s.coroner, area: s.area },
        relation: v!.relation,
        confidence: Math.round(Math.min(1, Math.max(0, v!.confidence)) * 100) / 100,
        explanation: wordingClean(v!.same_hazard_explanation) ? v!.same_hazard_explanation : null,
        earlier_quote: normForMatch(v!.earlier_quote),
        later_quote: normForMatch(v!.later_quote),
        promises: s.promises,
        chains: s.chains,
      });
    } else {
      result.other_earlier.push({ url: s.url, title: s.title, date: s.date, hazard: s.hazard });
    }
  }
  for (const { s } of top.slice(3)) result.other_earlier.push({ url: s.url, title: s.title, date: s.date, hazard: s.hazard });
  emit({ id: "judge", label: "Judging the closest matches (Nemotron Super)", status: "done",
    detail: `${result.matches.length} shown as the same or a closely related hazard` });
  emit({ id: "brief", label: "Assembling the brief", status: "done" });
  return result;
}

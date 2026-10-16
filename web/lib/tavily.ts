import "server-only";
import { getStore } from "./store";
import { sha256, stableStringify } from "./text";

// Tavily for the live agent: one basic search per check, cached by query, logged, and capped per day
// and in total (the 30% of Tavily credit kept for the live agent, D28). Lack of results is never
// presented as "did not happen".
const DAILY = Number(process.env.LIVE_TAVILY_DAILY_CREDITS ?? "8");
const TOTAL = Number(process.env.LIVE_TAVILY_TOTAL_CREDITS ?? "230");

export class TavilyUnavailable extends Error {}

export type WebSource = { title: string; url: string; content: string };

export async function tavilySearch(query: string): Promise<{ sources: WebSource[]; cached: boolean }> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new TavilyUnavailable("web search is not configured");
  const store = getStore();
  if (store.kind === "none") throw new TavilyUnavailable("no shared store");
  const body = { query: query.slice(0, 380), search_depth: "basic", max_results: 5, include_answer: false };
  const hash = await sha256(stableStringify(body));
  const hit = await store.get<WebSource[]>(`tavily:${hash}`);
  if (hit) return { sources: hit, cached: true };

  const day = new Date().toISOString().slice(0, 10);
  const usedToday = Number((await store.get<number>(`tavily-credits:${day}`)) ?? 0);
  const usedTotal = Number((await store.get<number>("tavily-credits:total")) ?? 0);
  if (usedToday + 1 > DAILY || usedTotal + 1 > TOTAL) throw new TavilyUnavailable("today's web-search allowance is used up");
  await store.add(`tavily-credits:${day}`, 1);
  await store.add("tavily-credits:total", 1);

  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const ledgerKey = `ledger:${day}`;
  const rows = ((await store.get<unknown[]>(ledgerKey)) ?? []).slice(-500);
  rows.push({ ts: new Date().toISOString(), stage: "brief-tavily", model: "tavily/search", credits: 1, success: r.ok, hash });
  await store.set(ledgerKey, rows);
  if (!r.ok) throw new TavilyUnavailable(`web search returned ${r.status}`);
  const data = (await r.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  const sources = (data.results ?? [])
    .filter((x) => x.url && !x.url.includes("judiciary.uk"))
    .slice(0, 4)
    .map((x) => ({ title: x.title ?? "", url: x.url!, content: (x.content ?? "").slice(0, 1500) }));
  await store.set(`tavily:${hash}`, sources);
  return { sources, cached: false };
}

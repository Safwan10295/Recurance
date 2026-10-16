import "server-only";
import { getStore } from "./store";
import { sha256, stableStringify } from "./text";

// TypeScript twin of pipeline/llm.py for the deployed app.
// - Uses its own key, NEBIUS_LIVE_API_KEY, never the pipeline key.
// - Every call: response cache by request hash, ledger entry, budget reservation against the
//   live reserve ceiling, mandatory max_tokens, at most one retry on transport errors.

const BASE = "https://api.tokenfactory.nebius.com/v1/";

export const MODELS = {
  nano: { id: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", inPrice: 0.06e-6, outPrice: 0.24e-6 },
  super: { id: "nvidia/nemotron-3-super-120b-a12b", inPrice: 0.3e-6, outPrice: 0.9e-6 },
  embed: { id: "Qwen/Qwen3-Embedding-8B", inPrice: 0.01e-6, outPrice: 0 },
} as const;
export type ModelKey = keyof typeof MODELS;

// The $5 live reserve, with a margin: stop live calls at this many dollars.
export const RESERVE_CEILING = Number(process.env.LIVE_COST_CEILING_USD ?? "4.5");

export class BudgetExceeded extends Error {}
export class LiveUnavailable extends Error {}

// Shape of the OpenAI-compatible responses we read.
interface ApiResponse {
  choices?: { message?: { content?: string }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
  data?: { index: number; embedding: number[] }[];
}

export interface ChatResult {
  content: string;
  parsed: unknown;
  cost: number;
  cacheHit: boolean;
  finishReason: string | null;
  // For the live agent trace: what the call used.
  model: string;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number;
  ms: number;
}

function estimateTokens(s: string) {
  return Math.ceil(s.length / 3) + 8;
}

function parseJson(text: string): unknown {
  const t = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function liveSpent(): Promise<number> {
  return Number((await getStore().get<number>("spend:total")) ?? 0);
}

async function reserve(amount: number) {
  const store = getStore();
  if (store.kind === "none") throw new LiveUnavailable("no shared store configured");
  // Reserve the worst case before calling; settle to the real cost afterwards.
  const after = await store.add("spend:total", amount);
  if (after > RESERVE_CEILING) {
    await store.add("spend:total", -amount);
    throw new BudgetExceeded(`live reserve ceiling reached ($${after.toFixed(4)})`);
  }
}

async function settle(reserved: number, actual: number) {
  await getStore().add("spend:total", actual - reserved);
}

async function ledger(entry: Record<string, unknown>) {
  const store = getStore();
  const day = new Date().toISOString().slice(0, 10);
  const k = `ledger:${day}`;
  const rows = ((await store.get<unknown[]>(k)) ?? []).slice(-500);
  rows.push({ ts: new Date().toISOString(), ...entry });
  await store.set(k, rows);
}

async function post(path: string, body: unknown): Promise<{ status: number; data: ApiResponse }> {
  const key = process.env.NEBIUS_LIVE_API_KEY;
  if (!key) throw new LiveUnavailable("NEBIUS_LIVE_API_KEY is not set");
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch(BASE + path, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      if ((r.status === 429 || r.status >= 500) && attempt === 1) {
        await new Promise((res) => setTimeout(res, 3000));
        continue;
      }
      return { status: r.status, data: (await r.json().catch(() => ({}))) as ApiResponse };
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((res) => setTimeout(res, 2000));
    }
  }
  throw new Error("unreachable");
}

export async function chat(opts: {
  stage: string;
  model: "nano" | "super";
  messages: { role: string; content: string }[];
  maxTokens: number;
  responseFormat?: unknown;
  thinking?: boolean;
  lowEffort?: boolean;
}): Promise<ChatResult> {
  if (!Number.isInteger(opts.maxTokens) || opts.maxTokens <= 0) throw new Error("max_tokens is required");
  const m = MODELS[opts.model];
  const body: Record<string, unknown> = {
    model: m.id,
    messages: opts.messages,
    max_tokens: opts.maxTokens,
    temperature: 0,
    chat_template_kwargs: opts.thinking ? { enable_thinking: true, ...(opts.lowEffort ? { low_effort: true } : {}) } : { enable_thinking: false },
  };
  if (opts.responseFormat) body.response_format = opts.responseFormat;
  const hash = await sha256(stableStringify(body));
  const store = getStore();
  const t0 = Date.now();
  const cached = await store.get<ApiResponse>(`llm:${hash}`);
  if (cached) {
    await ledger({ stage: opts.stage, model: m.id, cost: 0, cache_hit: true, hash });
    return toResult(m, cached, true, Date.now() - t0);
  }
  const worst = estimateTokens(JSON.stringify(opts.messages)) * m.inPrice + opts.maxTokens * m.outPrice;
  await reserve(worst);
  let res;
  try {
    res = await post("chat/completions", body);
  } catch (e) {
    await settle(worst, 0);
    await ledger({ stage: opts.stage, model: m.id, cost: 0, cache_hit: false, hash, success: false, error: String(e).slice(0, 200) });
    throw e;
  }
  if (res.status >= 400) {
    await settle(worst, 0);
    await ledger({ stage: opts.stage, model: m.id, cost: 0, cache_hit: false, hash, success: false, error: `HTTP ${res.status}` });
    throw new Error(`Token Factory HTTP ${res.status}`);
  }
  const out = toResult(m, res.data, false, Date.now() - t0);
  await settle(worst, out.cost);
  await ledger({ stage: opts.stage, model: m.id, cost: out.cost, cache_hit: false, hash, success: true,
    in: res.data?.usage?.prompt_tokens, out: res.data?.usage?.completion_tokens });
  if (out.finishReason !== "length") await store.set(`llm:${hash}`, res.data);
  return out;
}

function toResult(m: { id: string; inPrice: number; outPrice: number }, data: ApiResponse, cacheHit: boolean, ms: number): ChatResult {
  const choice = data?.choices?.[0] ?? {};
  const content: string = choice?.message?.content ?? "";
  const u = data?.usage ?? {};
  const cost = cacheHit ? 0 : (u.prompt_tokens ?? 0) * m.inPrice + (u.completion_tokens ?? 0) * m.outPrice;
  return {
    content,
    parsed: parseJson(content),
    cost,
    cacheHit,
    finishReason: choice?.finish_reason ?? null,
    model: m.id,
    tokensIn: u.prompt_tokens ?? 0,
    tokensOut: u.completion_tokens ?? 0,
    reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? 0,
    ms,
  };
}

export async function embed(stage: string, texts: string[], dimensions = 256): Promise<number[][]> {
  const m = MODELS.embed;
  const body = { model: m.id, input: texts.map((t) => t.slice(0, 2000) || "."), dimensions };
  const hash = await sha256(stableStringify(body));
  const store = getStore();
  const cached = await store.get<ApiResponse>(`llm:${hash}`);
  let data: ApiResponse | null = cached;
  if (!cached) {
    const worst = texts.reduce((a, t) => a + estimateTokens(t), 0) * m.inPrice;
    await reserve(worst);
    const res = await post("embeddings", body).catch(async (e) => {
      await settle(worst, 0);
      throw e;
    });
    if (res.status >= 400) {
      await settle(worst, 0);
      throw new Error(`embeddings HTTP ${res.status}`);
    }
    data = res.data;
    const cost = (data?.usage?.prompt_tokens ?? 0) * m.inPrice;
    await settle(worst, cost);
    await ledger({ stage, model: m.id, cost, cache_hit: false, hash, success: true });
    await store.set(`llm:${hash}`, data);
  } else {
    await ledger({ stage, model: m.id, cost: 0, cache_hit: true, hash });
  }
  return (data?.data ?? [])
    .sort((a, b) => a.index - b.index)
    .map((d) => {
      const v = d.embedding;
      const n = Math.hypot(...v) || 1;
      return v.map((x) => x / n);
    });
}

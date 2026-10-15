import { NextRequest } from "next/server";
import { runBrief, type BriefResult, type Step } from "@/lib/brief";
import { BudgetExceeded, LiveUnavailable } from "@/lib/llm";
import { checkLive, countLive } from "@/lib/limits";
import { getMeta } from "@/lib/queries";
import { getStore } from "@/lib/store";
import { redactTitles, sha256, stableStringify } from "@/lib/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const PAUSED_MESSAGE: Record<string, string> = {
  paused: "Live analysis is paused at the moment. Here are precomputed examples instead.",
  daily_cap: "Live analysis has reached today's limit. Here are precomputed examples instead.",
  ip_cap: "You have reached today's limit for live checks. Here are precomputed examples instead.",
  budget: "Live analysis is paused because its budget for the judging period is used up. Here are precomputed examples instead.",
  error: "Live analysis could not finish this time. Here are precomputed examples instead.",
};

function clientIp(req: NextRequest) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

function clean(result: BriefResult): BriefResult {
  return {
    ...result,
    concerns: result.concerns.map((c) => ({ ...c, quote: redactTitles(c.quote) })),
    matches: result.matches.map((m) => ({ ...m, later_quote: redactTitles(m.later_quote) })),
  };
}

async function examples() {
  try {
    return (await getMeta()).brief_examples ?? [];
  } catch {
    return [];
  }
}

// GET /api/brief?h=<hash> returns a saved brief, so results can be shared by link.
export async function GET(req: NextRequest) {
  const h = req.nextUrl.searchParams.get("h") ?? "";
  if (!/^[a-f0-9]{64}$/.test(h)) return Response.json({ error: "bad id" }, { status: 400 });
  const store = getStore();
  const saved = store.kind !== "none" ? await store.get<{ input: unknown; result: BriefResult }>(`brief:${h}`).catch(() => null) : null;
  if (!saved) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(saved);
}

export async function POST(req: NextRequest) {
  let body: { reportUrl?: string; reportSlug?: string; concerns?: string; organisation?: string; orgId?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ type: "error", message: "Invalid request." }, { status: 400 });
  }
  const input = {
    reportUrl: (body.reportUrl ?? "").slice(0, 300).trim() || undefined,
    reportSlug: (body.reportSlug ?? "").slice(0, 250).trim() || undefined,
    concerns: (body.concerns ?? "").slice(0, 8000).trim() || undefined,
    organisation: (body.organisation ?? "").slice(0, 200).trim() || undefined,
    orgId: Number.isInteger(body.orgId) ? body.orgId : undefined,
  };
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
      const paused = async (reason: string) =>
        send({ type: "paused", reason, message: PAUSED_MESSAGE[reason] ?? PAUSED_MESSAGE.paused, examples: await examples() });
      try {
        const hash = await sha256(stableStringify(input));
        const key = `brief:${hash}`;
        const store = getStore();
        const saved = store.kind !== "none" ? await store.get<{ result: BriefResult }>(key).catch(() => null) : null;
        if (saved?.result) {
          send({ type: "step", step: { id: "cache", label: "Using a saved brief for this exact input", status: "done" } satisfies Step });
          send({ type: "result", result: saved.result, cached: true, hash });
          controller.close();
          return;
        }
        const gate = await checkLive(clientIp(req));
        if (!gate.ok) {
          await paused(gate.reason);
          controller.close();
          return;
        }
        await countLive(clientIp(req));
        const result = clean(await runBrief(input, (step) => send({ type: "step", step })));
        if (!result.notes.length || result.matches.length) await store.set(key, { input, result }).catch(() => undefined);
        send({ type: "result", result, cached: false, hash });
      } catch (e) {
        if (e instanceof BudgetExceeded) await paused("budget");
        else if (e instanceof LiveUnavailable) await paused("paused");
        else await paused("error");
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

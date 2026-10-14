import { NextRequest } from "next/server";
import { getBriefExamples } from "@/lib/data";
import { BudgetExceeded, LiveUnavailable } from "@/lib/llm";
import { checkLive, countLive } from "@/lib/limits";
import { runBrief, type BriefResult, type Step } from "@/lib/brief";
import { getStore } from "@/lib/store";
import { redactTitles, sha256, stableStringify } from "@/lib/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAUSED_MESSAGE: Record<string, string> = {
  paused: "Live analysis is paused at the moment. Here are precomputed examples instead.",
  daily_cap: "Live analysis has reached today's limit. Here are precomputed examples instead.",
  ip_cap: "You have reached today's limit for live briefs. Here are precomputed examples instead.",
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

export async function POST(req: NextRequest) {
  let body: { reportUrl?: string; concerns?: string; organisation?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ type: "error", message: "Invalid request." }, { status: 400 });
  }
  const input = {
    reportUrl: (body.reportUrl ?? "").slice(0, 300).trim() || undefined,
    concerns: (body.concerns ?? "").slice(0, 8000).trim() || undefined,
    organisation: (body.organisation ?? "").slice(0, 200).trim() || undefined,
  };
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
      const paused = (reason: string) =>
        send({ type: "paused", reason, message: PAUSED_MESSAGE[reason] ?? PAUSED_MESSAGE.paused, examples: getBriefExamples() });
      try {
        const key = "brief:" + (await sha256(stableStringify(input)));
        const store = getStore();
        const cached = store.kind !== "none" ? await store.get<BriefResult>(key).catch(() => null) : null;
        if (cached) {
          send({ type: "step", step: { id: "cache", label: "Using a saved brief for this exact input", status: "done" } satisfies Step });
          send({ type: "result", result: cached, cached: true });
          controller.close();
          return;
        }
        const gate = await checkLive(clientIp(req));
        if (!gate.ok) {
          paused(gate.reason);
          controller.close();
          return;
        }
        await countLive(clientIp(req));
        const result = clean(await runBrief(input, (step) => send({ type: "step", step })));
        await store.set(key, result).catch(() => undefined);
        send({ type: "result", result, cached: false });
      } catch (e) {
        if (e instanceof BudgetExceeded) paused("budget");
        else if (e instanceof LiveUnavailable) paused("paused");
        else paused("error");
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

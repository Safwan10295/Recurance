import { NextRequest } from "next/server";
import { runBrief, type BriefResult, type Step } from "@/lib/brief";
import { BudgetExceeded, LiveUnavailable } from "@/lib/llm";
import { checkLive, countLive } from "@/lib/limits";
import { getMeta } from "@/lib/queries";
import { archiveBrief } from "@/lib/archive-brief";
import { q1 } from "@/lib/db";
import { getPrecomputed, relevantExamples } from "@/lib/precomputed";
import { getStore } from "@/lib/store";
import { redactNames, sha256, stableStringify } from "@/lib/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Shown above an archive report's own brief when live analysis is unavailable.
const ARCHIVE_MESSAGE: Record<string, string> = {
  paused: "Live analysis is paused, so this is the brief from the archive: earlier warnings Nemotron Super judged when the archive was built. No live model call was made.",
  daily_cap: "Live analysis has reached today's limit, so this is the brief from the archive, judged when the archive was built.",
  ip_cap: "You have reached today's limit for live checks, so this is the brief from the archive, judged when the archive was built.",
  budget: "Live analysis has used its budget, so this is the brief from the archive, judged when the archive was built.",
};

const PAUSED_MESSAGE: Record<string, string> = {
  paused: "Live analysis is paused at the moment. Here is the closest precomputed example instead. It is not your report.",
  daily_cap: "Live analysis has reached today's limit. Here are precomputed examples instead.",
  ip_cap: "You have reached today's limit for live checks. Here are precomputed examples instead.",
  budget: "Live analysis is paused because its budget for the judging period is used up. Here are precomputed examples instead.",
  error: "Live analysis could not finish this time. Here are precomputed examples instead.",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Replays a recorded trace at a readable pace, so a saved run still shows the agent's work.
async function replay(send: (o: unknown) => void, steps: Step[], fast = false) {
  for (const step of steps) {
    send({ type: "step", step: { ...step, status: "running" } });
    await sleep(fast ? 120 : 260);
    send({ type: "step", step });
    await sleep(fast ? 60 : 140);
  }
}

// The archive report this input points to, if any (by slug, or by its judiciary.uk address).
async function archiveSlug(input: { reportSlug?: string; reportUrl?: string }): Promise<string | null> {
  if (input.reportSlug) return input.reportSlug;
  if (!input.reportUrl) return null;
  const r = await q1<{ slug: string }>("SELECT slug FROM pub_reports WHERE url = $1", [input.reportUrl.replace(/\/?$/, "/")]).catch(() => null);
  return r?.slug ?? null;
}

function clientIp(req: NextRequest) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

// Text read fresh from the new report: redact staff and family names, and name the deceased by title only.
function clean(result: BriefResult): BriefResult {
  const titles = result.report?.title ? [result.report.title] : [];
  return {
    ...result,
    concerns: result.concerns.map((c) => ({ ...c, quote: redactNames(c.quote, titles) })),
    matches: result.matches.map((m) => ({ ...m, later_quote: redactNames(m.later_quote, titles) })),
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
  type Saved = { input: unknown; result: BriefResult; steps?: Step[] };
  const saved =
    store.kind !== "none"
      ? ((await store.get<Saved>(`brief:${h}`).catch(() => null)) ?? (await store.get<Saved>(`archive:${h}`).catch(() => null)))
      : null;
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
      const paused = async (reason: string, inp?: { organisation?: string; concerns?: string }) => {
        const rel = await relevantExamples(inp ?? {}).catch(() => []);
        const ex = rel.length
          ? rel.map((p) => ({ title: p.title, input: { reportSlug: p.slug }, result: p.result, why: p.why }))
          : await examples();
        send({ type: "paused", reason, message: PAUSED_MESSAGE[reason] ?? PAUSED_MESSAGE.paused, examples: ex });
      };
      try {
        const hash = await sha256(stableStringify(input));
        const key = `brief:${hash}`;
        const store = getStore();
        // 1. A precomputed brief for this archive report (real agent runs, published with the data).
        const slug = await archiveSlug(input);
        const pre = slug && !input.concerns ? (await getPrecomputed()).get(slug) : undefined;
        if (pre) {
          send({ type: "replay", source: "precomputed" });
          await store.set(key, { input, result: pre.result, steps: pre.steps }).catch(() => undefined);
          await replay(send, pre.steps);
          send({ type: "result", result: pre.result, cached: true, hash });
          controller.close();
          return;
        }
        // 2. A brief saved from an earlier live run of this exact input.
        const saved = store.kind !== "none" ? await store.get<{ result: BriefResult; steps?: Step[] }>(key).catch(() => null) : null;
        if (saved?.result) {
          send({ type: "replay", source: "saved" });
          await replay(send, saved.steps ?? []);
          send({ type: "result", result: saved.result, cached: true, hash });
          controller.close();
          return;
        }
        // 3. Live analysis, if it is available.
        const gate = await checkLive(clientIp(req));
        if (!gate.ok) {
          console.warn(`[brief] live analysis unavailable (${gate.reason}): ${gate.why}`);
          // An archive report still gets its own brief, from the verdicts stored in the archive.
          const arch = slug && !input.concerns ? await archiveBrief({ slug }).catch(() => null) : null;
          if (arch) {
            send({ type: "replay", source: "archive", reason: gate.reason, message: ARCHIVE_MESSAGE[gate.reason] ?? ARCHIVE_MESSAGE.paused });
            // Not cached under the input's hash: once live analysis is back, the same input runs live.
            await store.set(`archive:${hash}`, { input, result: arch.result, steps: arch.steps }).catch(() => undefined);
            await replay(send, arch.steps, true);
            send({ type: "result", result: arch.result, cached: true, hash });
          } else {
            await paused(gate.reason, input);
          }
          controller.close();
          return;
        }
        await countLive(clientIp(req));
        const steps = new Map<string, Step>();
        const result = clean(
          await runBrief(input, (step) => {
            if (step.status !== "pending") steps.set(step.id, step);
            send({ type: "step", step });
          }),
        );
        const trace = [...steps.values()].filter((st) => st.status === "done");
        if (!result.notes.length || result.matches.length) await store.set(key, { input, result, steps: trace }).catch(() => undefined);
        send({ type: "result", result, cached: false, hash });
      } catch (e) {
        console.warn(`[brief] live run stopped: ${e instanceof Error ? e.message.slice(0, 160) : "unknown error"}`);
        if (e instanceof BudgetExceeded) await paused("budget", input);
        else if (e instanceof LiveUnavailable) await paused("paused", input);
        else await paused("error", input);
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

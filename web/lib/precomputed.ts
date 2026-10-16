import "server-only";
import type { BriefResult, Step } from "./brief";
import { cached, q1 } from "./db";

// Briefs produced by real agent runs and published with the data (scripts/precompute_briefs.py), so the
// example chips, the audience cards and the demo-chain reports replay instantly at no cost, trace included.
export type Precomputed = { slug: string; title: string; result: BriefResult; steps: Step[]; generated_at?: string };

export const getPrecomputed = () =>
  cached(
    "precomputed-briefs",
    async () => {
      const r = await q1<{ value: Record<string, Precomputed> }>("SELECT value FROM pub_meta WHERE key = 'precomputed_briefs'").catch(() => null);
      return new Map(Object.entries(r?.value ?? {}));
    },
    300_000,
  );

const words = (s: string) => new Set((s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w)));
const STOP = new Set(["that", "this", "with", "from", "were", "have", "which", "there", "their", "been", "would", "could", "should", "concern", "concerns", "report"]);

// The most relevant precomputed examples for an input that is not in the archive: same organisation
// first, then the most shared words with the concerns given.
export async function relevantExamples(input: { organisation?: string; concerns?: string }, n = 2): Promise<(Precomputed & { why: string })[]> {
  const all = [...(await getPrecomputed()).values()].filter((p) => p.result.matches.length > 0);
  const org = (input.organisation ?? "").toLowerCase().trim();
  const w = words(input.concerns ?? "");
  return all
    .map((p) => {
      const name = (p.result.organisation?.name ?? "").toLowerCase();
      const sameOrg = !!org && !!name && (name.includes(org) || org.includes(name));
      const text = p.result.concerns.map((c) => `${c.hazard} ${c.quote}`).join(" ");
      const overlap = [...words(text)].filter((x) => w.has(x)).length;
      return { p, score: (sameOrg ? 100 : 0) + overlap, sameOrg, overlap };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(({ p, sameOrg, overlap }) => ({
      ...p,
      why: sameOrg ? `Same organisation: ${p.result.organisation?.name}` : overlap > 0 ? "A similar hazard" : "An example of what a brief looks like",
    }));
}

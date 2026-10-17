import Link from "next/link";
import {
  ArrowRight,
  Braces,
  Brain,
  Building2,
  CheckCheck,
  FileText,
  Fingerprint,
  ReceiptText,
  Scale,
  ScanSearch,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { AgentSteps, Flow, IconItem, ModelTag, StackBar, compact, latency, money, n, share } from "@/components/nemotron/parts";
import type { FlowStep, Segment } from "@/components/nemotron/parts";
import { EmptyState, PageHeader, Section, StatTile, btnPrimary, btnSecondary, pct } from "@/components/ui";
import { byFamily, byStage, getPipelinePage } from "@/lib/queries-pipeline";
import type { ModelFamily, Totals } from "@/lib/queries-pipeline";

export const metadata = { title: "How Nemotron did the work · Recurrence Watch" };
export const dynamic = "force-dynamic";

const CRUMBS = [{ href: "/how-we-know", label: "How we know" }, { label: "Nemotron" }];

const DEFAULT_IDS: Record<Exclude<ModelFamily, "other">, string> = {
  nano: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
  super: "nvidia/nemotron-3-super-120b-a12b",
  ultra: "nvidia/Nemotron-3-Ultra-550b-a55b",
  embed: "Qwen/Qwen3-Embedding-8B",
};

const STAGE: Record<string, { label: string; model: string; fill: string; opacity?: number }> = {
  C: { label: "Recurrence judge", model: "Super", fill: "var(--accent)" },
  D: { label: "Dossiers", model: "Ultra", fill: "var(--sand)" },
  A: { label: "Concern extraction", model: "Nano", fill: "var(--quote-bar)" },
  B: { label: "Promise extraction", model: "Nano", fill: "var(--quote-bar)", opacity: 0.6 },
  F: { label: "Follow-up classification", model: "Nano", fill: "var(--quote-bar)", opacity: 0.35 },
  embed: { label: "Embeddings", model: "Qwen3", fill: "var(--dot)" },
  dev: { label: "Pilots, development and chain titles", model: "mixed", fill: "var(--dot)", opacity: 0.5 },
};

function Explainer({ children }: { children: React.ReactNode }) {
  return <p className="text-ink-2 text-sm max-w-3xl">{children}</p>;
}

function Figure({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num text-ink" title={title}>
        {value}
      </dd>
    </div>
  );
}

export default async function NemotronPage() {
  const { pipeline, site, evaluation } = await getPipelinePage();

  if (!pipeline) {
    return (
      <div className="space-y-10">
        <PageHeader crumbs={CRUMBS} title="How Nemotron did the work" />
        <EmptyState title="The pipeline summary has not been published yet">
          It appears after the next publish. Meanwhile, see the <Link href="/how-we-know/evaluation">evaluation</Link> or the{" "}
          <Link href="/how-we-know/methodology">methodology</Link>.
        </EmptyState>
      </div>
    );
  }

  const f = pipeline.funnel;
  const ledger = pipeline.ledger ?? [];
  const hasLedger = ledger.length > 0;
  const fam = byFamily(ledger);
  const stages = byStage(ledger);
  const stageCost = (k: string) => stages.find((s) => s.stage === k)?.totals.cost ?? site?.spend.by_stage?.[k] ?? 0;

  const totalCost = hasLedger ? stages.reduce((a, s) => a + s.totals.cost, 0) : (site?.spend.total ?? 0);
  const paidCalls = stages.reduce((a, s) => a + s.totals.calls, 0);
  const cacheHits = stages.reduce((a, s) => a + s.totals.cached, 0);
  const chains = f.chains ?? site?.n_chains ?? 0;
  const links = f.links ?? site?.n_links ?? 0;
  const perChain = chains ? totalCost / chains : null;
  const ids = { ...DEFAULT_IDS, ...(site?.models ?? {}) } as Record<string, string>;
  const verifiedShare = f.concerns ? f.concerns_verified / f.concerns : 0;

  // ---- 2. the flow ----
  const flow: FlowStep[] = [
    { label: "Reports read", count: f.reports, tag: "judiciary.uk + OCR", model: false, note: "Every PFD report since 2013." },
    {
      label: "Concerns extracted",
      count: f.concerns,
      tag: "Nemotron Nano",
      note: `From ${n(f.reports_with_concerns)} reports, each as an exact quote.`,
    },
    {
      label: "Quotes verified",
      count: f.concerns_verified,
      tag: "Word-for-word check",
      model: false,
      note: `${pct(verifiedShare)} found word for word in the source.`,
    },
    {
      label: "Candidate pairs",
      count: f.pairs,
      tag: "TF-IDF + Qwen3",
      note: "Same organisation, at least six months apart.",
    },
    { label: "Pairs judged", count: f.judged, tag: "Nemotron Super", note: "Same hazard, or only the same topic?" },
    {
      label: "Links shown",
      count: links,
      tag: "Rules",
      model: false,
      note: "Identical or closely related, confident, both quotes verified.",
    },
    { label: "Chains", count: chains, tag: "Grouped", model: false, note: "One organisation, one hazard, over time." },
  ];

  const rel = f.relations ?? {};
  const relSegments: Segment[] = [
    { key: "identical", label: "Identical hazard", value: rel.identical ?? 0, fill: "var(--accent)" },
    { key: "closely_related", label: "Closely related", value: rel.closely_related ?? 0, fill: "var(--quote-bar)" },
    { key: "related", label: "Related", value: rel.related ?? 0, fill: "var(--dot)" },
    { key: "different", label: "Different", value: rel.different ?? 0, fill: "var(--dot)", opacity: 0.4 },
  ];
  const relTotal = relSegments.reduce((a, s) => a + s.value, 0);

  // ---- 3. models ----
  const perItem = (cost: number, count: number) => (count ? money(cost / count) : "–");
  const models: {
    fam: Exclude<ModelFamily, "other">;
    name: string;
    size: string;
    did: string;
    why: string;
    per: { label: string; value: string };
  }[] = [
    {
      fam: "nano",
      name: "Nemotron 3 Nano",
      size: "30B parameters, 3B active",
      did: `Read every report and response letter. Pulled out each concern (${n(f.concerns)}) and each promised action (${n(f.promises)}) as an exact quote, in enforced JSON. Sorted web search results for ${n(f.followups)} follow-ups.`,
      why: "Extraction is a narrow task repeated thousands of times. Nano is the smallest model that copies quotes reliably, so reasoning stays off.",
      per: { label: "Concern extraction, per 1,000 reports", value: perItem(stageCost("A") * 1000, f.reports) },
    },
    {
      fam: "super",
      name: "Nemotron 3 Super",
      size: "120B parameters, 12B active",
      did: `Judged ${n(f.judged)} candidate pairs: identical, closely related, related or different, with a confidence, a short reason and a quote from each report.`,
      why: "This is the hard semantic call: the same hazard, or only the same topic. Super reasons before it answers, at low effort to hold down cost and time.",
      per: { label: "Per 1,000 pairs judged", value: perItem(stageCost("C") * 1000, f.judged) },
    },
    {
      fam: "ultra",
      name: "Nemotron 3 Ultra",
      size: "550B parameters, 55B active",
      did: `Wrote ${n(f.dossiers)} dossiers for flagship chains: a dated timeline, a short narrative and open questions, from every report and response in the chain.`,
      why: "Its long context holds a whole chain in one prompt. It is the largest and dearest model, so it is used only here.",
      per: { label: "Per dossier", value: perItem(stageCost("D"), f.dossiers) },
    },
    {
      fam: "embed",
      name: "Qwen3 Embedding 8B",
      size: "8B parameters",
      did: `Turned each concern into a vector, so a later concern can find earlier ones by meaning and not only by shared words.`,
      why: "Token Factory serves no NVIDIA embedding model. This keeps retrieval on the same platform, the same key and the same cost ledger.",
      per: { label: `All ${n(f.concerns)} concerns embedded`, value: money(stageCost("embed")) },
    },
  ];

  const costSegments: Segment[] = Object.entries(
    hasLedger ? Object.fromEntries(stages.map((s) => [s.stage, s.totals.cost])) : (site?.spend.by_stage ?? {}),
  )
    .map(([k, v]) => ({
      key: k,
      label: STAGE[k]?.label ?? k,
      sub: STAGE[k]?.model,
      value: v,
      fill: STAGE[k]?.fill ?? "var(--rule)",
      opacity: STAGE[k]?.opacity,
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  const superReasoning = fam.super.reasoning_tokens;
  const best = evaluation?.systems?.find((s) => /judge/i.test(s.name));
  const baselines = evaluation?.systems?.filter((s) => s !== best && s.recall_at_threshold !== null) ?? [];

  return (
    <div className="space-y-12">
      {/* 1. Hero */}
      <div>
      <PageHeader
        crumbs={CRUMBS}
        title="How Nemotron did the work"
        description={
          <>
            Three sizes of NVIDIA Nemotron on Nebius Token Factory read {n(f.reports)} coroners&apos; reports, judged{" "}
            {n(f.judged)} possible recurrences and wrote {n(f.dossiers)} dossiers, for {money(totalCost)} in all.
          </>
        }
      />
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile value={n(f.reports)} label="reports read, 2013 to now" />
        <StatTile value={hasLedger ? n(paidCalls) : "–"} label="paid model calls, every one in the cost ledger" />
        <StatTile value={money(totalCost)} label="total spend on Token Factory, pilots included" />
        <StatTile value={perChain !== null ? money(perChain, true) : "–"} label={`per verified chain (${n(chains)} chains), all stages counted`} />
      </section>
      </div>

      {/* 2. Flow */}
      <Section title="From archive to evidence" tour="funnel">
        <Explainer>
          Each step narrows the archive. Small models do the reading, a larger one makes the judgement, and plain code
          checks every quote against the source.
        </Explainer>
        <Flow steps={flow} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card p-4 space-y-1">
            <div className="eyebrow">Alongside</div>
            <div className="font-serif text-xl num">{n(f.promises)}</div>
            <p className="text-sm text-ink-2">promised actions taken from {n(f.responses)} response letters</p>
            <ModelTag>Nemotron Nano</ModelTag>
          </div>
          <div className="card p-4 space-y-1">
            <div className="eyebrow">Alongside</div>
            <div className="font-serif text-xl num">{n(f.followups)}</div>
            <p className="text-sm text-ink-2">
              promises followed up on the web
              {pipeline.tavily_credits !== null && <>, using {n(Math.round(pipeline.tavily_credits))} Tavily credits</>}
            </p>
            <ModelTag>Nemotron Nano</ModelTag>
          </div>
          <div className="card p-4 space-y-1">
            <div className="eyebrow">Alongside</div>
            <div className="font-serif text-xl num">{n(f.dossiers)}</div>
            <p className="text-sm text-ink-2">dossiers with a timeline and open questions</p>
            <ModelTag>Nemotron Ultra</ModelTag>
          </div>
          <div className="card p-4 space-y-1">
            <div className="eyebrow">Alongside</div>
            <div className="font-serif text-xl num">{hasLedger ? n(cacheHits) : "–"}</div>
            <p className="text-sm text-ink-2">repeat requests answered free from the request-hash cache</p>
            <ModelTag model={false}>Cache</ModelTag>
          </div>
        </div>
        {relTotal > 0 && (
          <div className="card p-5 space-y-3">
            <div>
              <h3 className="font-medium">What Super decided</h3>
              <p className="text-sm text-ink-2">
                Verdicts on {n(relTotal)} candidate pairs. {share(relSegments[2].value + relSegments[3].value, relTotal)} were judged
                only related or different: alike in wording, but not the same hazard. That is why a judge is needed at all. Only confident identical or
                closely related verdicts with both quotes verified are shown ({n(links)} links).
              </p>
            </div>
            <StackBar segments={relSegments} format={(v) => n(v)} title="Super's verdicts" />
          </div>
        )}
      </Section>

      {/* 3. Models */}
      <Section title="Right-sized models">
        <Explainer>
          Each task goes to the smallest model that does it well. The big model is kept for the few jobs that need it.
        </Explainer>
        {hasLedger ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {models.map((m) => {
              const t: Totals = fam[m.fam];
              return (
                <article key={m.fam} className="card p-4 flex flex-col gap-3 min-w-0">
                  <header className="space-y-1">
                    <h3 className="font-serif text-lg leading-tight">{m.name}</h3>
                    <p className="text-xs text-muted">{m.size}</p>
                    <p className="font-mono text-[11px] text-ink-2 break-all">{ids[m.fam]}</p>
                  </header>
                  <p className="text-sm text-ink-2">{m.did}</p>
                  {t.calls + t.cached > 0 ? (
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm border-t border-rule pt-3">
                      <Figure label="Paid calls" value={n(t.calls)} />
                      <Figure label="Cache hits" value={n(t.cached)} />
                      <Figure label="Tokens in" value={compact(t.input_tokens)} title={n(t.input_tokens)} />
                      <Figure
                        label="Tokens out"
                        value={t.output_tokens ? compact(t.output_tokens) : "–"}
                        title={n(t.output_tokens)}
                      />
                      <Figure
                        label="Reasoning tokens"
                        value={t.reasoning_tokens ? compact(t.reasoning_tokens) : "none"}
                        title={n(t.reasoning_tokens)}
                      />
                      <Figure label="Average latency" value={latency(t.avg_latency_ms)} />
                      <Figure label="Cost" value={money(t.cost)} />
                      <Figure label="Share of spend" value={share(t.cost, totalCost)} />
                    </dl>
                  ) : (
                    <p className="text-sm text-muted border-t border-rule pt-3">No calls recorded in the ledger.</p>
                  )}
                  <div className="rounded-md bg-paper-2 px-3 py-2 text-sm flex items-baseline justify-between gap-3">
                    <span className="text-ink-2">{m.per.label}</span>
                    <span className="num text-ink">{m.per.value}</span>
                  </div>
                  <div className="mt-auto space-y-1">
                    <div className="eyebrow">Why this model</div>
                    <p className="text-sm text-ink-2">{m.why}</p>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title="The cost ledger was not available at the last publish">
            Spend by stage is still shown below.
          </EmptyState>
        )}
        {fam.other.calls > 0 && (
          <p className="text-xs text-muted">
            A further {n(fam.other.calls)} calls ({money(fam.other.cost)}) went to other models during development.
          </p>
        )}
        {costSegments.length > 0 && (
          <div className="card p-5 space-y-3">
            <div>
              <h3 className="font-medium">Where the {money(totalCost)} went</h3>
              <p className="text-sm text-ink-2">
                Share of spend by stage.
                {costSegments[0]?.key === "C" && " The judge is the largest share, because it reasons about every candidate pair."}
              </p>
            </div>
            <StackBar segments={costSegments} format={(v) => money(v)} title="Spend by stage" />
          </div>
        )}
      </Section>

      {/* 4. Token Factory features */}
      <Section title="Token Factory features used">
        <Explainer>
          Every call goes through one small wrapper, in the pipeline and in this app. These are the features it relies on.
        </Explainer>
        <ul className="card p-5 grid gap-5 md:grid-cols-2 list-none">
          <IconItem icon={Braces} title="Structured JSON output">
            A json_schema response format, enforced on Nano, Super and Ultra. Every concern, promise and verdict arrives as
            valid JSON, with no free-text parsing.
          </IconItem>
          <IconItem icon={Brain} title="Reasoning toggle">
            chat_template_kwargs turns reasoning off for extraction and sets it to low effort for the judge
            {superReasoning > 0 && <> ({compact(superReasoning)} reasoning tokens from Super in all)</>}.
          </IconItem>
          <IconItem icon={ReceiptText} title="Live prices">
            The models endpoint with verbose pricing gives the price per token. Each call is costed from it, and so is
            the budget guard.
          </IconItem>
          <IconItem icon={Timer} title="Rate-limit headers">
            The wrapper reads the rate-limit headers on each response and paces the next calls to stay inside them.
          </IconItem>
          <IconItem icon={Fingerprint} title="Request-hash cache">
            Each request is hashed. A repeat is answered from the cache at no cost
            {hasLedger && cacheHits > 0 && <> ({n(cacheHits)} times so far)</>}, so reruns are cheap and repeatable.
          </IconItem>
          <IconItem icon={ShieldCheck} title="Cost ledger with a hard budget stop">
            Every call is logged with its tokens, latency and cost. A call that could take a stage over its budget is
            refused before it is sent.
          </IconItem>
        </ul>
      </Section>

      {/* 5. Live agent */}
      <Section title="At request time: the live agent">
        <div className="card p-5 space-y-5">
          <Explainer>
            The same models run on demand. Give the brief a new report and it works through these steps while you watch,
            showing what each step found, its tokens and its cost.
          </Explainer>
          <AgentSteps
            steps={[
              { icon: FileText, title: "Read the report and find the organisation", tag: "Archive or judiciary.uk", model: false },
              { icon: ScanSearch, title: "Extract the concerns", tag: "Nemotron Nano" },
              { icon: Building2, title: "Retrieve earlier concerns to the same organisation", tag: "Qwen3 + pgvector" },
              { icon: Scale, title: "Judge the closest matches", tag: "Nemotron Super" },
              { icon: CheckCheck, title: "Check every quote word for word", tag: "Exact-match check", model: false },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Link href="/brief" className={btnPrimary}>
              Watch the agent <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
        </div>
      </Section>

      {/* 6. Footer */}
      <section className="border-t border-rule pt-6 space-y-3">
        {best?.recall_at_threshold != null && baselines.length > 0 && (
          <p className="text-ink-2 text-sm max-w-3xl">
            Does the judge earn its cost? On a blind test of recurrences that coroners themselves flagged, the hybrid with
            the Super judge found {pct(best.recall_at_threshold)}, against{" "}
            {baselines.map((b, i) => (
              <span key={b.name}>
                {i > 0 && (i === baselines.length - 1 ? " and " : ", ")}
                {pct(b.recall_at_threshold ?? 0)} for {b.name.replace(/ only$/i, "").replace(/^Embeddings$/, "embeddings")} alone
              </span>
            ))}
            , at the same number of shown links.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href="/how-we-know/evaluation" className={btnSecondary}>
            Evaluation
          </Link>
          <Link href="/how-we-know/methodology" className={btnSecondary}>
            Methodology
          </Link>
        </div>
      </section>
    </div>
  );
}

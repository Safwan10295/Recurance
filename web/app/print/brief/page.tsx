import Link from "next/link";
import {
  DocFooter,
  DocHeader,
  DocQuote,
  DocSection,
  Ext,
  FollowupItem,
  siteBase,
  Toolbar,
} from "@/components/print/PrintDoc";
import { RELATION_LABEL, confidenceWord, formatDate, shortTitle } from "@/components/ui";
import type { BriefMatch, BriefResult } from "@/lib/brief";
import { getStore } from "@/lib/store";
import type { Relation } from "@/lib/types";

export const metadata = { title: "Pre-inquest brief · Recurrence Watch" };

type Saved = { input?: { organisation?: string; concerns?: string }; result: BriefResult };

async function loadBrief(h: string): Promise<Saved | null> {
  if (!/^[a-f0-9]{64}$/.test(h)) return null;
  const store = getStore();
  if (store.kind === "none") return null;
  const saved = (await store.get<Saved>(`brief:${h}`).catch(() => null)) ?? (await store.get<Saved>(`archive:${h}`).catch(() => null));
  return saved?.result ? saved : null;
}

const relationLabel = (r: string) => RELATION_LABEL[r as Relation] ?? r;

function MatchBlock({ m, n, checked }: { m: BriefMatch; n: number; checked: string }) {
  return (
    <div className="pb-item">
      <h3>
        {n}. {shortTitle(m.earlier.title)}
      </h3>
      <p className="pb-meta">
        {formatDate(m.earlier.date)} · {m.earlier.coroner ?? "coroner not stated"}
        {m.earlier.area ? `, ${m.earlier.area}` : ""} · {relationLabel(m.relation)} · confidence {m.confidence.toFixed(2)} (
        {confidenceWord(m.confidence)})
      </p>
      {m.explanation && <p>{m.explanation}</p>}
      <div className="pb-pair">
        <div>
          <p className="pb-eyebrow">Earlier · {formatDate(m.earlier.date)}</p>
          <DocQuote text={m.earlier_quote} />
          <p className="pb-small">
            <Ext href={m.earlier.url} />
          </p>
        </div>
        <div>
          <p className="pb-eyebrow">{checked}</p>
          <DocQuote text={m.later_quote} />
        </div>
      </div>
    </div>
  );
}

export default async function PrintBriefPage({ searchParams }: { searchParams: Promise<{ h?: string | string[] }> }) {
  const sp = await searchParams;
  const h = typeof sp.h === "string" ? sp.h : "";
  const saved = await loadBrief(h);

  if (!saved) {
    return (
      <main id="main">
        <Toolbar back={{ href: "/brief", label: "Back to the brief tool" }} />
        <article className="pb-paper">
          <h1>Brief not found</h1>
          <p>
            This saved brief could not be found. The link may be incomplete, or the brief may no longer be stored.
          </p>
          <p>
            You can run the check again on the <Link href="/brief">brief page</Link>.
          </p>
        </article>
      </main>
    );
  }

  const { result, input } = saved;
  const address = `${await siteBase()}/brief?h=${h}`;
  const organisation = result.organisation?.name ?? input?.organisation ?? null;
  const report = result.report;
  const checked = report ? `Report checked · ${report.date ? formatDate(report.date) : "date not stated"}` : "Concerns supplied";
  const matches = result.matches;

  // Stated actions and web checks, numbered by the earlier warning they belong to.
  const promises = matches.flatMap((m, i) => m.promises.map((p) => ({ p, n: i + 1, m })));
  const actionNo = new Map(promises.map((x, k) => [`${x.n}|${x.p.quote}`, k + 1]));
  const followups = matches.flatMap((m, i) => (m.followups ?? []).map((f) => ({ f, n: i + 1, k: actionNo.get(`${i + 1}|${f.promise}`) })));

  return (
    <main id="main">
      <Toolbar back={{ href: `/brief?h=${h}`, label: "Back to the brief" }} />
      <article className="pb-paper">
        <DocHeader
          subject={report ? `Report checked: ${shortTitle(report.title)}` : "Concerns supplied"}
          organisation={organisation}
          address={address}
        />

        <DocSection title="The report checked">
          {report ? (
            <>
              <p>
                <span className="pb-label">{shortTitle(report.title)}</span> · {report.date ? formatDate(report.date) : "date not stated"}
              </p>
              <p className="pb-small">
                <Ext href={report.url} />
              </p>
            </>
          ) : (
            <p>Concerns supplied by the reader, not a published report.</p>
          )}
          <p className="pb-meta">
            <span className="pb-label">Organisation:</span> {organisation ?? "not identified"}
          </p>
        </DocSection>

        <DocSection title={matches.length === 1 ? "The earlier warning" : "The earlier warnings"}>
          {matches.length === 0 ? (
            <p className="pb-muted">No earlier report to this organisation raised a concern close enough to be linked.</p>
          ) : (
            matches.map((m, i) => <MatchBlock key={m.earlier.url} m={m} n={i + 1} checked={checked} />)
          )}
        </DocSection>

        {matches.length > 0 && (
          <DocSection title="What was promised">
            {promises.length === 0 ? (
              <p className="pb-muted">No stated action with a verified quote was found in a response to the earlier reports.</p>
            ) : (
              promises.map(({ p, n, m }, k) => (
                <div key={`${n}-${p.id}`} className="pb-item">
                  <p>
                    <span className="pb-label">Stated action {k + 1}</span>{" "}
                    <span className="pb-muted">· response to earlier warning {n}</span>{" "}
                    <span className="pb-muted">
                      · {shortTitle(m.earlier.title)} · stated timescale: {p.timescale ?? "none stated"}
                    </span>
                  </p>
                  <DocQuote text={p.quote} />
                </div>
              ))
            )}
          </DocSection>
        )}

        {followups.length > 0 && (
          <DocSection title="What happened next">
            {followups.map(({ f, n, k }, i) => (
              <FollowupItem
                key={i}
                classification={f.classification}
                sources={f.source_url && f.quote ? [{ url: f.source_url, quote: f.quote }] : []}
                action={
                  k ? (
                    `stated action ${k}`
                  ) : (
                    <>
                      earlier warning {n}, stated action: &ldquo;{f.promise}&rdquo;
                    </>
                  )
                }
              />
            ))}
          </DocSection>
        )}

        <DocFooter />
      </article>
    </main>
  );
}

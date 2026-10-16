import { ArrowRight, Gavel, HeartHandshake, Scale, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";

// Four ways in, each opening a real archive report in the brief. The examples have saved briefs, so they run
// instantly, at no cost, whether or not the live agent is available.
const CARDS: { icon: LucideIcon; who: string; need: string; body: string; slug: string; example: string }[] = [
  {
    icon: Gavel,
    who: "Coroner",
    need: "Before an inquest",
    body: "Has this concern already been raised with this organisation, and what did it say it would do?",
    slug: "david-levett-prevention-of-future-deaths-report",
    example: "A smart motorway report, 2023",
  },
  {
    icon: Scale,
    who: "Solicitor or lawyer",
    need: "Preparing questions",
    body: "Earlier reports, the responses and the actions they stated, with exact quotes and source links to cite.",
    slug: "paul-green-prevention-of-future-deaths-report",
    example: "A young driver crash report, 2026",
  },
  {
    icon: HeartHandshake,
    who: "Family",
    need: "Understanding what came before",
    body: "In plain words: has this happened before, and what was said would change?",
    slug: "jody-robb-prevention-of-future-deaths-report",
    example: "A railway platform report, 2025",
  },
  {
    icon: ShieldCheck,
    who: "Safety team",
    need: "Learning across the system",
    body: "Concerns raised more than once with your organisation, and the actions already stated in response.",
    slug: "george-haldenby-prevention-of-future-deaths-report",
    example: "A prison first aid report, 2026",
  },
];

export default function AudienceCards() {
  return (
    <section className="space-y-4" aria-labelledby="who-heading">
      <div>
        <h2 id="who-heading" className="font-serif text-2xl">
          Who it is for
        </h2>
        <p className="text-sm text-ink-2">Each card opens a real report in the brief and shows what the agent finds.</p>
      </div>
      <ul className="grid gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map(({ icon: Icon, who, need, body, slug, example }) => (
          <li key={who}>
            <Link
              href={`/brief?report=${slug}&run=1`}
              className="card card-link group flex h-full flex-col gap-2 p-4 hover:no-underline"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden>
                  <Icon size={18} />
                </span>
                <span>
                  <span className="block font-semibold leading-tight text-ink">{who}</span>
                  <span className="block text-xs text-muted">{need}</span>
                </span>
              </span>
              <span className="text-sm text-ink-2">{body}</span>
              <span className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs">
                <span className="text-muted">Try: {example}</span>
                <ArrowRight size={15} className="shrink-0 text-accent transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

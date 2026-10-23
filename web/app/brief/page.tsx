import AudienceCards from "@/components/AudienceCards";
import BriefTool from "@/components/BriefTool";
import { PageHeader } from "@/components/ui";
import { q1 } from "@/lib/db";
import { getOrg } from "@/lib/queries";

export const metadata = {
  title: "Check a report · Recurrence Watch",
  description: "Watch an agent built on NVIDIA Nemotron find earlier coroners' warnings to the same organisation, with verified quotes.",
};

export default async function BriefPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const url = sp.url && /^https:\/\/www\.judiciary\.uk\//.test(sp.url) ? sp.url : undefined;
  // ?report=<slug>&run=1 comes from a report page; ?org=<id> from a chain or organisation page.
  const slug = sp.report && /^[A-Za-z0-9._%-]{1,250}$/.test(sp.report) ? sp.report : undefined;
  const report = slug
    ? await q1<{ slug: string; title: string; date: string; url: string }>("SELECT slug, title, date::text, url FROM pub_reports WHERE slug = $1", [slug]).catch(() => null)
    : null;
  const orgId = Number(sp.org);
  const org = Number.isInteger(orgId) && orgId > 0 ? await getOrg(orgId).catch(() => null) : null;
  return (
    <div>
      <PageHeader
        crumbs={[{ href: "/", label: "Start here" }, { label: "Check a report" }]}
        title="Check a report"
        description={
          <>
            Give a report, new or old. An agent built on NVIDIA Nemotron finds earlier warnings to the same organisation that
            raised the same hazard, shows what was promised, and links to what happened next. You can watch every step it
            takes. Useful before an inquest, for a family, a lawyer or a safety team.
          </>
        }
      />
      <BriefTool
        initialUrl={url}
        initialSlug={report ?? undefined}
        initialOrg={org ? { id: org.id, name: org.name } : undefined}
        autoRun={sp.run === "1" && !!report}
      />
      <div className="mt-14">
        <AudienceCards />
      </div>
    </div>
  );
}

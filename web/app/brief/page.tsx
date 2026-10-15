import BriefTool from "@/components/BriefTool";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Check a report · Recurrence Watch" };

export default async function BriefPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const url = sp.url && /^https:\/\/www\.judiciary\.uk\//.test(sp.url) ? sp.url : undefined;
  return (
    <div>
      <PageHeader
        eyebrow="Use the tool"
        title="Check a report"
        description="Give a report, new or old, and the agent finds earlier warnings to the same organisation that raised the same hazard, shows what was promised, and links to what happened next. Useful before an inquest, for a family, a lawyer or a safety team."
      />
      <BriefTool initialUrl={url} />
    </div>
  );
}

import OrgIndex from "@/components/OrgIndex";
import { getOrgs } from "@/lib/data";

export const metadata = { title: "Organisations · Recurrence Watch" };

export default function OrgsPage() {
  const orgs = getOrgs();
  return (
    <div className="space-y-6">
      <header className="space-y-3 max-w-3xl">
        <h1 className="font-serif text-3xl">Organisations</h1>
        <p className="text-ink-2">
          Each page lists the reports an organisation received, its published responses, the actions it stated, and any
          chains where a similar concern was raised again. There is no ranking: a higher number of reports often
          reflects size and the range of services, not performance.
        </p>
      </header>
      <OrgIndex orgs={orgs} />
    </div>
  );
}

import ChainList from "@/components/ChainList";
import { getChains, getSite } from "@/lib/data";

export const metadata = { title: "Chains · Recurrence Watch" };

export default function ChainsPage() {
  const chains = getChains();
  const site = getSite();
  return (
    <div className="space-y-6">
      <header className="space-y-3 max-w-3xl">
        <h1 className="font-serif text-3xl">Recurrence chains</h1>
        <p className="text-ink-2">
          Each chain is one hazard raised with one organisation in two or more reports at least six months apart. A link
          is shown only when the judge model rated it identical or closely related with confidence of at least{" "}
          {site.min_confidence.toFixed(2)}, and both quotes were found word for word in the original reports.
        </p>
      </header>
      <ChainList chains={chains} />
    </div>
  );
}

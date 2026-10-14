import BriefTool from "@/components/BriefTool";

export const metadata = { title: "Pre-inquest brief · Recurrence Watch" };

export default function BriefPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-3 max-w-3xl">
        <h1 className="font-serif text-3xl">Pre-inquest brief</h1>
        <p className="text-ink-2">
          Give a new report or draft concerns and the organisation they are addressed to. An agent finds earlier reports
          to the same organisation that raised a similar hazard, shows what was promised, and links to what happened next.
        </p>
        <ol className="list-decimal pl-5 text-sm text-ink-2 space-y-0.5">
          <li>Resolve the organisation against every receiver name in the archive.</li>
          <li>Extract the concerns with Nemotron Nano, or reuse them if the report is already analysed.</li>
          <li>Search that organisation&apos;s earlier concerns by meaning (Qwen3 embeddings on Token Factory).</li>
          <li>Judge the three closest with Nemotron Super, with quotes checked word for word.</li>
        </ol>
        <p className="text-sm text-muted">
          Live use is limited each day to protect the service. Results are cached, so the same input gives the same brief.
        </p>
      </header>
      <BriefTool />
    </div>
  );
}

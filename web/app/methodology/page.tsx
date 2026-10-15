import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getMeta } from "@/lib/queries";

export const metadata = { title: "Methodology and responsible use · Recurrence Watch" };

export default async function Methodology() {
  const site = (await getMeta()).site;
  const contact = process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL;
  const repo = process.env.NEXT_PUBLIC_REPO_URL;
  return (
    <article className="space-y-5 max-w-3xl">
      <PageHeader eyebrow="How we know" title="Methodology and responsible use" description="How the links are made, what they mean, and what they do not mean." />

      <section className="card p-5 sm:p-6 space-y-3">
        <h2 className="font-serif text-xl">What a link means</h2>
        <p className="text-ink-2">
          A link says that a later coroner&apos;s report raised the same or a closely related hazard as an earlier report to
          the same organisation, often after the organisation stated an action. It does not say why the concern recurred.
          It is not a finding that any organisation ignored a warning, caused a death or is responsible for anything.
          Circumstances, evidence and context differ between inquests.
        </p>
      </section>

      <section className="card p-5 sm:p-6 space-y-3">
        <h2 className="font-serif text-xl">Data source and licence</h2>
        <ol className="list-decimal pl-5 space-y-1 text-ink-2">
          <li>Reports and responses are published by the Courts and Tribunals Judiciary at judiciary.uk.</li>
          <li>The material is Crown copyright and is used under the Open Government Licence v3.0.</li>
          <li>Every report and response is linked at its original address. Response documents are not copied or rehosted.</li>
          <li>The archive was read politely: one request per second, with a contact address in the request header.</li>
          <li>This analysis covers {site.n_reports.toLocaleString("en-GB")} unique reports. Republished duplicates are counted once.</li>
        </ol>
      </section>

      <section className="card p-5 sm:p-6 space-y-3">
        <h2 className="font-serif text-xl">How it works</h2>
        <ol className="list-decimal pl-5 space-y-2 text-ink-2">
          <li>Each report&apos;s concerns and circumstances sections are separated from the standard Regulation 28 template text, which is removed so it cannot drive similarity.</li>
          <li>Receiver names are normalised into organisations, including known renames such as Highways England to National Highways.</li>
          <li>Nemotron 3 Nano splits each report&apos;s concerns into separate concerns, each with a quote copied from the report.</li>
          <li>Within each organisation, concerns from reports at least six months apart are compared with TF-IDF and embedding similarity. Only the closest pairs go forward.</li>
          <li>For the earlier report in each pair, Nemotron 3 Nano lists the actions stated in the published response, each with a quote.</li>
          <li>Nemotron 3 Super, with low-effort reasoning, judges each pair as identical, closely related, related or different, and gives a confidence.</li>
          <li>Pairs judged identical or closely related, with confidence of at least {site.min_confidence.toFixed(2)}, are grouped into chains.</li>
          <li>For promised actions in chains, Tavily searches the web for evidence of what happened next, and Nemotron 3 Nano classifies what it finds.</li>
          <li>Nemotron 3 Ultra drafts a dossier for the strongest chains. A dossier is published only after a person has read it.</li>
        </ol>
      </section>

      <section className="card p-5 sm:p-6 space-y-3">
        <h2 className="font-serif text-xl">Safeguards</h2>
        <ol className="list-decimal pl-5 space-y-1 text-ink-2">
          <li>Every quote shown is checked by code as an exact substring of the source text, after whitespace and typographic quote normalisation. A link whose quotes cannot be verified is not shown.</li>
          <li>Where a model&apos;s quote differed only slightly from the source, the source&apos;s own words are shown instead.</li>
          <li>Model-written sentences are checked against a list of blaming words and withheld if they contain one.</li>
          <li>Names of clinicians, staff and family members are redacted. Coroners are named as public office holders. The deceased are referred to only by the published report title.</li>
          <li>There are no league tables or rankings. Lists are sorted by date.</li>
          <li>&quot;No published response found&quot; means none was attached to the report on judiciary.uk. A response may exist elsewhere.</li>
          <li>&quot;No evidence found&quot; from the web search does not mean an action did not happen.</li>
        </ol>
      </section>

      <section className="card p-5 sm:p-6 space-y-3">
        <h2 className="font-serif text-xl">Limitations</h2>
        <ol className="list-decimal pl-5 space-y-1 text-ink-2">
          <li>Linking is within one organisation. Renamed or merged bodies are linked only where a rename is known.</li>
          <li>Some older reports and responses are scanned images. They were read with OCR, which can introduce errors.</li>
          <li>Similarity search can miss a recurrence described in very different words.</li>
          <li>The judge model can be wrong. Confidence is the model&apos;s own estimate, checked against a labelled sample on the <Link href="/evaluation">evaluation page</Link>.</li>
        </ol>
      </section>

      <section className="card p-5 sm:p-6 space-y-3">
        <h2 className="font-serif text-xl">Prior work</h2>
        <ol className="list-decimal pl-5 space-y-1 text-ink-2">
          <li>PFD Monitor groups coroners&apos; concerns into themes and extracts stated actions. Its responsible-use guidance says it should not be used to decide that an organisation ignored a warning, and we agree.</li>
          <li>The Preventable Deaths Tracker by Georgia Richards tracks responses and overdue replies.</li>
          <li>PFD Toolkit by Sam Osian provides an open-source loader and thematic analysis. No PFD Toolkit code is used here.</li>
        </ol>
      </section>

      <section id="corrections" className="card p-5 sm:p-6 space-y-3 scroll-mt-24">
        <h2 className="font-serif text-xl">Corrections and contact</h2>
        <p className="text-ink-2">
          If a link, quote or redaction is wrong, please tell us and it will be reviewed and corrected or removed.{" "}
          {contact ? (
            <>
              Email <a href={`mailto:${contact}`}>{contact}</a>.
            </>
          ) : repo ? (
            <>
              Open an issue at <a href={`${repo}/issues`}>{repo}</a>.
            </>
          ) : (
            <>A contact address will be published here.</>
          )}
        </p>
      </section>
    </article>
  );
}

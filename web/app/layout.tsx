import type { Metadata } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const sans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", display: "swap" });

export const metadata: Metadata = {
  title: "Recurrence Watch",
  description:
    "Links coroners' Prevention of Future Deaths reports across years, coroners and areas, and shows where a concern recurred after a stated action.",
};

const NAV = [
  ["/chains", "Chains"],
  ["/organisations", "Organisations"],
  ["/brief", "Pre-inquest brief"],
  ["/evaluation", "Evaluation"],
  ["/methodology", "Methodology"],
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-screen">
        <header className="border-b border-rule">
          <div className="mx-auto max-w-5xl px-4 py-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <Link href="/" className="no-underline text-ink font-serif text-xl font-semibold tracking-tight">
              Recurrence Watch
            </Link>
            <nav aria-label="Main" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} className="text-ink-2 no-underline hover:underline">
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">{children}</main>
        <footer className="border-t border-rule mt-16">
          <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted space-y-2">
            <p>
              Source material: Prevention of Future Deaths reports and responses published by the Courts and Tribunals
              Judiciary at judiciary.uk. Crown copyright, used under the Open Government Licence v3.0.
            </p>
            <p>
              Links are machine-generated and checked against verbatim text. They show that a similar concern was raised
              again, not why. See the <Link href="/methodology">methodology and responsible use</Link> page.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

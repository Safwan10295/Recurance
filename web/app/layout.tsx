import type { Metadata } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import AppShell from "@/components/shell/AppShell";
import { THEME_SCRIPT } from "@/components/shell/nav";
import { formatDate } from "@/components/ui";
import { getMeta } from "@/lib/queries";
import "./globals.css";

const sans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  title: "Recurrence Watch",
  description:
    "Links coroners' Prevention of Future Deaths reports across years, coroners and areas, and shows where a concern recurred after a stated action.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let updated: string | null = null;
  try {
    const m = await getMeta();
    updated = m.published_at ? formatDate(m.published_at) : null;
  } catch {
    updated = null;
  }
  return (
    <html lang="en-GB" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AppShell updated={updated}>{children}</AppShell>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import AppShell from "@/components/shell/AppShell";
import { THEME_SCRIPT } from "@/components/shell/nav";
import { formatDate } from "@/components/ui";
import { getMeta } from "@/lib/queries";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  title: "Recurance",
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
    <html lang="en-GB" className={figtree.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AppShell updated={updated}>{children}</AppShell>
      </body>
    </html>
  );
}

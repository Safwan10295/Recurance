import type { Metadata } from "next";

// Layout for the printable briefs. The app shell is not rendered under /print (see AppShell), so these pages
// are standalone documents. The styles live in this layout, so they apply only while a print page is open.

export const metadata: Metadata = { robots: { index: false, follow: false } };

const CSS = `
html, body { background: #e9e7e1 !important; }
.pb-desk {
  /* Always the light palette, whatever theme the reader has chosen: this is a paper document. */
  --paper: #f6f5f1; --surface: #ffffff; --paper-2: #efede6; --ink: #18202c; --ink-2: #444e5e; --muted: #687080;
  --rule: #e2dfd6; --accent: #2f5d62; --accent-strong: #234a4e; --accent-ink: #ffffff; --accent-soft: #e3eded;
  --quote-bar: #9fb7b9;
  color-scheme: light;
  min-height: 100vh; padding: 20px 16px 48px; color: #18202c;
  font-family: var(--font-source-sans), system-ui, sans-serif;
}
.pb-toolbar { max-width: 800px; margin: 0 auto 14px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; font-size: 14px; }
.pb-toolbar a.pb-back { color: #2f5d62; }
.pb-paper {
  max-width: 800px; margin: 0 auto; background: #fff; color: #18202c;
  padding: 40px 48px; border: 1px solid #dcd9d0; box-shadow: 0 10px 30px -12px rgba(20,24,31,.18);
  font-size: 13px; line-height: 1.5;
}
@media (max-width: 640px) { .pb-paper { padding: 24px 18px; } }
.pb-paper h1, .pb-paper h2, .pb-paper h3 { font-family: var(--font-source-serif), Georgia, serif; color: #18202c; font-weight: 600; letter-spacing: -0.01em; }
.pb-paper h1 { font-size: 26px; line-height: 1.15; margin: 2px 0 6px; }
.pb-paper h2 { font-size: 15.5px; margin: 0 0 6px; padding-bottom: 3px; border-bottom: 1px solid #d9d6cd; }
.pb-paper h3 { font-size: 13.5px; margin: 0 0 2px; }
.pb-eyebrow { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: #5d6574; font-weight: 600; }
.pb-hazard { font-family: var(--font-source-serif), Georgia, serif; font-size: 17px; line-height: 1.3; margin: 0 0 4px; color: #18202c; }
.pb-meta { color: #4a5363; font-size: 12px; }
.pb-head { border-bottom: 2px solid #18202c; padding-bottom: 10px; margin-bottom: 14px; }
.pb-section { margin: 0 0 14px; break-inside: avoid; page-break-inside: avoid; }
.pb-item { break-inside: avoid; page-break-inside: avoid; margin: 0 0 8px; }
.pb-item:last-child { margin-bottom: 0; }
.pb-muted { color: #5d6574; }
.pb-small { font-size: 11px; }
.pb-quote { font-family: var(--font-source-serif), Georgia, serif; font-size: 13px; line-height: 1.45; color: #18202c; border-left: 2px solid #9fb7b9; padding: 0 0 0 9px; margin: 3px 0; }
.pb-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 6px; }
@media (max-width: 640px) { .pb-pair { grid-template-columns: 1fr; } }
.pb-list { list-style: none; margin: 0; padding: 0; }
.pb-list > li { padding: 4px 0; border-bottom: 1px solid #ebe8e0; break-inside: avoid; page-break-inside: avoid; }
.pb-list > li:last-child { border-bottom: 0; }
.pb-num { font-variant-numeric: tabular-nums; }
.pb-paper a { color: #2f5d62; text-decoration: none; }
.pb-paper a:hover { text-decoration: underline; }
.pb-url { font-size: 10.5px; color: #5d6574; word-break: break-all; }
.pb-label { font-weight: 600; color: #18202c; }
.pb-foot { margin-top: 16px; padding-top: 8px; border-top: 1px solid #d9d6cd; font-size: 10.5px; color: #4a5363; break-inside: avoid; page-break-inside: avoid; }
.pb-foot p { margin: 0 0 3px; }
.pb-paper p { margin: 0 0 4px; }

@page { size: A4; margin: 14mm; }
@media print {
  html, body { background: #fff !important; }
  .pb-desk { padding: 0; min-height: 0; background: none; }
  .pb-noprint { display: none !important; }
  .pb-paper { max-width: none; margin: 0; padding: 0; border: 0; box-shadow: none; font-size: 9.5pt; line-height: 1.4; }
  .pb-paper, .pb-paper * { color: #000 !important; background: transparent !important; box-shadow: none !important; }
  .pb-paper h1 { font-size: 19pt; }
  .pb-paper h2 { font-size: 11.5pt; border-bottom-color: #000; }
  .pb-hazard { font-size: 13pt; }
  .pb-quote { font-size: 9.5pt; border-left-color: #777; }
  .pb-url, .pb-foot, .pb-small, .pb-eyebrow { font-size: 7.5pt; }
  .pb-meta { font-size: 8.5pt; }
  .pb-head { border-bottom-color: #000; }
  .pb-pair { grid-template-columns: 1fr 1fr; }
  .pb-paper a { text-decoration: none; }
}
`;

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-desk">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {children}
    </div>
  );
}

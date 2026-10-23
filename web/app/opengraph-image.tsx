import { ImageResponse } from "next/og";
import { ogFonts } from "@/lib/og-fonts";
import { getChain, getMeta } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // read the live data on request, never a build-time snapshot
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Recurrence Watch: the same coroner's warning, raised again and again";

const HERO_CHAIN = "c52cded99f756309";
const MONTH = 30.44 * 86_400_000;

// The preview card when the site is shared: the Spine hero in miniature, from the same data as the home page.
export default async function Image() {
  const [{ chain }, meta, fonts] = await Promise.all([
    getChain(HERO_CHAIN).catch(() => ({ chain: null })),
    getMeta().catch(() => null),
    ogFonts(),
  ]);
  const dates = chain ? chain.reports.map((r) => r.date).sort() : [];
  const t0 = dates.length ? Date.parse(dates[0]) : 0;
  const span = dates.length ? Math.max(1, (Date.parse(dates[dates.length - 1]) - t0) / MONTH) : 1;
  const top = 70;
  const height = 470;
  const y = (d: string) => top + ((Date.parse(d) - t0) / MONTH / span) * height;
  // Dates closer than a label's height to the one above keep their dot but not their label.
  let lastLabelled = -Infinity;
  const showLabel = dates.map((d) => {
    const yy = y(d);
    if (yy - lastLabelled < 30) return false;
    lastLabelled = yy;
    return true;
  });
  const label = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#eef0ec", color: "#161a17", fontFamily: "Figtree" }}>
        <div style={{ width: 84, height: "100%", background: "#161a17", display: "flex", justifyContent: "center", paddingTop: 30 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#88c99e", display: "flex" }} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "64px 56px 56px 64px" }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1, color: "#3e463f" }}>RECURRENCE WATCH</div>
          <div style={{ marginTop: 28, display: "flex", flexDirection: "column", fontSize: 76, fontWeight: 800, lineHeight: 1, letterSpacing: -3 }}>
            <span>Raised in {chain ? chain.first_date.slice(0, 4) : "2019"}.</span>
            <span>Raised again.</span>
            <span>And again.</span>
          </div>
          <div style={{ marginTop: 30, fontSize: 28, lineHeight: 1.4, color: "#3e463f", maxWidth: 560, display: "flex" }}>
            {chain ? `${chain.hazard}. ${chain.org.name}, ${dates.length} reports.` : "Coroners' warnings, raised again with the same organisation."}
          </div>
          <div style={{ marginTop: "auto", fontSize: 24, color: "#3e463f", display: "flex" }}>
            {meta ? `${meta.site.n_chains.toLocaleString("en-GB")} repeated warnings found, every quote checked word for word` : ""}
          </div>
        </div>
        <div style={{ width: 360, position: "relative", display: "flex" }}>
          <div style={{ position: "absolute", left: 60, top: top, width: 3, height: height, background: "#161a17" }} />
          {dates.map((d, i) => (
            <div key={i} style={{ position: "absolute", left: 50, top: y(d) - 11, display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: i === 0 ? "#161a17" : "#3f8a5c",
                  border: "4px solid #eef0ec",
                  display: "flex",
                }}
              />
              {showLabel[i] && <span style={{ fontSize: 20, fontWeight: 700 }}>{label(d)}</span>}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}

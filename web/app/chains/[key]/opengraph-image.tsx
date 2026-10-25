import { ImageResponse } from "next/og";
import { LogoMark } from "@/components/shell/Logo";
import { ogFonts } from "@/lib/og-fonts";
import { getChain } from "@/lib/queries";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A recurrence chain on Recurance";

// The preview card when a chain link is shared: hazard, organisation, reports over time.
export default async function Image({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [{ chain }, fonts] = await Promise.all([getChain(key).catch(() => ({ chain: null })), ogFonts()]);
  const title = chain?.hazard ?? "Recurance";
  const org = chain?.org.name ?? "Coroners' Prevention of Future Deaths reports";
  const years = chain ? `${chain.first_date.slice(0, 4)}–${chain.last_date.slice(0, 4)}` : "";
  const dots = chain ? chain.reports.map((r) => r.date) : [];
  const t0 = dots.length ? Date.parse(dots[0]) : 0;
  const t1 = dots.length ? Date.parse(dots[dots.length - 1]) : 1;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#eef0ec", padding: 64, color: "#161a17", fontFamily: "Figtree" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 34, fontWeight: 800, letterSpacing: -1.3, color: "#161a17" }}>
          <LogoMark size={46} />
          recurance
        </div>
        <div style={{ marginTop: 44, fontSize: 26, letterSpacing: 2, textTransform: "uppercase", color: "#5e665f" }}>{org}</div>
        <div style={{ marginTop: 14, fontSize: 60, lineHeight: 1.12, fontWeight: 600, display: "flex", maxWidth: 1060 }}>{title}</div>
        {chain && (
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ position: "relative", height: 24, display: "flex" }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: 11, height: 2, background: "#d3d8d1" }} />
              {dots.map((d, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: `${((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * 97}%`,
                    top: 0,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    background: i === 0 ? "#3f8a5c" : "#ffffff",
                    border: "4px solid #3f8a5c",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 36, fontSize: 28, color: "#444e5e" }}>
              <span>{chain.n_reports} reports</span>
              <span>{chain.coroners.length} coroners</span>
              <span>{years}</span>
              <span style={{ color: "#3f8a5c" }}>Every quote verified word for word</span>
            </div>
          </div>
        )}
      </div>
    ),
    { ...size, fonts },
  );
}

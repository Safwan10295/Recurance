import { ImageResponse } from "next/og";
import { getChain } from "@/lib/queries";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A recurrence chain on Recurrence Watch";

// The preview card when a chain link is shared: hazard, organisation, reports over time.
export default async function Image({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { chain } = await getChain(key).catch(() => ({ chain: null }));
  const title = chain?.hazard ?? "Recurrence Watch";
  const org = chain?.org.name ?? "Coroners' Prevention of Future Deaths reports";
  const years = chain ? `${chain.first_date.slice(0, 4)}–${chain.last_date.slice(0, 4)}` : "";
  const dots = chain ? chain.reports.map((r) => r.date) : [];
  const t0 = dots.length ? Date.parse(dots[0]) : 0;
  const t1 = dots.length ? Date.parse(dots[dots.length - 1]) : 1;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f6f5f1", padding: 64, color: "#18202c" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, color: "#2f5d62" }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "#2f5d62", display: "flex" }} />
          Recurrence Watch
        </div>
        <div style={{ marginTop: 44, fontSize: 26, letterSpacing: 2, textTransform: "uppercase", color: "#687080" }}>{org}</div>
        <div style={{ marginTop: 14, fontSize: 60, lineHeight: 1.12, fontWeight: 600, display: "flex", maxWidth: 1060 }}>{title}</div>
        {chain && (
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ position: "relative", height: 24, display: "flex" }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: 11, height: 2, background: "#d8d4ca" }} />
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
                    background: i === 0 ? "#2f5d62" : "#ffffff",
                    border: "4px solid #2f5d62",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 36, fontSize: 28, color: "#444e5e" }}>
              <span>{chain.n_reports} reports</span>
              <span>{chain.coroners.length} coroners</span>
              <span>{years}</span>
              <span style={{ color: "#2f5d62" }}>Every quote verified word for word</span>
            </div>
          </div>
        )}
      </div>
    ),
    size,
  );
}

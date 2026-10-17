"use client";

import { Download, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { btnSecondary } from "@/components/ui";

// A7: a shareable image of the score, drawn in the browser. It carries only the score and the site's name:
// no quotes, no report titles, nothing about the player.
function draw(agreed: number, answered: number, site: string): string | null {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 630;
  const g = c.getContext("2d");
  if (!g) return null;
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const serifEl = document.querySelector(".font-serif");
  const serif = serifEl ? getComputedStyle(serifEl).fontFamily : "Georgia, serif";
  const sans = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const paper = v("--paper", "#f6f5f1");
  const ink = v("--ink", "#18202c");
  const muted = v("--muted", "#687080");
  const accent = v("--accent", "#2f5d62");
  const rule = v("--rule", "#e2dfd6");

  g.fillStyle = paper;
  g.fillRect(0, 0, 1200, 630);
  g.fillStyle = accent;
  g.fillRect(0, 0, 14, 630);

  g.fillStyle = muted;
  g.font = `600 26px ${sans}`;
  g.fillText("RECURRENCE WATCH · YOU BE THE JUDGE", 80, 110);

  g.fillStyle = ink;
  g.font = `400 64px ${serif}`;
  g.fillText("I agreed with Nemotron on", 80, 250);
  g.font = `600 150px ${serif}`;
  g.fillText(`${agreed} of ${answered}`, 80, 410);

  // One dot per answered pair: filled where the call matched the model's.
  for (let i = 0; i < answered; i++) {
    g.beginPath();
    g.arc(96 + i * 52, 480, 16, 0, Math.PI * 2);
    if (i < agreed) {
      g.fillStyle = accent;
      g.fill();
    } else {
      g.strokeStyle = rule;
      g.lineWidth = 4;
      g.stroke();
    }
  }

  g.fillStyle = muted;
  g.font = `400 28px ${sans}`;
  g.fillText(`Same hazard or not? Try it: ${site}/judge`, 80, 565);
  return c.toDataURL("image/png");
}

export default function ShareCard({ agreed, answered }: { agreed: number; answered: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    const site = window.location.host;
    // Wait for web fonts, so the image uses the site's type.
    (document.fonts?.ready ?? Promise.resolve()).then(() => setUrl(draw(agreed, answered, site)));
    setCanShare(typeof navigator.share === "function" && typeof navigator.canShare === "function");
  }, [agreed, answered]);

  if (!url) return null;

  const share = async () => {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], "recurrence-watch-judge.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "You be the judge" });
    } catch {
      /* the person closed the share sheet */
    }
  };

  return (
    <div className="card space-y-3 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL, not a site asset */}
      <img src={url} alt={`Share card: I agreed with Nemotron on ${agreed} of ${answered}`} width={600} height={315} className="h-auto w-full max-w-md rounded-lg border border-rule" />
      <div className="flex flex-wrap gap-2">
        <a href={url} download="recurrence-watch-judge.png" className={`${btnSecondary} px-3 py-2`}>
          <Download size={16} aria-hidden /> Download the card
        </a>
        {canShare && (
          <button type="button" onClick={share} className={`${btnSecondary} px-3 py-2`}>
            <Share2 size={16} aria-hidden /> Share
          </button>
        )}
      </div>
      <p className="text-xs text-muted">The card shows only your score. Nothing is sent anywhere unless you share it.</p>
    </div>
  );
}

// One colour per model family, used wherever a step names the model or service that did it (A3, A4).
// Muted hues that hold their contrast in light and dark (tokens in globals.css).
export type Family = "nano" | "super" | "ultra" | "qwen" | "tavily" | "code";

export function familyOf(label: string | undefined): Family {
  const t = (label ?? "").toLowerCase();
  if (t.includes("nano")) return "nano";
  if (t.startsWith("judge_candidate")) return "super"; // the agent's judge tool calls Nemotron Super
  if (t.startsWith("search_earlier")) return "qwen"; // pgvector search over Qwen3 embeddings
  if (t.includes("super")) return "super";
  if (t.includes("ultra")) return "ultra";
  if (t.includes("qwen") || t.includes("embedding")) return "qwen";
  if (t.includes("tavily")) return "tavily";
  return "code";
}

export const FAMILY_NAME: Record<Family, string> = {
  nano: "Nemotron Nano",
  super: "Nemotron Super",
  ultra: "Nemotron Ultra",
  qwen: "Qwen3 embeddings",
  tavily: "Tavily",
  code: "Code",
};

export function BadgeLegend({ families = ["nano", "super", "ultra", "qwen", "tavily"] as Family[] }: { families?: Family[] }) {
  return (
    <ul className="flex list-none flex-wrap gap-1.5 p-0" aria-label="Badge colours">
      {families.map((f) => (
        <li key={f} className={`badge-${f} inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]`}>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {FAMILY_NAME[f]}
        </li>
      ))}
    </ul>
  );
}

export default function ModelBadge({ label, className = "" }: { label: string; className?: string }) {
  const f = familyOf(label);
  return (
    <span title={FAMILY_NAME[f]} className={`badge-${f} inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}

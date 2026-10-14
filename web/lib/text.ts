// TypeScript ports of pipeline/parse/text.py, pipeline/parse/sections.py and pipeline/normalise/orgs.py key().

const TRANSLATE: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
  "“": '"', "”": '"', "„": '"', "″": '"',
  "–": "-", "—": "-", "‒": "-", "−": "-", "­": "",
  " ": " ", " ": " ", "​": "", " ": " ", "﻿": "",
  "•": "-", "": "-", "●": "-",
};
const TRANSLATE_RX = new RegExp(`[${Object.keys(TRANSLATE).join("")}]`, "g");

export function unify(s: string): string {
  return (s || "").normalize("NFKC").replace(TRANSLATE_RX, (c) => TRANSLATE[c] ?? c);
}

export function normForMatch(s: string): string {
  return unify(s).replace(/\s+/g, " ").trim();
}

export function verifyQuote(quote: string | null | undefined, source: string): boolean {
  const q = normForMatch(quote ?? "");
  if (q.length < 20) return false;
  return normForMatch(source).includes(q);
}

export function tidy(s: string): string {
  return unify(s)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function htmlToText(fragment: string): string {
  let s = fragment.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<\s*\/t[dh]\s*>/gi, " \n");
  s = s.replace(/<\s*(br|\/p|\/tr|\/li|\/h[1-6]|\/div|\/thead|\/tbody|\/table|\/figure|\/blockquote)\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
  return tidy(s);
}

const LEAD = String.raw`(?:^|\n)[ \t]*(?:\(?\d{1,2}[.)]?|[IVX]{1,4}[.)])?[ \t]*`;
const HEADINGS: Record<string, string> = {
  summary: String.raw`SUMMARY\s+OF\s+(?:THE\s+)?CORONER'?S?'?\s+CONCERNS?`,
  concerns: String.raw`(?:THE\s+)?CORONER'?S?'?\s+CONCERNS?|CORONERS\s+CONCERNS?|MATTERS\s+OF\s+CONCERN(?!\s+are)`,
  circumstances: String.raw`CIRCUMSTANCES\s+(?:OF|SURROUNDING)\s+(?:THE\s+)?DEATH`,
  investigation: String.raw`INVESTIGATION\s+(?:AND|&)\s+INQUEST`,
  action: String.raw`ACTION\s+SHOULD\s+BE\s+TAKEN`,
  response: String.raw`YOUR\s+RESPONSE`,
  copies: String.raw`COPIES\s+(?:AND|&)\s+PUBLICATION`,
  legal: String.raw`(?:CORONER'?S?'?\s+)?LEGAL\s+POWERS`,
  sent_to: String.raw`THIS\s+REPORT\s+IS\s+BEING\s+SENT\s+TO`,
  date: String.raw`DATE\s+OF\s+REPORT`,
};

export function splitSections(text: string): Record<string, string> {
  const hits: [number, number, string][] = [];
  for (const [name, pat] of Object.entries(HEADINGS)) {
    const rx = new RegExp(LEAD + "(" + pat + ")[ \\t:.-]*", "gi");
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text))) {
      const start = m.index + m[0].indexOf(m[1]);
      hits.push([start, m.index + m[0].length, name]);
      if (rx.lastIndex === m.index) rx.lastIndex++;
    }
  }
  hits.sort((a, b) => a[0] - b[0]);
  const kept: [number, number, string][] = [];
  for (const h of hits) {
    const last = kept[kept.length - 1];
    if (last && h[0] < last[1]) {
      if (h[1] - h[0] > last[1] - last[0]) kept[kept.length - 1] = h;
      continue;
    }
    kept.push(h);
  }
  const out: Record<string, string> = {};
  kept.forEach(([, end, name], i) => {
    const next = i + 1 < kept.length ? kept[i + 1][0] : text.length;
    const body = text.slice(end, next).replace(/(?:\n[ \t]*\(?\d{1,2}[.)]?[ \t]*)+\s*$/, "").trim();
    if (!(name in out) && body) out[name] = body;
  });
  return out;
}

const BOILER = [
  /During\s+the\s+course\s+of\s+(?:the|my)\s+(?:investigation|inquest)s?(?:\s+and\s+inquest)?,?\s+(?:my\s+inquiries|the\s+evidence|evidence)\s+revealed\s+(?:matters|a\s+matter)\s+giving\s+rise\s+to\s+(?:the\s+following\s+)?concerns?\.?/gi,
  /In\s+my\s+opinion\s+there\s+is\s+a\s+risk\s+that\s+future\s+deaths?\s+(?:could|will|may)\s+occur\s+unless\s+action\s+is\s+taken\.?/gi,
  /In\s+the\s+circumstances\s+it\s+is\s+my\s+statutory\s+duty\s+to\s+report\s+(?:to\s+you|(?:the\s+)?matters?\s+of\s+concern\s+to\s+you)\.?/gi,
  /The\s+MATTERS?\s+OF\s+CONCERN\s+(?:are|is)\s+as\s+follows\s*[:.-]*/gi,
  /\(\s*brief\s+summary\s+of\s+matters\s+of\s+concern\s*\)/gi,
];

export function stripBoilerplate(s: string): string {
  let t = s;
  for (const rx of BOILER) t = t.replace(rx, " ");
  return t.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").replace(/^[\s:-]+|[\s:-]+$/g, "");
}

export function orgKey(name: string): string {
  let s = name.toLowerCase().replace(/&/g, " and ");
  s = s.replace(/\b(?:her|his)\s+majesty'?s\b/g, "hm");
  s = s.replace(/\bh\.?\s?m\.?\b/g, "hm");
  s = s.replace(/[^a-z0-9 ]+/g, " ");
  s = s.replace(/\bthe\b/g, " ");
  s = s.replace(/\bnhs\s+foundation\s+trust\b|\bfoundation\s+trust\b|\bnhs\s+ft\b|\bnhs\s+trust\b/g, " nhs trust ");
  s = s.replace(/\buniversity\s+hospitals?\b/g, " university hospital ");
  s = s.replace(/\b(ltd|limited|plc|llp|inc|uk)\b/g, " ");
  s = s.replace(/\bcouncils?\b/g, " council");
  return s.replace(/\s+/g, " ").trim();
}

export function tokenSetSimilarity(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
}

const BANNED =
  /\b(ignor(?:e|ed|es|ing)|caus(?:e|ed|es|ing)\s+(?:the\s+)?death|failed\s+to\s+(?:act|respond|learn|address|implement)|fail(?:ure|ed)\s+to|(?:is|are|was|were)\s+responsible|responsib(?:le|ility)\s+for\s+(?:the\s+)?death|negligen(?:t|ce)|at\s+fault|to\s+blame|blame[sd]?|culpab(?:le|ility)|disregard(?:ed)?|neglect(?:ed)?)\b/i;

export function wordingClean(s: string | null | undefined): boolean {
  return !BANNED.test(s ?? "");
}

const TITLE_RX =
  /\b(Dr|Doctor|Nurse|Sister|Matron|Professor|Prof|PC|DC|DS|DI|DCI|Sgt|Sergeant|Inspector|Constable|Officer|Paramedic|Midwife|Consultant|Registrar)\.?\s+((?:[A-Z][a-z'\-]+|[A-Z]\.?)(?:\s+[A-Z][a-z'\-]+)?)\b/g;

// Light redaction for user-supplied text in the live brief: titled staff names.
export function redactTitles(s: string): string {
  return (s ?? "").replace(TITLE_RX, (_m, title: string) => `${title} [name redacted]`);
}

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

// A quote that matches the source apart from letter case (models often change "THERE WAS" to "There was")
// is replaced by the source's own text, so what is shown is still word for word from the source.
export function snapQuote(quote: string | null | undefined, source: string): string | null {
  const q = normForMatch(quote ?? "");
  if (q.length < 20) return null;
  const src = normForMatch(source);
  if (src.includes(q)) return q;
  const i = src.toLowerCase().indexOf(q.toLowerCase());
  return i >= 0 ? src.slice(i, i + q.length) : null;
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
  /\b(ignor(?:e|ed|es|ing)|caus(?:e|ed|es|ing)\s+(?:the\s+)?death|failed\s+to\s+(?:act|respond|learn|address|implement)|fail(?:ure|ed)\s+to|(?:is|are|was|were)\s+responsible|responsib(?:le|ility)\s+for\s+(?:the\s+)?death|negligen(?:t|ce)|at\s+fault|to\s+blame|blame[sd]?|culpab(?:le|ility)|disregard(?:ed)?|neglect(?:ed)?|faults?\s+(?:the|its|their))\b/i;

export function wordingClean(s: string | null | undefined): boolean {
  return !BANNED.test(s ?? "");
}

// Redaction for text the live brief reads fresh from judiciary.uk. Mirrors pipeline/redact.py:
// staff and family names become [name redacted]; the deceased (named in the report title) become
// [the deceased]; coroners stay named. Archive text is already redacted when it is published.
const REDACTED = "[name redacted]";
const DECEASED = "[the deceased]";
const HON = "(?:Mr|Mrs|Ms|Miss|Master|Mx)";
const CAP = "[A-Z][a-z'\\-]+";
const TITLE_RX =
  /\b(Dr|Doctor|Nurse|Sister|Matron|Professor|Prof|PC|DC|DS|DI|DCI|Sgt|Sergeant|Inspector|Constable|Officer|Paramedic|Midwife|Consultant|Registrar|Mr|Mrs|Ms|Miss)\.?\s+((?:[A-Z][a-z'\-]+|[A-Z]\.?)(?:\s+[A-Z][a-z'\-]+)?)\b/g;
const ROLE =
  "nurse|doctor|GP|paramedic|call handler|call taker|clinician|consultant|registrar|surgeon|psychiatrist|psychologist|anaesthetist|radiologist|radiographer|pharmacist|physiotherapist|midwife|health visitor|healthcare assistant|support worker|care worker|carer|social worker|care coordinator|key ?worker|officer|manager|practitioner|therapist|technician|dispatcher|mother|father|wife|husband|partner|son|daughter|sister|brother|parents?|grandmother|grandfather|aunt|uncle|friend|cousin|fianc[ée]e?|girlfriend|boyfriend|neighbour";
const ROLE_BEFORE = new RegExp(`\\b(?:${ROLE}),?\\s+(${CAP}(?:\\s+${CAP})?)\\b`, "g");
const ROLE_AFTER = new RegExp(`\\b(${CAP}\\s+${CAP}),\\s+(?:a|an|the|his|her|their)\\s+(?:[a-z\\-]+\\s+){0,2}(?:${ROLE})\\b`, "g");
const NOT_NAME = new Set(
  ("and of the baby mr mrs ms miss master dr prevention future deaths death report regulation inquest into re in deceased " +
    "coroner area pm st saint nhs trust county council police constabulary fire hospital university borough city health " +
    "service services prison road street house court ward unit centre center park lane way school college ambulance " +
    "practice surgery team clinic board partnership foundation group limited ltd home care on at when after before during " +
    "however although this that there it he she they his her their a an i we following despite while whilst as if by").split(" "),
);
const COMMON = new Set(
  "hope grace faith joy will may june april rose summer mark bill frank ray dean guy rich long young love star sky skye jack max victoria georgia carol page hunter mason chase ivy holly dawn eve".split(" "),
);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const capWords = (s: string) => s.match(/[A-Z][A-Za-z'\-]+/g) ?? [];

function deceasedParts(titles: string[]) {
  const fulls: string[][] = [];
  const firsts = new Set<string>();
  const surnames = new Set<string>();
  for (const t of titles) {
    const head = (t ?? "").split(/\s*(?::| - | – )\s*/)[0];
    for (const person of head.split(/\s*(?:,|&|\band\b)\s*/)) {
      const ws = capWords(person).filter((w) => !NOT_NAME.has(w.toLowerCase()) && w.length > 1);
      if (!ws.length || ws.length > 5) continue;
      firsts.add(ws[0]);
      if (ws.length >= 2) {
        surnames.add(ws[ws.length - 1]);
        fulls.push(ws);
      }
    }
  }
  return { fulls: fulls.sort((a, b) => b.length - a.length), firsts, surnames };
}

function redactDeceased(text: string, titles: string[]): string {
  const { fulls, firsts, surnames } = deceasedParts(titles);
  if (!firsts.size) return text;
  let out = text;
  for (const ws of fulls) {
    for (const v of new Set([ws.map(esc).join("\\s+"), `${esc(ws[0])}\\s+${esc(ws[ws.length - 1])}`])) {
      out = out.replace(new RegExp(`(?:\\b${HON}\\.?\\s+)?\\b${v}\\b`, "g"), DECEASED);
    }
  }
  if (surnames.size) {
    const sur = [...surnames].sort((a, b) => b.length - a.length).map(esc).join("|");
    out = out.replace(new RegExp(`\\b(${HON})\\.?\\s+(?:${sur})\\b`, "g"), (_m, h: string) => `${h} ${REDACTED}`);
    out = out.replace(new RegExp(`\\b${CAP}\\s+(?:${sur})\\b`, "g"), (m) =>
      NOT_NAME.has(m.split(/\s+/)[0].toLowerCase()) ? m : REDACTED,
    );
  }
  const fst = [...firsts].sort((a, b) => b.length - a.length).map(esc).join("|");
  const src = out;
  return src.replace(new RegExp(`\\b(?:${fst})\\b(?!\\s+[A-Z][a-z])(?!-)`, "g"), (w, offset: number) => {
    const before = src.slice(0, offset).trimEnd();
    if (/\b(?:St|Saint)\.?$/.test(before)) return w;
    const sentenceStart = !before || ".!?\"“(:;".includes(before[before.length - 1]);
    if (COMMON.has(w.toLowerCase()) && sentenceStart) return w;
    return DECEASED;
  });
}

export function redactNames(s: string, deceasedTitles: string[] = []): string {
  const keep = (name: string) => {
    const ws = capWords(name).map((w) => w.toLowerCase());
    return !ws.length || ws.some((w) => NOT_NAME.has(w));
  };
  let out = (s ?? "").replace(TITLE_RX, (m, title: string, name: string) => (keep(name) ? m : `${title} ${REDACTED}`));
  const role = (m: string, name: string) => (keep(name) ? m : m.replace(name, REDACTED));
  out = out.replace(ROLE_BEFORE, role).replace(ROLE_AFTER, role);
  return redactDeceased(out, deceasedTitles);
}

// Kept for callers that have no report title.
export function redactTitles(s: string): string {
  return redactNames(s, []);
}

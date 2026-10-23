import {
  BarChart3,
  BookOpen,
  Building2,
  Clock3,
  Cpu,
  Gavel,
  Home,
  Link2,
  Map,
  MessageSquareQuote,
  ScanSearch,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; hint: string; icon: LucideIcon; primary?: boolean };

// Eight items. The three hands-on features are marked primary: they are what a first-time visitor should try.
export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Use the tool",
    items: [
      { href: "/", label: "Start here", hint: "What this is, in one minute", icon: Home },
      { href: "/brief", label: "Check a report", hint: "Watch the agent find earlier warnings", icon: ScanSearch, primary: true },
      { href: "/judge", label: "You be the judge", hint: "Same hazard or not? Try it", icon: Gavel, primary: true },
      { href: "/map", label: "Hazard map", hint: "Every concern, placed by meaning", icon: Map, primary: true },
    ],
  },
  {
    group: "Explore the record",
    items: [
      { href: "/chains", label: "Repeated warnings", hint: "The same concern, raised again and again", icon: Link2 },
      { href: "/promises", label: "Promises, then again", hint: "Stated actions, then the same concern", icon: MessageSquareQuote },
      { href: "/recent", label: "Recent repeats", hint: "New reports that repeat a warning", icon: Clock3 },
    ],
  },
  {
    group: "How we know",
    items: [{ href: "/how-we-know", label: "How we know", hint: "Nemotron, evaluation, methodology", icon: ShieldCheck }],
  },
];

// The desktop icon rail (Spine design): seven places, short labels, the full name and hint as a tooltip.
export type RailItem = { href: string; label: string; full: string; hint: string; icon: LucideIcon };
export const RAIL: RailItem[] = [
  { href: "/", label: "Home", full: "Start here", hint: "What this is, in one minute", icon: Home },
  { href: "/brief", label: "Check", full: "Check a report", hint: "Watch the agent find earlier warnings", icon: ScanSearch },
  { href: "/judge", label: "Judge", full: "You be the judge", hint: "Same hazard or not? Try it", icon: Gavel },
  { href: "/map", label: "Map", full: "Hazard map", hint: "Every concern, placed by meaning", icon: Map },
  { href: "/chains", label: "Repeats", full: "Repeated warnings", hint: "The same concern, raised again and again", icon: Link2 },
  { href: "/promises", label: "Promises", full: "Promises, then again", hint: "Stated actions, then the same concern", icon: MessageSquareQuote },
  { href: "/how-we-know", label: "How", full: "How we know", hint: "Nemotron, evaluation, methodology", icon: ShieldCheck },
];
// Phones get the first five as a bottom tab bar; Promises and How we know are in the search palette and page links.
export const TABS: RailItem[] = RAIL.slice(0, 5);

export function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

// Every page the command palette can jump to, including those reached from inside a section.
export const ALL_PAGES: NavItem[] = [
  ...NAV.flatMap((g) => g.items),
  { href: "/organisations", label: "Organisations", hint: "Who received which warnings", icon: Building2 },
  { href: "/how-we-know", label: "How Nemotron did the work", hint: "Models, tokens and cost", icon: Cpu },
  { href: "/how-we-know/evaluation", label: "Evaluation", hint: "Accuracy against baselines", icon: BarChart3 },
  { href: "/how-we-know/methodology", label: "Methodology", hint: "Method, safeguards, corrections", icon: BookOpen },
];

// Runs before paint (inlined in the layout) so the page never flashes the wrong theme.
// Also, before paint: hides the guided path once dismissed, marks that scripts run (.js, so animations may
// start from an empty frame), and lists animations already seen this session (they open on their final frame).
export const THEME_SCRIPT = `try{var t=localStorage.getItem("rw-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;if(localStorage.getItem("rw-guide")==="off")document.documentElement.dataset.guide="off"}catch(e){}try{var d=document.documentElement;d.classList.add("js");if(location.hash.indexOf("#report-")===0)d.classList.add("arrived");if(!/[?&]replay/.test(location.search))d.dataset.seen=JSON.parse(sessionStorage.getItem("rw-seen")||"[]").join(" ")}catch(e){}`;

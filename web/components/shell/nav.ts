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
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; hint: string; icon: LucideIcon };

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Use the tool",
    items: [
      { href: "/", label: "Start here", hint: "What this is, in one minute", icon: Home },
      { href: "/brief", label: "Check a report", hint: "Watch the agent find earlier warnings", icon: ScanSearch },
      { href: "/judge", label: "You be the judge", hint: "Same hazard or not? Try it", icon: Gavel },
      { href: "/recent", label: "Recent recurrences", hint: "New reports that repeat a warning", icon: Clock3 },
    ],
  },
  {
    group: "Explore the record",
    items: [
      { href: "/chains", label: "Recurrence chains", hint: "Hazards raised again and again", icon: Link2 },
      { href: "/promises", label: "Promises, then again", hint: "Stated actions, then the same concern", icon: MessageSquareQuote },
      { href: "/map", label: "Hazard map", hint: "Every concern, placed by meaning", icon: Map },
      { href: "/organisations", label: "Organisations", hint: "Who received which warnings", icon: Building2 },
    ],
  },
  {
    group: "How we know",
    items: [
      { href: "/nemotron", label: "How Nemotron did the work", hint: "Models, tokens and cost", icon: Cpu },
      { href: "/evaluation", label: "Evaluation", hint: "Accuracy against baselines", icon: BarChart3 },
      { href: "/methodology", label: "Methodology", hint: "Method, safeguards, corrections", icon: BookOpen },
    ],
  },
];

// Runs before paint (inlined in the layout) so the page never flashes the wrong theme.
export const THEME_SCRIPT = `try{var t=localStorage.getItem("rw-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

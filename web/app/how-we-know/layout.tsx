import HowWeKnowTabs from "@/components/howweknow/Tabs";

// Nemotron, Evaluation and Methodology answer one question, so they share one section with three tabs.
export default function HowWeKnowLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <HowWeKnowTabs />
      {children}
    </div>
  );
}

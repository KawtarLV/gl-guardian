import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, Brain, CloudRain, FileSpreadsheet, LineChart } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cashflow Intelligence — 13-Week Construction Forecasting" },
      { name: "description", content: "AI-powered GL mapping and deterministic 13-week cash flow forecasting for construction companies." },
      { property: "og:title", content: "Cashflow Intelligence" },
      { property: "og:description", content: "AI-powered GL mapping and deterministic 13-week cash flow forecasting for construction companies." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold">C</div>
            <span className="font-semibold">Cashflow Intelligence</span>
          </div>
          <Link to="/auth"><Button variant="ghost">Sign in</Button></Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/15 text-sm mb-6">
            <Brain size={14} /> AI-powered finance intelligence
          </div>
          <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
            13 weeks ahead.<br />
            <span className="text-accent">Every number traceable.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            Upload your accounting export. AI maps your GL accounts to a standard chart. A deterministic engine
            forecasts your next 13 weeks — adjusted for weather, payment lag, and project shifts. Every cash
            number is auditable to its source invoice.
          </p>
          <div className="mt-8 flex gap-3">
            <Link to="/auth"><Button size="lg">Get started <ArrowRight size={16} className="ml-2" /></Button></Link>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-6">
        <Feature icon={<FileSpreadsheet />} title="GL Mapping that learns" desc="Drag your .xlsx in. AI classifies each account with confidence scores. Every correction trains the next upload via semantic vector search." />
        <Feature icon={<CloudRain />} title="Weather-aware forecasting" desc="Dual-provider consensus (Open-Meteo + OpenWeatherMap) shifts milestones, reduces labour costs in rain weeks, and flags low-confidence weeks." />
        <Feature icon={<LineChart />} title="Fully auditable" desc="Click any week to see every source invoice, milestone, weather adjustment, and lag calculation. AI never modifies a number — only explains it." />
      </section>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="p-6 rounded-lg border bg-card">
      <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center mb-4">{icon}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

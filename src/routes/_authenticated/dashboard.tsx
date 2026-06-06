import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, LineChart, FolderKanban } from "lucide-react";
import { SourceBanner } from "@/components/source-banner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Cashflow" }] }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="p-8 max-w-6xl space-y-6">
      <SourceBanner />
      <div className="mb-2">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground mt-1">Smart Import seeds every dashboard from the same uploaded file.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Tile to="/upload" icon={<Upload />} title="1. Smart Import"
          desc="Drop any .xlsx or .csv — invoice list, GL statement, or monthly summary. Customers are auto-created and previous imports are replaced." />
        <Tile to="/forecast" icon={<LineChart />} title="2. Run Forecast"
          desc="Deterministic 13-week cash flow with weather adjustments, payment lag and full audit trail." />
        <Tile to="/projects" icon={<FolderKanban />} title="3. Projects & Milestones"
          desc="See planned vs. weather-shifted timelines for every active project." />
      </div>
    </div>
  );
}

function Tile({ to, icon, title, desc }: { to: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link to={to}>
      <Card className="h-full hover:border-accent transition-colors">
        <CardHeader>
          <div className="w-10 h-10 rounded-md bg-accent/15 text-accent-foreground flex items-center justify-center mb-2">{icon}</div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{desc}</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </Link>
  );
}

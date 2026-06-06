import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, LineChart, FolderKanban, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Cashflow" }] }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground mt-1">Upload your accounting data, then run a 13-week forecast.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Tile to="/upload" icon={<Upload />} title="1. Upload & Map GL"
          desc="Drop your .xlsx accounting export. AI classifies each account into a standard chart. You review, approve, and the system learns." />
        <Tile to="/upload" icon={<Sparkles />} title="2. Import Demo Data"
          desc="Same upload page: any invoice-shaped sheet auto-creates customers, projects, and milestones for the forecast." />
        <Tile to="/forecast" icon={<LineChart />} title="3. Run Forecast"
          desc="Deterministic 13-week cash flow with weather adjustments, payment lag, and audit trail." />
        <Tile to="/projects" icon={<FolderKanban />} title="4. Projects & Milestones"
          desc="See planned vs. weather-shifted timelines for every active project." />
      </div>

      <div className="mt-10 p-6 rounded-lg border bg-muted/40">
        <h2 className="font-semibold mb-2">Build status</h2>
        <p className="text-sm text-muted-foreground">
          Foundation is shipped: database schema, Lovable AI + dual-weather services, deterministic forecast engine,
          Excel parsing, and the learning-loop scaffolding. The upload, mapping review, forecast dashboard,
          drill-down, and AI copilot UIs will be wired into these services in the next iteration. Ask me to
          continue building any of those screens.
        </p>
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

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getProjectsList } from "@/lib/forecast.functions";
import { SourceBanner } from "@/components/source-banner";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: "Projects — Cashflow" }] }),
  component: ProjectsPage,
});

type Project = {
  id: string;
  name: string;
  region: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  total_labour_cost: number | string;
  customerName: string | null;
  milestones: Array<{ id: string; name: string; planned_date: string; invoice_amount: number | string }>;
};

function ProjectsPage() {
  const fn = useServerFn(getProjectsList);
  const q = useQuery({ queryKey: ["projects-list"], queryFn: () => fn({}) });
  const projects: Project[] = (q.data ?? []) as Project[];

  return (
    <div className="p-8 max-w-6xl space-y-4">
      <SourceBanner />
      <h1 className="text-2xl font-semibold mb-1">Projects & Milestones</h1>
      <p className="text-muted-foreground mb-6">Planned milestones — the forecast engine shifts these by weather-lost days.</p>
      {projects.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No projects yet. They will be auto-created from imported data, or you can add them later.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {projects.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{p.name}</CardTitle>
                    <CardDescription>
                      {p.customerName ?? "—"} · {p.region ?? "no region"} · {p.start_date ?? "?"} → {p.end_date ?? "?"}
                    </CardDescription>
                  </div>
                  <Badge variant={p.status === "active" ? "default" : "outline"}>{p.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm mb-3">Total labour budget: <span className="font-mono">€{Number(p.total_labour_cost).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                {p.milestones.length > 0 ? (
                  <div className="space-y-1">
                    {p.milestones.sort((a, b) => a.planned_date.localeCompare(b.planned_date)).map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                        <span>{m.name}</span>
                        <span className="text-muted-foreground">{m.planned_date}</span>
                        <span className="font-mono">€{Number(m.invoice_amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No milestones defined.</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

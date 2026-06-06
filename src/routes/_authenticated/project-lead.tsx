import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Clock, AlertTriangle } from "lucide-react";
import { getOrCreateCompany } from "@/lib/company.functions";
import { getProjectLeadData } from "@/lib/role-views.functions";
import { SourceBanner } from "@/components/source-banner";

export const Route = createFileRoute("/_authenticated/project-lead")({
  head: () => ({ meta: [{ title: "Project Lead — Milestones" }] }),
  component: ProjectLeadPage,
});

const eur = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

function ProjectLeadPage() {
  const bootstrap = useServerFn(getOrCreateCompany);
  const fetchData = useServerFn(getProjectLeadData);
  const company = useQuery({ queryKey: ["company"], queryFn: () => bootstrap({ data: undefined as never }) });
  const [projectId, setProjectId] = useState<string | undefined>();

  const data = useQuery({
    queryKey: ["project-lead", company.data?.companyId, projectId],
    queryFn: () => fetchData({ data: { companyId: company.data!.companyId, projectId } }),
    enabled: !!company.data?.companyId,
  });

  const projects = data.data?.projects ?? [];
  const selectedId = projectId ?? data.data?.selectedId ?? null;
  const selected = projects.find((p) => p.id === selectedId);
  const milestones = data.data?.milestones ?? [];

  const totalInvoice = milestones.reduce((s, m) => s + Number(m.invoice_amount ?? 0), 0);
  const billed = milestones.filter((m) => m.invoiced).reduce((s, m) => s + Number(m.invoice_amount ?? 0), 0);
  const paid = milestones.filter((m) => m.paid).reduce((s, m) => s + Number(m.invoice_amount ?? 0), 0);

  return (
    <div className="p-6 space-y-6">
      <SourceBanner />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Project Lead</h1>
          <p className="text-sm text-muted-foreground">Milestone timeline, billing progress & cost tracking</p>
        </div>
        <select
          className="bg-card border rounded px-3 py-2 text-sm"
          value={selectedId ?? ""}
          onChange={(e) => setProjectId(e.target.value || undefined)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.client_name ? ` — ${p.client_name}` : ""}</option>
          ))}
          {projects.length === 0 && <option value="">No projects</option>}
        </select>
      </div>

      {selected && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Metric label="Contract value" value={eur(Number(selected.total_value ?? 0))} />
            <Metric label="Billed" value={eur(billed)} valueClass="text-blue-700" />
            <Metric label="Paid" value={eur(paid)} valueClass="text-green-700" />
            <Metric label="Open WIP" value={eur(Number(selected.wip_amount ?? 0))} valueClass="text-amber-700" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{selected.name}</CardTitle>
              <CardDescription>
                {selected.client_name} · {selected.client_type} · {selected.city ?? selected.region ?? "—"} · {selected.start_date} → {selected.end_date}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>Billing progress</span>
                <span>{totalInvoice > 0 ? Math.round((billed / totalInvoice) * 100) : 0}%</span>
              </div>
              <div className="h-2 bg-muted rounded overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${totalInvoice > 0 ? (billed / totalInvoice) * 100 : 0}%` }} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Milestones</CardTitle>
              <CardDescription>Planned vs shifted dates · invoicing & costs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {milestones.map((m) => {
                  const late = Number(m.days_delayed ?? 0) > 0;
                  const Icon = m.paid ? CheckCircle2 : m.invoiced ? Clock : late ? AlertTriangle : Circle;
                  const color = m.paid ? "text-green-600" : m.invoiced ? "text-blue-600" : late ? "text-red-600" : "text-muted-foreground";
                  return (
                    <div key={m.id} className="border rounded p-3 flex items-start gap-3">
                      <Icon className={`mt-0.5 ${color}`} size={18} />
                      <div className="flex-1">
                        <div className="flex justify-between gap-2">
                          <div className="font-medium text-sm">{m.name}</div>
                          <div className="text-sm font-medium">{eur(Number(m.invoice_amount ?? 0))}</div>
                        </div>
                        <div className="text-xs text-muted-foreground flex flex-wrap gap-3 mt-1">
                          <span>Planned: {m.planned_date}</span>
                          {m.shifted_date && m.shifted_date !== m.planned_date && (
                            <span className="text-amber-700">Shifted: {m.shifted_date}</span>
                          )}
                          {late && <Badge variant="destructive" className="px-1 py-0">+{m.days_delayed}d {m.delay_reason ?? ""}</Badge>}
                          {m.invoiced && <Badge variant="secondary">Invoiced</Badge>}
                          {m.paid && <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Materials {eur(Number(m.materials_cost ?? 0))} · Subs {eur(Number(m.subcontractor_cost ?? 0))} · Labour {eur(Number(m.labour_cost ?? 0))}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {milestones.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">No milestones for this project.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!selected && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Select a project to view milestones.</CardContent></Card>
      )}
    </div>
  );
}

function Metric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${valueClass ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

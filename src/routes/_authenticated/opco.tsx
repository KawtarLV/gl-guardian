import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CloudRain, Hammer, Users, Briefcase } from "lucide-react";
import { getOrCreateCompany } from "@/lib/company.functions";
import { getOpcoData } from "@/lib/role-views.functions";
import { SourceBanner } from "@/components/source-banner";

export const Route = createFileRoute("/_authenticated/opco")({
  head: () => ({ meta: [{ title: "Opco MD — Operations" }] }),
  component: OpcoPage,
});

const eur = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

function OpcoPage() {
  const bootstrap = useServerFn(getOrCreateCompany);
  const fetchData = useServerFn(getOpcoData);
  const company = useQuery({ queryKey: ["company"], queryFn: () => bootstrap({ data: undefined as never }) });
  const data = useQuery({
    queryKey: ["opco", company.data?.companyId],
    queryFn: () => fetchData({ data: { companyId: company.data!.companyId } }),
    enabled: !!company.data?.companyId,
  });

  const projects = data.data?.projects ?? [];
  const milestones = data.data?.milestones ?? [];
  const weeks = data.data?.weeks ?? [];

  const activeProjects = projects.filter((p) => p.status === "active");
  const totalWip = projects.reduce((s, p) => s + Number(p.wip_amount ?? 0), 0);
  const lostDays = weeks.reduce((s, w) => s + Number(w.lost_days ?? 0), 0);
  const weatherLoss = weeks.reduce((s, w) => s + Number(w.driver_weather_impact ?? 0), 0);

  const byType = projects.reduce<Record<string, { count: number; value: number }>>((a, p) => {
    const k = p.client_type ?? "unknown";
    a[k] = a[k] ?? { count: 0, value: 0 };
    a[k].count += 1;
    a[k].value += Number(p.total_value ?? 0);
    return a;
  }, {});

  const delayed = milestones
    .filter((m) => Number(m.days_delayed ?? 0) > 0)
    .sort((a, b) => Number(b.days_delayed) - Number(a.days_delayed))
    .slice(0, 10);

  return (
    <div className="p-6 space-y-6">
      <SourceBanner />
      <div>
        <h1 className="text-2xl font-bold">Opco MD — Operations</h1>
        <p className="text-sm text-muted-foreground">{company.data?.companyName} · project mix, weather impact & delays</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Metric label="Active projects" value={String(activeProjects.length)} icon={<Briefcase />} />
        <Metric label="Open WIP" value={eur(totalWip)} icon={<Hammer />} />
        <Metric label="Lost days (13w)" value={String(lostDays)} icon={<CloudRain className="text-blue-600" />} />
        <Metric label="Weather impact (€)" value={eur(weatherLoss)} valueClass="text-red-700" icon={<Users className="text-red-600" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Project mix by client type</CardTitle>
            <CardDescription>Affects payment lag in the forecast</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase text-left">
                <tr><th className="py-2">Client type</th><th className="py-2 text-right">Projects</th><th className="py-2 text-right">Value</th></tr>
              </thead>
              <tbody>
                {Object.entries(byType).map(([k, v]) => (
                  <tr key={k} className="border-t">
                    <td className="py-2 capitalize">{k.replace(/_/g, " ")}</td>
                    <td className="py-2 text-right">{v.count}</td>
                    <td className="py-2 text-right">{eur(v.value)}</td>
                  </tr>
                ))}
                {Object.keys(byType).length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">No projects yet.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weather outlook — 13 weeks</CardTitle>
            <CardDescription>Rain & lost days that shift milestones</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {weeks.map((w) => {
                const pct = Math.min(100, (Number(w.rain_mm) / 60) * 100);
                return (
                  <div key={w.week_number} className="flex items-center gap-2 text-xs">
                    <span className="w-10 text-muted-foreground">W{w.week_number}</span>
                    <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-12 text-right">{Number(w.rain_mm).toFixed(0)}mm</span>
                    {Number(w.lost_days) > 0 && <Badge variant="destructive" className="px-1 py-0">-{w.lost_days}d</Badge>}
                  </div>
                );
              })}
              {weeks.length === 0 && <p className="text-sm text-muted-foreground py-4">Run the forecast to see weather.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top delayed milestones</CardTitle>
          <CardDescription>Where the plan is slipping</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase text-left">
              <tr>
                <th className="py-2">Milestone</th>
                <th className="py-2">Planned</th>
                <th className="py-2">Shifted</th>
                <th className="py-2 text-right">Days late</th>
                <th className="py-2 text-right">Invoice</th>
                <th className="py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {delayed.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="py-2">{m.name}</td>
                  <td className="py-2 text-muted-foreground">{m.planned_date}</td>
                  <td className="py-2">{m.shifted_date ?? "—"}</td>
                  <td className="py-2 text-right text-red-700">{m.days_delayed}</td>
                  <td className="py-2 text-right">{eur(Number(m.invoice_amount))}</td>
                  <td className="py-2 text-muted-foreground">{m.delay_reason ?? "—"}</td>
                </tr>
              ))}
              {delayed.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No delays — on track.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, valueClass, icon }: { label: string; value: string; valueClass?: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={`text-2xl font-bold mt-1 ${valueClass ?? ""}`}>{value}</div>
          </div>
          <div className="opacity-60">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

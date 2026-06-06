import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, TrendingUp, TrendingDown, Building2 } from "lucide-react";
import { getOrCreateCompany } from "@/lib/company.functions";
import { getPeBoardData } from "@/lib/role-views.functions";
import { SourceBanner } from "@/components/source-banner";

export const Route = createFileRoute("/_authenticated/pe-board")({
  head: () => ({ meta: [{ title: "PE Board — Portfolio overview" }] }),
  component: PeBoard,
});

const eur = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

function PeBoard() {
  const bootstrap = useServerFn(getOrCreateCompany);
  const fetchData = useServerFn(getPeBoardData);
  const company = useQuery({ queryKey: ["company"], queryFn: () => bootstrap({ data: undefined as never }) });
  const data = useQuery({
    queryKey: ["pe-board", company.data?.companyId],
    queryFn: () => fetchData({ data: { companyId: company.data!.companyId } }),
    enabled: !!company.data?.companyId,
  });

  const companies = data.data?.companies ?? [];
  const forecasts = data.data?.forecasts ?? [];
  const covenants = data.data?.covenants ?? [];
  const projects = data.data?.projects ?? [];

  const perCompany = companies.map((c) => {
    const fw = forecasts.filter((f) => f.company_id === c.id);
    const cashIn = fw.reduce((s, f) => s + Number(f.cash_in), 0);
    const cashOut = fw.reduce((s, f) => s + Number(f.cash_out), 0);
    const lastBalance = fw.length ? Number(fw[fw.length - 1].running_balance) : 0;
    const cov = covenants.find((cv) => cv.company_id === c.id);
    const headroom = cov ? lastBalance - Number(cov.threshold) : null;
    const status = headroom == null ? "green" : headroom < 0 ? "red" : headroom < Number(cov!.threshold) * 0.2 ? "amber" : "green";
    const proj = projects.filter((p) => p.company_id === c.id);
    const wip = proj.reduce((s, p) => s + Number(p.wip_amount ?? 0), 0);
    const pipeline = proj.reduce((s, p) => s + Number(p.total_value ?? 0), 0);
    return { company: c, cashIn, cashOut, net: cashIn - cashOut, lastBalance, headroom, status, wip, pipeline, projectCount: proj.length };
  });

  const portfolioTotals = perCompany.reduce(
    (a, x) => ({ cashIn: a.cashIn + x.cashIn, cashOut: a.cashOut + x.cashOut, wip: a.wip + x.wip, pipeline: a.pipeline + x.pipeline }),
    { cashIn: 0, cashOut: 0, wip: 0, pipeline: 0 },
  );
  const breaching = perCompany.filter((x) => x.status === "red").length;

  return (
    <div className="p-6 space-y-6">
      <SourceBanner />
      <div>
        <h1 className="text-2xl font-bold">PE Board</h1>
        <p className="text-sm text-muted-foreground">Portfolio overview across {companies.length} opco{companies.length === 1 ? "" : "s"}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Metric label="Portfolio cash IN (13w)" value={eur(portfolioTotals.cashIn)} icon={<TrendingUp className="text-green-600" />} />
        <Metric label="Portfolio cash OUT (13w)" value={eur(portfolioTotals.cashOut)} icon={<TrendingDown className="text-red-600" />} />
        <Metric label="Open WIP" value={eur(portfolioTotals.wip)} icon={<Building2 />} />
        <Metric
          label="Covenant breaches"
          value={`${breaching} / ${perCompany.length}`}
          valueClass={breaching > 0 ? "text-red-600" : "text-green-600"}
          icon={<Shield className={breaching > 0 ? "text-red-600" : "text-green-600"} />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Operating companies</CardTitle>
          <CardDescription>13-week net cash, covenant headroom and WIP per opco</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="py-2">Opco</th>
                  <th className="py-2">Region</th>
                  <th className="py-2 text-right">Projects</th>
                  <th className="py-2 text-right">Pipeline</th>
                  <th className="py-2 text-right">WIP</th>
                  <th className="py-2 text-right">Net 13w</th>
                  <th className="py-2 text-right">End balance</th>
                  <th className="py-2 text-right">Headroom</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {perCompany.map((x) => (
                  <tr key={x.company.id} className="border-t">
                    <td className="py-2 font-medium">{x.company.name}</td>
                    <td className="py-2 text-muted-foreground">{x.company.city ?? "—"}</td>
                    <td className="py-2 text-right">{x.projectCount}</td>
                    <td className="py-2 text-right">{eur(x.pipeline)}</td>
                    <td className="py-2 text-right">{eur(x.wip)}</td>
                    <td className={`py-2 text-right ${x.net >= 0 ? "text-green-700" : "text-red-700"}`}>{eur(x.net)}</td>
                    <td className="py-2 text-right">{eur(x.lastBalance)}</td>
                    <td className="py-2 text-right">{x.headroom == null ? "—" : eur(x.headroom)}</td>
                    <td className="py-2">
                      <Badge variant={x.status === "red" ? "destructive" : x.status === "amber" ? "secondary" : "default"}>
                        {x.status.toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {perCompany.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No portfolio data yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
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

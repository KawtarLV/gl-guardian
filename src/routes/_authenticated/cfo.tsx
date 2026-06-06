import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, RefreshCw, TrendingUp, TrendingDown, Wallet, Shield, CloudRain, Sun, Cloud, Snowflake } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, ReferenceLine, Cell } from "recharts";
import { toast } from "sonner";
import { getOrCreateCompany } from "@/lib/company.functions";
import { recomputeForecast, getForecast, type Scenario } from "@/lib/forecast-engine.functions";
import { SourceBanner } from "@/components/source-banner";

export const Route = createFileRoute("/_authenticated/cfo")({
  head: () => ({ meta: [{ title: "CFO Dashboard — 13-week cashflow" }] }),
  component: CfoPage,
});

const eur = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const DRIVERS = [
  { key: "driver_milestone_billing", label: "Milestone billing", color: "hsl(142 71% 45%)", sign: 1 },
  { key: "driver_materials_outflow", label: "Materials outflow", color: "hsl(265 60% 55%)", sign: -1 },
  { key: "driver_subcontractor_payments", label: "Subcontractor payments", color: "hsl(28 90% 55%)", sign: -1 },
  { key: "driver_payment_lag_adjustment", label: "Payment lag effect", color: "hsl(200 90% 50%)", sign: 1 },
  { key: "driver_weather_impact", label: "Weather impact", color: "hsl(0 75% 55%)", sign: -1 },
] as const;

function WeatherIcon({ rain_mm, is_frost }: { rain_mm: number; is_frost: boolean }) {
  if (is_frost) return <Snowflake size={16} className="text-blue-400" />;
  if (rain_mm > 30) return <CloudRain size={16} className="text-blue-600" />;
  if (rain_mm > 10) return <Cloud size={16} className="text-slate-500" />;
  return <Sun size={16} className="text-amber-500" />;
}

function CfoPage() {
  const bootstrap = useServerFn(getOrCreateCompany);
  const getFn = useServerFn(getForecast);
  const recomputeFn = useServerFn(recomputeForecast);
  const qc = useQueryClient();
  const [scenario, setScenario] = useState<Scenario>("base");
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  const company = useQuery({ queryKey: ["company"], queryFn: () => bootstrap({ data: undefined as never }) });
  const companyId = company.data?.companyId;

  const forecast = useQuery({
    queryKey: ["forecast", companyId, scenario],
    queryFn: () => getFn({ data: { companyId: companyId!, scenario } }),
    enabled: !!companyId,
  });

  const recomputeM = useMutation({
    mutationFn: () => recomputeFn({ data: { companyId: companyId!, scenario } }),
    onSuccess: () => {
      toast.success(`Forecast recalculated (${scenario})`);
      qc.invalidateQueries({ queryKey: ["forecast", companyId, scenario] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const weeks = (forecast.data?.weeks ?? []) as Array<Record<string, any>>;
  const covenant = (forecast.data?.covenants ?? [])[0] as { threshold?: number; metric?: string } | undefined;

  const totals = weeks.reduce(
    (acc, w) => ({
      cashIn: acc.cashIn + Number(w.cash_in ?? 0),
      cashOut: acc.cashOut + Number(w.cash_out ?? 0),
      d1: acc.d1 + Number(w.driver_milestone_billing ?? 0),
      d2: acc.d2 + Number(w.driver_materials_outflow ?? 0),
      d3: acc.d3 + Number(w.driver_subcontractor_payments ?? 0),
      d4: acc.d4 + Number(w.driver_payment_lag_adjustment ?? 0),
      d5: acc.d5 + Number(w.driver_weather_impact ?? 0),
    }),
    { cashIn: 0, cashOut: 0, d1: 0, d2: 0, d3: 0, d4: 0, d5: 0 },
  );
  const net = totals.cashIn - totals.cashOut;
  const lastBalance = weeks.length ? Number(weeks[weeks.length - 1].running_balance ?? 0) : 0;
  const headroom = covenant?.threshold != null ? lastBalance - Number(covenant.threshold) : null;
  const headroomStatus = headroom == null ? "green" : headroom < 0 ? "red" : headroom < Number(covenant!.threshold) * 0.2 ? "amber" : "green";

  const chartData = weeks.map((w) => ({
    week: `W${w.week_number}`,
    date: String(w.week_start ?? "").slice(5),
    "Milestone billing": Number(w.driver_milestone_billing ?? 0),
    "Materials outflow": -Number(w.driver_materials_outflow ?? 0),
    "Subcontractor payments": -Number(w.driver_subcontractor_payments ?? 0),
    "Payment lag effect": Number(w.driver_payment_lag_adjustment ?? 0),
    "Weather impact": -Number(w.driver_weather_impact ?? 0),
    rain: Number(w.rain_mm ?? 0),
    weekNum: Number(w.week_number),
  }));

  const selected = selectedWeek != null ? weeks.find((w) => Number(w.week_number) === selectedWeek) : null;
  const driverMax = Math.max(Math.abs(totals.d1), Math.abs(totals.d2), Math.abs(totals.d3), Math.abs(totals.d4), Math.abs(totals.d5), 1);

  const noData = !forecast.isLoading && weeks.length === 0;

  return (
    <div className="p-6 space-y-6">
      <SourceBanner />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">CFO Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {company.data?.companyName ?? "—"} · 13-week cash flow · scenario:{" "}
            <span className="font-medium capitalize">{scenario}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border bg-card p-1">
            {(["base", "wet", "dry"] as Scenario[]).map((s) => (
              <button
                key={s}
                onClick={() => setScenario(s)}
                className={`px-3 py-1.5 text-sm rounded capitalize transition ${
                  scenario === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s === "base" ? "Base" : s === "wet" ? "Wet quarter" : "Dry quarter"}
              </button>
            ))}
          </div>
          <Button onClick={() => recomputeM.mutate()} disabled={!companyId || recomputeM.isPending}>
            {recomputeM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Recalculate
          </Button>
        </div>
      </div>

      {noData && (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <p className="text-muted-foreground">No forecast yet for this scenario.</p>
            <Button onClick={() => recomputeM.mutate()} disabled={!companyId || recomputeM.isPending}>
              {recomputeM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Run forecast now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Cash IN (13w)" value={eur(totals.cashIn)} icon={<TrendingUp className="text-green-600" />} />
        <MetricCard label="Cash OUT (13w)" value={eur(totals.cashOut)} icon={<TrendingDown className="text-red-600" />} />
        <MetricCard label="Net position" value={eur(net)} valueClass={net >= 0 ? "text-green-600" : "text-red-600"} icon={<Wallet />} />
        <MetricCard
          label={`Covenant headroom${covenant?.metric ? ` (${covenant.metric})` : ""}`}
          value={headroom == null ? "—" : eur(headroom)}
          valueClass={headroomStatus === "red" ? "text-red-600" : headroomStatus === "amber" ? "text-amber-600" : "text-green-600"}
          icon={<Shield className={headroomStatus === "red" ? "text-red-600" : headroomStatus === "amber" ? "text-amber-600" : "text-green-600"} />}
        />
      </div>

      {/* 5 driver bars */}
      <Card>
        <CardHeader>
          <CardTitle>Cash flow drivers — 13 weeks</CardTitle>
          <CardDescription>Each driver's contribution across the forecast window</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {DRIVERS.map((d, i) => {
            const totalKey = (["d1", "d2", "d3", "d4", "d5"] as const)[i];
            const val = totals[totalKey] * d.sign;
            const pct = Math.min(100, (Math.abs(totals[totalKey]) / driverMax) * 100);
            return (
              <div key={d.key} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{d.label}</span>
                  <span className={d.sign > 0 ? "text-green-700" : "text-red-700"}>{eur(val)}</span>
                </div>
                <div className="h-2 bg-muted rounded overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: d.color }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Weather strip */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Weather outlook</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-13 gap-1" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
            {chartData.map((d, i) => {
              const week = weeks[i];
              const isWet = Number(week?.rain_mm ?? 0) > 15;
              return (
                <div
                  key={i}
                  className={`flex flex-col items-center gap-1 p-2 rounded text-[10px] ${isWet ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}
                >
                  <div className="text-muted-foreground">{d.week}</div>
                  <WeatherIcon rain_mm={Number(week?.rain_mm ?? 0)} is_frost={Boolean(week?.is_frost)} />
                  <div className="text-foreground">{Number(week?.rain_mm ?? 0).toFixed(0)}mm</div>
                  {Number(week?.lost_days ?? 0) > 0 && (
                    <Badge variant="destructive" className="px-1 py-0 text-[9px]">-{week?.lost_days}d</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Stacked chart */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly cash flow breakdown</CardTitle>
          <CardDescription>Click a bar to see the full audit trail for that week</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} stackOffset="sign" onClick={(e) => {
                const wk = (e as { activePayload?: Array<{ payload: { weekNum: number } }> })?.activePayload?.[0]?.payload?.weekNum;
                if (wk) setSelectedWeek(wk);
              }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `€${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => eur(v)} />
                <ReferenceLine y={0} stroke="hsl(var(--foreground))" />
                {DRIVERS.map((d) => (
                  <Bar key={d.key} dataKey={d.label} stackId="stack" fill={d.color}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} cursor="pointer" />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Sheet open={selectedWeek != null} onOpenChange={(o) => !o && setSelectedWeek(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              Week {selectedWeek} — {selected?.week_start as string} → {selected?.week_end as string}
            </SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><div className="text-muted-foreground">Cash in</div><div className="font-medium text-green-700">{eur(Number(selected.cash_in))}</div></div>
                <div><div className="text-muted-foreground">Cash out</div><div className="font-medium text-red-700">{eur(Number(selected.cash_out))}</div></div>
                <div><div className="text-muted-foreground">Net</div><div className="font-medium">{eur(Number(selected.net_cash))}</div></div>
                <div><div className="text-muted-foreground">Balance</div><div className="font-medium">{eur(Number(selected.running_balance))}</div></div>
                <div><div className="text-muted-foreground">Rain</div><div className="font-medium">{Number(selected.rain_mm).toFixed(1)}mm</div></div>
                <div><div className="text-muted-foreground">Confidence</div><div className="font-medium">{Math.round(Number(selected.confidence_score) * 100)}%</div></div>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Components</h3>
                {((selected.audit_json as { components?: Array<Record<string, unknown>> } | null)?.components ?? []).map((c, i) => (
                  <div key={i} className="rounded border p-3 text-xs space-y-1">
                    <div className="flex justify-between font-medium">
                      <span className="capitalize">{String(c.driver).replace(/_/g, " ")}</span>
                      <span className={Number(c.amount) >= 0 ? "text-green-700" : "text-red-700"}>{eur(Number(c.amount))}</span>
                    </div>
                    {Object.entries(c).filter(([k]) => k !== "driver" && k !== "amount").map(([k, v]) => (
                      <div key={k} className="flex justify-between text-muted-foreground">
                        <span>{k.replace(/_/g, " ")}</span>
                        <span className="text-foreground">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <Badge variant="secondary" className="bg-green-100 text-green-800">✓ This number is fully traceable</Badge>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MetricCard({ label, value, valueClass, icon }: { label: string; value: string; valueClass?: string; icon: React.ReactNode }) {
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

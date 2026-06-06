import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, AlertTriangle, Sparkles, Send } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { toast } from "sonner";
import { runForecast, getLatestForecast, copilotAsk } from "@/lib/forecast.functions";

export const Route = createFileRoute("/_authenticated/forecast")({
  head: () => ({ meta: [{ title: "Forecast — Cashflow" }] }),
  component: ForecastPage,
});

type Week = {
  week_number: number;
  week_start: string;
  cash_in: number | string;
  cash_out: number | string;
  net_cash: number | string;
  running_balance: number | string;
  confidence_score: number | string;
  anomaly_flags: string[];
  audit_json: {
    sources?: Array<{ type: string; description: string; amount: number; meta?: Record<string, unknown> }>;
    weather?: { consensusMm: number; minTempC: number | null; lostDays: number; frostFlag: boolean; confidence: number };
  };
};

const num = (v: number | string) => Number(v) || 0;

function ForecastPage() {
  const runFn = useServerFn(runForecast);
  const latestFn = useServerFn(getLatestForecast);
  const qc = useQueryClient();
  const latest = useQuery({ queryKey: ["forecast"], queryFn: () => latestFn({}) });
  const [selected, setSelected] = useState<Week | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);

  const runM = useMutation({
    mutationFn: () => runFn({}),
    onSuccess: () => {
      toast.success("Forecast generated");
      qc.invalidateQueries({ queryKey: ["forecast"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const weeks: Week[] = (latest.data?.weeks ?? []) as Week[];
  const source = latest.data?.importSource as { filename?: string; parsed_rows?: number; total_rows?: number; uploaded_at?: string } | null | undefined;
  const chartData = weeks.map((w) => ({
    week: `W${w.week_number}`,
    inflow: num(w.cash_in),
    outflow: num(w.cash_out),
    net: num(w.net_cash),
    balance: num(w.running_balance),
  }));

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">13-Week Forecast</h1>
          <p className="text-muted-foreground text-sm">
            {source?.filename
              ? `Using ${source.filename} · ${source.parsed_rows ?? source.total_rows ?? 0} imported rows · full audit trail`
              : "Deterministic engine · weather-adjusted · full audit trail"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCopilotOpen(true)}>
            <Sparkles className="w-4 h-4 mr-2" /> AI Copilot
          </Button>
          <Button onClick={() => runM.mutate()} disabled={runM.isPending}>
            {runM.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Run forecast
          </Button>
        </div>
      </div>

      {weeks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground mb-4">No forecast yet. Import some data and click <b>Run forecast</b>.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Cash flow trajectory</CardTitle></CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="week" />
                  <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => `€${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                  <Legend />
                  <Line type="monotone" dataKey="inflow" stroke="hsl(var(--chart-1, 142 71% 45%))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="outflow" stroke="hsl(var(--chart-2, 0 84% 60%))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="balance" stroke="hsl(var(--chart-3, 217 91% 60%))" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Weather & anomalies</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-13 gap-1">
                {weeks.map((w) => {
                  const wx = w.audit_json.weather;
                  const rain = wx?.consensusMm ?? 0;
                  const tone =
                    rain > 30 ? "bg-blue-600" :
                    rain > 15 ? "bg-blue-400" :
                    rain > 5 ? "bg-sky-200" : "bg-muted";
                  return (
                    <div key={w.week_number} className="text-center">
                      <div className={`h-8 rounded ${tone}`} title={`${rain.toFixed(1)} mm rain`} />
                      <div className="text-[10px] mt-1 text-muted-foreground">W{w.week_number}</div>
                      {wx?.frostFlag && <div className="text-[9px] text-blue-500">❄</div>}
                      {w.anomaly_flags?.length > 0 && <AlertTriangle className="w-3 h-3 inline text-amber-500" />}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Weekly breakdown</CardTitle>
              <CardDescription>Click a row to drill into the audit trail.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground text-left">
                  <tr>
                    <th className="py-2 pr-3">Week</th>
                    <th className="py-2 pr-3">Start</th>
                    <th className="py-2 pr-3 text-right">Cash in</th>
                    <th className="py-2 pr-3 text-right">Cash out</th>
                    <th className="py-2 pr-3 text-right">Net</th>
                    <th className="py-2 pr-3 text-right">Balance</th>
                    <th className="py-2 pr-3">Confidence</th>
                    <th className="py-2 pr-3">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((w) => (
                    <tr key={w.week_number} className="border-t cursor-pointer hover:bg-muted/50" onClick={() => setSelected(w)}>
                      <td className="py-2 pr-3 font-semibold">W{w.week_number}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{w.week_start}</td>
                      <td className="py-2 pr-3 text-right font-mono text-emerald-600">€{num(w.cash_in).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="py-2 pr-3 text-right font-mono text-red-600">€{num(w.cash_out).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="py-2 pr-3 text-right font-mono">€{num(w.net_cash).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className={`py-2 pr-3 text-right font-mono font-semibold ${num(w.running_balance) < 0 ? "text-red-600" : ""}`}>€{num(w.running_balance).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="py-2 pr-3">{(num(w.confidence_score) * 100).toFixed(0)}%</td>
                      <td className="py-2 pr-3">
                        {(w.anomaly_flags ?? []).map((f) => (
                          <Badge key={f} variant="destructive" className="mr-1 text-[10px]">{f}</Badge>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-[640px] sm:max-w-[640px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>Week {selected.week_number} · {selected.week_start}</SheetTitle>
                <SheetDescription>Full audit trail for every contributing source.</SheetDescription>
              </SheetHeader>
              <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
                <Stat label="Cash in" value={`€${num(selected.cash_in).toLocaleString()}`} />
                <Stat label="Cash out" value={`€${num(selected.cash_out).toLocaleString()}`} />
                <Stat label="Net" value={`€${num(selected.net_cash).toLocaleString()}`} />
              </div>
              {selected.audit_json.weather && (
                <div className="mt-6 p-4 rounded-md bg-muted/40 text-sm">
                  <div className="font-medium mb-2">Weather (consensus)</div>
                  <div>Rain: {selected.audit_json.weather.consensusMm.toFixed(1)} mm · Lost days: {selected.audit_json.weather.lostDays}</div>
                  <div>Min temp: {selected.audit_json.weather.minTempC ?? "—"}°C {selected.audit_json.weather.frostFlag ? "❄ frost risk" : ""}</div>
                  <div className="text-xs text-muted-foreground mt-1">Confidence: {(selected.audit_json.weather.confidence * 100).toFixed(0)}%</div>
                </div>
              )}
              <div className="mt-6">
                <div className="font-medium mb-2">Audit sources ({selected.audit_json.sources?.length ?? 0})</div>
                <div className="space-y-2">
                  {(selected.audit_json.sources ?? []).map((s, i) => (
                    <div key={i} className="p-3 rounded border text-sm">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">{s.type}</Badge>
                        <span className={`font-mono ${s.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>
                          €{Math.abs(s.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div className="mt-1">{s.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <CopilotPanel open={copilotOpen} onClose={() => setCopilotOpen(false)} ask={useServerFn(copilotAsk)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-md bg-muted/40">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold font-mono">{value}</div>
    </div>
  );
}

function CopilotPanel({ open, onClose, ask }: { open: boolean; onClose: () => void; ask: (args: { data: { question: string } }) => Promise<{ answer: string }> }) {
  const [q, setQ] = useState("");
  const [log, setLog] = useState<Array<{ role: "user" | "ai"; text: string }>>([]);
  const m = useMutation({
    mutationFn: (question: string) => ask({ data: { question } }),
    onSuccess: (r) => setLog((l) => [...l, { role: "ai", text: r.answer }]),
    onError: (e: Error) => setLog((l) => [...l, { role: "ai", text: `Error: ${e.message}` }]),
  });
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI Copilot</SheetTitle>
          <SheetDescription>Ask questions about your forecast — answers cite week numbers and audit sources.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto mt-4 space-y-3">
          {log.length === 0 && (
            <div className="text-sm text-muted-foreground space-y-2">
              <p>Try:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Which week has the largest cash gap?</li>
                <li>What's driving the spend in W3?</li>
                <li>Where is weather impacting the most?</li>
              </ul>
            </div>
          )}
          {log.map((e, i) => (
            <div key={i} className={`p-3 rounded text-sm whitespace-pre-wrap ${e.role === "user" ? "bg-muted ml-8" : "bg-accent/10 mr-8"}`}>{e.text}</div>
          ))}
          {m.isPending && <div className="text-sm text-muted-foreground">Thinking…</div>}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            className="flex-1 h-10 px-3 rounded-md border bg-background"
            placeholder="Ask about your forecast…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && q.trim()) {
                setLog((l) => [...l, { role: "user", text: q }]);
                m.mutate(q);
                setQ("");
              }
            }}
          />
          <Button
            size="icon"
            disabled={!q.trim() || m.isPending}
            onClick={() => {
              setLog((l) => [...l, { role: "user", text: q }]);
              m.mutate(q);
              setQ("");
            }}
          ><Send className="w-4 h-4" /></Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

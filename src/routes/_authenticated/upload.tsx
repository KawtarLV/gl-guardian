import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, CheckCircle2, AlertTriangle, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { parseExcel, classifyAccounts, saveClassifications, getMappingsSummary } from "@/lib/mapping.functions";
import { previewImport, commitImport } from "@/lib/demo-import.functions";
import { GL_CATEGORIES } from "@/lib/categories";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({ meta: [{ title: "Upload & Map — Cashflow" }] }),
  component: UploadPage,
});

type Classification = {
  accountNumber: string | null;
  accountDescription: string;
  category: string;
  confidence: number;
  source: "lookup" | "vector" | "ai";
  reasoning: string;
  needsReview: boolean;
  suggestedCategory: string;
};

type ParseResult = Awaited<ReturnType<typeof parseExcel>>;

function UploadPage() {
  return (
    <div className="p-8 max-w-7xl">
      <h1 className="text-2xl font-semibold mb-1">Upload & Map</h1>
      <p className="text-muted-foreground mb-6">Drop an Excel export — either GL accounts to map, or invoice data to seed the forecast.</p>
      <Tabs defaultValue="gl">
        <TabsList>
          <TabsTrigger value="gl">GL Mapping</TabsTrigger>
          <TabsTrigger value="demo">Demo Data</TabsTrigger>
        </TabsList>
        <TabsContent value="gl" className="mt-6"><GlMappingTab /></TabsContent>
        <TabsContent value="demo" className="mt-6"><DemoDataTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function useFileToBase64() {
  return useCallback(async (file: File) => {
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as number[]);
    }
    return btoa(binary);
  }, []);
}

function GlMappingTab() {
  const parse = useServerFn(parseExcel);
  const classify = useServerFn(classifyAccounts);
  const save = useServerFn(saveClassifications);
  const summaryFn = useServerFn(getMappingsSummary);
  const qc = useQueryClient();
  const toB64 = useFileToBase64();

  const summary = useQuery({ queryKey: ["mapping-summary"], queryFn: () => summaryFn({}) });
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [rows, setRows] = useState<Classification[]>([]);

  const parseM = useMutation({
    mutationFn: async (file: File) => {
      const fileBase64 = await toB64(file);
      return parse({ data: { fileBase64, filename: file.name } });
    },
    onSuccess: (data) => {
      setParsed(data);
      setRows([]);
      toast.success(`Parsed ${data.length} sheet(s)`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const classifyM = useMutation({
    mutationFn: async () => {
      const accounts = (parsed ?? []).flatMap((s) => s.glAccounts);
      if (accounts.length === 0) throw new Error("No GL accounts detected in the sheet(s)");
      const r = await classify({ data: { accounts } });
      return r.results.map((x) => ({ ...x, suggestedCategory: x.category }));
    },
    onSuccess: (r) => {
      setRows(r);
      toast.success(`Classified ${r.length} accounts`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveM = useMutation({
    mutationFn: () =>
      save({
        data: {
          rows: rows.map((r) => ({
            accountNumber: r.accountNumber,
            accountDescription: r.accountDescription,
            category: r.category,
            confidence: r.confidence,
            wasCorrected: r.category !== r.suggestedCategory,
            suggestedCategory: r.suggestedCategory,
          })),
        },
      }),
    onSuccess: (r) => {
      toast.success(`Saved ${r.saved} mappings (${r.learned} corrections taught)`);
      qc.invalidateQueries({ queryKey: ["mapping-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && parseM.mutate(files[0]),
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
    multiple: false,
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition ${isDragActive ? "border-accent bg-accent/5" : "border-border"}`}
            >
              <input {...getInputProps()} />
              <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
              {parseM.isPending ? (
                <p>Parsing…</p>
              ) : isDragActive ? (
                <p>Drop the .xlsx here</p>
              ) : (
                <p className="text-sm">Drop a <code>.xlsx</code> export here, or click to pick</p>
              )}
            </div>
          </CardContent>
        </Card>

        {parsed && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Parsed sheets</CardTitle>
                  <CardDescription>
                    {parsed.length} sheet(s), {parsed.reduce((a, s) => a + s.glAccounts.length, 0)} unique accounts detected
                  </CardDescription>
                </div>
                <Button onClick={() => classifyM.mutate()} disabled={classifyM.isPending}>
                  {classifyM.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Classify with AI
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {parsed.map((s) => (
                <div key={s.sheetName} className="text-sm flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{s.sheetName}</span>
                  <Badge variant="outline" className="text-xs">{s.shape}</Badge>
                  <span className="text-muted-foreground">· {s.rowCount} rows · {s.glAccounts.length} accounts</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {rows.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Review classifications</CardTitle>
                  <CardDescription>Override any category — the system learns from your corrections.</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const high = rows.filter((r) => r.confidence >= 0.9).length;
                      toast.info(`${high} rows are high-confidence (≥0.90)`);
                    }}
                  >
                    Inspect high-confidence
                  </Button>
                  <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
                    {saveM.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save & learn
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2 pr-3">#</th><th className="py-2 pr-3">Description</th><th className="py-2 pr-3">Category</th><th className="py-2 pr-3">Confidence</th><th className="py-2 pr-3">Source</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{r.accountNumber ?? "—"}</td>
                      <td className="py-2 pr-3">{r.accountDescription}<div className="text-xs text-muted-foreground">{r.reasoning}</div></td>
                      <td className="py-2 pr-3 min-w-[180px]">
                        <Select value={r.category} onValueChange={(v) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, category: v } : x))}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>{GL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 pr-3"><ConfidenceChip v={r.confidence} review={r.needsReview} /></td>
                      <td className="py-2 pr-3"><Badge variant="outline" className="text-xs uppercase">{r.source}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <Card>
          <CardHeader>
            <CardTitle>Learned mappings</CardTitle>
            <CardDescription>Approved mappings in your company memory.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{summary.data?.total ?? 0}</div>
            <div className="mt-4 space-y-1 text-sm">
              {Object.entries(summary.data?.byCategory ?? {})
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span>{k}</span><span className="text-muted-foreground">{v}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ConfidenceChip({ v, review }: { v: number; review: boolean }) {
  if (review) return <Badge variant="destructive" className="gap-1"><AlertTriangle size={12} />{(v * 100).toFixed(0)}%</Badge>;
  if (v >= 0.9) return <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1"><CheckCircle2 size={12} />{(v * 100).toFixed(0)}%</Badge>;
  return <Badge variant="secondary">{(v * 100).toFixed(0)}%</Badge>;
}

type DemoInvoice = {
  amount: number;
  invoiceDate: string;
  dueDate: string | null;
  customerName: string | null;
  description: string | null;
};

function DemoDataTab() {
  const parse = useServerFn(parseExcel);
  const preview = useServerFn(previewImport);
  const commit = useServerFn(commitImport);
  const toB64 = useFileToBase64();
  const qc = useQueryClient();

  const [invoices, setInvoices] = useState<DemoInvoice[]>([]);
  const [previewData, setPreviewData] = useState<Awaited<ReturnType<typeof previewImport>> | null>(null);

  const parseM = useMutation({
    mutationFn: async (file: File) => {
      const fileBase64 = await toB64(file);
      return parse({ data: { fileBase64, filename: file.name } });
    },
    onSuccess: async (data) => {
      const inv = data.flatMap((s) => s.invoices);
      if (inv.length === 0) {
        toast.error("No invoice-shaped rows detected in the file");
        return;
      }
      setInvoices(inv);
      const p = await preview({ data: { invoices: inv } });
      setPreviewData(p);
      toast.success(`Detected ${inv.length} invoices across ${p.customerCount} customers`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commitM = useMutation({
    mutationFn: () => commit({ data: { invoices } }),
    onSuccess: (r) => {
      toast.success(`Imported ${r.customers} customers + ${r.invoices} invoices`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && parseM.mutate(files[0]),
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
    multiple: false,
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition ${isDragActive ? "border-accent bg-accent/5" : "border-border"}`}
            >
              <input {...getInputProps()} />
              <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm">{parseM.isPending ? "Parsing…" : "Drop an invoice export (.xlsx) — we'll auto-create customers and invoices."}</p>
            </div>
          </CardContent>
        </Card>

        {previewData && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>
                    {previewData.customerCount} customers · {previewData.invoiceCount} invoices · €{previewData.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} total
                  </CardDescription>
                </div>
                <Button onClick={() => commitM.mutate()} disabled={commitM.isPending}>
                  {commitM.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Commit import
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground text-left">
                  <tr><th className="py-2 pr-3">Customer</th><th className="py-2 pr-3">Inferred type</th><th className="py-2 pr-3">Invoices</th><th className="py-2 pr-3 text-right">Total</th></tr>
                </thead>
                <tbody>
                  {previewData.customers.map((c) => (
                    <tr key={c.name} className="border-t">
                      <td className="py-2 pr-3">{c.name}</td>
                      <td className="py-2 pr-3"><Badge variant="outline">{c.type}</Badge></td>
                      <td className="py-2 pr-3">{c.invoiceCount}</td>
                      <td className="py-2 pr-3 text-right font-mono">€{c.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
      <div>
        <Card>
          <CardHeader><CardTitle>How this works</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>Heuristics detect invoice-shaped sheets (amount + date columns).</p>
            <p>Customer type is inferred from name patterns (e.g. <code>BV</code> → commercial, <code>woningstichting</code> → housing corp).</p>
            <p>Default payment lag is assigned by type so the forecast becomes usable immediately.</p>
            <p>Then head to <a className="text-accent underline" href="/forecast">Forecast</a> to generate the 13-week run.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

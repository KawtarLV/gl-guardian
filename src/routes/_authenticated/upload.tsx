import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, CheckCircle2, AlertTriangle, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { parseFileUniversal, approveColumnMapping, commitUniversalImport } from "@/lib/universal-parser.functions";
import { STANDARD_FIELDS, type StandardField } from "@/lib/column-detector";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({ meta: [{ title: "Smart Import — Cashflow" }] }),
  component: UploadPage,
});

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

type ParseUniversalResult = Awaited<ReturnType<typeof parseFileUniversal>>;
type Detection = ParseUniversalResult["detections"][number];

function UploadPage() {
  return (
    <div className="p-8 max-w-7xl">
      <h1 className="text-2xl font-semibold mb-1">Smart Import</h1>
      <p className="text-muted-foreground mb-6">
        Drop any Excel/CSV export — invoice list, GL statement, or monthly summary. The parser auto-detects
        columns, creates customers, and replaces previous imports so every dashboard reflects this file.
      </p>
      <SmartImportTab />
    </div>
  );
}

function SmartImportTab() {
  const parse = useServerFn(parseFileUniversal);
  const approve = useServerFn(approveColumnMapping);
  const commit = useServerFn(commitUniversalImport);
  const toB64 = useFileToBase64();
  const qc = useQueryClient();

  const [result, setResult] = useState<ParseUniversalResult | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);

  const parseM = useMutation({
    mutationFn: async (file: File) => {
      const fileBase64 = await toB64(file);
      return parse({ data: { fileBase64, filename: file.name } });
    },
    onSuccess: (r) => {
      setResult(r);
      setDetections(r.detections);
      const review = r.needsAIReview.length;
      if (review > 0) toast.warning(`Detected ${r.detections.length} columns — ${review} need review`);
      else toast.success(`All ${r.detections.length} columns auto-recognized`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveM = useMutation({
    mutationFn: async (det: Detection) =>
      approve({
        data: {
          columnName: det.original_name,
          standardField: det.standard_field,
          sampleValues: det.sample_values ?? [],
          applyGlobal: false,
        },
      }),
    onSuccess: (_d, det) => {
      setDetections((ds) =>
        ds.map((x) =>
          x.original_name === det.original_name ? { ...x, needs_review: false, source: "previous_approval", confidence: 1 } : x,
        ),
      );
      toast.success(`Saved: ${det.original_name} → ${det.standard_field}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commitM = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("Nothing to import");
      return commit({
        data: {
          uploadId: result.uploadId ?? null,
          transactions: result.transactions.map((t) => ({
            account_code: t.account_code,
            date: t.date,
            invoice_number: t.invoice_number,
            customer_code: t.customer_code,
            debet: t.debet,
            credit: t.credit,
            description: t.description,
          })),
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`Imported ${r.inserted} invoice(s)${r.customers ? ` · ${r.customers} customer(s)` : ""}`);
      // Refresh everything that depends on the latest upload.
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && parseM.mutate(files[0]),
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "text/csv": [".csv"],
    },
    multiple: false,
  });

  const reviewQueue = detections.filter((d) => d.needs_review);
  const allReviewed = reviewQueue.length === 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition ${isDragActive ? "border-accent bg-accent/5" : "border-border"}`}
          >
            <input {...getInputProps()} />
            <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm">
              {parseM.isPending ? "Parsing…" : "Drop any .xlsx or .csv — rule engine → previous approvals → AI as last resort."}
            </p>
          </div>
        </CardContent>
      </Card>

      {result && (
        <>
          {(result.fileContext?.company_name || result.fileContext?.account_code || result.fileContext?.year) && (
            <Card className="border-emerald-500/40 bg-emerald-500/5">
              <CardContent className="p-4 flex items-center gap-3 text-sm">
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                <div>
                  <span className="font-medium">Detected from file:</span>{" "}
                  {result.fileContext.company_name && <span>{result.fileContext.company_name}</span>}
                  {result.fileContext.account_code && <span> · Account {result.fileContext.account_code}</span>}
                  {result.fileContext.year && <span> · {result.fileContext.year}</span>}
                  {result.fileContext.period_from && result.fileContext.period_to && (
                    <span> · Periode {result.fileContext.period_from}–{result.fileContext.period_to}</span>
                  )}
                  <span className="text-muted-foreground"> · header row {result.headerRowIndex + 1}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {result.type === "monthly_summary" ? (
            <Card>
              <CardHeader>
                <CardTitle>Monthly summary detected</CardTitle>
                <CardDescription>
                  {result.monthlySummary.length} account rows imported. Stored as monthly aggregates for seasonal forecasting and reconciliation.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground text-left">
                    <tr>
                      <th className="py-2 pr-3">Account code</th>
                      <th className="py-2 pr-3">Description</th>
                      <th className="py-2 pr-3">Months with data</th>
                      <th className="py-2 pr-3 text-right">Annual total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.monthlySummary.map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="py-2 pr-3 font-mono">{row.account_code || "—"}</td>
                        <td className="py-2 pr-3">{row.account_description}</td>
                        <td className="py-2 pr-3">{Object.keys(row.monthly_totals).length}</td>
                        <td className="py-2 pr-3 text-right font-mono">€{row.annual_total.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Parse quality: {result.qualityScore}%</CardTitle>
                      <CardDescription>
                        {result.transactionCount} rows parsed · €{result.reconciliation.total_credit.toLocaleString()} credit · €{result.reconciliation.total_debet.toLocaleString()} debet
                      </CardDescription>
                    </div>
                    {allReviewed ? (
                      <Button onClick={() => commitM.mutate()} disabled={commitM.isPending || !result}>
                        {commitM.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Ready to import — click to commit
                      </Button>
                    ) : (
                      <Badge variant="destructive">{reviewQueue.length} column(s) need review</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                    {(["date", "credit", "debet", "invoice_number", "account_code"] as StandardField[]).map((f) => {
                      const found = detections.some((d) => d.standard_field === f);
                      return (
                        <div key={f} className="flex items-center gap-2">
                          {found ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                          <span className={found ? "" : "text-muted-foreground"}>{f}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Column detection report</CardTitle>
                  <CardDescription>One row per column. Green = auto-approved, amber = AI suggestion, red = unknown.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground text-left">
                      <tr>
                        <th className="py-2 pr-3">Column</th>
                        <th className="py-2 pr-3">Detected as</th>
                        <th className="py-2 pr-3">Confidence</th>
                        <th className="py-2 pr-3">Source</th>
                        <th className="py-2 pr-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detections.map((d, i) => (
                        <DetectionRow
                          key={i}
                          det={d}
                          onChange={(field) =>
                            setDetections((ds) => ds.map((x, j) => (j === i ? { ...x, standard_field: field } : x)))
                          }
                          onApprove={() => approveM.mutate(d)}
                          isApproving={approveM.isPending}
                        />
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Reconciliation</CardTitle></CardHeader>
                <CardContent className="font-mono text-sm space-y-1">
                  <div>Total credit: €{result.reconciliation.total_credit.toLocaleString()}</div>
                  <div>Total debet: €{result.reconciliation.total_debet.toLocaleString()}</div>
                  <div>Net: €{(result.reconciliation.total_credit - result.reconciliation.total_debet).toLocaleString()}</div>
                  <div>Rows: {result.reconciliation.row_count}</div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function DetectionRow({
  det,
  onChange,
  onApprove,
  isApproving,
}: {
  det: Detection;
  onChange: (f: StandardField) => void;
  onApprove: () => void;
  isApproving: boolean;
}) {
  const rowClass = det.needs_review
    ? det.standard_field === "unknown"
      ? "bg-destructive/5"
      : "bg-amber-500/5"
    : "bg-emerald-500/5";
  return (
    <tr className={`border-t ${rowClass}`}>
      <td className="py-2 pr-3 font-mono">
        {det.original_name}
        {det.sample_values && det.sample_values.length > 0 && (
          <div className="text-xs text-muted-foreground truncate max-w-[260px]">
            e.g. {det.sample_values.slice(0, 3).join(" · ")}
          </div>
        )}
        {det.reasoning && <div className="text-xs text-muted-foreground italic">{det.reasoning}</div>}
      </td>
      <td className="py-2 pr-3 min-w-[180px]">
        <Select value={det.standard_field} onValueChange={(v) => onChange(v as StandardField)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{STANDARD_FIELDS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
        </Select>
      </td>
      <td className="py-2 pr-3">{Math.round((det.confidence ?? 0) * 100)}%</td>
      <td className="py-2 pr-3">
        <Badge variant="outline" className="text-xs uppercase">{det.source}</Badge>
      </td>
      <td className="py-2 pr-3">
        {det.needs_review ? (
          <Button size="sm" onClick={onApprove} disabled={isApproving}>
            {isApproving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Approve
          </Button>
        ) : (
          <span className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 size={12} /> Auto</span>
        )}
      </td>
    </tr>
  );
}

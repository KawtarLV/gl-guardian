import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { getLatestUpload } from "@/lib/forecast.functions";

/**
 * Shows the file that is currently powering the dashboards.
 * Every metric below derives from this upload (via invoices + monthly_summaries).
 */
export function SourceBanner() {
  const fn = useServerFn(getLatestUpload);
  const q = useQuery({ queryKey: ["latest-upload"], queryFn: () => fn({}) });
  const src = q.data;

  if (!src) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 px-4 py-2 text-sm text-muted-foreground flex items-center gap-2">
        <FileSpreadsheet className="w-4 h-4" />
        No file imported yet — go to <a className="underline ml-1" href="/upload">Upload</a> to seed every dashboard.
      </div>
    );
  }
  return (
    <div className="rounded-md border bg-emerald-500/5 border-emerald-500/30 px-4 py-2 text-sm flex items-center gap-2">
      <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
      <span>
        <span className="font-medium">Data source:</span> {src.filename}
        <span className="text-muted-foreground"> · {src.parsed_rows ?? src.total_rows ?? 0} rows · uploaded {new Date(src.uploaded_at as string).toLocaleString("nl-NL")}</span>
      </span>
    </div>
  );
}

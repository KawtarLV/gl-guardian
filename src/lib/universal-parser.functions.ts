import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  detectFieldFromRules,
  normaliseColumnName,
  STANDARD_FIELDS,
  type StandardField,
} from "./column-detector";
import { parseAmount } from "./number-parser";
import { parseDate, parsePeriod } from "./date-parser";

// ── Public types ─────────────────────────────────────────────────────
export interface FileContext {
  account_code?: string;
  company_name?: string;
  year?: number;
  period_from?: string;
  period_to?: string;
}

export interface ColumnDetectionResult {
  original_name: string;
  standard_field: StandardField;
  confidence: number;
  source: "rule_engine" | "sample_analysis" | "previous_approval" | "ai" | "unknown";
  needs_review: boolean;
  reasoning?: string;
  mapping_id?: string;
  sample_values?: string[];
}

export interface ParsedTransaction {
  account_code: string | null;
  period: string | null;
  date: string | null;
  invoice_number: string | null;
  customer_code: string | null;
  debet: number;
  credit: number;
  description: string | null;
  journal: string | null;
  raw_row: Record<string, string>;
  parse_warnings: string[];
}

// Keywords that prove a row is the real header row
const HEADER_KEYWORDS = [
  "nr", "nr.", "per", "per.", "datum", "date", "bkst", "bkst.nr", "bkst.nr.",
  "dagboek", "journal", "debet", "debit", "credit", "rekening", "account",
  "boeknummer", "trek", "periode", "period", "boekingstekst", "omschrijving",
  "description", "btw", "vat", "relatie", "klant", "factuurnummer",
];

const MONTH_NAMES = [
  "jan", "feb", "mrt", "mar", "apr", "mei", "may", "jun",
  "jul", "aug", "sep", "okt", "oct", "nov", "dec",
];
const MONTH_TO_NUM: Record<string, string> = {
  jan: "01", feb: "02", mrt: "03", mar: "03", apr: "04",
  mei: "05", may: "05", jun: "06", jul: "07", aug: "08",
  sep: "09", okt: "10", oct: "10", nov: "11", dec: "12",
};

export type DatasetType = "monthly_summary" | "gl_statement" | "transaction_ledger" | "unknown";

interface HeaderDetection {
  datasetType: DatasetType;
  headerIndex: number;
  dataStartIndex: number;
  context: FileContext;
  skipColumns: number[];
}

/** Skip metadata rows; detect dataset type; find real header row; extract context. */
export function findHeaderRow(allRows: string[][]): HeaderDetection {
  const context: FileContext = {};

  // ── TYPE A: Monthly summary — month names as column headers ──────
  for (let i = 0; i < Math.min(allRows.length, 5); i++) {
    const row = allRows[i] ?? [];
    const monthCount = row.filter((cell) => {
      const n = String(cell ?? "").toLowerCase().trim().slice(0, 3);
      return MONTH_NAMES.includes(n);
    }).length;
    if (monthCount >= 6) {
      const skipColumns: number[] = [];
      row.forEach((cell, idx) => {
        const t = String(cell ?? "").toLowerCase().trim();
        if (t === "totaal" || t === "total") skipColumns.push(idx);
      });
      if (!row[0]?.trim()) skipColumns.push(0);
      return {
        datasetType: "monthly_summary",
        headerIndex: i,
        dataStartIndex: i + 1,
        context,
        skipColumns,
      };
    }
  }

  // ── TYPE B / C: Transaction rows ─────────────────────────────────
  for (let i = 0; i < Math.min(allRows.length, 30); i++) {
    const row = allRows[i] ?? [];
    const joined = row.join(" ");

    const adminMatch = joined.match(/administratie:\s*\d+\s*-\s*(.+)/i);
    if (adminMatch) context.company_name = adminMatch[1].trim();

    const accountMatch = joined.match(/grootboekrekening\s+(\d{3,6})/i);
    if (accountMatch) context.account_code = accountMatch[1];

    const yearMatch = joined.match(/boekjaar\s+(\d{4})/i);
    if (yearMatch) context.year = parseInt(yearMatch[1], 10);

    const periodMatch = joined.match(/periode\s+(\d{1,2})\s*[-–]\s*(\d{1,2})/i);
    if (periodMatch) {
      context.period_from = periodMatch[1];
      context.period_to = periodMatch[2];
    }

    const matchCount = row.filter((cell) => {
      if (!cell?.trim()) return false;
      const n = normaliseColumnName(cell);
      return HEADER_KEYWORDS.some((kw) => n === kw || n.startsWith(kw + " "));
    }).length;

    if (matchCount >= 3) {
      const skipColumns: number[] = [];
      row.forEach((cell, idx) => {
        if (!String(cell ?? "").trim()) {
          const hasData = allRows.slice(i + 1, i + 6).some(
            (r) => String(r?.[idx] ?? "").trim(),
          );
          if (!hasData) skipColumns.push(idx);
        }
      });
      return {
        datasetType: i === 0 ? "transaction_ledger" : "gl_statement",
        headerIndex: i,
        dataStartIndex: i + 1,
        context,
        skipColumns,
      };
    }
  }
  return { datasetType: "unknown", headerIndex: 0, dataStartIndex: 1, context, skipColumns: [] };
}

/** Layer 1b — identify a column from what its sample data looks like (no AI cost). */
function detectViaSamples(
  columnName: string,
  samples: string[],
): Omit<ColumnDetectionResult, "original_name"> | null {
  const nonEmpty = samples.filter((s) => s?.trim());
  if (nonEmpty.length < 2) return null;

  const allDates = nonEmpty.every((s) => !!parseDate(s));
  if (allDates) {
    return {
      standard_field: "date",
      confidence: 0.92,
      source: "sample_analysis",
      needs_review: false,
      reasoning: `All sample values parse as dates: ${nonEmpty.slice(0, 3).join(", ")}`,
    };
  }

  const allPeriodNums = nonEmpty.every((s) => {
    const n = parseInt(s, 10);
    return !isNaN(n) && n >= 1 && n <= 12 && s.trim().length <= 2;
  });
  if (allPeriodNums) {
    return {
      standard_field: "period",
      confidence: 0.85,
      source: "sample_analysis",
      needs_review: false,
      reasoning: "Sample values are period numbers 1–12",
    };
  }

  const intSeq = nonEmpty.every((s) => /^\d{1,5}$/.test(s.trim()));
  if (intSeq) {
    const last = parseInt(nonEmpty[nonEmpty.length - 1], 10);
    if (last === nonEmpty.length || last <= nonEmpty.length + 2) {
      return {
        standard_field: "row_number",
        confidence: 0.8,
        source: "sample_analysis",
        needs_review: false,
        reasoning: "Sequential integers — looks like a row index",
      };
    }
  }

  const amounts = nonEmpty.map((s) => parseAmount(s));
  const allAmounts = amounts.every((n) => n !== 0);
  const hasLarge = amounts.some((n) => Math.abs(n) > 1000);
  if (allAmounts && hasLarge) {
    const hint = columnName.toLowerCase();
    const field: StandardField = hint.includes("debet") || hint.includes("af") ? "debet" : "credit";
    return {
      standard_field: field,
      confidence: 0.8,
      source: "sample_analysis",
      needs_review: false,
      reasoning: `Monetary values detected: ${nonEmpty.slice(0, 3).join(", ")}`,
    };
  }

  const journalish = nonEmpty.every(
    (s) =>
      /verkoop|inkoop|memoriaal|bank|kas|boek/i.test(s) || /^\d{1,3}\s*-\s*.+/.test(s),
  );
  if (journalish) {
    return {
      standard_field: "journal",
      confidence: 0.85,
      source: "sample_analysis",
      needs_review: false,
      reasoning: "Values match Dutch dagboek patterns",
    };
  }

  return null;
}

// ── Validation ───────────────────────────────────────────────────────
const ParseFileInput = z.object({
  fileBase64: z.string().min(10),
  filename: z.string().min(1),
  fileContext: z
    .object({ account_code: z.string().optional(), year: z.number().optional() })
    .optional(),
});

const ApproveMappingInput = z.object({
  mappingId: z.string().uuid().optional(),
  columnName: z.string().min(1),
  standardField: z.enum(STANDARD_FIELDS as [StandardField, ...StandardField[]]),
  sampleValues: z.array(z.string()).optional(),
  applyGlobal: z.boolean().default(false),
});

const CommitImportInput = z.object({
  uploadId: z.string().uuid().nullable().optional(),
  transactions: z.array(
    z.object({
      account_code: z.string().nullable(),
      date: z.string().nullable(),
      invoice_number: z.string().nullable(),
      customer_code: z.string().nullable(),
      debet: z.number(),
      credit: z.number(),
      description: z.string().nullable(),
    }),
  ).min(1),
});

// ── Server fn: parse file end-to-end ─────────────────────────────────
export const parseFileUniversal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ParseFileInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseWorkbookRaw } = await import("./excel.server");
    const { lovableAi } = await import("./ai.server");

    // Find user's company
    const { data: mem } = await supabaseAdmin
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();
    const companyId = mem?.company_id ?? null;

    // Read every sheet as a raw matrix — no header inference yet
    const buf = Buffer.from(data.fileBase64, "base64");
    const sheets = parseWorkbookRaw(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );
    const sheet = sheets.find((s) => s.rows.length > 0) ?? sheets[0];
    if (!sheet) throw new Error("File contains no sheets");

    // ── Find dataset type + real header row, skipping metadata ──
    const { datasetType, headerIndex, dataStartIndex, context: fileContext, skipColumns } =
      findHeaderRow(sheet.rows);
    const mergedContext: FileContext = { ...fileContext, ...(data.fileContext ?? {}) };

    const headers = (sheet.rows[headerIndex] ?? []).map((h) => (h ?? "").trim());
    const rows = sheet.rows
      .slice(dataStartIndex)
      .filter((r) => r.some((c) => c?.trim()))
      .map((r) => headers.map((_, i) => (r[i] ?? "").trim()));

    // ── TYPE A: Monthly summary — different shape entirely ───────
    if (datasetType === "monthly_summary") {
      const year = mergedContext.year ?? new Date().getFullYear();
      const monthCols: { idx: number; period: string }[] = [];
      headers.forEach((h, idx) => {
        if (skipColumns.includes(idx)) return;
        const key = String(h ?? "").toLowerCase().trim().slice(0, 3);
        const m = MONTH_TO_NUM[key];
        if (m) monthCols.push({ idx, period: `${year}-${m}` });
      });
      const totalIdx = headers.findIndex((h) => {
        const t = String(h ?? "").toLowerCase().trim();
        return t === "totaal" || t === "total";
      });

      const summaryRows = rows
        .map((row) => {
          const firstCell = (row[0] ?? "").trim() || (row[1] ?? "").trim();
          if (!firstCell) return null;
          const m = firstCell.match(/^(\d{4,6})\s+(.+)$/);
          const account_code = m ? m[1] : "";
          const account_description = m ? m[2] : firstCell;
          const monthly_totals: Record<string, number> = {};
          for (const { idx, period } of monthCols) {
            const v = parseAmount(row[idx]);
            if (v !== 0) monthly_totals[period] = v;
          }
          const annual_total = totalIdx >= 0 ? parseAmount(row[totalIdx]) : 0;
          return { account_code, account_description, monthly_totals, annual_total };
        })
        .filter(Boolean) as Array<{
          account_code: string;
          account_description: string;
          monthly_totals: Record<string, number>;
          annual_total: number;
        }>;

      if (companyId && summaryRows.length) {
        const insertRows = summaryRows.flatMap((r) =>
          Object.entries(r.monthly_totals).map(([period, amount]) => ({
            company_id: companyId,
            account_code: r.account_code || null,
            account_description: r.account_description,
            period,
            total_credit: amount,
            source_file: data.filename,
          })),
        );
        if (insertRows.length) {
          await supabaseAdmin
            .from("monthly_summaries" as never)
            .delete()
            .eq("company_id", companyId);
          await supabaseAdmin
            .from("monthly_summaries" as never)
            .upsert(insertRows as never, {
              onConflict: "company_id,account_code,account_description,period,source_file",
            } as never);
        }
      }

      return {
        type: "monthly_summary" as const,
        uploadId: null,
        companyId,
        headers,
        sheetName: sheet.sheetName,
        headerRowIndex: headerIndex,
        fileContext: mergedContext,
        detections: [] as ColumnDetectionResult[],
        transactions: [] as ParsedTransaction[],
        transactionCount: 0,
        qualityScore: 100,
        needsAIReview: [] as string[],
        monthlySummary: summaryRows,
        reconciliation: {
          total_credit: Math.round(
            summaryRows.reduce((s, r) => s + r.annual_total, 0) * 100,
          ) / 100,
          total_debet: 0,
          row_count: summaryRows.length,
        },
      };
    }


    // ── Detect each column ────────────────────────────────────────
    const detections: ColumnDetectionResult[] = [];
    let rekeningSeen = 0;
    for (let idx = 0; idx < headers.length; idx++) {
      const header = headers[idx] || `(empty col ${idx + 1})`;
      const samples = rows.slice(0, 10).map((r) => r[idx] || "").filter((v) => v.trim()).slice(0, 5);

      // Skip columns marked as irrelevant (empty headers with no data, etc.)
      if (skipColumns.includes(idx)) {
        detections.push({
          original_name: header,
          standard_field: "unknown",
          confidence: 0,
          source: "unknown",
          needs_review: false,
          reasoning: "Skipped — empty column",
          sample_values: samples,
        });
        continue;
      }

      // Special case: duplicate "Rekening" in Type C — first = account_code, second = period
      const normHeader = String(header).toLowerCase().trim();
      if (normHeader === "rekening") {
        const field: StandardField = rekeningSeen === 0 ? "account_code" : "period";
        rekeningSeen++;
        detections.push({
          original_name: header,
          standard_field: field,
          confidence: 1.0,
          source: "rule_engine",
          needs_review: false,
          reasoning: rekeningSeen === 1 ? `Duplicate "Rekening" — first occurrence treated as account code` : `Duplicate "Rekening" — second occurrence treated as period`,
          sample_values: samples,
        });
        continue;
      }

      // Layer 1: rule engine (skip if header is empty/__EMPTY)
      if (header && !header.startsWith("__EMPTY") && !header.startsWith("(empty")) {
        const ruleField = detectFieldFromRules(header);
        if (ruleField) {
          detections.push({
            original_name: header,
            standard_field: ruleField,
            confidence: 1.0,
            source: "rule_engine",
            needs_review: false,
            reasoning: `Matched alias "${normaliseColumnName(header)}"`,
            sample_values: samples,
          });
          continue;
        }
      }

      // Layer 1b: sample analysis
      const sampleDet = detectViaSamples(header, samples);
      if (sampleDet) {
        detections.push({ original_name: header, sample_values: samples, ...sampleDet });
        continue;
      }

      // Layer 2: previous approval
      const normalised = normaliseColumnName(header);
      const { data: approval } = await supabaseAdmin
        .from("column_mappings")
        .select("id, standard_field, confidence")
        .eq("status", "approved")
        .eq("normalised_column_name", normalised)
        .or(`company_id.eq.${companyId ?? "00000000-0000-0000-0000-000000000000"},company_id.is.null`)
        .order("company_id", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (approval && approval.standard_field) {
        detections.push({
          original_name: header,
          standard_field: approval.standard_field as StandardField,
          confidence: Number(approval.confidence ?? 0.95),
          source: "previous_approval",
          needs_review: false,
          mapping_id: approval.id as string,
          sample_values: samples,
        });
        continue;
      }

      // Layer 3: AI (Lovable AI Gateway — only for genuinely unknown columns)
      let aiField: StandardField = "unknown";
      let aiConfidence = 0;
      let aiReasoning = "AI unavailable — select the field type manually";
      let aiSource: ColumnDetectionResult["source"] = "unknown";
      try {
        const prompt = `You are a Dutch accounting expert. Identify what standard financial field this column represents.

Column name: "${header}"
Sample values: ${JSON.stringify(samples)}

Choose exactly one of:
account_code | period | date | invoice_number | customer_code | debet | credit | description | journal | vat | row_number | unknown

Reply ONLY as valid JSON: {"field": "...", "confidence": 0.0-1.0, "reasoning": "..."}`;

        const reply = await lovableAi(prompt, { system: "You are a strict JSON-only classifier for Dutch accounting column headers." });
        if (reply) {
          const cleaned = reply.replace(/```json\s*|\s*```/g, "").trim();
          const parsed = JSON.parse(cleaned);
          if ((STANDARD_FIELDS as readonly string[]).includes(parsed.field)) aiField = parsed.field;
          aiConfidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
          aiReasoning = String(parsed.reasoning ?? aiReasoning);
          aiSource = "ai";
        }
      } catch (e) {
        aiReasoning = `AI failed: ${e instanceof Error ? e.message : String(e)}`;
      }

      const { data: saved } = await supabaseAdmin
        .from("column_mappings")
        .upsert(
          {
            company_id: companyId,
            source_column_name: header,
            normalised_column_name: normalised,
            sample_values: samples,
            suggested_field: aiField,
            standard_field: aiField,
            confidence: aiConfidence,
            reasoning: aiReasoning,
            source: aiSource,
            status: "needs_review",
          } as never,
          { onConflict: "company_id,normalised_column_name" } as never,
        )
        .select("id")
        .single();

      detections.push({
        original_name: header,
        standard_field: aiField,
        confidence: aiConfidence,
        source: aiSource,
        needs_review: true,
        reasoning: aiReasoning,
        mapping_id: (saved?.id as string | undefined) ?? undefined,
        sample_values: samples,
      });
    }

    // ── Parse rows using detected fields ──────────────────────────
    const fieldIndex: Partial<Record<StandardField, number>> = {};
    detections.forEach((det, idx) => {
      if (det.standard_field !== "unknown" && fieldIndex[det.standard_field] === undefined) {
        fieldIndex[det.standard_field] = idx;
      }
    });

    const get = (row: string[], field: StandardField): string => {
      const idx = fieldIndex[field];
      return idx !== undefined ? (row[idx] || "").trim() : "";
    };

    const transactions: ParsedTransaction[] = [];
    for (const row of rows) {
      if (!row.some((c) => c?.trim())) continue;
      const rowWarnings: string[] = [];

      let accountCode = get(row, "account_code");
      if (!accountCode && mergedContext.account_code) {
        accountCode = mergedContext.account_code;
      }

      const rawDate = get(row, "date");
      const parsedDate = parseDate(rawDate || null);
      if (rawDate && !parsedDate) rowWarnings.push(`Cannot parse date: "${rawDate}"`);

      const yearContext = parsedDate ? parseInt(parsedDate.slice(0, 4), 10) : mergedContext.year;
      const period = parsePeriod(get(row, "period") || null, yearContext);

      const debet = parseAmount(get(row, "debet"));
      const credit = parseAmount(get(row, "credit"));

      transactions.push({
        account_code: accountCode || null,
        period,
        date: parsedDate,
        invoice_number: get(row, "invoice_number") || null,
        customer_code: get(row, "customer_code") || null,
        debet,
        credit,
        description: get(row, "description") || null,
        journal: get(row, "journal") || null,
        raw_row: Object.fromEntries(headers.map((h, i) => [h || `col${i + 1}`, row[i] || ""])),
        parse_warnings: rowWarnings,
      });
    }

    // ── Quality score ─────────────────────────────────────────────
    const keyFields: StandardField[] = ["date", "credit", "invoice_number", "account_code"];
    const found = keyFields.filter(
      (f) => fieldIndex[f] !== undefined || (f === "account_code" && !!mergedContext.account_code),
    ).length;
    const qualityScore = Math.round((found / keyFields.length) * 100);

    const totalCredit = transactions.reduce((s, t) => s + t.credit, 0);
    const totalDebet = transactions.reduce((s, t) => s + t.debet, 0);
    const needsAIReview = detections.filter((d) => d.needs_review).map((d) => d.original_name);

    // ── Record the upload ─────────────────────────────────────────
    let uploadId: string | null = null;
    if (companyId) {
      const { data: rec } = await supabaseAdmin
        .from("file_uploads")
        .insert({
          company_id: companyId,
          filename: data.filename,
          file_structure: detections.some((d) => d.standard_field === "account_code")
            ? "structure_a"
            : "structure_b",
          total_rows: rows.length,
          parsed_rows: transactions.length,
          failed_rows: rows.length - transactions.length,
          parse_quality_score: qualityScore,
          column_map: detections.map((d) => ({
            column: d.original_name,
            field: d.standard_field,
            source: d.source,
          })),
          warnings: needsAIReview,
          status: needsAIReview.length > 0 ? "reviewing" : "pending",
          uploaded_by: userId,
        } as never)
        .select("id")
        .single();
      uploadId = (rec?.id as string | undefined) ?? null;
    }

    return {
      type: datasetType,
      uploadId,
      companyId,
      headers,
      sheetName: sheet.sheetName,
      headerRowIndex: headerIndex,
      fileContext: mergedContext,
      detections,
      transactions,
      transactionCount: transactions.length,
      qualityScore,
      needsAIReview,
      monthlySummary: [] as Array<{
        account_code: string;
        account_description: string;
        monthly_totals: Record<string, number>;
        annual_total: number;
      }>,
      reconciliation: {
        total_credit: Math.round(totalCredit * 100) / 100,
        total_debet: Math.round(totalDebet * 100) / 100,
        row_count: transactions.length,
      },
    };
  });

// ── Approve / correct a column mapping ───────────────────────────────
export const approveColumnMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApproveMappingInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mem } = await supabaseAdmin
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();
    const companyId = data.applyGlobal ? null : mem?.company_id ?? null;
    const norm = normaliseColumnName(data.columnName);

    const payload = {
      company_id: companyId,
      source_column_name: data.columnName,
      normalised_column_name: norm,
      sample_values: data.sampleValues ?? [],
      standard_field: data.standardField,
      suggested_field: data.standardField,
      confidence: 1,
      source: "human",
      status: "approved",
      approved_by: userId,
      approved_at: new Date().toISOString(),
    };

    const { data: saved, error } = await supabaseAdmin
      .from("column_mappings")
      .upsert(payload as never, {
        onConflict: companyId ? "company_id,normalised_column_name" : "normalised_column_name",
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: saved?.id as string };
  });

// ── List column mappings for the tab ─────────────────────────────────
export const listColumnMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mem } = await supabaseAdmin
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();
    const companyId = mem?.company_id ?? null;

    const { data } = await supabaseAdmin
      .from("column_mappings")
      .select("*")
      .or(companyId ? `company_id.eq.${companyId},company_id.is.null` : `company_id.is.null`)
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(500);

    return {
      mappings: (data ?? []).map((m: Record<string, unknown>) => ({
        id: String(m.id),
        company_id: (m.company_id as string | null) ?? null,
        source_column_name: String(m.source_column_name ?? ""),
        normalised_column_name: (m.normalised_column_name as string | null) ?? null,
        standard_field: (m.standard_field as string | null) ?? null,
        confidence: m.confidence == null ? null : Number(m.confidence),
        source: (m.source as string | null) ?? null,
        status: (m.status as string | null) ?? null,
        sample_values: Array.isArray(m.sample_values) ? (m.sample_values as unknown[]).map(String) : [],
        reasoning: (m.reasoning as string | null) ?? null,
        approved_at: (m.approved_at as string | null) ?? null,
      })),
    };
  });

// ── Commit parsed transactions as invoices ───────────────────────────
export const commitUniversalImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CommitImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { CUSTOMER_TYPE_DEFAULT_LAG } = await import("./categories");

    const { data: mem } = await supabaseAdmin
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();
    const companyId = mem?.company_id as string | undefined;
    if (!companyId) throw new Error("No company membership found for user");

    // ── Upsert one customer per unique customer_code / customer_name found in the file.
    // Mirrors the legacy demo-import flow so invoice-shape files (no account_code,
    // customer column instead) still produce real customer records the forecast can use.
    const inferType = (name: string): string => {
      const n = name.toLowerCase();
      if (/woningstichting|woningcorporatie|woningbouw|housing/.test(n)) return "housing_corp";
      if (/\b(bv|b\.v\.|nv|n\.v\.|gmbh|ltd|inc|holding)\b/.test(n)) return "commercial";
      if (/particulier|dhr\.|mevr\.|familie|fam\./.test(n)) return "small_repair";
      return "unknown";
    };

    const uniqueCustomers = new Map<string, string>();
    for (const t of data.transactions) {
      const name = (t.customer_code ?? "").trim();
      if (!name) continue;
      uniqueCustomers.set(name.toLowerCase(), name);
    }
    const customerIds = new Map<string, string>();
    for (const [key, name] of uniqueCustomers) {
      const type = inferType(name);
      const lag = CUSTOMER_TYPE_DEFAULT_LAG[type] ?? 30;
      const { data: existing } = await supabaseAdmin
        .from("customers").select("id")
        .eq("company_id", companyId).eq("name", name).maybeSingle();
      if (existing?.id) { customerIds.set(key, existing.id); continue; }
      const { data: ins } = await supabaseAdmin
        .from("customers").insert({
          company_id: companyId, name, customer_type: type, avg_payment_lag_days: lag,
        } as never).select("id").single();
      if (ins?.id) customerIds.set(key, ins.id);
    }

    const today = new Date().toISOString().slice(0, 10);
    const rows = data.transactions
      .map((t, index) => {
        const amount = t.credit !== 0 ? t.credit : -t.debet;
        if (amount === 0) return null;
        const custKey = (t.customer_code ?? "").trim().toLowerCase();
        return {
          company_id: companyId,
          customer_id: custKey ? customerIds.get(custKey) ?? null : null,
          amount,
          invoice_date: t.date ?? today,
          status: "open" as const,
          external_ref: data.uploadId ? `upload:${data.uploadId}:${t.invoice_number ?? index + 1}` : t.invoice_number ?? null,
          gl_category: t.account_code ?? null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) throw new Error("No importable rows (all zero-amount)");

    await supabaseAdmin
      .from("invoices")
      .delete()
      .eq("company_id", companyId)
      .is("project_id", null)
      .is("milestone_id", null);

    let inserted = 0;
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error, count } = await supabaseAdmin
        .from("invoices")
        .insert(chunk as never, { count: "exact" } as never);
      if (error) throw new Error(error.message);
      inserted += count ?? chunk.length;
    }

    if (data.uploadId) {
      await supabaseAdmin
        .from("file_uploads")
        .update({ status: "imported" } as never)
        .eq("id", data.uploadId);
    }

    return { inserted, customers: customerIds.size };
  });

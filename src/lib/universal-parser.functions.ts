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
  source: "rule_engine" | "sample_analysis" | "previous_approval" | "claude" | "unknown";
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

interface HeaderDetection {
  headerIndex: number;
  dataStartIndex: number;
  context: FileContext;
}

/** Skip metadata rows at the top of the file; find the row with real column headers
 *  and extract file context (company, account, year, period range). */
export function findHeaderRow(allRows: string[][]): HeaderDetection {
  const context: FileContext = {};

  for (let i = 0; i < Math.min(allRows.length, 30); i++) {
    const row = allRows[i] ?? [];
    const joined = row.join(" ");

    const adminMatch = joined.match(/administratie:\s*\d+\s*-\s*(.+)/i);
    if (adminMatch) context.company_name = adminMatch[1].trim();

    const accountMatch = joined.match(/grootboekrekening\s+(\d{3,6})/i);
    if (accountMatch) context.account_code = accountMatch[1];

    const yearMatch = joined.match(/boekjaar\s+(\d{4})/i);
    if (yearMatch) context.year = parseInt(yearMatch[1], 10);

    const periodMatch = joined.match(/periode\s+(\d{1,2})\s*-\s*(\d{1,2})/i);
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
      return { headerIndex: i, dataStartIndex: i + 1, context };
    }
  }
  return { headerIndex: 0, dataStartIndex: 1, context };
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

// ── Server fn: parse file end-to-end ─────────────────────────────────
export const parseFileUniversal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ParseFileInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseWorkbookRaw } = await import("./excel.server");
    const { claudeMessage } = await import("./ai.server");

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

    // ── Find the real header row, skipping metadata ──────────────
    const { headerIndex, dataStartIndex, context: fileContext } = findHeaderRow(sheet.rows);
    const mergedContext: FileContext = { ...fileContext, ...(data.fileContext ?? {}) };

    const headers = (sheet.rows[headerIndex] ?? []).map((h) => (h ?? "").trim());
    const rows = sheet.rows
      .slice(dataStartIndex)
      .filter((r) => r.some((c) => c?.trim()))
      .map((r) => headers.map((_, i) => (r[i] ?? "").trim()));

    // ── Detect each column ────────────────────────────────────────
    const detections: ColumnDetectionResult[] = [];
    for (let idx = 0; idx < headers.length; idx++) {
      const header = headers[idx] || `(empty col ${idx + 1})`;
      const samples = rows.slice(0, 10).map((r) => r[idx] || "").filter((v) => v.trim()).slice(0, 5);

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

      // Layer 3: Claude (only for genuinely unknown columns)
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

        const reply = await claudeMessage(prompt, { maxTokens: 200 });
        if (reply) {
          const cleaned = reply.replace(/```json\s*|\s*```/g, "").trim();
          const parsed = JSON.parse(cleaned);
          if ((STANDARD_FIELDS as readonly string[]).includes(parsed.field)) aiField = parsed.field;
          aiConfidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
          aiReasoning = String(parsed.reasoning ?? aiReasoning);
          aiSource = "claude";
        }
      } catch (e) {
        aiReasoning = `Claude failed: ${e instanceof Error ? e.message : String(e)}`;
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
      uploadId,
      companyId,
      headers,
      sheetName: sheet.sheetName,
      headerRowIndex: headerIndex,
      fileContext: mergedContext,
      detections,
      transactions: transactions.slice(0, 1000),
      transactionCount: transactions.length,
      qualityScore,
      needsAIReview,
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

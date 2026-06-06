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
export interface ColumnDetectionResult {
  original_name: string;
  standard_field: StandardField;
  confidence: number;
  source: "rule_engine" | "previous_approval" | "openai" | "unknown";
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
    const { parseWorkbook } = await import("./excel.server");

    // Find user's company
    const { data: mem } = await supabaseAdmin
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();
    const companyId = mem?.company_id ?? null;

    const buf = Buffer.from(data.fileBase64, "base64");
    const sheets = parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    // Use the first sheet that has rows
    const sheet = sheets.find((s) => s.rows.length > 0) ?? sheets[0];
    if (!sheet) throw new Error("File contains no sheets");

    const headers = sheet.headers;
    const rows = sheet.rows.map((r) =>
      headers.map((h) => (r[h] == null ? "" : String(r[h])))
    );

    // ── Detect each column ────────────────────────────────────────
    const detections: ColumnDetectionResult[] = [];
    for (let idx = 0; idx < headers.length; idx++) {
      const header = headers[idx];
      const samples = rows.slice(0, 10).map((r) => r[idx] || "").filter((v) => v.trim()).slice(0, 5);

      // Layer 1: rule engine
      const ruleField = detectFieldFromRules(header);
      if (ruleField) {
        detections.push({
          original_name: header,
          standard_field: ruleField,
          confidence: 1.0,
          source: "rule_engine",
          needs_review: false,
          sample_values: samples,
        });
        continue;
      }

      // Layer 2: previous approval (company-scoped, then global)
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

      // Layer 3: OpenAI
      let aiField: StandardField = "unknown";
      let aiConfidence = 0.5;
      let aiReasoning = "AI could not determine field type";
      try {
        const { chatCompletion } = await import("./ai.server");
        const prompt = `You are a Dutch accounting expert. Identify what standard financial field this column represents.

Column name: "${header}"
Sample values from this column: ${JSON.stringify(samples)}

Choose exactly one of these standard fields:
account_code | period | date | invoice_number | customer_code | debet | credit | description | journal | vat | row_number | unknown

Dutch accounting context:
- "Trek", "Relatie", "Klantnummer", "Debiteur" = customer_code
- "Datum", "Factuurdatum", "Boekingsdatum" = date
- "Boeknummer", "Bkst.nr", "Factuurnummer" = invoice_number
- "Rekening", "Grootboek" = account_code
- "Dagboek", "Boek" = journal
- "Periode", "Per", "Maand" = period
- "Boekingstekst", "Omschrijving", "Tekst" = description
- Amounts in a column called "Debet/Af" = debet; in "Credit/Bij" = credit
- If cannot determine = unknown

Reply ONLY as valid JSON:
{"field": "customer_code", "confidence": 0.92, "reasoning": "Trek is the Dutch term for relation/customer reference"}`;

        const reply = await chatCompletion(
          "You are a strict JSON-only classifier for Dutch accounting column headers.",
          prompt,
          { model: "gpt-4o-mini", temperature: 0 },
        );
        const cleaned = reply.replace(/```json\s*|\s*```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (STANDARD_FIELDS.includes(parsed.field)) aiField = parsed.field;
        aiConfidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
        aiReasoning = String(parsed.reasoning ?? aiReasoning);
      } catch (e) {
        aiReasoning = `AI call failed: ${e instanceof Error ? e.message : String(e)}`;
      }

      // Persist as needs_review so a human can approve
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
            source: "openai",
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
        source: "openai",
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
      if (!accountCode && data.fileContext?.account_code) {
        accountCode = data.fileContext.account_code;
        rowWarnings.push(`account_code from file context: ${accountCode}`);
      }

      const rawDate = get(row, "date");
      const parsedDate = parseDate(rawDate || null);
      if (rawDate && !parsedDate) rowWarnings.push(`Cannot parse date: "${rawDate}"`);

      const yearContext = parsedDate ? parseInt(parsedDate.slice(0, 4), 10) : data.fileContext?.year;
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
        raw_row: Object.fromEntries(headers.map((h, i) => [h, row[i] || ""])),
        parse_warnings: rowWarnings,
      });
    }

    // ── Quality score ─────────────────────────────────────────────
    const keyFields: StandardField[] = ["date", "credit", "debet", "invoice_number", "account_code"];
    const found = keyFields.filter((f) => fieldIndex[f] !== undefined).length;
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
      detections,
      transactions: transactions.slice(0, 1000), // cap for transport
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
      .upsert(payload as never, { onConflict: companyId ? "company_id,normalised_column_name" : "normalised_column_name" } as never)
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
      mappings: (data ?? []) as Array<{
        id: string;
        company_id: string | null;
        source_column_name: string;
        normalised_column_name: string | null;
        standard_field: string | null;
        confidence: number | null;
        source: string | null;
        status: string | null;
        sample_values: unknown;
        reasoning: string | null;
        approved_at: string | null;
      }>,
    };
  });

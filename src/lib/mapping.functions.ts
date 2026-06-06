import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ParseInput = z.object({ fileBase64: z.string().min(10), filename: z.string().min(1) });
const ClassifyInput = z.object({
  accounts: z
    .array(z.object({ accountNumber: z.string().nullable(), accountDescription: z.string().min(1) }))
    .min(1)
    .max(2000),
});
const SaveInput = z.object({
  rows: z
    .array(
      z.object({
        accountNumber: z.string().nullable(),
        accountDescription: z.string().min(1),
        category: z.string().min(1),
        confidence: z.number().min(0).max(1),
        wasCorrected: z.boolean(),
        suggestedCategory: z.string().nullable(),
      }),
    )
    .min(1)
    .max(2000),
});

export const parseExcel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ParseInput.parse(data))
  .handler(async ({ data }) => {
    const { parseWorkbook, extractGlRows, extractInvoiceRows, extractJournalRows, detectShape } = await import("./excel.server");
    const buf = Buffer.from(data.fileBase64, "base64");
    const sheets = parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    return sheets.map((s) => ({
      sheetName: s.sheetName,
      headers: s.headers,
      preview: s.rows.slice(0, 20),
      rowCount: s.rows.length,
      shape: detectShape(s),
      glAccounts: extractGlRows(s),
      invoices: extractInvoiceRows(s).slice(0, 500),
      journalRows: extractJournalRows(s),
    }));
  });

export const classifyAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ClassifyInput.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { embedText, classifyAccount, toVectorLiteral } = await import("./ai.server");
    const { normalizeDescription } = await import("./categories");

    const { data: mem } = await supabaseAdmin
      .from("company_members").select("company_id").eq("user_id", userId).maybeSingle();
    const companyId = mem?.company_id;
    if (!companyId) throw new Error("No company found for user");

    const results: Array<{
      accountNumber: string | null;
      accountDescription: string;
      category: string;
      confidence: number;
      source: "lookup" | "vector" | "ai";
      reasoning: string;
      needsReview: boolean;
    }> = [];

    for (const a of data.accounts) {
      const norm = normalizeDescription(a.accountDescription);

      const { data: hit } = await supabaseAdmin
        .from("gl_mappings")
        .select("standardized_category, confidence")
        .eq("company_id", companyId)
        .eq("normalized_description", norm)
        .order("confidence", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (hit) {
        results.push({
          ...a,
          category: (hit as { standardized_category: string }).standardized_category,
          confidence: 0.99,
          source: "lookup",
          reasoning: "Exact match from prior approvals",
          needsReview: false,
        });
        continue;
      }

      let vectorHit: { category: string; similarity: number } | null = null;
      try {
        const emb = await embedText(a.accountDescription);
        const rpc = await supabaseAdmin.rpc("match_gl_mappings" as never, {
          query_embedding: toVectorLiteral(emb),
          match_company_id: companyId,
          match_threshold: 0.85,
          match_count: 1,
        } as never);
        const matches = rpc.data as unknown as Array<{ standardized_category: string; similarity: number }> | null;
        const m = matches?.[0];
        if (m && m.similarity >= 0.85) vectorHit = { category: m.standardized_category, similarity: m.similarity };
      } catch {
        /* embeddings/RPC missing → skip */
      }
      if (vectorHit) {
        results.push({
          ...a,
          category: vectorHit.category,
          confidence: vectorHit.similarity,
          source: "vector",
          reasoning: `Semantic match (cosine ${vectorHit.similarity.toFixed(2)})`,
          needsReview: vectorHit.similarity < 0.92,
        });
        continue;
      }

      try {
        const ai = await classifyAccount(a.accountDescription, a.accountNumber);
        results.push({
          ...a,
          category: ai.category,
          confidence: ai.confidence,
          source: "ai",
          reasoning: ai.reasoning,
          needsReview: ai.needs_review,
        });
      } catch (e) {
        results.push({
          ...a,
          category: "Other",
          confidence: 0.1,
          source: "ai",
          reasoning: `AI failed: ${e instanceof Error ? e.message : String(e)}`,
          needsReview: true,
        });
      }
    }
    return { companyId, results };
  });

export const saveClassifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SaveInput.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { embedText, toVectorLiteral } = await import("./ai.server");
    const { normalizeDescription } = await import("./categories");

    const { data: mem } = await supabaseAdmin
      .from("company_members").select("company_id").eq("user_id", userId).maybeSingle();
    const companyId = mem?.company_id;
    if (!companyId) throw new Error("No company found for user");

    let saved = 0;
    let learned = 0;
    for (const r of data.rows) {
      const norm = normalizeDescription(r.accountDescription);

      let embeddingLiteral: string | null = null;
      try {
        const emb = await embedText(r.accountDescription);
        embeddingLiteral = toVectorLiteral(emb);
      } catch {
        /* ignore — embedding optional */
      }
      const { error } = await supabaseAdmin.from("gl_mappings").upsert(
        {
          company_id: companyId,
          account_number: r.accountNumber,
          account_description: r.accountDescription,
          normalized_description: norm,
          standardized_category: r.category,
          confidence: r.confidence,
          needs_review: false,
          approved: true,
          source: r.wasCorrected ? "human" : "llm",
          embedding: embeddingLiteral,
          approved_by: userId,
          approved_at: new Date().toISOString(),
        } as never,
        { onConflict: "company_id,normalized_description" } as never,
      );
      if (!error) saved++;

      if (r.wasCorrected && r.suggestedCategory) {
        await supabaseAdmin.from("classification_feedback").insert({
          company_id: companyId,
          account_description: r.accountDescription,
          normalized_description: norm,
          suggested_category: r.suggestedCategory,
          corrected_category: r.category,
          embedding: embeddingLiteral,
          created_by: userId,
        } as never);
        learned++;
      }
    }
    return { saved, learned };
  });

export const getMappingsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mem } = await supabaseAdmin
      .from("company_members").select("company_id").eq("user_id", userId).maybeSingle();
    const companyId = mem?.company_id;
    if (!companyId) return { total: 0, byCategory: {} as Record<string, number> };
    const { data } = await supabaseAdmin
      .from("gl_mappings").select("standardized_category").eq("company_id", companyId);
    const byCategory: Record<string, number> = {};
    for (const r of (data ?? []) as Array<{ standardized_category: string }>) {
      byCategory[r.standardized_category] = (byCategory[r.standardized_category] ?? 0) + 1;
    }
    return { total: data?.length ?? 0, byCategory };
  });

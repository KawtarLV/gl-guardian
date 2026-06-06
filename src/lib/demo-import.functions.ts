import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InvoiceRowSchema = z.object({
  amount: z.number(),
  invoiceDate: z.string(),
  dueDate: z.string().nullable(),
  customerName: z.string().nullable(),
  description: z.string().nullable(),
});
const PreviewInput = z.object({
  invoices: z.array(InvoiceRowSchema).min(1).max(5000),
  filename: z.string().nullable().optional(),
});

function inferType(name: string): "small_repair" | "commercial" | "housing_corp" | "unknown" {
  const n = name.toLowerCase();
  if (/woningstichting|woningcorporatie|woningbouw|housing/.test(n)) return "housing_corp";
  if (/\b(bv|b\.v\.|nv|n\.v\.|gmbh|ltd|inc|holding)\b/.test(n)) return "commercial";
  if (/particulier|dhr\.|mevr\.|familie|fam\./.test(n)) return "small_repair";
  return "unknown";
}

export const previewImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PreviewInput.parse(d))
  .handler(async ({ data }) => {
    const customers = new Map<string, { name: string; type: string; invoiceCount: number; total: number }>();
    for (const inv of data.invoices) {
      const name = inv.customerName?.trim() || "Unknown";
      const key = name.toLowerCase();
      const c = customers.get(key) ?? { name, type: inferType(name), invoiceCount: 0, total: 0 };
      c.invoiceCount += 1;
      c.total += inv.amount;
      customers.set(key, c);
    }
    return {
      customerCount: customers.size,
      invoiceCount: data.invoices.length,
      totalAmount: data.invoices.reduce((a, b) => a + b.amount, 0),
      customers: Array.from(customers.values()).sort((a, b) => b.total - a.total).slice(0, 20),
    };
  });

export const commitImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PreviewInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { CUSTOMER_TYPE_DEFAULT_LAG } = await import("./categories");

    const { data: mem } = await supabaseAdmin
      .from("company_members").select("company_id").eq("user_id", userId).maybeSingle();
    const companyId = mem?.company_id;
    if (!companyId) throw new Error("No company found for user");

    const { data: upload } = await supabaseAdmin
      .from("file_uploads")
      .insert({
        company_id: companyId,
        filename: data.filename ?? "invoice import",
        file_structure: "invoice_import",
        total_rows: data.invoices.length,
        parsed_rows: data.invoices.length,
        failed_rows: 0,
        parse_quality_score: 100,
        column_map: [],
        warnings: [],
        status: "imported",
        uploaded_by: userId,
      } as never)
      .select("id")
      .single();

    await supabaseAdmin
      .from("invoices")
      .delete()
      .eq("company_id", companyId)
      .is("project_id", null)
      .is("milestone_id", null);

    // Upsert customers
    const customerIds = new Map<string, string>();
    const uniqueCustomers = new Map<string, string>();
    for (const inv of data.invoices) {
      const name = (inv.customerName?.trim() || "Unknown");
      uniqueCustomers.set(name.toLowerCase(), name);
    }
    for (const [key, name] of uniqueCustomers) {
      const type = inferType(name);
      const lag = CUSTOMER_TYPE_DEFAULT_LAG[type] ?? 30;
      // Try select
      const { data: existing } = await supabaseAdmin
        .from("customers").select("id").eq("company_id", companyId).eq("name", name).maybeSingle();
      if (existing?.id) {
        customerIds.set(key, existing.id);
        continue;
      }
      const { data: ins } = await supabaseAdmin
        .from("customers").insert({
          company_id: companyId, name, customer_type: type, avg_payment_lag_days: lag,
        } as never).select("id").single();
      if (ins?.id) customerIds.set(key, ins.id);
    }

    // Insert invoices
    const invoiceRows = data.invoices.map((inv, index) => {
      const name = (inv.customerName?.trim() || "Unknown");
      return {
        company_id: companyId,
        customer_id: customerIds.get(name.toLowerCase()) ?? null,
        amount: inv.amount,
        invoice_date: inv.invoiceDate,
        due_date: inv.dueDate,
        status: "open",
        external_ref: upload?.id ? `upload:${upload.id}:${index + 1}` : null,
      };
    });
    const { error: invErr } = await supabaseAdmin.from("invoices").insert(invoiceRows as never);
    if (invErr) throw new Error(invErr.message);

    return {
      customers: customerIds.size,
      invoices: invoiceRows.length,
    };
  });

const JournalRowSchema = z.object({
  rekening: z.string(),
  trek: z.string().nullable(),
  datum: z.string(),
  amount: z.number(),
  description: z.string(),
});
const JournalInput = z.object({
  rows: z.array(JournalRowSchema).min(1).max(20000),
});

export const previewJournalImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => JournalInput.parse(d))
  .handler(async ({ data }) => {
    const accounts = new Map<string, { rekening: string; postings: number; net: number }>();
    const customers = new Map<string, { name: string; trek: string | null; postings: number; net: number }>();
    for (const r of data.rows) {
      const a = accounts.get(r.rekening) ?? { rekening: r.rekening, postings: 0, net: 0 };
      a.postings += 1; a.net += r.amount; accounts.set(r.rekening, a);
      const key = r.trek ?? `__text:${r.description.slice(0, 30)}`;
      const name = r.trek ? `Klant ${r.trek}` : (r.description.slice(0, 40) || "Onbekend");
      const c = customers.get(key) ?? { name, trek: r.trek, postings: 0, net: 0 };
      c.postings += 1; c.net += r.amount; customers.set(key, c);
    }
    return {
      postings: data.rows.length,
      accounts: Array.from(accounts.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
      customerCount: customers.size,
      net: data.rows.reduce((a, b) => a + b.amount, 0),
      customers: Array.from(customers.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 30),
    };
  });

export const commitJournalImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => JournalInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { CUSTOMER_TYPE_DEFAULT_LAG, normalizeDescription } = await import("./categories");

    const { data: mem } = await supabaseAdmin
      .from("company_members").select("company_id").eq("user_id", userId).maybeSingle();
    const companyId = mem?.company_id;
    if (!companyId) throw new Error("No company found for user");

    // Upsert one synthetic customer per unique trek (or per fallback name).
    const customerKey = (r: { trek: string | null; description: string }) =>
      r.trek ? `trek:${r.trek}` : `text:${r.description.slice(0, 30).toLowerCase()}`;
    const customerName = (r: { trek: string | null; description: string }) =>
      r.trek ? `Klant ${r.trek}` : (r.description.slice(0, 40) || "Onbekend");

    const uniqueCustomers = new Map<string, string>();
    for (const r of data.rows) uniqueCustomers.set(customerKey(r), customerName(r));

    const customerIds = new Map<string, string>();
    for (const [key, name] of uniqueCustomers) {
      const { data: existing } = await supabaseAdmin
        .from("customers").select("id").eq("company_id", companyId).eq("name", name).maybeSingle();
      if (existing?.id) { customerIds.set(key, existing.id); continue; }
      const { data: ins } = await supabaseAdmin
        .from("customers").insert({
          company_id: companyId,
          name,
          customer_type: "unknown",
          avg_payment_lag_days: CUSTOMER_TYPE_DEFAULT_LAG.unknown ?? 30,
        } as never).select("id").single();
      if (ins?.id) customerIds.set(key, ins.id);
    }

    // Insert synthetic invoices: due_date = datum + 30d.
    const invoiceRows = data.rows.map((r) => {
      const due = new Date(r.datum);
      due.setDate(due.getDate() + 30);
      return {
        company_id: companyId,
        customer_id: customerIds.get(customerKey(r)) ?? null,
        amount: r.amount,
        invoice_date: r.datum,
        due_date: due.toISOString().slice(0, 10),
        status: "open",
      };
    });
    const { error: invErr } = await supabaseAdmin.from("invoices").insert(invoiceRows as never);
    if (invErr) throw new Error(invErr.message);

    // Seed a GL mapping per unique rekening (default to Revenue when net credit).
    const accounts = new Map<string, { net: number; count: number }>();
    for (const r of data.rows) {
      const a = accounts.get(r.rekening) ?? { net: 0, count: 0 };
      a.net += r.amount; a.count += 1; accounts.set(r.rekening, a);
    }
    let mappings = 0;
    for (const [rek, agg] of accounts) {
      const desc = `Account ${rek}`;
      const norm = normalizeDescription(desc);
      const category = agg.net > 0 ? "Revenue" : "Other Operating Expenses";
      const { error } = await supabaseAdmin.from("gl_mappings").upsert(
        {
          company_id: companyId,
          account_number: rek,
          account_description: desc,
          normalized_description: norm,
          standardized_category: category,
          confidence: 0.6,
          needs_review: true,
          approved: false,
          source: "heuristic",
          approved_by: userId,
          approved_at: new Date().toISOString(),
        } as never,
        { onConflict: "company_id,normalized_description" } as never,
      );
      if (!error) mappings += 1;
    }

    return {
      customers: customerIds.size,
      invoices: invoiceRows.length,
      mappings,
    };
  });


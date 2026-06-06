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
    const invoiceRows = data.invoices.map((inv) => {
      const name = (inv.customerName?.trim() || "Unknown");
      return {
        company_id: companyId,
        customer_id: customerIds.get(name.toLowerCase()) ?? null,
        amount: inv.amount,
        invoice_date: inv.invoiceDate,
        due_date: inv.dueDate,
        description: inv.description,
        status: "open",
      };
    });
    const { error: invErr } = await supabaseAdmin.from("invoices").insert(invoiceRows as never);
    if (invErr) throw new Error(invErr.message);

    return {
      customers: customerIds.size,
      invoices: invoiceRows.length,
    };
  });

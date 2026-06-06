import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CopilotInput = z.object({
  question: z.string().min(1).max(2000),
});

async function loadCompanyId(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: mem } = await supabaseAdmin
    .from("company_members").select("company_id").eq("user_id", userId).maybeSingle();
  if (!mem?.company_id) throw new Error("No company found for user");
  return mem.company_id;
}

export const runForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchWeather13Weeks } = await import("./weather.server");
    const { runForecast: engine } = await import("./forecast-engine");

    const companyId = await loadCompanyId(userId);

    const [invR, payR, custR, projR, milR] = await Promise.all([
      supabaseAdmin.from("invoices").select("*").eq("company_id", companyId),
      supabaseAdmin.from("payments").select("*").eq("company_id", companyId),
      supabaseAdmin.from("customers").select("*").eq("company_id", companyId),
      supabaseAdmin.from("projects").select("*").eq("company_id", companyId),
      supabaseAdmin.from("milestones").select("*").eq("company_id", companyId),
    ]);

    const region =
      (projR.data?.[0] as { region?: string | null } | undefined)?.region ?? "amsterdam";
    const weather = await fetchWeather13Weeks(region);

    const invoices = (invR.data ?? []).map((i) => ({
      id: i.id,
      customerId: i.customer_id,
      amount: Number(i.amount),
      invoiceDate: i.invoice_date,
      dueDate: i.due_date,
      status: i.status ?? "open",
      isRecurring: !!i.is_recurring,
      recurrenceType: i.recurrence_type ?? null,
      projectId: i.project_id ?? null,
      milestoneId: i.milestone_id ?? null,
    }));
    const payments = (payR.data ?? []).map((p) => ({
      invoiceId: p.invoice_id, paymentDate: p.payment_date, amount: Number(p.amount),
    }));
    const customers = (custR.data ?? []).map((c) => ({
      id: c.id, name: c.name, customerType: c.customer_type ?? "unknown",
      avgPaymentLagDays: c.avg_payment_lag_days ?? null,
    }));
    const projects = (projR.data ?? []).map((p) => ({
      id: p.id, name: p.name, region: p.region ?? null,
      startDate: p.start_date ?? null, endDate: p.end_date ?? null,
      totalLabourCost: Number(p.total_labour_cost ?? 0),
      customerId: p.customer_id ?? null,
    }));
    const milestones = (milR.data ?? []).map((m) => ({
      id: m.id, projectId: m.project_id, name: m.name,
      plannedDate: m.planned_date, invoiceAmount: Number(m.invoice_amount ?? 0),
    }));

    const weeks = engine({
      startingBalance: 0,
      invoices, payments, customers, projects, milestones, weather,
    });

    for (const w of weeks) {
      if (w.cashIn + w.cashOut > 0 && w.audit.sources.length === 0) {
        throw new Error(`Audit-trail invariant: week ${w.weekNumber} has values without sources`);
      }
    }

    const { data: run, error: runErr } = await supabaseAdmin
      .from("forecast_runs").insert({
        company_id: companyId, created_by: userId, starting_balance: 0,
        notes: `Region: ${region}`,
      } as never).select("id").single();
    if (runErr) throw new Error(`forecast_runs insert failed: ${runErr.message}`);
    if (run?.id) {
      // Clear any prior 'legacy' scenario rows for this company so the unique
      // constraint (company_id, scenario, week_number) doesn't block us.
      await supabaseAdmin
        .from("forecast_weeks")
        .delete()
        .eq("company_id", companyId)
        .eq("scenario", "legacy");

      const rows = weeks.map((w) => ({
        company_id: companyId,
        forecast_run_id: run.id,
        scenario: "legacy",
        week_number: w.weekNumber,
        week_start: w.weekStart,
        cash_in: w.cashIn,
        cash_out: w.cashOut,
        net_cash: w.netCash,
        running_balance: w.runningBalance,
        confidence_score: w.confidenceScore,
        anomaly_flags: w.anomalyFlags,
        audit_json: w.audit as never,
      }));
      const { error: wkErr } = await supabaseAdmin
        .from("forecast_weeks").insert(rows as never);
      if (wkErr) throw new Error(`forecast_weeks insert failed: ${wkErr.message}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return JSON.parse(JSON.stringify({ runId: run?.id ?? null, weeks, weather })) as any;
  });

export const getLatestForecast = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const companyId = await loadCompanyId(userId);
    const { data: run } = await supabaseAdmin
      .from("forecast_runs").select("*").eq("company_id", companyId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!run) return null;
    const { data: weeks } = await supabaseAdmin
      .from("forecast_weeks").select("*").eq("forecast_run_id", run.id)
      .order("week_number", { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return JSON.parse(JSON.stringify({ run, weeks: weeks ?? [] })) as any;
  });

export const getProjectsList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const companyId = await loadCompanyId(userId);
    const [pr, mr, cr] = await Promise.all([
      supabaseAdmin.from("projects").select("*").eq("company_id", companyId),
      supabaseAdmin.from("milestones").select("*").eq("company_id", companyId),
      supabaseAdmin.from("customers").select("id, name").eq("company_id", companyId),
    ]);
    const customers = new Map((cr.data ?? []).map((c) => [c.id, c.name] as const));
    const out = (pr.data ?? []).map((p) => ({
      ...p,
      customerName: p.customer_id ? customers.get(p.customer_id) ?? null : null,
      milestones: (mr.data ?? []).filter((m) => m.project_id === p.id),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return JSON.parse(JSON.stringify(out)) as any;
  });

export const copilotAsk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CopilotInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { chatCompletion } = await import("./ai.server");
    const companyId = await loadCompanyId(userId);

    const { data: run } = await supabaseAdmin
      .from("forecast_runs").select("id").eq("company_id", companyId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!run) return { answer: "Run a forecast first so I have data to reason about." };

    const { data: weeks } = await supabaseAdmin
      .from("forecast_weeks")
      .select("week_number, week_start, cash_in, cash_out, net_cash, running_balance, confidence_score, anomaly_flags, audit_json")
      .eq("forecast_run_id", run.id).order("week_number", { ascending: true });

    const ctx = JSON.stringify(weeks?.slice(0, 13) ?? [], null, 0).slice(0, 12000);
    const system = `You are a finance copilot for a construction company. You have ONE source of data: the JSON array of 13 forecast weeks provided.
Rules:
- Always cite specific week numbers (W1..W13) and source types from audit_json.sources when making any numerical claim.
- Never invent numbers. If the data does not contain the answer, say so.
- Keep responses under 250 words, use short bullet points.`;
    const user = `Forecast data (JSON):\n${ctx}\n\nQuestion: ${data.question}`;
    try {
      const answer = await chatCompletion(system, user, { temperature: 0.2 });
      return { answer };
    } catch (e) {
      return { answer: `AI temporarily unavailable: ${e instanceof Error ? e.message : "unknown"}` };
    }
  });

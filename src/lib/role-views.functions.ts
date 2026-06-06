// Read-only aggregations for role-specific dashboards (PE Board, Opco MD, Project Lead).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const companyInput = z.object({ companyId: z.string().uuid() });

export const getPeBoardData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => companyInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // PE Board sees portfolio: all companies the user is a member of.
    const { data: company } = await supabaseAdmin
      .from("companies").select("id, name, city").eq("id", data.companyId).single();
    const { data: members } = await supabaseAdmin
      .from("company_members").select("company_id").limit(50);
    const companyIds = Array.from(new Set([data.companyId, ...((members ?? []).map((m) => m.company_id))]));
    const { data: companies } = await supabaseAdmin
      .from("companies").select("id, name, city").in("id", companyIds);
    const { data: forecasts } = await supabaseAdmin
      .from("forecast_weeks")
      .select("company_id, week_number, cash_in, cash_out, net_cash, running_balance, covenant_status")
      .in("company_id", companyIds).eq("scenario", "base").order("week_number");
    const { data: covenants } = await supabaseAdmin
      .from("covenants").select("*").in("company_id", companyIds);
    const { data: projects } = await supabaseAdmin
      .from("projects").select("company_id, total_value, wip_amount, status").in("company_id", companyIds);
    return { current: company, companies: companies ?? [], forecasts: forecasts ?? [], covenants: covenants ?? [], projects: projects ?? [] };
  });

export const getOpcoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => companyInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: projects } = await supabaseAdmin
      .from("projects")
      .select("id, name, client_name, client_type, region, city, status, total_value, wip_amount, total_labour_cost, total_materials_cost, weather_sensitive, start_date, end_date")
      .eq("company_id", data.companyId);
    const { data: milestones } = await supabaseAdmin
      .from("milestones")
      .select("id, project_id, name, planned_date, shifted_date, invoice_amount, days_delayed, invoiced, paid, delay_reason")
      .eq("company_id", data.companyId);
    const { data: weeks } = await supabaseAdmin
      .from("forecast_weeks")
      .select("week_number, week_start, rain_mm, lost_days, is_frost, driver_weather_impact")
      .eq("company_id", data.companyId).eq("scenario", "base").order("week_number");
    return { projects: projects ?? [], milestones: milestones ?? [], weeks: weeks ?? [] };
  });

const projectInput = z.object({ companyId: z.string().uuid(), projectId: z.string().uuid().optional() });

export const getProjectLeadData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => projectInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: projects } = await supabaseAdmin
      .from("projects")
      .select("id, name, client_name, client_type, region, city, status, total_value, wip_amount, total_labour_cost, total_materials_cost, start_date, end_date")
      .eq("company_id", data.companyId).order("start_date", { ascending: false });
    const pickId = data.projectId ?? projects?.[0]?.id ?? null;
    const { data: milestones } = pickId
      ? await supabaseAdmin.from("milestones")
          .select("*").eq("project_id", pickId).order("planned_date")
      : { data: [] };
    return { projects: projects ?? [], selectedId: pickId, milestones: milestones ?? [] };
  });

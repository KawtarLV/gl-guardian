// Deterministic 13-week cash flow forecast engine with scenarios + 5 drivers.
// All financial math is pure (no AI). Weather is real (Open-Meteo) with a historical fallback.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type Scenario = "base" | "wet" | "dry";

const PAYMENT_LAG_DEFAULTS: Record<string, number> = {
  housing_corp: 55,
  commercial: 35,
  government: 45,
  repair: 18,
  unknown: 30,
};

const SEASONAL_INDEX: Record<string, number> = {
  "01": 0.30, "02": 0.35, "03": 0.78, "04": 0.82,
  "05": 0.88, "06": 0.95, "07": 1.40, "08": 0.32,
  "09": 0.95, "10": 1.10, "11": 0.78, "12": 0.85,
};

const MONTHLY_AVG_RAIN: Record<string, number> = {
  "01": 18, "02": 15, "03": 14, "04": 12,
  "05": 13, "06": 14, "07": 12, "08": 13,
  "09": 16, "10": 20, "11": 22, "12": 20,
};

function getLostDays(rainMm: number, isFrost: boolean): number {
  if (isFrost) return 5;
  if (rainMm > 50) return 5;
  if (rainMm > 30) return 2;
  if (rainMm > 15) return 1;
  return 0;
}

function scenarioRainModifier(s: Scenario): number {
  if (s === "wet") return 20;
  if (s === "dry") return -15;
  return 0;
}

type WeeklyWeather = { rain_mm: number; min_temp: number; lost_days: number; is_frost: boolean };

async function fetchWeather(lat: number, lon: number, weeks: number): Promise<WeeklyWeather[]> {
  const days = Math.min(weeks * 7, 14);
  let realDays = 0;
  let real: WeeklyWeather[] = [];
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum,temperature_2m_min&forecast_days=${days}&timezone=Europe%2FAmsterdam`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json() as { daily: { precipitation_sum: number[]; temperature_2m_min: number[] } };
      const precip = data.daily.precipitation_sum;
      const temps = data.daily.temperature_2m_min;
      realDays = Math.min(precip.length, days);
      const fullWeeks = Math.floor(realDays / 7);
      for (let w = 0; w < fullWeeks; w++) {
        const start = w * 7;
        const end = start + 7;
        const rainMm = precip.slice(start, end).reduce((s, v) => s + (v || 0), 0);
        const minTemp = Math.min(...temps.slice(start, end).filter((v) => v != null));
        const isFrost = minTemp < 2;
        real.push({ rain_mm: Math.round(rainMm * 10) / 10, min_temp: minTemp, lost_days: getLostDays(rainMm, isFrost), is_frost: isFrost });
      }
    }
  } catch {
    // fall through to historical
  }

  const out: WeeklyWeather[] = [...real];
  const today = new Date();
  for (let w = real.length; w < weeks; w++) {
    const d = new Date(today);
    d.setDate(d.getDate() + w * 7);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const rainMm = MONTHLY_AVG_RAIN[month] ?? 15;
    out.push({ rain_mm: rainMm, min_temp: 8, lost_days: getLostDays(rainMm, false), is_frost: false });
  }
  return out;
}

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

const recomputeInput = z.object({
  companyId: z.string().uuid(),
  scenario: z.enum(["base", "wet", "dry"]).default("base"),
});

export const recomputeForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recomputeInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { companyId, scenario } = data;

    const [companyRes, milestonesRes, customersRes, covenantsRes, monthlyRes] = await Promise.all([
      supabaseAdmin.from("companies").select("*").eq("id", companyId).single(),
      supabaseAdmin.from("milestones").select("*, projects(*)").eq("company_id", companyId).eq("invoiced", false),
      supabaseAdmin.from("customers").select("*").eq("company_id", companyId),
      supabaseAdmin.from("covenants").select("*").eq("company_id", companyId),
      supabaseAdmin.from("monthly_summaries").select("*").eq("company_id", companyId),
    ]);

    const company = companyRes.data as { latitude?: number; longitude?: number } | null;
    const milestones = (milestonesRes.data ?? []) as Array<Record<string, unknown> & { projects?: Record<string, unknown> | null }>;
    const customers = (customersRes.data ?? []) as Array<Record<string, unknown>>;
    const covenants = (covenantsRes.data ?? []) as Array<Record<string, unknown>>;
    const monthly = (monthlyRes.data ?? []) as Array<Record<string, unknown>>;

    const lat = (company?.latitude as number) ?? 52.37;
    const lon = (company?.longitude as number) ?? 4.90;

    const weatherRaw = await fetchWeather(lat, lon, 13);
    const mod = scenarioRainModifier(scenario);
    const weather: WeeklyWeather[] = weatherRaw.map((w) => {
      const r = Math.max(0, w.rain_mm + mod);
      return { ...w, rain_mm: r, lost_days: getLostDays(r, w.is_frost) };
    });

    const avgWeeklyRevenue = monthly.length > 0
      ? monthly.reduce((s, m) => s + Number(m.total_credit ?? 0), 0) / Math.max(monthly.length, 1) / 4.33
      : 85000;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Shift milestones forward based on weather
    type ShiftedMilestone = Record<string, unknown> & {
      projects?: Record<string, unknown> | null;
      _planned: Date; _shifted: Date; _delay: number;
    };
    const shifted: ShiftedMilestone[] = milestones.map((m) => {
      const planned = new Date(m.planned_date as string);
      let totalDelay = 0;
      let current = new Date(planned);
      for (let w = 0; w < 13; w++) {
        const ws = new Date(today); ws.setDate(today.getDate() + w * 7);
        const we = new Date(ws); we.setDate(ws.getDate() + 7);
        if (current >= ws && current < we && weather[w].lost_days > 0) {
          totalDelay += weather[w].lost_days;
          current = new Date(current); current.setDate(current.getDate() + weather[w].lost_days);
        }
      }
      return {
        ...m,
        _planned: planned,
        _shifted: totalDelay > 0 ? current : planned,
        _delay: totalDelay,
      };
    });

    const lagOffsetWeeks = 5;
    const covenant = covenants[0] as { threshold?: number; breach_warning_pct?: number } | undefined;

    const weeks: Array<Record<string, unknown>> = [];
    let runningBalance = 0;

    for (let w = 0; w < 13; w++) {
      const ws = new Date(today); ws.setDate(today.getDate() + w * 7);
      const we = new Date(ws); we.setDate(ws.getDate() + 7);
      const audit: Array<Record<string, unknown>> = [];

      // Driver 1: milestone billing (cash arrives shifted_date + lag, snapped to week)
      let milestoneBilling = 0;
      // Driver 4: payment lag adjustment — invoices issued in earlier week land here
      let paymentLag = 0;
      // Driver 3: subcontractor outflow (shifted + 30d)
      let subPay = 0;
      // Driver 2: materials outflow (planned - 14d, weather-independent)
      let materials = 0;

      for (const m of shifted) {
        const inv = Number(m.invoice_amount ?? 0);
        const mat = Number(m.materials_cost ?? 0);
        const sub = Number(m.subcontractor_cost ?? 0);
        const proj = m.projects as Record<string, unknown> | null;
        const cust = customers.find((c) => c.id === proj?.customer_id);
        const lagDays = (cust?.avg_payment_lag_days as number | null) ?? PAYMENT_LAG_DEFAULTS[(cust?.customer_type as string) ?? "unknown"];

        // Milestone cash-in (invoice -> cash with lag)
        const cashDate = new Date(m._shifted as Date); cashDate.setDate(cashDate.getDate() + Math.round(lagDays));
        if (cashDate >= ws && cashDate < we) {
          milestoneBilling += inv;
          audit.push({
            driver: "milestone_billing",
            amount: inv,
            project: proj?.name,
            milestone: m.name,
            planned_date: ymd(m._planned as Date),
            shifted_date: ymd(m._shifted as Date),
            days_delayed: m._delay,
            payment_lag_days: lagDays,
            customer: cust?.name ?? "unknown",
            customer_type: cust?.customer_type ?? "unknown",
          });
        }

        // Materials (planned - 14d)
        const matDate = new Date(m._planned as Date); matDate.setDate(matDate.getDate() - 14);
        if (matDate >= ws && matDate < we && mat > 0) {
          materials += mat;
          audit.push({
            driver: "materials_outflow", amount: -mat,
            project: proj?.name, milestone: m.name,
            note: "Ordered 14 days before planned milestone",
          });
        }

        // Subcontractor (shifted + 30d)
        const subDate = new Date(m._shifted as Date); subDate.setDate(subDate.getDate() + 30);
        if (subDate >= ws && subDate < we && sub > 0) {
          subPay += sub;
          audit.push({
            driver: "subcontractor_payment", amount: -sub,
            project: proj?.name, milestone: m.name,
            note: "30 days after shifted milestone completion",
          });
        }
      }

      // Driver 4 (payment lag adjustment) — show timing impact of historical invoices already issued
      // For visualization: represent the "extra" cash coming in this week due to lag chain
      // Implemented as 0 here (already captured by milestoneBilling cash-in date)
      paymentLag = 0;

      // Driver 5: weather impact (labour partly paid during rain)
      let weatherImpact = 0;
      if (weather[w].lost_days > 0) {
        const activeProjs = new Set<string>();
        for (const m of shifted) {
          const proj = m.projects as Record<string, unknown> | null;
          if (!proj) continue;
          const start = new Date((proj.start_date as string) ?? today);
          const end = new Date((proj.end_date as string) ?? today);
          if (ws >= start && ws <= end) activeProjs.add(proj.id as string);
        }
        let weeklyLabour = 0;
        for (const m of shifted) {
          const proj = m.projects as Record<string, unknown> | null;
          if (!proj || !activeProjs.has(proj.id as string)) continue;
          const total = Number(proj.total_labour_cost ?? 0);
          const start = new Date((proj.start_date as string) ?? today);
          const end = new Date((proj.end_date as string) ?? today);
          const wks = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (7 * 86400000)));
          weeklyLabour += total / wks;
        }
        const counted = new Set<string>();
        // Avoid double counting via milestone loop above — recompute from unique projects:
        weeklyLabour = 0;
        for (const pid of activeProjs) {
          const m = shifted.find((x) => (x.projects as Record<string, unknown> | null)?.id === pid);
          const proj = m?.projects as Record<string, unknown> | null;
          if (!proj || counted.has(pid)) continue;
          counted.add(pid);
          const total = Number(proj.total_labour_cost ?? 0);
          const start = new Date((proj.start_date as string) ?? today);
          const end = new Date((proj.end_date as string) ?? today);
          const wks = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (7 * 86400000)));
          weeklyLabour += total / wks;
        }
        weatherImpact = -(weeklyLabour * 0.4);
        audit.push({
          driver: "weather_impact",
          amount: weatherImpact,
          rain_mm: weather[w].rain_mm,
          lost_days: weather[w].lost_days,
          is_frost: weather[w].is_frost,
          active_projects: activeProjs.size,
          note: `${weather[w].lost_days} days lost — 40% labour still paid`,
        });
      }

      // Seasonal fallback when no milestones land this week
      const month = String(ws.getMonth() + 1).padStart(2, "0");
      const seasonal = milestoneBilling === 0
        ? Math.round(avgWeeklyRevenue * (SEASONAL_INDEX[month] ?? 1.0))
        : 0;
      if (seasonal > 0) {
        audit.push({
          driver: "seasonal_baseline", amount: seasonal, month,
          seasonal_index: SEASONAL_INDEX[month], avg_weekly_revenue: Math.round(avgWeeklyRevenue),
          note: "No milestone billing this week — seasonal average",
        });
      }

      const cashIn = milestoneBilling + paymentLag + seasonal;
      const cashOut = materials + subPay + Math.abs(weatherImpact);
      const net = cashIn - cashOut;
      runningBalance += net;

      const headroom = covenant?.threshold != null ? runningBalance - Number(covenant.threshold) : null;
      const warnPct = Number(covenant?.breach_warning_pct ?? 20);
      const status: "green" | "amber" | "red" = headroom == null
        ? "green"
        : headroom < 0 ? "red"
        : headroom < Number(covenant!.threshold) * (warnPct / 100) ? "amber"
        : "green";

      weeks.push({
        company_id: companyId,
        scenario,
        week_number: w + 1,
        week_start: ymd(ws),
        week_end: ymd(we),
        driver_milestone_billing: Math.round(milestoneBilling),
        driver_materials_outflow: Math.round(materials),
        driver_subcontractor_payments: Math.round(subPay),
        driver_payment_lag_adjustment: Math.round(paymentLag),
        driver_weather_impact: Math.round(Math.abs(weatherImpact)),
        cash_in: Math.round(cashIn),
        cash_out: Math.round(cashOut),
        net_cash: Math.round(net),
        running_balance: Math.round(runningBalance),
        covenant_headroom: headroom != null ? Math.round(headroom) : null,
        covenant_status: status,
        rain_mm: weather[w].rain_mm,
        lost_days: weather[w].lost_days,
        is_frost: weather[w].is_frost,
        confidence_score: w < 2 ? 0.95 : w < 5 ? 0.85 : w < 9 ? 0.70 : 0.50,
        audit_json: { components: audit, scenario, generated_at: new Date().toISOString() },
        anomaly_flags: [],
      });
    }

    // Wipe + insert for (company, scenario)
    await supabaseAdmin.from("forecast_weeks")
      .delete().eq("company_id", companyId).eq("scenario", scenario);
    const { error } = await supabaseAdmin.from("forecast_weeks").insert(weeks as never);
    if (error) throw new Error(error.message);

    return { ok: true, weekCount: weeks.length };
  });

const getInput = z.object({
  companyId: z.string().uuid(),
  scenario: z.enum(["base", "wet", "dry"]).default("base"),
});

export const getForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => getInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: weeks } = await supabaseAdmin
      .from("forecast_weeks")
      .select("*")
      .eq("company_id", data.companyId)
      .eq("scenario", data.scenario)
      .order("week_number");
    const { data: covenants } = await supabaseAdmin
      .from("covenants").select("*").eq("company_id", data.companyId);
    return { weeks: weeks ?? [], covenants: covenants ?? [] };
  });

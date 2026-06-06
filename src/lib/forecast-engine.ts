// Deterministic 13-week cash flow forecast engine.
// Pure functions only — no AI calls, no Math.random. AI overlays are passed in separately.

import { SEASONAL_INDEX, CUSTOMER_TYPE_DEFAULT_LAG } from "./categories";
import type { WeeklyWeather } from "./weather.server";

export interface Invoice {
  id: string;
  customerId: string | null;
  amount: number;
  invoiceDate: string; // YYYY-MM-DD
  dueDate: string | null;
  status: string;
  isRecurring: boolean;
  recurrenceType: string | null;
  projectId: string | null;
  milestoneId: string | null;
}
export interface Payment { invoiceId: string; paymentDate: string; amount: number; }
export interface Customer {
  id: string;
  name: string;
  customerType: string;
  avgPaymentLagDays: number | null;
}
export interface Project {
  id: string;
  name: string;
  region: string | null;
  startDate: string | null;
  endDate: string | null;
  totalLabourCost: number;
  customerId: string | null;
}
export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  plannedDate: string;
  invoiceAmount: number;
}

export interface AuditEntry {
  type: string;
  description: string;
  amount: number;
  sourceId?: string;
  meta?: Record<string, unknown>;
}

export interface ForecastWeek {
  weekNumber: number;
  weekStart: string;
  cashIn: number;
  cashOut: number;
  netCash: number;
  runningBalance: number;
  confidenceScore: number;
  anomalyFlags: string[];
  audit: { sources: AuditEntry[]; weather: WeeklyWeather };
}

export interface ForecastInput {
  startingBalance: number;
  invoices: Invoice[];
  payments: Payment[];
  customers: Customer[];
  projects: Project[];
  milestones: Milestone[];
  weather: WeeklyWeather[]; // length 13
  // Optional learned baselines (per "MM" → avg monthly revenue from GL summaries)
  monthRevenue?: Map<string, number>;
  // AI overlays (advisory)
  aiPaymentLag?: Map<string, { lagDays: number; confidence: number }>; // by customerId
  aiProjectRisk?: Map<string, { riskScore: number }>; // by projectId
}

function mondayOf(d: Date): Date {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  const m = new Date(d);
  m.setUTCDate(d.getUTCDate() - diff);
  m.setUTCHours(0, 0, 0, 0);
  return m;
}
function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(s: string, n: number): string {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}
function weekIndexFor(date: string, weekStarts: string[]): number {
  for (let i = 0; i < weekStarts.length; i++) {
    const start = weekStarts[i];
    const end = addDays(start, 7);
    if (date >= start && date < end) return i;
  }
  return -1;
}

function avgLagForCustomer(c: Customer | undefined, invoices: Invoice[], payments: Payment[], aiOverlay?: { lagDays: number; confidence: number }): number {
  if (aiOverlay && aiOverlay.confidence > 0.8) return aiOverlay.lagDays;
  if (c?.avgPaymentLagDays && c.avgPaymentLagDays > 0) return c.avgPaymentLagDays;
  if (c) {
    // Compute from history
    const ids = new Set(invoices.filter(i => i.customerId === c.id).map(i => i.id));
    const lags: number[] = [];
    for (const p of payments) {
      if (!ids.has(p.invoiceId)) continue;
      const inv = invoices.find(i => i.id === p.invoiceId);
      if (!inv) continue;
      const lag = (new Date(p.paymentDate).getTime() - new Date(inv.invoiceDate).getTime()) / 86400000;
      if (lag > 0 && lag < 365) lags.push(lag);
    }
    if (lags.length >= 3) return Math.round(lags.reduce((a, b) => a + b, 0) / lags.length);
  }
  return CUSTOMER_TYPE_DEFAULT_LAG[c?.customerType ?? "unknown"] ?? 30;
}

function detectRecurringFromHistory(invoices: Invoice[]): Map<string, { amount: number; intervalWeeks: number }> {
  // Group by customer + amount; if seen >= 3 times with ~30-day cadence → monthly
  const groups = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    if (!inv.customerId) continue;
    const key = `${inv.customerId}::${Math.round(inv.amount)}`;
    const arr = groups.get(key) ?? [];
    arr.push(inv);
    groups.set(key, arr);
  }
  const result = new Map<string, { amount: number; intervalWeeks: number }>();
  for (const [key, arr] of groups) {
    if (arr.length < 3) continue;
    const sorted = arr.slice().sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const g = (new Date(sorted[i].invoiceDate).getTime() - new Date(sorted[i-1].invoiceDate).getTime()) / 86400000;
      gaps.push(g);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (avgGap >= 25 && avgGap <= 35) {
      result.set(key, { amount: sorted[0].amount, intervalWeeks: 4 });
    } else if (avgGap >= 84 && avgGap <= 100) {
      result.set(key, { amount: sorted[0].amount, intervalWeeks: 13 });
    }
  }
  return result;
}

export function runForecast(input: ForecastInput): ForecastWeek[] {
  const today = mondayOf(new Date());
  const weekStarts: string[] = [];
  for (let i = 0; i < 13; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() + i * 7);
    weekStarts.push(ymd(d));
  }

  const customerById = new Map(input.customers.map(c => [c.id, c]));
  const weeks: ForecastWeek[] = weekStarts.map((ws, i) => ({
    weekNumber: i + 1,
    weekStart: ws,
    cashIn: 0,
    cashOut: 0,
    netCash: 0,
    runningBalance: 0,
    confidenceScore: 0,
    anomalyFlags: [],
    audit: { sources: [], weather: input.weather[i] },
  }));

  // ---- Revenue source A: existing OPEN invoices → cash in at invoiceDate + lag
  for (const inv of input.invoices) {
    if (inv.status === "paid") continue;
    const c = inv.customerId ? customerById.get(inv.customerId) : undefined;
    const overlay = inv.customerId ? input.aiPaymentLag?.get(inv.customerId) : undefined;
    const lag = avgLagForCustomer(c, input.invoices, input.payments, overlay);
    const cashDate = addDays(inv.invoiceDate, lag);
    const w = weekIndexFor(cashDate, weekStarts);
    if (w >= 0) {
      weeks[w].cashIn += inv.amount;
      weeks[w].audit.sources.push({
        type: "invoice_payment",
        description: `Invoice from ${c?.name ?? "unknown customer"} (${inv.invoiceDate}) expected paid ${cashDate} (lag ${lag}d)`,
        amount: inv.amount,
        sourceId: inv.id,
        meta: { customerId: inv.customerId, lag, lagSource: overlay && overlay.confidence > 0.8 ? "ai" : "historical" },
      });
    }
  }

  // ---- Revenue source A.2: recurring detection — project forward
  const recurring = detectRecurringFromHistory(input.invoices);
  for (const [key, r] of recurring) {
    const [customerId] = key.split("::");
    const c = customerById.get(customerId);
    const lag = avgLagForCustomer(c, input.invoices, input.payments, input.aiPaymentLag?.get(customerId));
    // Find last seen
    const last = input.invoices
      .filter(i => i.customerId === customerId && Math.round(i.amount) === Math.round(r.amount))
      .map(i => i.invoiceDate).sort().pop();
    if (!last) continue;
    let next = addDays(last, r.intervalWeeks * 7);
    for (let step = 0; step < 4; step++) {
      const cashDate = addDays(next, lag);
      const w = weekIndexFor(cashDate, weekStarts);
      if (w >= 0) {
        weeks[w].cashIn += r.amount;
        weeks[w].audit.sources.push({
          type: "recurring_invoice",
          description: `Projected recurring invoice from ${c?.name ?? "customer"} (every ${r.intervalWeeks}w)`,
          amount: r.amount,
          meta: { customerId, intervalWeeks: r.intervalWeeks },
        });
      }
      next = addDays(next, r.intervalWeeks * 7);
    }
  }

  // ---- Revenue source B: milestones → produce future invoice → cash in
  for (const m of input.milestones) {
    const project = input.projects.find(p => p.id === m.projectId);
    const c = project?.customerId ? customerById.get(project.customerId) : undefined;
    const overlay = project?.customerId ? input.aiPaymentLag?.get(project.customerId) : undefined;
    const lag = avgLagForCustomer(c, input.invoices, input.payments, overlay);
    // Apply weather shift: total lostDays for weeks between today and milestone
    let shifted = m.plannedDate;
    let mWeek = weekIndexFor(shifted, weekStarts);
    if (mWeek >= 0) {
      const lost = input.weather.slice(0, mWeek + 1).reduce((a, w) => a + w.lostDays, 0);
      if (lost > 0) shifted = addDays(shifted, lost);
      mWeek = weekIndexFor(shifted, weekStarts);
    }
    const invDate = shifted;
    const cashDate = addDays(invDate, lag);
    const cashW = weekIndexFor(cashDate, weekStarts);
    if (cashW >= 0 && m.invoiceAmount > 0) {
      weeks[cashW].cashIn += m.invoiceAmount;
      weeks[cashW].audit.sources.push({
        type: "milestone_invoice",
        description: `Milestone "${m.name}" of project ${project?.name ?? ""} → invoice ${invDate}, paid ${cashDate}`,
        amount: m.invoiceAmount,
        sourceId: m.id,
        meta: { plannedDate: m.plannedDate, shiftedDate: shifted, lag },
      });
    }

    // Materials: 23% of milestone, ordered 2 weeks before SHIFTED milestone (fixed regardless of additional shifts)
    const matDate = addDays(shifted, -14);
    const matW = weekIndexFor(matDate, weekStarts);
    const matCost = m.invoiceAmount * 0.23;
    if (matW >= 0 && matCost > 0) {
      weeks[matW].cashOut += matCost;
      weeks[matW].audit.sources.push({
        type: "materials",
        description: `Materials for milestone "${m.name}" (23% of €${m.invoiceAmount.toFixed(0)})`,
        amount: -matCost,
        meta: { milestoneId: m.id },
      });
    }
  }

  // ---- Revenue source C: seasonal fallback for weeks beyond observed signal.
  // Prefer per-month revenue learned from uploaded GL monthly_summaries; if
  // unavailable, fall back to a trailing weekly average from invoice history
  // scaled by the static SEASONAL_INDEX.
  const historyTotals = input.invoices
    .filter(i => i.invoiceDate < weekStarts[0])
    .map(i => i.amount);
  const weeklyAvgHistory = historyTotals.length > 0
    ? historyTotals.reduce((a, b) => a + b, 0) / Math.max(1, Math.ceil(historyTotals.length / 4))
    : 0;
  for (let i = 0; i < 13; i++) {
    if (weeks[i].cashIn > 0) continue; // only fill if no observed signal
    const d = new Date(weekStarts[i] + "T00:00:00Z");
    const monthNum = d.getUTCMonth() + 1;
    const mm = String(monthNum).padStart(2, "0");
    const learnedMonthly = input.monthRevenue?.get(mm) ?? 0;
    let seasonal = 0;
    let basis = "";
    if (learnedMonthly > 0) {
      // 30.44 avg days/month → ÷ 4.348 to weekly
      seasonal = learnedMonthly / 4.348;
      basis = `learned monthly avg €${learnedMonthly.toFixed(0)} (month ${mm}) → €${seasonal.toFixed(0)}/wk`;
    } else if (weeklyAvgHistory > 0) {
      const idx = SEASONAL_INDEX[monthNum] ?? 1;
      seasonal = weeklyAvgHistory * idx;
      basis = `invoice history avg €${weeklyAvgHistory.toFixed(0)}/wk × seasonal index ${idx}`;
    }
    if (seasonal > 0) {
      weeks[i].cashIn += seasonal;
      weeks[i].audit.sources.push({
        type: "seasonal_revenue",
        description: `Seasonal fallback — ${basis}`,
        amount: seasonal,
        meta: { month: monthNum, learnedMonthly, weeklyAvgHistory },
      });
    }
  }

  // ---- Labour: spread evenly across project duration, rain weeks × 0.6
  for (const p of input.projects) {
    if (!p.startDate || !p.endDate || p.totalLabourCost <= 0) continue;
    const start = new Date(p.startDate);
    const end = new Date(p.endDate);
    const totalWeeks = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (7 * 86400000)));
    const baseWeekly = p.totalLabourCost / totalWeeks;
    for (let i = 0; i < 13; i++) {
      const ws = new Date(weekStarts[i] + "T00:00:00Z");
      if (ws < start || ws > end) continue;
      const rain = input.weather[i].consensusMm;
      const cost = rain > 15 ? baseWeekly * 0.6 : baseWeekly;
      weeks[i].cashOut += cost;
      weeks[i].audit.sources.push({
        type: "labour",
        description: `Labour for project "${p.name}" (${rain > 15 ? "rain-adjusted ×0.6" : "normal"})`,
        amount: -cost,
        meta: { projectId: p.id, rainMm: rain },
      });
    }
  }

  // ---- Compute net + running balance + confidence
  let balance = input.startingBalance;
  for (let i = 0; i < 13; i++) {
    weeks[i].netCash = weeks[i].cashIn - weeks[i].cashOut;
    balance += weeks[i].netCash;
    weeks[i].runningBalance = balance;
    const wConf = weeks[i].audit.weather.confidence;
    const dataConf = weeks[i].audit.sources.length > 0 ? 0.9 : 0.5;
    const lagConf = 0.8;
    const riskConf = 0.85;
    weeks[i].confidenceScore = (wConf * 0.3 + dataConf * 0.3 + lagConf * 0.2 + riskConf * 0.2);
    // Anomaly: negative balance, spike vs neighbors
    if (weeks[i].runningBalance < 0) weeks[i].anomalyFlags.push("negative_balance");
    if (weeks[i].cashOut > weeks[i].cashIn * 2 && weeks[i].cashIn > 0) weeks[i].anomalyFlags.push("cost_spike");
  }
  // Z-score anomaly on cash_in across the 13 weeks
  const means = weeks.map(w => w.cashIn);
  const avg = means.reduce((a, b) => a + b, 0) / means.length;
  const std = Math.sqrt(means.map(v => (v - avg) ** 2).reduce((a, b) => a + b, 0) / means.length);
  if (std > 0) {
    weeks.forEach(w => {
      const z = Math.abs((w.cashIn - avg) / std);
      if (z > 2.5) w.anomalyFlags.push("revenue_outlier");
    });
  }

  return weeks;
}

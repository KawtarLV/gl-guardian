// Weather fetching from Open-Meteo (keyless) and OpenWeatherMap (key required).
// We aggregate to weekly totals (mm of rain) and compute consensus.

export interface WeeklyWeather {
  weekStart: string; // YYYY-MM-DD (Monday)
  openMeteoMm: number | null;
  openWeatherMm: number | null;
  consensusMm: number;
  confidence: number; // 0..1
  minTempC: number | null;
  lostDays: number;
  frostFlag: boolean;
}

// Approximate Dutch region centroids
const REGION_COORDS: Record<string, { lat: number; lon: number }> = {
  amsterdam: { lat: 52.37, lon: 4.9 },
  rotterdam: { lat: 51.92, lon: 4.48 },
  utrecht: { lat: 52.09, lon: 5.12 },
  eindhoven: { lat: 51.44, lon: 5.48 },
  groningen: { lat: 53.22, lon: 6.57 },
  default: { lat: 52.1, lon: 5.3 },
};

function coords(region: string | null | undefined) {
  if (!region) return REGION_COORDS.default;
  return REGION_COORDS[region.toLowerCase()] ?? REGION_COORDS.default;
}

function mondayOf(d: Date): Date {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  const m = new Date(d);
  m.setUTCDate(d.getUTCDate() - diff);
  m.setUTCHours(0, 0, 0, 0);
  return m;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lostDaysFromMm(mm: number): number {
  if (mm > 50) return 5;
  if (mm > 30) return 2;
  if (mm > 15) return 1;
  return 0;
}

async function fetchOpenMeteo(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): Promise<Map<string, { rain: number; tmin: number }>> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum,temperature_2m_min&start_date=${startDate}&end_date=${endDate}&timezone=UTC`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  const data = await r.json();
  const out = new Map<string, { rain: number; tmin: number }>();
  const dates: string[] = data.daily?.time ?? [];
  const rains: number[] = data.daily?.precipitation_sum ?? [];
  const tmins: number[] = data.daily?.temperature_2m_min ?? [];
  dates.forEach((d, i) => out.set(d, { rain: rains[i] ?? 0, tmin: tmins[i] ?? 20 }));
  return out;
}

async function fetchOpenWeather(
  lat: number,
  lon: number,
): Promise<Map<string, number> | null> {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) return null;
  // Free plan: /forecast (3h step, 5 days). We bucket per day.
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${key}&units=metric`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const data = await r.json();
  const buckets = new Map<string, number>();
  for (const entry of data.list ?? []) {
    const day = (entry.dt_txt as string).slice(0, 10);
    const rain = entry.rain?.["3h"] ?? 0;
    buckets.set(day, (buckets.get(day) ?? 0) + rain);
  }
  return buckets;
}

export async function fetchWeather13Weeks(region: string | null): Promise<WeeklyWeather[]> {
  const { lat, lon } = coords(region);
  const today = mondayOf(new Date());
  const weeks: Date[] = [];
  for (let i = 0; i < 13; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() + i * 7);
    weeks.push(d);
  }
  const startDate = ymd(weeks[0]);
  const endDate = ymd(new Date(weeks[12].getTime() + 6 * 86400000));

  const omPromise = fetchOpenMeteo(lat, lon, startDate, endDate).catch(() => null);
  const owPromise = fetchOpenWeather(lat, lon).catch(() => null);
  const [om, ow] = await Promise.all([omPromise, owPromise]);

  const out: WeeklyWeather[] = [];
  for (const wk of weeks) {
    let omMm: number | null = null;
    let owMm: number | null = null;
    let minTemp: number | null = null;
    if (om) {
      omMm = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(wk);
        d.setUTCDate(wk.getUTCDate() + i);
        const e = om.get(ymd(d));
        if (e) {
          omMm += e.rain;
          minTemp = minTemp == null ? e.tmin : Math.min(minTemp, e.tmin);
        }
      }
    }
    if (ow) {
      owMm = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(wk);
        d.setUTCDate(wk.getUTCDate() + i);
        const v = ow.get(ymd(d));
        if (v != null) owMm += v;
      }
      // OW only covers ~5 days from today; treat as null for far-future weeks
      const daysFromNow = (wk.getTime() - Date.now()) / 86400000;
      if (daysFromNow > 5) owMm = null;
    }

    let consensus: number;
    let confidence: number;
    if (omMm != null && owMm != null) {
      consensus = (omMm + owMm) / 2;
      const denom = Math.max(omMm, owMm, 1);
      const divergence = Math.abs(omMm - owMm) / denom;
      confidence = divergence > 0.3 ? 0.5 : 0.95;
    } else if (omMm != null) {
      consensus = omMm;
      confidence = 0.75;
    } else if (owMm != null) {
      consensus = owMm;
      confidence = 0.6;
    } else {
      consensus = 0;
      confidence = 0.3;
    }

    out.push({
      weekStart: ymd(wk),
      openMeteoMm: omMm,
      openWeatherMm: owMm,
      consensusMm: consensus,
      confidence,
      minTempC: minTemp,
      lostDays: lostDaysFromMm(consensus),
      frostFlag: minTemp != null && minTemp < 2,
    });
  }
  return out;
}

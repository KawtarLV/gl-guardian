/** Convert an Excel serial date (days since 1900-01-00, with the leap-year bug) to YYYY-MM-DD. */
function excelSerialToISO(serial: number): string | null {
  if (!isFinite(serial) || serial <= 0) return null;
  // Excel's day 60 is the fictional 1900-02-29. Adjust.
  const adjusted = serial > 59 ? serial - 1 : serial;
  const ms = Math.round((adjusted - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function parseDate(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return excelSerialToISO(raw);
  const str = String(raw).trim();
  if (!str) return null;

  // YYYY-MM-DD (ISO)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.slice(0, 10);

  // D/M/YYYY, D-M-YYYY, D.M.YYYY (separators interchangeable).
  // Defaults to DD/MM/YYYY (EU). If the first part > 12 it's clearly day-first;
  // if the second part > 12 it's clearly month-first (US M/D/YYYY) — swap.
  const sep = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (sep) {
    const [, aRaw, bRaw, y] = sep;
    let d = parseInt(aRaw, 10);
    let mo = parseInt(bRaw, 10);
    if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const yr = y.length === 2 ? `20${y}` : y;
    return `${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }



  // YYYYMMDD
  const ymd = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;


  // Numeric Excel serial as string
  if (/^\d+(\.\d+)?$/.test(str)) {
    const n = Number(str);
    if (n > 1000 && n < 80000) return excelSerialToISO(n);
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

export function parsePeriod(
  raw: string | number | null | undefined,
  yearContext?: number,
): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const str = String(raw).trim();
  if (!str) return null;

  // "Jan 2023"
  const monthName = str.match(/^([a-zA-Z]{3,9})\s+(\d{4})$/);
  if (monthName) {
    const months: Record<string, string> = {
      jan: "01", feb: "02", mrt: "03", mar: "03", apr: "04",
      mei: "05", may: "05", jun: "06", jul: "07", aug: "08",
      sep: "09", okt: "10", oct: "10", nov: "11", dec: "12",
    };
    const m = months[monthName[1].toLowerCase().slice(0, 3)];
    if (m) return `${monthName[2]}-${m}`;
  }

  // "2023-01"
  if (/^\d{4}-\d{2}$/.test(str)) return str;

  // "12" — period number, needs year
  const periodNum = str.match(/^(\d{1,2})$/);
  if (periodNum) {
    const num = parseInt(periodNum[1], 10);
    if (num >= 1 && num <= 12) {
      const year = yearContext ?? new Date().getFullYear();
      return `${year}-${String(num).padStart(2, "0")}`;
    }
  }

  return null;
}

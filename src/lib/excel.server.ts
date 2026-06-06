import * as XLSX from "xlsx";

export interface ParsedRow {
  [key: string]: string | number | null;
}

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: ParsedRow[];
}

export function parseWorkbook(buffer: ArrayBuffer): ParsedSheet[] {
  const wb = XLSX.read(buffer, { type: "array" });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<ParsedRow>(ws, { defval: null, raw: true });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { sheetName: name, headers, rows };
  });
}

// Heuristically pick the first column that looks like X
const ACCOUNT_NUMBER_HEADERS = ["account_number", "account number", "rekening", "rekeningnr", "grootboek", "grootboeknummer", "nr", "nummer", "code"];
const ACCOUNT_DESC_HEADERS = ["account_description", "account description", "description", "omschrijving", "naam", "rekeningnaam", "grootboek omschrijving"];
const AMOUNT_HEADERS = ["amount", "bedrag", "totaal", "total", "value", "saldo"];
const DATE_HEADERS = ["date", "datum", "invoice_date", "factuurdatum"];
const CUSTOMER_HEADERS = ["customer", "klant", "debiteur", "name", "naam"];
const DUE_HEADERS = ["due_date", "vervaldatum", "due"];

function findHeader(headers: string[], options: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const opt of options) {
    const i = lower.indexOf(opt);
    if (i >= 0) return headers[i];
  }
  // partial contains
  for (const opt of options) {
    const i = lower.findIndex((h) => h.includes(opt));
    if (i >= 0) return headers[i];
  }
  return null;
}

export interface GlExtraction {
  accountNumber: string | null;
  accountDescription: string;
}

export function extractGlRows(sheet: ParsedSheet): GlExtraction[] {
  const numCol = findHeader(sheet.headers, ACCOUNT_NUMBER_HEADERS);
  const descCol = findHeader(sheet.headers, ACCOUNT_DESC_HEADERS);
  if (!descCol) return [];
  const seen = new Set<string>();
  const out: GlExtraction[] = [];
  for (const row of sheet.rows) {
    const desc = row[descCol];
    if (!desc) continue;
    const key = String(desc).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      accountNumber: numCol && row[numCol] != null ? String(row[numCol]) : null,
      accountDescription: String(desc).trim(),
    });
  }
  return out;
}

export interface InvoiceExtraction {
  amount: number;
  invoiceDate: string;
  dueDate: string | null;
  customerName: string | null;
  description: string | null;
}

function toDateString(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // try ISO or dd-mm-yyyy / dd/mm/yyyy
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(s);
  if (iso) return s.slice(0, 10);
  const dmY = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/.exec(s);
  if (dmY) {
    const [, d, m, y] = dmY;
    const yr = y.length === 2 ? `20${y}` : y;
    return `${yr}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

export function extractInvoiceRows(sheet: ParsedSheet): InvoiceExtraction[] {
  const amountCol = findHeader(sheet.headers, AMOUNT_HEADERS);
  const dateCol = findHeader(sheet.headers, DATE_HEADERS);
  const dueCol = findHeader(sheet.headers, DUE_HEADERS);
  const custCol = findHeader(sheet.headers, CUSTOMER_HEADERS);
  const descCol = findHeader(sheet.headers, ACCOUNT_DESC_HEADERS);
  if (!amountCol || !dateCol) return [];
  const out: InvoiceExtraction[] = [];
  for (const row of sheet.rows) {
    const amt = Number(row[amountCol]);
    const date = toDateString(row[dateCol]);
    if (!isFinite(amt) || amt === 0 || !date) continue;
    out.push({
      amount: amt,
      invoiceDate: date,
      dueDate: dueCol ? toDateString(row[dueCol]) : null,
      customerName: custCol && row[custCol] ? String(row[custCol]).trim() : null,
      description: descCol && row[descCol] ? String(row[descCol]).trim() : null,
    });
  }
  return out;
}

export function detectShape(sheet: ParsedSheet): "gl" | "invoices" | "unknown" {
  const hasAccountDesc = !!findHeader(sheet.headers, ACCOUNT_DESC_HEADERS);
  const hasAccountNumber = !!findHeader(sheet.headers, ACCOUNT_NUMBER_HEADERS);
  const hasAmount = !!findHeader(sheet.headers, AMOUNT_HEADERS);
  const hasDate = !!findHeader(sheet.headers, DATE_HEADERS);
  if (hasAmount && hasDate) return "invoices";
  if (hasAccountDesc && hasAccountNumber) return "gl";
  if (hasAccountDesc) return "gl";
  return "unknown";
}

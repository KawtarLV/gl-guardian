import * as XLSX from "xlsx";
import { parseDate } from "./date-parser";

export interface ParsedRow {
  [key: string]: string | number | null;
}

export interface KaartAccount {
  number: string | null;
  description: string;
}

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: ParsedRow[];
  /** Single-account context extracted from metadata rows above the table
   *  (e.g. "Kaart | Grootboekrekening: 8005 - omzet ..."). When set, every
   *  row belongs to this account even if there is no per-row rekening column. */
  kaartAccount?: KaartAccount;
}

// Tokens that identify a real header row (used to skip metadata banner
// rows produced by Dutch accounting exports — Exact, AFAS, Twinfield, etc.).
const HEADER_TOKENS = [
  "datum", "date",
  "debet", "debit", "credit", "kredit", "haben",
  "bedrag", "amount", "saldo",
  "dagboek", "daybook",
  "bkst", "boekstuk", "boeknr", "boeknummer",
  "rekening", "grootboek",
  "omschrijving", "boekingstekst", "description",
];

function countHeaderHits(cells: (string | number | null)[]): number {
  let hits = 0;
  for (const raw of cells) {
    const c = String(raw ?? "").toLowerCase().trim();
    if (!c) continue;
    for (const t of HEADER_TOKENS) {
      if (c === t || c.includes(t)) { hits += 1; break; }
    }
  }
  return hits;
}

function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h, i) => {
    const base = (h ?? "").toString().trim() || `col_${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

function detectKaartAccount(metaRows: (string | number | null)[][]): KaartAccount | undefined {
  const flat = metaRows.flat().map((c) => String(c ?? "").trim()).filter(Boolean);
  const re = /^(\d{3,6})\s*[-–]\s*(.{2,})$/;
  for (let i = 0; i < flat.length; i++) {
    if (/grootboek|kaart|rekening/i.test(flat[i])) {
      for (let j = i + 1; j < Math.min(i + 4, flat.length); j++) {
        const m = flat[j].match(re);
        if (m) return { number: m[1], description: m[2].trim() };
      }
    }
  }
  for (const cell of flat) {
    const m = cell.match(re);
    if (m) return { number: m[1], description: m[2].trim() };
  }
  return undefined;
}

export function parseWorkbook(buffer: ArrayBuffer): ParsedSheet[] {
  const wb = XLSX.read(buffer, { type: "array" });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: false,
    });
    const matrix: (string | number | null)[][] = aoa.map((r) =>
      (r || []).map((c) => (c == null ? null : (typeof c === "number" ? c : String(c)))),
    );

    // Find the most likely header row in the first 25 rows.
    let headerIdx = 0;
    let bestHits = 0;
    const scanLimit = Math.min(25, matrix.length);
    for (let i = 0; i < scanLimit; i++) {
      const hits = countHeaderHits(matrix[i]);
      if (hits > bestHits) { bestHits = hits; headerIdx = i; }
    }
    if (bestHits < 2) headerIdx = 0;

    const headerCells = (matrix[headerIdx] ?? []).map((c) => String(c ?? "").trim());
    const headers = dedupeHeaders(headerCells);
    const rows: ParsedRow[] = matrix.slice(headerIdx + 1).map((r) => {
      const obj: ParsedRow = {};
      headers.forEach((h, i) => { obj[h] = (r[i] ?? null) as string | number | null; });
      return obj;
    }).filter((o) => Object.values(o).some((v) => v !== null && v !== ""));

    const kaartAccount = headerIdx > 0
      ? detectKaartAccount(matrix.slice(0, headerIdx))
      : undefined;

    return { sheetName: name, headers, rows, kaartAccount };
  });
}

/** Return every sheet as a raw matrix (string[][]) — no header inference.
 *  Use this when files have metadata rows above the real header row. */
export interface RawSheet {
  sheetName: string;
  rows: string[][];
}
export function parseWorkbookRaw(buffer: ArrayBuffer): RawSheet[] {
  const wb = XLSX.read(buffer, { type: "array" });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    const rows: string[][] = aoa.map((r) => (r || []).map((c) => (c == null ? "" : String(c))));
    return { sheetName: name, rows };
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
  return parseDate(v as string | number | null | undefined);
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

export interface JournalExtraction {
  rekening: string;
  trek: string | null;
  datum: string;
  amount: number; // credit - debet
  description: string;
}

const DEBET_HEADERS = ["debet", "debit"];
const CREDIT_HEADERS = ["credit", "kredit", "haben"];
const JOURNAL_DATE_HEADERS = ["datum", "date"];
const TREK_HEADERS = ["trek", "relatie", "relation", "klantnr", "debiteur"];
const BOEKINGSTEKST_HEADERS = ["boekingstekst", "omschrijving", "description", "memo"];
const BOEKNR_HEADERS = ["boeknummer", "boeknr", "journal", "journaal", "bkst", "bkst.nr", "bkstnr", "boekstuk", "boekstuknr", "boekstuknummer"];
const DAGBOEK_HEADERS = ["dagboek", "daybook"];
const REKENING_HEADERS = ["rekening", "grootboek", "grootboeknummer"];

export function detectJournalShape(sheet: ParsedSheet): boolean {
  const hasRekening = !!findHeader(sheet.headers, REKENING_HEADERS) || !!sheet.kaartAccount;
  const hasDebOrCred =
    !!findHeader(sheet.headers, DEBET_HEADERS) || !!findHeader(sheet.headers, CREDIT_HEADERS);
  const hasBoeknr = !!findHeader(sheet.headers, BOEKNR_HEADERS);
  const hasDagboek = !!findHeader(sheet.headers, DAGBOEK_HEADERS);
  const hasDate = !!findHeader(sheet.headers, JOURNAL_DATE_HEADERS);
  return hasRekening && hasDebOrCred && hasDate && (hasBoeknr || hasDagboek);
}

export function extractJournalRows(sheet: ParsedSheet): JournalExtraction[] {
  const rekCol = findHeader(sheet.headers, REKENING_HEADERS);
  const dateCol = findHeader(sheet.headers, JOURNAL_DATE_HEADERS);
  const debCol = findHeader(sheet.headers, DEBET_HEADERS);
  const credCol = findHeader(sheet.headers, CREDIT_HEADERS);
  const trekCol = findHeader(sheet.headers, TREK_HEADERS);
  const textCol = findHeader(sheet.headers, BOEKINGSTEKST_HEADERS);
  const boekCol = findHeader(sheet.headers, BOEKNR_HEADERS);
  const dagCol = findHeader(sheet.headers, DAGBOEK_HEADERS);
  if (!dateCol) return [];
  // Kaart fallback: single-account exports have no per-row rekening column.
  const kaartRek = sheet.kaartAccount?.number ?? null;
  const kaartDesc = sheet.kaartAccount?.description ?? null;
  if (!rekCol && !kaartRek) return [];
  const out: JournalExtraction[] = [];
  for (const row of sheet.rows) {
    const rekRaw = rekCol ? row[rekCol] : null;
    const rek = rekRaw != null && String(rekRaw).trim() !== "" ? String(rekRaw).trim() : kaartRek;
    const date = toDateString(row[dateCol]);
    if (!rek || !date) continue;
    const deb = debCol ? Number(row[debCol]) || 0 : 0;
    const cred = credCol ? Number(row[credCol]) || 0 : 0;
    const amount = cred - deb;
    if (!isFinite(amount) || amount === 0) continue;
    const trekRaw = trekCol ? row[trekCol] : null;
    const trek = trekRaw != null && String(trekRaw).trim() !== "" ? String(trekRaw).trim() : null;
    const text = textCol && row[textCol] ? String(row[textCol]).trim() : "";
    const boek = boekCol && row[boekCol] ? String(row[boekCol]).trim() : "";
    const dag = dagCol && row[dagCol] ? String(row[dagCol]).trim() : "";
    const tail = dag && boek ? `${dag} ${boek}` : dag || boek;
    const description = [text, tail, !text && !tail && kaartDesc ? kaartDesc : ""].filter(Boolean).join(" · ");
    out.push({
      rekening: rek,
      trek,
      datum: date,
      amount,
      description: description || kaartDesc || "Boeking",
    });
  }
  return out;
}

export function detectShape(sheet: ParsedSheet): "gl" | "invoices" | "journal" | "unknown" {
  if (detectJournalShape(sheet)) return "journal";
  const hasAccountDesc = !!findHeader(sheet.headers, ACCOUNT_DESC_HEADERS);
  const hasAccountNumber = !!findHeader(sheet.headers, ACCOUNT_NUMBER_HEADERS);
  const hasAmount = !!findHeader(sheet.headers, AMOUNT_HEADERS);
  const hasDate = !!findHeader(sheet.headers, DATE_HEADERS);
  if (hasAmount && hasDate) return "invoices";
  if (hasAccountDesc && hasAccountNumber) return "gl";
  if (hasAccountDesc) return "gl";
  return "unknown";
}



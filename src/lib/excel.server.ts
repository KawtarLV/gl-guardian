import * as XLSX from "xlsx";
import { parseDate } from "./date-parser";

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
  // Delegate to shared parser to avoid bundler quirks with XLSX.SSF.
  // Lazy require to keep this file self-contained.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { parseDate } = require("./date-parser") as typeof import("./date-parser");
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
const BOEKNR_HEADERS = ["boeknummer", "boeknr", "journal", "journaal"];
const DAGBOEK_HEADERS = ["dagboek", "daybook"];
const REKENING_HEADERS = ["rekening", "grootboek", "grootboeknummer"];

export function detectJournalShape(sheet: ParsedSheet): boolean {
  const hasRekening = !!findHeader(sheet.headers, REKENING_HEADERS);
  const hasDebOrCred =
    !!findHeader(sheet.headers, DEBET_HEADERS) || !!findHeader(sheet.headers, CREDIT_HEADERS);
  const hasBoeknr = !!findHeader(sheet.headers, BOEKNR_HEADERS);
  return hasRekening && hasDebOrCred && hasBoeknr;
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
  if (!rekCol || !dateCol) return [];
  const out: JournalExtraction[] = [];
  for (const row of sheet.rows) {
    const rek = row[rekCol];
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
    const description = [text, tail].filter(Boolean).join(" · ");
    out.push({
      rekening: String(rek).trim(),
      trek,
      datum: date,
      amount,
      description: description || "Boeking",
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


export type StandardField =
  | "account_code"
  | "period"
  | "date"
  | "invoice_number"
  | "customer_code"
  | "debet"
  | "credit"
  | "description"
  | "journal"
  | "vat"
  | "row_number"
  | "unknown";

export const STANDARD_FIELDS: StandardField[] = [
  "account_code", "period", "date", "invoice_number", "customer_code",
  "debet", "credit", "description", "journal", "vat", "row_number", "unknown",
];

export const COLUMN_ALIASES: Record<string, StandardField> = {
  // Account code
  rekening: "account_code",
  account: "account_code",
  grootboek: "account_code",
  grootboekrekening: "account_code",
  "gl account": "account_code",
  "account number": "account_code",
  rekeningnummer: "account_code",
  code: "account_code",
  "gl code": "account_code",

  // Period
  periode: "period",
  period: "period",
  per: "period",
  maand: "period",
  month: "period",
  boekperiode: "period",

  // Date
  datum: "date",
  date: "date",
  boekingsdatum: "date",
  transactiedatum: "date",
  factuurdatum: "date",
  "invoice date": "date",
  "transaction date": "date",
  waardedatum: "date",
  "value date": "date",

  // Invoice number
  boeknummer: "invoice_number",
  "bkst nr": "invoice_number",
  boekstuknummer: "invoice_number",
  factuurnummer: "invoice_number",
  "invoice number": "invoice_number",
  "invoice nr": "invoice_number",
  referentie: "invoice_number",
  document: "invoice_number",
  ref: "invoice_number",

  // Customer code
  trek: "customer_code",
  relatie: "customer_code",
  relatienummer: "customer_code",
  customer: "customer_code",
  klant: "customer_code",
  klantnummer: "customer_code",
  debiteurnummer: "customer_code",
  debiteur: "customer_code",
  contact: "customer_code",
  contactcode: "customer_code",
  klantreferentie: "customer_code",
  client: "customer_code",

  // Debet
  debet: "debet",
  debit: "debet",
  af: "debet",
  uitgave: "debet",
  "debit amount": "debet",
  withdrawal: "debet",
  kosten: "debet",

  // Credit (also accept single "amount" columns from invoice-shape exports —
  // treated as a positive revenue line by the commit step)
  credit: "credit",
  bij: "credit",
  ontvangst: "credit",
  "credit amount": "credit",
  deposit: "credit",
  inkomsten: "credit",
  amount: "credit",
  bedrag: "credit",
  totaal: "credit",
  total: "credit",
  saldo: "credit",
  value: "credit",

  // Description
  boekingstekst: "description",
  omschrijving: "description",
  description: "description",
  tekst: "description",
  text: "description",
  memo: "description",
  opmerking: "description",
  toelichting: "description",
  naam: "description",
  benaming: "description",
  note: "description",

  // Journal
  dagboek: "journal",
  journal: "journal",
  boek: "journal",
  dagboekcode: "journal",
  source: "journal",

  // VAT
  btw: "vat",
  vat: "vat",
  tax: "vat",
  belasting: "vat",
  "btw bedrag": "vat",
  "btw srt": "vat",

  // Row number
  nr: "row_number",
  no: "row_number",
  volgnummer: "row_number",
  rijnummer: "row_number",
};

export function normaliseColumnName(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[.\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectFieldFromRules(columnName: string): StandardField | null {
  const normalised = normaliseColumnName(columnName);
  if (COLUMN_ALIASES[normalised]) return COLUMN_ALIASES[normalised];
  // Partial match — only when the alias is at least 3 chars to avoid noise
  for (const [alias, field] of Object.entries(COLUMN_ALIASES)) {
    if (alias.length < 3) continue;
    if (normalised.includes(alias) || alias.includes(normalised)) return field;
  }
  return null;
}

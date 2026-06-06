export const GL_CATEGORIES = [
  "Revenue",
  "Materials",
  "Payroll",
  "Subcontractors",
  "Equipment",
  "Vehicles",
  "Rent",
  "Insurance",
  "Taxes",
  "Interest",
  "Professional Services",
  "Utilities",
  "Office Expenses",
  "Maintenance",
  "Marketing",
  "Other Operating Expenses",
  "Other Income",
  "Other",
] as const;

export type GlCategory = (typeof GL_CATEGORIES)[number];

export const CATEGORY_HINTS_DUTCH = `
Common Dutch accounting term hints:
- "omzet", "verkoop", "verkopen", "opbrengst" → Revenue
- "materiaal", "materialen", "grondstof", "inkoop materiaal" → Materials
- "loon", "lonen", "salaris", "personeel" → Payroll
- "onderaannemer", "onderaanneming", "uitbesteed werk" → Subcontractors
- "gereedschap", "machines", "apparatuur" → Equipment
- "auto", "bus", "diesel", "benzine", "brandstof", "wagenpark", "leaseauto" → Vehicles
- "huur", "huur pand", "kantoorhuur" → Rent
- "verzekering", "premie" → Insurance
- "btw", "vpb", "loonheffing", "belasting" → Taxes
- "rente", "bankkosten" → Interest
- "accountant", "advocaat", "advies", "notaris" → Professional Services
- "gas", "water", "licht", "elektra", "energie", "telefoon" → Utilities
- "kantoor", "kantoorbenodigdheden", "porto" → Office Expenses
- "onderhoud", "reparatie" → Maintenance
- "reclame", "marketing", "advertentie" → Marketing
- "ontvangen rente", "subsidie" → Other Income
`.trim();

export const CUSTOMER_TYPE_DEFAULT_LAG: Record<string, number> = {
  small_repair: 18,
  commercial: 35,
  housing_corp: 55,
  unknown: 30,
};

export const SEASONAL_INDEX: Record<number, number> = {
  1: 0.30, 2: 0.35, 3: 0.78, 4: 0.82, 5: 0.88, 6: 0.95,
  7: 1.40, 8: 0.32, 9: 0.95, 10: 1.10, 11: 0.78, 12: 0.85,
};

export function normalizeDescription(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ").replace(/[^\w\s\-\/]/g, "");
}

export function inferCustomerType(name: string): keyof typeof CUSTOMER_TYPE_DEFAULT_LAG {
  const n = name.toLowerCase();
  if (/woningstichting|woningcorporatie|woningbouw|housing/.test(n)) return "housing_corp";
  if (/\b(bv|b\.v\.|nv|n\.v\.|gmbh|ltd|inc|holding)\b/.test(n)) return "commercial";
  if (/particulier|dhr\.|mevr\.|familie|fam\./.test(n)) return "small_repair";
  return "unknown";
}

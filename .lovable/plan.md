## Goal

Make the user's real Dutch GL transaction export (`GB_8000_jan-dec_23.xlsx` — 1,097 sales-journal rows on account 8000 "Omzet hoog") drive the forecast without requiring them to find a chart-of-accounts or debtor list first. Keep the existing two flows untouched.

## Approach — Option A (journal-mode importer)

Extend the existing Demo Data tab with auto-detection of a third shape: **GL transaction journal**. When the parser sees columns like `Rekening`, `Boeknummer`, `Trek`, `Debet`/`Credit`, `Boekingstekst`, `Dagboek`, `BTW`, it switches to journal mode instead of invoice mode.

### Journal-mode transform

1. **Synthetic invoices** — one row per journal posting:
   - `amount` = `Credit` − `Debet` (revenue accounts net credit; flip sign for cost accounts later if needed)
   - `invoiceDate` = `Datum`
   - `dueDate` = `Datum` + 30 days (default; refined per customer type below)
   - `customerName` = `"Klant " + Trek` when `Trek` is numeric and non-empty, else `Boekingstekst` first 40 chars, else `"Onbekend"`
   - `description` = `Boekingstekst` + " · " + `Dagboek` + `Boeknummer`
   - `glAccount` = `Rekening` (carried through so the forecast engine can categorize)

2. **Customer aggregation** — group by `Trek`. For each unique trek id:
   - Name = `"Klant " + Trek` (clearly marked as synthetic in the preview UI)
   - Type inference falls back to `unknown` (no name signal) → default 30-day lag
   - Surface a checkbox in preview: "These customers are anonymous — I'll rename later"

3. **GL account auto-mapping** — because the file is single-account (8000 Omzet hoog), the importer also seeds one GL mapping row (`8000` → `revenue_sales`) and pushes it through the existing classify → save loop so the forecast engine recognizes the cashflow as revenue.

### UI changes (Demo Data tab only)

- After parse, show a badge: `Detected shape: GL journal · 1 account · 1,097 postings · 47 unique trek ids`
- Preview table swaps "Customer" column header for "Customer (synthetic)" when in journal mode
- A small info banner above the preview explains: "This is a transaction journal, not an invoice list. We've created one synthetic customer per relation ID. For named customers, upload an Open Posten / Debiteuren export instead."
- Commit button label changes to "Commit journal import"

### What stays the same

- Existing invoice-shape detection and import path
- GL Mapping tab (untouched)
- Forecast engine, audit trail, copilot
- Schema — synthetic customers and invoices use existing `customers` / `invoices` tables

## Technical details

**Files to change:**
- `src/lib/excel.server.ts` — add `detectJournalShape()` heuristic (looks for `Rekening` + `Boeknummer` + (`Debet`|`Credit`) headers, Dutch-aware). Return `{ shape: "journal", journalRows: [...] }` alongside existing `invoices`.
- `src/lib/demo-import.functions.ts` — new `previewJournalImport` + `commitJournalImport` server fns. Reuses `customers`/`invoices` inserts; additionally inserts a `gl_mappings` row for the detected account if missing.
- `src/routes/_authenticated/upload.tsx` — in `DemoDataTab`, branch on `shape === "journal"` after parse: render the journal preview (with synthetic-customer banner) instead of the invoice preview, wire the new mutation.

**No DB migration needed** — synthetic rows fit existing tables.

**Heuristic safety:** if both invoice-shape and journal-shape match (unlikely), prefer invoice-shape and surface a warning so the user can choose.

## Out of scope (deferred)

- Multi-account journal files (chart-of-accounts inference) — current file is single-account; we'll cross that bridge when a user uploads one
- Renaming synthetic customers in bulk (post-import editor)
- Option B (asking user for additional exports) — not blocking, can layer on later

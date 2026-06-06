
# Construction Finance Intelligence Platform — Build Plan

A two-module platform sharing one database, auth, and AI layer:
1. **GL Mapping Engine** — Excel upload → AI classification → human review → learning loop
2. **13-Week Cash Flow Forecast** — Deterministic engine with weather, payment lag, audit trail, and AI copilot

Per your direction: OpenAI direct, dual weather providers (Open-Meteo + OpenWeatherMap), and a Demo Data Importer that ingests real accounting Excel exports and heuristically materializes projects/invoices/customers/milestones.

---

## Phase 0 — Foundation

- Enable **Lovable Cloud** (Supabase: Postgres + Auth + Storage + pgvector)
- Request secrets: `OPENAI_API_KEY`, `OPENWEATHER_API_KEY`
- Auth: email/password sign-in; gated routes under `_authenticated/`
- Multi-company scaffolding: every domain table carries `company_id`; RLS scopes data per user's company membership
- Tables: `companies`, `company_members`, `user_roles` (separate `app_role` enum table — never store roles on profile)

---

## Phase 1 — Database Schema (one migration)

GL: `gl_mappings`, `mapping_history`, `classification_feedback` (all with `embedding vector(1536)`, HNSW index)
Domain: `customers`, `projects`, `milestones`, `invoices`, `payments`, `materials`, `labour`, `subcontractors`
Forecast: `weather_cache`, `forecast_runs`, `forecast_weeks` (with `audit_json` jsonb)
Storage bucket: `excel-uploads` (private)

RLS on every table scoped by `company_id`. Explicit `GRANT` to `authenticated` + `service_role` per migration rules.

---

## Phase 2 — GL Mapping Engine

**Upload flow** (server route + server fn):
- Drag-drop `.xlsx` → upload to storage → server fn parses first sheet with `xlsx`
- Extract `account_number` + `account_description`
- Preview first 20 rows in UI before classification

**Hybrid classification pipeline** (server fn, per row):
1. Deterministic lookup — exact normalized description match in approved `gl_mappings`
2. Vector search — embed description (text-embedding-3-small), cosine search against approved mappings, threshold 0.85
3. LLM fallback — `gpt-4o-mini` with strict JSON schema returning `{category, confidence, reasoning, needs_review}`
   - System prompt encodes the 18-category chart + Dutch synonyms (diesel→Vehicles, huur→Rent, etc.)
   - `confidence < 0.75` → `needs_review = true`

**Review UI**: editable table with confidence chips (green/yellow/red), category dropdown, approve/reject, bulk-approve all ≥0.90.

**Learning loop**: on approve/correct → insert into `classification_feedback` + upsert high-priority entry in `gl_mappings` with embedding. Future runs hit step 1 or 2 first.

**Mapping history page**: search/filter by account, category, user; full change log from `mapping_history`.

---

## Phase 3 — Demo Data Importer (replaces seed)

A second Excel ingestion path that materializes the forecast domain from real exports:
- Detect file shape (GL export vs. invoice register vs. project list) by header heuristics
- Invoice rows → create/link `customers` (by name), `invoices`, infer `gl_category` via the mapping engine
- Project-shaped rows → create `projects` + `milestones` (planned_date from due date heuristics)
- Recurring invoice detection (same customer + amount + monthly cadence) flags `is_recurring`
- Customer type inferred from name patterns (BV, Woningstichting, particulier) → defaults `avg_payment_lag_days`
- Import preview + commit step; nothing writes until user confirms

This makes the forecast dashboard functional immediately after import — no manual entry.

---

## Phase 4 — Forecast Engine (deterministic, server fn)

Pure TypeScript module, fully unit-testable. AI never mutates numbers.

**Revenue**: (A) recurring detection from invoice history, (B) milestone schedule, (C) seasonal fallback using fixed monthly indices.
**Costs**: Materials = `invoice × 0.23` two weeks pre-milestone; Labour spread evenly, ×0.6 on rain weeks; Subcontractors at `completion + paymentLag`.
**Weather**: dual fetch (Open-Meteo + OWM), consensus = average; >30% divergence → low-confidence flag; lostDays tiered by rain mm; frost flag <2°C.
**Project shifting**: milestone dates += lostDays, recursively re-evaluate if shifted into another bad week. Materials stay fixed.
**Payment lag**: historical avg per customer, fallback to type defaults (18/35/55/30 days).
**AI overlays** (advisory only, stored separately from base calc):
- Payment lag prediction — used only if confidence > 80%
- Delay risk score per project
- Anomaly detection (z-score on invoice amounts + spend patterns)
**Confidence engine**: weighted blend (weather agreement, payment confidence, project risk, data completeness)

Every weekly value writes `audit_json` listing every source invoice, milestone, weather adjustment, and cost allocation that contributed.

---

## Phase 5 — Forecast UI

- **Dashboard**: 13-week table (Week, Cash In, Cash Out, Net, Running Balance, Confidence%) + Recharts line chart of running balance + weather/anomaly indicator strip
- **Week drill-down**: side panel rendering the full audit chain from `audit_json` (source invoice → project → milestone → weather adjustments → lag → final number)
- **Projects view**: timeline showing planned vs. weather-shifted milestone dates
- **AI Copilot panel**: input + chat; server fn passes the current forecast's audit data as grounded context to `gpt-4o-mini` with strict instruction to cite week numbers and source rows. No free-form numerical claims.

---

## Phase 6 — Polish & Verification

- Input validation with Zod everywhere (file size caps, schema validation on AI JSON)
- Error boundaries on every route
- Audit-trail assertion: forecast write rejects any week with empty `audit_json.sources`
- Manual QA pass: upload sample GL → classify → review → import demo data → view forecast → drill into a negative week → ask copilot "why?"

---

## Technical Notes

- **Stack**: TanStack Start + Supabase (per template). Server fns for all AI/forecast logic; `process.env.OPENAI_API_KEY` only inside `.handler()`.
- **OpenAI usage**: `gpt-4o-mini` for classification/copilot/risk; `text-embedding-3-small` (1536-dim) for vectors. Direct fetch in server fns (not AI SDK) since you chose OpenAI direct.
- **Weather**: Open-Meteo (no key) + OpenWeatherMap (`OPENWEATHER_API_KEY`); cached weekly in `weather_cache` to avoid rate limits.
- **Excel parsing**: `xlsx` npm package, server-side only.
- **Determinism**: forecast engine has zero `Math.random`, zero AI calls in the math path. AI outputs land in dedicated columns (`ai_predicted_lag`, `ai_risk_score`) and are read by the engine only when confidence gates pass.

---

## What's NOT in MVP

- Multi-user collaboration / comments
- Forecast versioning beyond `forecast_runs` snapshot
- Export to Excel/PDF (can add later)
- Mobile-optimized layout (desktop-first)
- Background job queue (forecast runs synchronously on demand; fine for MVP scale)

This is a large build — expect it to land in stages within this session. I'll start with Phase 0-1 (Cloud + schema + secrets) once you approve.

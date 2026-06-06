## Next build phases

Foundation (Cloud + schema + auth shell) is live. Continue with the feature surface, in order:

### 1. GL Mapping Upload + Classification UI
- Wire `/upload` route to drag-drop `.xlsx` (react-dropzone), POST to `uploadExcel` server fn that stores in `excel-uploads` bucket and parses with `xlsx`.
- Preview first 20 rows in a table; user clicks "Classify".
- `classifyAccounts` server fn: for each unique account → deterministic lookup in `gl_mappings` → vector search (cosine ≥0.85) → `gpt-4o-mini` JSON schema fallback. Writes results with `confidence`, `needs_review`, `source` (lookup/vector/ai).
- Review table: editable category dropdown, confidence chip color-coded, bulk-approve ≥0.90, "Save & learn" persists corrections to `classification_feedback` + upserts `gl_mappings` with embedding.

### 2. Demo Data Importer
- `/upload` second tab "Demo data".
- `importDemoData` server fn: parses invoice-shaped sheets → upserts `customers` (by name), `invoices` (with `gl_category` via mapping engine), detects project-shaped rows → `projects` + `milestones`, assigns `avg_payment_lag_days` defaults by customer type.
- Preview screen with counts (X customers, Y invoices, Z projects) → Commit button.

### 3. Forecast Engine Wiring
- `runForecast` server fn calls deterministic `forecast-engine.ts` already in repo:
  - Revenue: recurring detection → milestone schedule → seasonal fallback
  - Costs: materials (invoice×0.23, 2wk pre-milestone), labour (×0.6 on rain weeks), subs (completion+lag)
  - Weather consensus (Open-Meteo + OWM, cached in `weather_cache`)
  - Project shifting recursive
  - Every week → `audit_json.sources[]`; assertion rejects empty sources.
- AI overlays (advisory, written to `audit_json.ai_overlays`): payment lag prediction (conf >80%), delay risk, z-score anomaly.

### 4. Forecast UI + Copilot
- `/forecast`: 13-week table (sticky first col, week headers), Recharts line (inflow/outflow/net), weather/anomaly strip above.
- Click week → drawer with full `audit_json` chain (revenue sources, cost sources, weather, AI overlays).
- `/projects`: list with timeline bars and milestone status.
- AI Copilot panel (right side, collapsible): `gpt-4o-mini` with strict system prompt — must cite week numbers and audit sources, refuse free-form numeric claims.

### 5. Polish
- Zod validation on every server fn input.
- Error boundaries on each route.
- Audit-trail invariant: forecast write throws if any week has empty `sources[]`.
- Manual QA: upload sample → classify → import demo → run forecast → drill week → ask Copilot.

### Secrets needed (will request on build)
- `OPENAI_API_KEY` (required for classification + embeddings + Copilot)
- `OPENWEATHER_API_KEY` (required for dual-provider weather consensus)

### Out of scope (per MVP)
Multi-user collab, forecast versioning beyond `forecast_runs`, Excel/PDF export, mobile layout, background job queue.

Approve to start with Phase 1 (GL Mapping UI). I'll request the two secrets in the same turn.

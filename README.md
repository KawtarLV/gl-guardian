# GL Guardian

A smart cashflow management platform built for finance teams. Upload any GL statement or invoice export, run a 13-week forecast with weather adjustments, and get role-specific dashboards for CFOs, PE boards, and project leads.

---

## Features

- **Smart Import** — Drop any `.xlsx` or `.csv` file (GL statement, invoice list, monthly summary). Columns are auto-detected, customers are auto-created, and previous imports are replaced so every dashboard stays in sync.
- **13-Week Forecast** — Deterministic cash flow engine with weather adjustments, payment lag modeling, anomaly flags, and a full audit trail per week.
- **AI Copilot** — Ask natural language questions about your forecast data directly from the forecast view.
- **Projects & Milestones** — Planned vs. weather-shifted timelines for every active project.
- **Role-based dashboards** — Separate views for CFO, PE Board, OpCo, and Project Lead.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [TanStack Start](https://tanstack.com/start) (React + TypeScript) |
| Database & Auth | [Supabase](https://supabase.com) |
| UI | [shadcn/ui](https://ui.shadcn.com) + Tailwind CSS v4 |
| Charts | Recharts |
| Runtime | Bun |
| Build | Vite |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) `>= 1.0`
- A [Supabase](https://supabase.com) project

### 1. Clone & install

```bash
git clone https://github.com/KawtarLV/gl-guardian.git
cd gl-guardian
bun install
```

### 2. Set up environment variables

Create a `.env` file at the root:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

### 3. Run database migrations

```bash
supabase db push
```

### 4. Start the dev server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
src/
├── routes/
│   ├── _authenticated/     # Protected pages (dashboard, forecast, upload, ...)
│   ├── auth.tsx            # Login / sign-up
│   └── index.tsx           # Root redirect
├── components/             # Shared UI components
├── lib/                    # Server functions, forecast engine, parsers
└── integrations/           # Supabase client
```

---

## License

Private — all rights reserved.

# GL Guardian

A financial portfolio management platform built for CFOs, PE boards, and project leads to track forecasts, budgets, and project performance.

## Tech Stack

- **Framework:** TanStack Start (React + TypeScript)
- **Database & Auth:** Supabase
- **UI:** Tailwind CSS + shadcn/ui (Radix UI)
- **Build tool:** Vite + Bun

## Features

- Role-based dashboards (CFO, PE Board, OpCo, Project Lead)
- Financial forecasting and budget tracking
- Project portfolio management
- Data upload and import

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed
- A Supabase project

### Setup

```bash
# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Fill in your Supabase URL and anon key

# Start the dev server
bun run dev
```

The app will be running at `http://localhost:3000`.

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/forecast")({
  head: () => ({ meta: [{ title: "Forecast — Cashflow" }] }),
  component: () => (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-semibold mb-2">13-Week Forecast</h1>
      <p className="text-muted-foreground">
        Coming next: the deterministic engine (<code>src/lib/forecast-engine.ts</code>) wired to the
        dual-weather service, running balance chart, per-week drill-down with audit trail, and the AI copilot.
      </p>
    </div>
  ),
});

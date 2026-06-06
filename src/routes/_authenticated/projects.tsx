import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: "Projects — Cashflow" }] }),
  component: () => (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-semibold mb-2">Projects & Milestones</h1>
      <p className="text-muted-foreground">Timeline view with weather-shifted dates — wiring in next.</p>
    </div>
  ),
});

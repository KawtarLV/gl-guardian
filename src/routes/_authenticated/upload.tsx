import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({ meta: [{ title: "Upload & Map — Cashflow" }] }),
  component: () => (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-semibold mb-2">Upload & Map GL</h1>
      <p className="text-muted-foreground">
        Coming in the next build wave: drag-and-drop .xlsx upload, parsed preview, AI classification with
        confidence chips, editable review table, and the learning loop. The backend services
        (<code>src/lib/excel.server.ts</code>, <code>src/lib/ai.server.ts</code>) are ready to wire in.
      </p>
    </div>
  ),
});

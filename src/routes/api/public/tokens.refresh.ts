import { createFileRoute } from "@tanstack/react-router";
import { setLatestTokenDataset } from "@/lib/token-store";

export const Route = createFileRoute("/api/public/tokens/refresh")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "content-type",
          },
        }),
      POST: async () => {
        const headers = {
          "content-type": "application/json",
          "cache-control": "no-store",
          "Access-Control-Allow-Origin": "*",
        };
        try {
          const { runTokenCollection } = await import("@/lib/token-collector.server");
          const run = await runTokenCollection();
          if (!run.records.length) {
            return new Response(
              JSON.stringify({ ok: false, error: "no token rows collected", outcomes: run.outcomes }),
              { status: 502, headers },
            );
          }
          const stored = await setLatestTokenDataset({
            generated_at: run.generated_at,
            records: run.records,
          });
          return new Response(
            JSON.stringify({
              ok: true,
              generated_at: stored.generated_at,
              ingested_at: stored.ingested_at,
              record_count: stored.record_count,
              slices_ok: run.outcomes.filter((o) => o.status === "ok").length,
              slices_attempted: run.outcomes.length,
              duration_ms: run.duration_ms,
              outcomes: run.outcomes,
            }),
            { status: 200, headers },
          );
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message.slice(0, 400) : "token refresh failed",
            }),
            { status: 500, headers },
          );
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { getLatestDataset, setLatestDataset } from "@/lib/dataset-store";

export const Route = createFileRoute("/api/public/scrape")({
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
          const { runCollection, mergeWithPrevious } = await import("@/lib/collector.server");
          const run = await runCollection();
          const previous = await getLatestDataset();
          const merged = mergeWithPrevious(run.records, previous?.records ?? []);

          if (merged.length === 0) {
            return new Response(
              JSON.stringify({
                ok: false,
                error: "scraper run returned no rows",
                outcomes: run.outcomes,
              }),
              { status: 502, headers },
            );
          }

          const stored = await setLatestDataset({
            generated_at: run.generated_at,
            record_count: merged.length,
            records: merged,
          });

          // Token utilisation refreshes alongside the primary run.
          let tokens: { record_count: number; slices_ok: number; error?: string } = {
            record_count: 0,
            slices_ok: 0,
          };
          try {
            const { runTokenCollection } = await import("@/lib/token-collector.server");
            const { setLatestTokenDataset } = await import("@/lib/token-store");
            const tokenRun = await runTokenCollection();
            if (tokenRun.records.length) {
              const storedTokens = await setLatestTokenDataset({
                generated_at: tokenRun.generated_at,
                records: tokenRun.records,
              });
              tokens = {
                record_count: storedTokens.record_count,
                slices_ok: tokenRun.outcomes.filter((o) => o.status === "ok").length,
              };
            }
          } catch (tokenError) {
            tokens.error =
              tokenError instanceof Error ? tokenError.message.slice(0, 200) : "token run failed";
          }

          const ok = run.outcomes.filter((o) => o.status === "ok").length;
          return new Response(
            JSON.stringify({
              ok: true,
              generated_at: stored.generated_at,
              ingested_at: stored.ingested_at,
              record_count: stored.record_count,
              fresh_records: run.records.length,
              sources_attempted: run.outcomes.length,
              sources_ok: ok,
              duration_ms: run.duration_ms,
              outcomes: run.outcomes,
            }),
            { status: 200, headers },
          );
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message.slice(0, 500) : "scrape failed",
            }),
            { status: 500, headers },
          );
        }
      },
    },
  },
});

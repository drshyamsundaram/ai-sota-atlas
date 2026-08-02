import { createFileRoute } from "@tanstack/react-router";
import { setLatestDataset } from "@/lib/dataset-store";
import { parseDataset } from "@/lib/schema";

export const Route = createFileRoute("/api/public/ingest")({
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
      POST: async ({ request }) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "content-type": "application/json",
        };
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "invalid JSON body" }), {
            status: 400,
            headers: cors,
          });
        }

        const rows = Array.isArray(body)
          ? body
          : ((body as { records?: unknown[] })?.records ?? []);
        if (!Array.isArray(rows)) {
          return new Response(JSON.stringify({ error: "expected `records` array" }), {
            status: 400,
            headers: cors,
          });
        }
        if (rows.length > 5000) {
          return new Response(JSON.stringify({ error: "payload too large (max 5000 rows)" }), {
            status: 413,
            headers: cors,
          });
        }

        try {
          const dataset = parseDataset(body);
          const categoriesSeen = [...new Set(dataset.records.map((r) => r.category))];
          const stored = setLatestDataset(dataset);
          return new Response(
            JSON.stringify({
              ok: true,
              accepted: dataset.records.length,
              categories: categoriesSeen,
              received_at: stored.ingested_at,
            }),
            { status: 200, headers: cors },
          );
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "schema validation failed",
              detail: error instanceof Error ? error.message.slice(0, 2000) : "unknown",
            }),
            { status: 422, headers: cors },
          );
        }
      },
    },
  },
});

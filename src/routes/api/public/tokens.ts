import { createFileRoute } from "@tanstack/react-router";
import { getLatestTokenDataset } from "@/lib/token-store";
import type { TokenRecord } from "@/lib/token-schema";

const CORS = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "Access-Control-Allow-Origin": "*",
};

function toCsv(rows: TokenRecord[]): string {
  const header = [
    "slice_id",
    "slice_label",
    "rank",
    "model_id",
    "model_name",
    "developer",
    "country",
    "tokens_processed",
    "tokens_display",
    "token_share_pct",
    "token_growth_pct",
    "source_url",
    "retrieved_at",
  ];
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    header.join(","),
    ...rows.map((r) => header.map((k) => escape((r as never)[k as never])).join(",")),
  ].join("\n");
}

export const Route = createFileRoute("/api/public/tokens")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "content-type",
          },
        }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slice = url.searchParams.get("slice");
        const country = url.searchParams.get("country");
        const model = url.searchParams.get("model");
        const developer = url.searchParams.get("developer");
        const groupBy = url.searchParams.get("group_by");
        const format = (url.searchParams.get("format") ?? "json").toLowerCase();
        const limitRaw = Number(url.searchParams.get("limit") ?? "500");
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 500;

        const latest = await getLatestTokenDataset();
        let rows = latest?.records ?? [];

        if (slice) rows = rows.filter((r) => r.slice_id === slice);
        if (country) rows = rows.filter((r) => r.country.toLowerCase() === country.toLowerCase());
        if (developer)
          rows = rows.filter((r) => r.developer.toLowerCase() === developer.toLowerCase());
        if (model) {
          const q = model.toLowerCase();
          rows = rows.filter(
            (r) => r.model_id.toLowerCase().includes(q) || r.model_name.toLowerCase().includes(q),
          );
        }
        rows = rows.sort((a, b) => b.tokens_processed - a.tokens_processed).slice(0, limit);

        if (groupBy === "country" || groupBy === "developer" || groupBy === "model") {
          const key = (r: TokenRecord) =>
            groupBy === "country" ? r.country : groupBy === "developer" ? r.developer : r.model_id;
          const map = new Map<string, { tokens: number; models: Set<string>; rows: number }>();
          for (const r of rows) {
            const k = key(r);
            const entry = map.get(k) ?? { tokens: 0, models: new Set<string>(), rows: 0 };
            entry.tokens += r.tokens_processed;
            entry.models.add(r.model_id);
            entry.rows += 1;
            map.set(k, entry);
          }
          const total = [...map.values()].reduce((s, e) => s + e.tokens, 0) || 1;
          const groups = [...map.entries()]
            .map(([k, e]) => ({
              key: k,
              tokens_processed: e.tokens,
              share_pct: Number(((e.tokens / total) * 100).toFixed(2)),
              models: e.models.size,
              rows: e.rows,
            }))
            .sort((a, b) => b.tokens_processed - a.tokens_processed);
          return new Response(
            JSON.stringify({
              generated_at: latest?.generated_at ?? null,
              ingested_at: latest?.ingested_at ?? null,
              group_by: groupBy,
              group_count: groups.length,
              groups,
            }),
            { status: 200, headers: CORS },
          );
        }

        if (format === "csv") {
          return new Response(toCsv(rows), {
            status: 200,
            headers: {
              "content-type": "text/csv; charset=utf-8",
              "content-disposition": 'attachment; filename="token_utilization.csv"',
              "Access-Control-Allow-Origin": "*",
              "cache-control": "no-store",
            },
          });
        }

        return new Response(
          JSON.stringify({
            generated_at: latest?.generated_at ?? null,
            ingested_at: latest?.ingested_at ?? null,
            record_count: rows.length,
            records: rows,
          }),
          { status: 200, headers: CORS },
        );
      },
    },
  },
});

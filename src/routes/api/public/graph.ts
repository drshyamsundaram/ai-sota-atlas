import { createFileRoute } from "@tanstack/react-router";
import { getLatestDataset } from "@/lib/dataset-store";
import { getLatestTokenDataset } from "@/lib/token-store";
import { buildGraph, miniGraph } from "@/lib/graph";

export const Route = createFileRoute("/api/public/graph")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const [bench, tokens] = await Promise.all([getLatestDataset(), getLatestTokenDataset()]);
        const full = buildGraph(bench?.records ?? [], tokens?.records ?? []);
        const types = url.searchParams.get("types")?.split(",").filter(Boolean);
        let graph = url.searchParams.get("mini") === "true" ? miniGraph(full) : full;
        if (types?.length) {
          const keep = new Set(graph.nodes.filter((n) => types.includes(n.type)).map((n) => n.id));
          graph = {
            nodes: graph.nodes.filter((n) => keep.has(n.id)),
            links: graph.links.filter((l) => keep.has(l.source) && keep.has(l.target)),
          };
        }
        return new Response(
          JSON.stringify({
            generated_at: bench?.generated_at ?? null,
            tokens_generated_at: tokens?.generated_at ?? null,
            node_count: graph.nodes.length,
            link_count: graph.links.length,
            stats: full.stats,
            nodes: graph.nodes,
            links: graph.links,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      },
    },
  },
});

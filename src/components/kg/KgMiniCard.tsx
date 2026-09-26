import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Network } from "lucide-react";
import { KgGraph } from "./KgGraph";
import { useKgData } from "@/hooks/use-kg-data";
import { NODE_TYPES, miniGraph } from "@/lib/graph";

export function KgMiniCard() {
  const { graph } = useKgData();
  const mini = useMemo(() => miniGraph(graph, 40), [graph]);
  return (
    <Link
      to="/knowledge-graph"
      className="group mb-8 block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/60"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Network className="size-4 text-primary" />
          <span className="text-sm font-semibold">LLM &amp; Tokenomics KG</span>
          <span className="mono-label hidden sm:inline">
            · {graph.nodes.length} nodes · {graph.links.length} links
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {NODE_TYPES.map((t) => (
            <span key={t.id} className="mono-label flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: t.color }} />
              {t.label}
            </span>
          ))}
          <span className="mono-label flex items-center gap-1 text-primary">
            Explore <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </div>
      <div className="pointer-events-auto">
        {mini.nodes.length ? (
          <KgGraph data={mini} height={300} mini />
        ) : (
          <div className="flex h-[300px] items-center justify-center mono-label">loading graph…</div>
        )}
      </div>
    </Link>
  );
}

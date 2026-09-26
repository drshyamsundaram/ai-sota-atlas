import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, FileJson, Maximize2, Network, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KgGraph, type ForceGraphHandle } from "@/components/kg/KgGraph";
import { useKgData } from "@/hooks/use-kg-data";
import { NODE_TYPES, type GraphNode, type NodeType } from "@/lib/graph";

export const Route = createFileRoute("/knowledge-graph")({
  head: () => ({
    meta: [
      { title: "LLM & Tokenomics KG — AI SOTA Shift Tracker" },
      {
        name: "description",
        content:
          "Interactive knowledge graph linking LLMs, developers, countries, benchmarks and token usage.",
      },
      { property: "og:title", content: "LLM & Tokenomics KG — AI SOTA Shift Tracker" },
      {
        property: "og:description",
        content: "Explore how models, benchmarks, developers, countries and token usage connect.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KnowledgeGraphPage,
});

const RELATION_LABEL: Record<string, string> = {
  builds: "builds",
  based_in: "based in",
  scored_on: "scored on",
  belongs_to: "belongs to",
  used_in: "used in",
};

function KnowledgeGraphPage() {
  const { graph, isLoading } = useKgData();
  const fgRef = useRef<ForceGraphHandle>(null);
  const [types, setTypes] = useState<Set<NodeType>>(new Set(NODE_TYPES.map((t) => t.id)));
  const [country, setCountry] = useState("all");
  const [category, setCategory] = useState("all");
  const [slice, setSlice] = useState("all");
  const [topN, setTopN] = useState(40);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GraphNode | null>(null);

  const byType = (t: NodeType) => graph.nodes.filter((n) => n.type === t);
  const countries = useMemo(() => byType("country"), [graph]);
  const categories = useMemo(() => byType("category"), [graph]);
  const slices = useMemo(() => byType("slice"), [graph]);

  const filtered = useMemo(() => {
    const adj = new Map<string, Set<string>>();
    for (const l of graph.links) {
      if (!adj.has(l.source)) adj.set(l.source, new Set());
      if (!adj.has(l.target)) adj.set(l.target, new Set());
      adj.get(l.source)!.add(l.target);
      adj.get(l.target)!.add(l.source);
    }
    // choose models
    let models = byType("model");
    if (country !== "all")
      models = models.filter((m) => {
        const devs = [...(adj.get(m.id) ?? [])].filter((x) => x.startsWith("developer:"));
        return devs.some((d) => adj.get(d)?.has(country));
      });
    if (category !== "all")
      models = models.filter((m) =>
        [...(adj.get(m.id) ?? [])].some((b) => b.startsWith("benchmark:") && adj.get(b)?.has(category)),
      );
    if (slice !== "all") models = models.filter((m) => adj.get(m.id)?.has(slice));
    models = models
      .sort((a, b) => (b.tokens ?? 0) - (a.tokens ?? 0) || b.size - a.size)
      .slice(0, topN);
    const keep = new Set(models.map((m) => m.id));
    for (const m of models) for (const n of adj.get(m.id) ?? []) keep.add(n);
    for (const id of [...keep])
      if (id.startsWith("developer:") || id.startsWith("benchmark:"))
        for (const n of adj.get(id) ?? [])
          if (n.startsWith("country:") || n.startsWith("category:")) keep.add(n);
    if (country !== "all") keep.add(country);
    const nodes = graph.nodes.filter((n) => keep.has(n.id) && types.has(n.type));
    const ids = new Set(nodes.map((n) => n.id));
    return {
      nodes,
      links: graph.links.filter((l) => ids.has(l.source) && ids.has(l.target)),
    };
  }, [graph, types, country, category, slice, topN]);

  const connections = useMemo(() => {
    if (!selected) return [];
    const label = new Map(graph.nodes.map((n) => [n.id, n]));
    return graph.links
      .filter((l) => l.source === selected.id || l.target === selected.id)
      .map((l) => {
        const out = l.source === selected.id;
        const other = label.get(out ? l.target : l.source)!;
        return { l, out, other };
      })
      .sort((a, b) => a.other.type.localeCompare(b.other.type));
  }, [selected, graph]);

  function runSearch() {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = filtered.nodes.find((n) => n.label.toLowerCase().includes(q));
    if (hit) {
      setSelected(hit);
      fgRef.current?.zoomTo(hit.id);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "llm_tokenomics_kg.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const selectCls =
    "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div>
            <nav className="mono-label mb-2 flex gap-4">
              <Link to="/" className="hover:text-primary">← Dashboard</Link>
              <Link to="/tokens" className="hover:text-primary">Token utilisation</Link>
              <Link to="/api-docs" className="hover:text-primary">API docs</Link>
            <Link to="/docs" className="hover:text-primary">
              Docs
            </Link>
            </nav>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Network className="size-6 text-primary" /> LLM &amp; Tokenomics KG
            </h1>
            <p className="mono-label mt-2">
              {graph.nodes.length} nodes · {graph.links.length} links · {graph.stats.matched} models
              matched across benchmarks &amp; tokens · {graph.stats.benchmarkOnly} benchmark-only ·{" "}
              {graph.stats.tokenOnly} token-only
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => fgRef.current?.reset()}>
              <Maximize2 className="size-4" /> Reset view
            </Button>
            <Button variant="outline" size="sm" onClick={() => fgRef.current?.exportPng()}>
              <Download className="size-4" /> PNG
            </Button>
            <Button size="sm" onClick={exportJson}>
              <FileJson className="size-4" /> JSON
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[240px_1fr_300px]">
        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mono-label mb-2">Search</p>
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="e.g. Claude"
              />
              <Button size="icon" variant="outline" onClick={runSearch} aria-label="Find node">
                <Search className="size-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <p className="mono-label">Node types</p>
            {NODE_TYPES.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={types.has(t.id)}
                  onChange={() => {
                    const next = new Set(types);
                    next.has(t.id) ? next.delete(t.id) : next.add(t.id);
                    setTypes(next);
                  }}
                />
                <span className="size-3 rounded-full" style={{ background: t.color }} />
                {t.label}
              </label>
            ))}
          </div>
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <label className="block space-y-1">
              <span className="mono-label">Country</span>
              <select className={selectCls} value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="all">All countries</option>
                {countries.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="mono-label">Category</span>
              <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="all">All categories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="mono-label">Token slice</span>
              <select className={selectCls} value={slice} onChange={(e) => setSlice(e.target.value)}>
                <option value="all">All slices</option>
                {slices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="mono-label">Top models: {topN}</span>
              <input
                type="range"
                min={5}
                max={150}
                step={5}
                value={topN}
                onChange={(e) => setTopN(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </label>
          </div>
        </aside>

        <section className="overflow-hidden rounded-lg border border-border bg-card">
          {isLoading ? (
            <div className="flex h-[640px] items-center justify-center mono-label">loading data…</div>
          ) : (
            <KgGraph
              ref={fgRef}
              data={filtered}
              height={640}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
            />
          )}
        </section>

        <aside className="rounded-lg border border-border bg-card p-4">
          {!selected ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="mono-label">Details</p>
              <p>Click a dot to see its connections, scores and token numbers.</p>
              <p>Drag to move, scroll to zoom. Bigger model dots = more tokens processed.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Badge variant="outline" className="mb-2 capitalize">{selected.type}</Badge>
                <h2 className="text-lg font-semibold">{selected.label}</h2>
              </div>
              {selected.meta && Object.keys(selected.meta).length > 0 && (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(selected.meta).map(([k, v]) =>
                    v == null || k === "url" ? null : (
                      <div key={k}>
                        <dt className="mono-label">{k.replace(/_/g, " ")}</dt>
                        <dd className="truncate">{String(v)}</dd>
                      </div>
                    ),
                  )}
                </dl>
              )}
              <div>
                <p className="mono-label mb-2">Connections ({connections.length})</p>
                <ul className="max-h-[380px] space-y-1 overflow-auto text-sm">
                  {connections.map(({ l, out, other }, i) => (
                    <li key={i}>
                      <button
                        className="w-full rounded px-2 py-1 text-left hover:bg-muted"
                        onClick={() => {
                          setSelected(other);
                          fgRef.current?.zoomTo(other.id);
                        }}
                      >
                        <span className="mono-label">
                          {out ? RELATION_LABEL[l.relation] : `← ${RELATION_LABEL[l.relation]}`}
                        </span>{" "}
                        {other.label}
                        {l.label ? <span className="text-muted-foreground"> · {l.label}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mono-label flex gap-3">
                <Link to="/" className="hover:text-primary">Leaderboard →</Link>
                <Link to="/tokens" className="hover:text-primary">Tokens report →</Link>
              </div>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

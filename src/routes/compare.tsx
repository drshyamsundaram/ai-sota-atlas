import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GitCompareArrows, X } from "lucide-react";
import { recordSchema, type LeaderboardRecord } from "@/lib/schema";
import { tokenRecordSchema, type TokenRecord } from "@/lib/token-schema";
import { specialistModels, EVIDENCE_LABEL } from "@/data/specialist-models";
import { categories } from "@/data/config";
import { PaniniChat } from "@/components/panini/PaniniChat";
import { Disclaimer } from "@/components/Disclaimer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { z } from "zod";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Compare models — AI SOTA Shift Tracker" },
      {
        name: "description",
        content:
          "Compare LLMs side by side by category, parameters, token usage and benchmark scores, with a Panini-powered Q&A grounded in the AI-SOTA knowledge graph.",
      },
      { property: "og:title", content: "Compare models — AI SOTA Shift Tracker" },
      {
        property: "og:description",
        content:
          "Side-by-side model comparison across categories, parameters, token usage and benchmark scores, plus Panini Q&A.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComparePage,
});

type CompareModel = {
  key: string;
  name: string;
  developer: string | null;
  country: string | null;
  categories: Set<string>;
  parameters: string | null;
  evidence: string | null;
  url: string | null;
  tokens: number;
  tokenShare: number | null;
  tokenGrowth: number | null;
  scores: Map<string, { value: number | null; unit: string; rank: number | null }>;
};

const PARAM_RE = /(\d+(?:\.\d+)?\s*[BTM](?:\s*total)?(?:\s*\/\s*\d+(?:\.\d+)?\s*[BTM]\s*active)?)/i;

function extractParams(text: string | undefined): string | null {
  if (!text) return null;
  const m = text.match(PARAM_RE);
  return m ? m[1]!.replace(/\s+/g, " ") : null;
}

function ComparePage() {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const leaderboardQuery = useQuery({
    queryKey: ["compare-dataset"],
    queryFn: async () => {
      const res = await fetch("/api/public/dataset", { cache: "no-store" });
      if (!res.ok) throw new Error(`dataset fetch failed (${res.status})`);
      const body = (await res.json()) as { records: unknown[] };
      return z.array(recordSchema).parse(body.records);
    },
    staleTime: 60_000,
  });

  const tokenQuery = useQuery({
    queryKey: ["compare-tokens"],
    queryFn: async () => {
      const res = await fetch("/api/public/tokens?limit=2000", { cache: "no-store" });
      if (!res.ok) throw new Error(`token fetch failed (${res.status})`);
      const body = (await res.json()) as { records: unknown[] };
      return z.array(tokenRecordSchema).parse(body.records);
    },
    staleTime: 60_000,
  });

  const models = useMemo(() => {
    const map = new Map<string, CompareModel>();
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const get = (name: string): CompareModel => {
      const key = norm(name);
      const cur = map.get(key);
      if (cur) return cur;
      const created: CompareModel = {
        key,
        name,
        developer: null,
        country: null,
        categories: new Set(),
        parameters: null,
        evidence: null,
        url: null,
        tokens: 0,
        tokenShare: null,
        tokenGrowth: null,
        scores: new Map(),
      };
      map.set(key, created);
      return created;
    };

    for (const r of (leaderboardQuery.data ?? []) as LeaderboardRecord[]) {
      const m = get(r.model_name);
      m.categories.add(r.category);
      const prev = m.scores.get(r.benchmark_name);
      if (!prev || (r.rank != null && (prev.rank == null || r.rank < prev.rank))) {
        m.scores.set(r.benchmark_name, {
          value: r.metric_value,
          unit: r.metric_unit,
          rank: r.rank ?? null,
        });
      }
    }

    for (const t of (tokenQuery.data ?? []) as TokenRecord[]) {
      if (t.slice_id !== "overall") continue;
      const m = get(t.model_name);
      m.developer = m.developer ?? t.developer;
      m.country = m.country ?? t.country;
      m.tokens += t.tokens_processed;
      m.tokenShare = t.token_share_pct;
      m.tokenGrowth = t.token_growth_pct;
    }

    for (const s of specialistModels) {
      const m = get(s.name);
      m.categories.add(s.category);
      m.developer = m.developer ?? s.developer;
      m.country = m.country ?? s.country;
      m.parameters = m.parameters ?? extractParams(s.kind) ?? extractParams(s.claim);
      m.evidence = EVIDENCE_LABEL[s.evidence];
      m.url = s.url;
    }

    return [...map.values()].sort((a, b) => b.tokens - a.tokens);
  }, [leaderboardQuery.data, tokenQuery.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter(
      (m) =>
        (category === "all" || m.categories.has(category)) &&
        (!q ||
          m.name.toLowerCase().includes(q) ||
          (m.developer ?? "").toLowerCase().includes(q)),
    );
  }, [models, category, search]);

  const chosen = useMemo(
    () => selected.map((k) => models.find((m) => m.key === k)).filter((m): m is CompareModel => !!m),
    [selected, models],
  );

  const benchmarkColumns = useMemo(() => {
    const set = new Set<string>();
    for (const m of chosen) for (const b of m.scores.keys()) set.add(b);
    return [...set].sort();
  }, [chosen]);

  const toggle = (key: string) =>
    setSelected((cur) =>
      cur.includes(key) ? cur.filter((k) => k !== key) : cur.length >= 4 ? cur : [...cur, key],
    );

  const fmtTokens = (n: number) =>
    n >= 1e12 ? `${(n / 1e12).toFixed(1)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n ? String(n) : "—";

  const loading = leaderboardQuery.isLoading || tokenQuery.isLoading;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-center gap-3">
        <GitCompareArrows className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">Compare models</h1>
        <nav className="mono-label ml-auto flex flex-wrap items-center gap-4">
          <Link to="/" className="hover:text-primary">Dashboard</Link>
          <Link to="/tokens" className="hover:text-primary">Token utilisation</Link>
          <Link to="/knowledge-graph" className="hover:text-primary">AI-SOTA KG</Link>
          <Link to="/panini" className="hover:text-primary">Panini chat</Link>
        </nav>
      </header>
      <Disclaimer />

      <section className="panel mt-6 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models or developers…"
            className="w-64"
          />
          <span className="text-xs text-muted-foreground">
            Pick up to 4 models ({selected.length}/4 selected)
          </span>
        </div>

        <div className="mt-4 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading models…</p>
          ) : (
            filtered.slice(0, 120).map((m) => {
              const active = selected.includes(m.key);
              return (
                <button
                  key={m.key}
                  onClick={() => toggle(m.key)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    active
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m.name}
                </button>
              );
            })
          )}
        </div>
      </section>

      {chosen.length > 0 && (
        <section className="panel mt-6 overflow-x-auto p-5">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-4 font-medium text-muted-foreground">Attribute</th>
                {chosen.map((m) => (
                  <th key={m.key} className="py-2 pr-4 font-medium">
                    <span className="flex items-center gap-2">
                      {m.name}
                      <button
                        onClick={() => toggle(m.key)}
                        aria-label={`Remove ${m.name}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4 text-muted-foreground">Developer</td>
                {chosen.map((m) => <td key={m.key} className="py-2 pr-4">{m.developer ?? "—"}</td>)}
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4 text-muted-foreground">Country</td>
                {chosen.map((m) => <td key={m.key} className="py-2 pr-4">{m.country ?? "—"}</td>)}
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4 text-muted-foreground">Categories</td>
                {chosen.map((m) => (
                  <td key={m.key} className="py-2 pr-4">
                    <span className="flex flex-wrap gap-1">
                      {[...m.categories].map((c) => (
                        <Badge key={c} variant="secondary" className="text-[10px]">
                          {categories.find((x) => x.id === c)?.title ?? c}
                        </Badge>
                      ))}
                    </span>
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4 text-muted-foreground">Parameters</td>
                {chosen.map((m) => <td key={m.key} className="py-2 pr-4 font-mono text-xs">{m.parameters ?? "—"}</td>)}
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4 text-muted-foreground">Weekly tokens (OpenRouter)</td>
                {chosen.map((m) => <td key={m.key} className="py-2 pr-4 font-mono text-xs">{fmtTokens(m.tokens)}</td>)}
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4 text-muted-foreground">Token share / growth</td>
                {chosen.map((m) => (
                  <td key={m.key} className="py-2 pr-4 font-mono text-xs">
                    {m.tokenShare != null ? `${m.tokenShare.toFixed(1)}%` : "—"}
                    {" / "}
                    {m.tokenGrowth != null ? `${m.tokenGrowth > 0 ? "+" : ""}${m.tokenGrowth.toFixed(1)}%` : "—"}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4 text-muted-foreground">Evidence</td>
                {chosen.map((m) => (
                  <td key={m.key} className="py-2 pr-4 text-xs">
                    {m.evidence ?? (m.scores.size ? "Collected scores" : "—")}
                    {m.url && (
                      <>
                        {" · "}
                        <a href={m.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                          source
                        </a>
                      </>
                    )}
                  </td>
                ))}
              </tr>
              {benchmarkColumns.map((b) => (
                <tr key={b} className="border-b border-border/60">
                  <td className="py-2 pr-4 text-muted-foreground">{b}</td>
                  {chosen.map((m) => {
                    const s = m.scores.get(b);
                    return (
                      <td key={m.key} className="py-2 pr-4 font-mono text-xs">
                        {s ? `${s.value != null ? s.value : "—"} ${s.unit}${s.rank != null ? ` (#${s.rank})` : ""}` : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Ask Panini about these models</h2>
        <PaniniChat compact />
      </section>
    </div>
  );
}

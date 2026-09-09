import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Bot,
  Database,
  Download,
  ExternalLink,
  Gauge,
  Github,
  RefreshCw,
  ShieldAlert,
  Timer,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";

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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";
import { categories, rules, spec } from "@/data/config";
import seed from "@/data/records.json";
import { parseDataset, type LeaderboardRecord } from "@/lib/schema";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI SOTA Shift Tracker | LLM Leaderboard Signals | Dr Shyam S" },
      {
        name: "description",
        content:
          "Track state-of-the-art LLM shifts across global, hallucination, India, China and Europe leaderboards from one normalized, source-backed dataset.",
      },
      { property: "og:title", content: "AI SOTA Shift Tracker | LLM Leaderboard Signals | Dr Shyam S" },
      {
        property: "og:description",
        content:
          "Track state-of-the-art LLM shifts across global, hallucination, India, China and Europe leaderboards from one normalized, source-backed dataset.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const seedDataset = parseDataset(seed);

const LOWER_IS_BETTER = new Set(["hallucination_rate", "latency", "token_cost", "price"]);

const REFRESH_OPTIONS: { ms: number; label: string }[] = [
  { ms: 0, label: "off" },
  { ms: 60_000, label: "1 min" },
  { ms: 5 * 60_000, label: "5 min" },
  { ms: 15 * 60_000, label: "15 min" },
  { ms: 60 * 60_000, label: "1 hour" },
  { ms: 6 * 60 * 60_000, label: "6 hours" },
];

function formatValue(record: LeaderboardRecord) {
  if (record.metric_value === null || record.metric_value === undefined) return "—";
  const v = record.metric_value;
  switch (record.metric_unit) {
    case "percent":
      return `${v}%`;
    case "usd_per_mtok":
      return `$${v}/Mtok`;
    case "seconds":
      return `${v}s`;
    case "tokens_per_second":
      return `${v} tok/s`;
    default:
      return String(v);
  }
}

function Dashboard() {
  const [records, setRecords] = useState<LeaderboardRecord[]>(seedDataset.records);
  const [generatedAt, setGeneratedAt] = useState(seedDataset.generated_at ?? "");
  const [category, setCategory] = useState<string>(categories[0]!.id);
  const [region, setRegion] = useState<string>("all");
  const [metric, setMetric] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [intervalMs, setIntervalMs] = useState<number>(60_000);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    data: liveDataset,
    dataUpdatedAt,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["live-dataset"],
    queryFn: async () => {
      const res = await fetch("/api/public/dataset", { cache: "no-store" });
      if (!res.ok) throw new Error(`dataset fetch failed (${res.status})`);
      return (await res.json()) as {
        generated_at: string | null;
        ingested_at: string | null;
        record_count: number;
        records: unknown[];
      };
    },
    refetchInterval: intervalMs || false,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    if (!liveDataset || liveDataset.record_count === 0) return;
    if (liveDataset.generated_at && liveDataset.generated_at === generatedAt) return;
    try {
      const parsed = parseDataset(liveDataset);
      setRecords(parsed.records);
      setGeneratedAt(parsed.generated_at ?? new Date().toISOString());
      toast.success(`Scheduled refresh: ${parsed.records.length} records`);
    } catch {
      toast.error("Scheduled refresh returned an invalid dataset");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDataset]);

  const [isScraping, setIsScraping] = useState(false);
  const [batchInfo, setBatchInfo] = useState<{
    ingested_at: string;
    record_count: number;
    sources_ok: number;
    sources_attempted: number;
  } | null>(null);

  const handleManualRefresh = async () => {
    setIsScraping(true);
    const pending = toast.loading("Running the collector across the configured sources…");
    try {
      const res = await fetch("/api/public/scrape", { method: "POST" });
      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
        generated_at?: string;
        ingested_at?: string;
        record_count?: number;
        sources_ok?: number;
        sources_attempted?: number;
        fresh_records?: number;
      };
      if (!res.ok || !body.ok) {
        toast.error(body.error ?? "The collector run failed", { id: pending });
      } else {
        setBatchInfo({
          ingested_at: body.ingested_at ?? new Date().toISOString(),
          record_count: body.record_count ?? 0,
          sources_ok: body.sources_ok ?? 0,
          sources_attempted: body.sources_attempted ?? 0,
        });
        toast.success(
          `New batch stored — ${body.record_count} rows (${body.fresh_records} freshly scraped from ${body.sources_ok}/${body.sources_attempted} sources)`,
          { id: pending },
        );
      }
    } catch {
      toast.error("Could not reach the data service", { id: pending });
    } finally {
      setIsScraping(false);
    }
    await refetch();
  };



  const catRecords = useMemo(
    () => records.filter((r) => r.category === category),
    [records, category],
  );

  const metricOptions = useMemo(
    () => [...new Set(catRecords.map((r) => r.metric_name))].sort(),
    [catRecords],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catRecords
      .filter((r) => (region === "all" ? true : r.scope_region === region))
      .filter((r) => (metric === "all" ? true : r.metric_name === metric))
      .filter((r) =>
        q
          ? `${r.model_name} ${r.model_version ?? ""} ${r.benchmark_name} ${r.source_name}`
              .toLowerCase()
              .includes(q)
          : true,
      )
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  }, [catRecords, region, metric, query]);

  const chartMetric = metric === "all" ? (metricOptions[0] ?? "") : metric;
  const chartData = useMemo(() => {
    const rows = catRecords.filter((r) => r.metric_name === chartMetric);
    const lowerBetter = LOWER_IS_BETTER.has(chartMetric);
    return rows
      .slice()
      .sort((a, b) =>
        lowerBetter
          ? (a.metric_value ?? 0) - (b.metric_value ?? 0)
          : (b.metric_value ?? 0) - (a.metric_value ?? 0),
      )
      .slice(0, spec.max_items_per_category)
      .map((r) => ({
        label: `${r.model_name} ${r.model_version ?? ""}`.trim(),
        value: r.metric_value ?? 0,
        unit: r.metric_unit,
      }));
  }, [catRecords, chartMetric]);

  const activeCategory = categories.find((c) => c.id === category)!;
  const sourceCount = new Set(records.map((r) => r.source_name)).size;
  const modelCount = new Set(records.map((r) => `${r.model_name}${r.model_version ?? ""}`)).size;
  const safetyRows = records.filter((r) => r.task_type === "hallucination").length;

  function handleImport(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataset = parseDataset(JSON.parse(String(reader.result)));
        setRecords(dataset.records);
        setGeneratedAt(dataset.generated_at ?? new Date().toISOString());
        setCategory(dataset.records[0]?.category ?? categories[0]!.id);
        setMetric("all");
        toast.success(`Loaded ${dataset.records.length} normalized records`);
      } catch (error) {
        toast.error("Invalid dataset", {
          description: error instanceof Error ? error.message.slice(0, 160) : "Schema mismatch",
        });
      }
    };
    reader.readAsText(file);
  }

  function handleExport() {
    const blob = new Blob(
      [
        JSON.stringify(
          { generated_at: generatedAt, record_count: records.length, records },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sota_shift_dataset.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen">
      <Toaster />
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md border border-primary/40 bg-primary/10">
              <Gauge className="size-5 text-primary" />
            </span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                AI SOTA <span className="text-gradient-accent">Shift Tracker</span>
              </h1>
              <p className="mono-label">normalized llm leaderboard signals</p>
            </div>
          </div>
          <nav className="mono-label ml-6 flex items-center gap-4">
            <Link to="/tokens" className="hover:text-primary">
              Token utilisation
            </Link>
            <Link to="/api-docs" className="hover:text-primary">
              API docs
            </Link>
            <a
              href="https://www.linkedin.com/in/bioenable/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary"
            >
              About author
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }}
            />
            <Select
              value={String(intervalMs)}
              onValueChange={(v) => {
                setIntervalMs(Number(v));
                toast.info(
                  Number(v) === 0
                    ? "Auto-refresh paused"
                    : `Auto-refresh every ${REFRESH_OPTIONS.find((o) => o.ms === Number(v))?.label}`,
                );
              }}
            >
              <SelectTrigger className="h-9 w-[190px]">
                <RefreshCw className={`size-4 ${isFetching ? "animate-spin text-primary" : ""}`} />
                <SelectValue placeholder="Auto-refresh" />
              </SelectTrigger>
              <SelectContent>
                {REFRESH_OPTIONS.map((o) => (
                  <SelectItem key={o.ms} value={String(o.ms)}>
                    {o.ms === 0 ? "Auto-refresh: off" : `Every ${o.label}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={isFetching || isScraping}
            >
              <RefreshCw className={`size-4 ${isFetching || isScraping ? "animate-spin" : ""}`} />
              {isScraping ? "Scraping…" : "Refresh now"}
            </Button>

            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> Import JSON
            </Button>
            <Button size="sm" onClick={handleExport}>
              <Download className="size-4" /> Export dataset
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Database} label="Normalized records" value={String(records.length)} />
          <StatCard icon={Bot} label="Distinct models" value={String(modelCount)} />
          <StatCard icon={ExternalLink} label="Sources ingested" value={String(sourceCount)} />
          <StatCard
            icon={ShieldAlert}
            label="Hallucination rows"
            value={String(safetyRows)}
            tone="accent"
          />
        </section>

        <p className="mono-label mt-3 flex flex-wrap items-center gap-2">
          <Timer className="size-3.5" /> latest batch{" "}
          {(liveDataset?.generated_at ?? generatedAt) || "—"}
          {liveDataset?.ingested_at || batchInfo?.ingested_at
            ? ` · stored ${new Date(batchInfo?.ingested_at ?? liveDataset!.ingested_at!).toLocaleString()}`
            : ""}
          {" · "}
          {batchInfo
            ? `${batchInfo.record_count} rows from ${batchInfo.sources_ok}/${batchInfo.sources_attempted} sources`
            : `${records.length} rows`}
          {" · cap "}
          {spec.max_items_per_category} items / category ·{" "}
          {intervalMs
            ? `auto-refresh every ${REFRESH_OPTIONS.find((o) => o.ms === intervalMs)?.label}`
            : "auto-refresh off"}
          {dataUpdatedAt ? ` · last checked ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ""}
        </p>


        <nav className="mt-6 flex flex-wrap gap-2">
          {categories.map((c) => {
            const count = records.filter((r) => r.category === c.id).length;
            const active = c.id === category;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setCategory(c.id);
                  setMetric("all");
                }}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.title}
                <span className="ml-2 font-mono text-xs opacity-70">{count}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <div className="panel p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <h2 className="text-base font-semibold">{activeCategory.title}</h2>
                  <p className="mono-label">
                    top {spec.max_items_per_category} by {chartMetric || "metric"}
                  </p>
                </div>
              </div>

              <div className="mt-5 h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <CartesianGrid horizontal={false} stroke="var(--border)" />
                      <XAxis
                        type="number"
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={150}
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                        tickLine={false}
                      />
                      <ReTooltip
                        cursor={{ fill: "var(--muted)" }}
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {chartData.map((_, i) => (
                          <Cell key={i} fill={i === 0 ? "var(--chart-1)" : "var(--chart-3)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No numeric records for this category yet — run the pipeline and import the
                    dataset.
                  </p>
                )}
              </div>
            </div>

            <div className="panel overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                <h3 className="text-sm font-semibold">Details</h3>
                <Badge variant="secondary" className="font-mono text-xs">
                  {filtered.length}
                </Badge>
              </div>
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Benchmark</TableHead>
                      <TableHead>Metric</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.raw_hash || `${r.source_url}-${r.model_name}-${r.metric_name}`}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {r.rank ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{r.model_name}</span>
                          {r.model_version ? (
                            <span className="ml-1 font-mono text-xs text-muted-foreground">
                              v{r.model_version}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.benchmark_name}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`font-mono text-[11px] ${
                              LOWER_IS_BETTER.has(r.metric_name)
                                ? "border-accent/50 text-accent"
                                : "border-primary/40 text-primary"
                            }`}
                          >
                            {r.metric_name}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatValue(r)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {r.date_reported ?? "—"}
                        </TableCell>
                        <TableCell>
                          <a
                            href={r.source_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            {r.source_name}
                            <ArrowUpRight className="size-3" />
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!filtered.length && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                          No records match these filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="panel p-5">
              <h3 className="text-sm font-semibold">Leaderboard filters</h3>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="mono-label mb-1 block">metric</label>
                  <Select value={metric} onValueChange={setMetric}>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Metric" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All metrics</SelectItem>
                      {metricOptions.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mono-label mb-1 block">region</label>
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Region" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All regions</SelectItem>
                      {["global", "india", "china", "europe", "us", "unknown"].map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mono-label mb-1 block">search</label>
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter model / benchmark"
                    className="h-9 w-full"
                  />
                </div>
              </div>
            </div>

            <div className="panel p-5">
              <h3 className="text-sm font-semibold">Configured sources</h3>
              <p className="mono-label mt-1">{activeCategory.id}</p>
              <ul className="mt-3 space-y-2">
                {(activeCategory.sources ?? []).map((s) => (
                  <li key={s}>
                    <a
                      href={s}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="line-clamp-1 text-xs text-muted-foreground hover:text-primary"
                    >
                      {s.replace(/^https?:\/\//, "")}
                    </a>
                  </li>
                ))}
                {!activeCategory.sources?.length && (
                  <li className="text-xs text-muted-foreground">
                    Derived category — scored from other sources.
                  </li>
                )}
              </ul>
              {activeCategory.metrics?.length ? (
                <>
                  <Separator className="my-4" />
                  <p className="mono-label">tracked metrics</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {activeCategory.metrics.map((m) => (
                      <Badge key={m} variant="secondary" className="font-mono text-[11px]">
                        {m}
                      </Badge>
                    ))}
                  </div>
                </>
              ) : null}
              {activeCategory.evaluation_dimensions?.length ? (
                <>
                  <Separator className="my-4" />
                  <p className="mono-label">evaluation dimensions</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {activeCategory.evaluation_dimensions.map((m) => (
                      <Badge key={m} variant="secondary" className="font-mono text-[11px]">
                        {m}
                      </Badge>
                    ))}
                  </div>
                </>
              ) : null}
              {activeCategory.distinct_families?.length ? (
                <>
                  <Separator className="my-4" />
                  <p className="mono-label">model families</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {activeCategory.distinct_families.map((m) => (
                      <Badge key={m} variant="outline" className="text-[11px]">
                        {m}
                      </Badge>
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            <div className="panel p-5">
              <h3 className="text-sm font-semibold">Pipeline</h3>
              <ol className="mt-3 space-y-3 text-xs text-muted-foreground">
                <li>
                  <span className="mono-label block">01 · scrape</span>
                  Async httpx crawl, robots.txt honoured, randomized 1–5s delays, rotating
                  User-Agents, exponential backoff with jitter.
                </li>
                <li>
                  <span className="mono-label block">02 · extract</span>
                  Pydantic <code className="font-mono">LeaderboardRecord</code> schema parses
                  leaderboard tables into normalized JSON.
                </li>
                <li>
                  <span className="mono-label block">03 · process</span>
                  Pandas standardizes column names, coerces types, de-dupes on{" "}
                  <code className="font-mono">raw_hash</code>, caps per category.
                </li>
                <li>
                  <span className="mono-label block">04 · integrate</span>
                  Export to <code className="font-mono">src/data/records.json</code>, import here,
                  or POST to <code className="font-mono">/api/public/ingest</code>.
                </li>
              </ol>
              <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
{`python pipeline/scraper.py --out pipeline/out/raw.json
python pipeline/process.py --in pipeline/out/raw.json \\
  --out src/data/records.json`}
              </pre>
            </div>

            <div className="panel p-5">
              <h3 className="text-sm font-semibold">Rules</h3>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                {rules.map((r) => (
                  <li key={r} className="flex gap-2">
                    <span className="text-primary">›</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </main>

      <footer className="border-t border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-6 sm:flex-row">
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold tracking-tight">AI SOTA Shift Tracker</p>
            <p className="mono-label">normalized llm leaderboard signals</p>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://www.linkedin.com/in/bioenable/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <svg className="size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.852 3.37-1.852 3.601 0 4.267 2.37 4.267 5.455v6.288zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
            <a
              href="#"
              aria-label="GitHub (placeholder)"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <Github className="size-5" />
            </a>
            <a
              href="#"
              aria-label="X (placeholder)"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <svg className="size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "primary",
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  tone?: "primary" | "accent";
}) {
  return (
    <div className="panel flex items-center gap-4 p-4">
      <span
        className={`flex size-10 items-center justify-center rounded-md border ${
          tone === "accent" ? "border-accent/40 bg-accent/10" : "border-primary/40 bg-primary/10"
        }`}
      >
        <Icon className={`size-5 ${tone === "accent" ? "text-accent" : "text-primary"}`} />
      </span>
      <div>
        <p className="mono-label">{label}</p>
        <p className="font-mono text-2xl font-semibold">{value}</p>
      </div>
    </div>
  );
}

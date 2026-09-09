import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, ExternalLink, Globe, Layers, RefreshCw, Timer } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";
import { tokenKpis, tokenRules, tokenSlices } from "@/data/token-config";
import { formatTokens, type TokenRecord } from "@/lib/token-schema";

export const Route = createFileRoute("/tokens")({
  head: () => ({
    meta: [
      { title: "Token Utilisation Report | AI SOTA Shift Tracker" },
      {
        name: "description",
        content:
          "Live token-utilisation KPIs for open LLM routing: tokens processed, share and weekly growth by model, developer and country.",
      },
      { property: "og:title", content: "Token Utilisation Report | AI SOTA Shift Tracker" },
      {
        property: "og:description",
        content: "Drill down token consumption by model, developer and country, then export it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TokensPage,
});

type Payload = {
  generated_at: string | null;
  ingested_at: string | null;
  record_count: number;
  records: TokenRecord[];
};

const BAR_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const AXIS = "var(--muted-foreground)";
const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  color: "var(--popover-foreground)",
  fontSize: 12,
} as const;

function TokensPage() {
  const [slice, setSlice] = useState("overall");
  const [country, setCountry] = useState("all");
  const [search, setSearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["token-dataset"],
    queryFn: async (): Promise<Payload> => {
      const res = await fetch("/api/public/tokens?limit=2000", { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as Payload;
    },
    staleTime: 0,
    gcTime: 0,
  });

  const records = data?.records ?? [];

  const countries = useMemo(
    () => [...new Set(records.map((r) => r.country))].sort(),
    [records],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter(
      (r) =>
        (slice === "all" || r.slice_id === slice) &&
        (country === "all" || r.country === country) &&
        (!q ||
          r.model_name.toLowerCase().includes(q) ||
          r.model_id.toLowerCase().includes(q) ||
          r.developer.toLowerCase().includes(q)),
    );
  }, [records, slice, country, search]);

  const byModel = useMemo(() => {
    const map = new Map<string, { name: string; tokens: number; country: string }>();
    for (const r of filtered) {
      const entry = map.get(r.model_id) ?? { name: r.model_name, tokens: 0, country: r.country };
      entry.tokens += r.tokens_processed;
      map.set(r.model_id, entry);
    }
    return [...map.values()].sort((a, b) => b.tokens - a.tokens).slice(0, 12);
  }, [filtered]);

  const byCountry = useMemo(() => {
    const map = new Map<string, { tokens: number; models: Set<string> }>();
    for (const r of filtered) {
      const entry = map.get(r.country) ?? { tokens: 0, models: new Set<string>() };
      entry.tokens += r.tokens_processed;
      entry.models.add(r.model_id);
      map.set(r.country, entry);
    }
    const total = [...map.values()].reduce((s, e) => s + e.tokens, 0) || 1;
    return [...map.entries()]
      .map(([name, e]) => ({
        name,
        tokens: e.tokens,
        models: e.models.size,
        share: Number(((e.tokens / total) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [filtered]);

  const totalTokens = filtered.reduce((s, r) => s + r.tokens_processed, 0);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const pending = toast.loading("Collecting live token-utilisation data…");
    try {
      const res = await fetch("/api/public/tokens/refresh", { method: "POST" });
      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
        record_count?: number;
        slices_ok?: number;
        slices_attempted?: number;
      };
      if (!res.ok || !body.ok) toast.error(body.error ?? "Collection failed", { id: pending });
      else
        toast.success(
          `Stored ${body.record_count} rows from ${body.slices_ok}/${body.slices_attempted} categories`,
          { id: pending },
        );
    } catch {
      toast.error("Could not reach the data service", { id: pending });
    } finally {
      setIsRefreshing(false);
      await refetch();
    }
  };

  const exportCsv = () => {
    const params = new URLSearchParams({ format: "csv", limit: "2000" });
    if (slice !== "all") params.set("slice", slice);
    if (country !== "all") params.set("country", country);
    window.open(`/api/public/tokens?${params.toString()}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div>
            <nav className="mono-label mb-2 flex gap-4">
              <Link to="/" className="hover:text-primary">
                ← Dashboard
              </Link>
              <Link to="/api-docs" className="hover:text-primary">
                API docs
              </Link>
            </nav>
            <h1 className="text-2xl font-semibold tracking-tight">Token utilisation report</h1>
            <p className="mono-label mt-2 flex items-center gap-2">
              <Timer className="size-3.5" />
              {data?.generated_at
                ? `collected ${new Date(data.generated_at).toLocaleString()}`
                : "no batch stored yet"}
              {data?.ingested_at ? ` · stored ${new Date(data.ingested_at).toLocaleString()}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing || isFetching}
            >
              <RefreshCw className={`size-4 ${isRefreshing || isFetching ? "animate-spin" : ""}`} />
              {isRefreshing ? "Collecting…" : "Refresh tokens"}
            </Button>
            <Button size="sm" onClick={exportCsv}>
              <Download className="size-4" /> Export CSV
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={Layers} label="Tokens in view" value={formatTokens(totalTokens)} />
          <Stat icon={Layers} label="Model rows" value={String(filtered.length)} />
          <Stat icon={Globe} label="Countries" value={String(byCountry.length)} />
          <Stat icon={ExternalLink} label="Category slices" value={String(tokenSlices.length)} />
        </section>

        <section className="mt-6 flex flex-wrap gap-3">
          <Select value={slice} onValueChange={setSlice}>
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {tokenSlices.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search model or developer"
            className="h-9 w-[260px]"
          />
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <ChartCard title="Tokens processed by model">
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={byModel} layout="vertical" margin={{ left: 24, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={(v) => formatTokens(Number(v))} fontSize={11} />
                <YAxis type="category" dataKey="name" width={150} fontSize={11} />
                <ReTooltip formatter={(v) => formatTokens(Number(v))} />
                <Bar dataKey="tokens" radius={[0, 4, 4, 0]}>
                  {byModel.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Tokens by developer country">
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={byCountry.slice(0, 12)} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" fontSize={11} interval={0} angle={-25} textAnchor="end" height={70} />
                <YAxis tickFormatter={(v) => formatTokens(Number(v))} fontSize={11} />
                <ReTooltip formatter={(v) => formatTokens(Number(v))} />
                <Bar dataKey="tokens" radius={[4, 4, 0, 0]}>
                  {byCountry.slice(0, 12).map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Country drill-down</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Share</TableHead>
                  <TableHead>Models</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCountry.map((c) => (
                  <TableRow
                    key={c.name}
                    className="cursor-pointer"
                    onClick={() => setCountry(country === c.name ? "all" : c.name)}
                  >
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{formatTokens(c.tokens)}</TableCell>
                    <TableCell>{c.share}%</TableCell>
                    <TableCell>{c.models}</TableCell>
                  </TableRow>
                ))}
                {byCountry.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No token data yet — run “Refresh tokens”.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Granular model rows</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Developer</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Share</TableHead>
                  <TableHead>Weekly growth</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map((r, i) => (
                  <TableRow key={`${r.slice_id}-${r.model_id}-${i}`}>
                    <TableCell className="text-muted-foreground">{r.rank ?? i + 1}</TableCell>
                    <TableCell className="font-medium">{r.model_name}</TableCell>
                    <TableCell>{r.developer}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.country}</Badge>
                    </TableCell>
                    <TableCell>{r.slice_label}</TableCell>
                    <TableCell>{r.tokens_display}</TableCell>
                    <TableCell>{r.token_share_pct}%</TableCell>
                    <TableCell
                      className={
                        (r.token_growth_pct ?? 0) < 0 ? "text-destructive" : "text-primary"
                      }
                    >
                      {r.token_growth_pct === null ? "—" : `${r.token_growth_pct}%`}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Nothing to show for these filters.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-border p-5">
            <h3 className="mono-label">KPI definitions</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {tokenKpis.map((k) => (
                <li key={k.id}>
                  <span className="font-medium">{k.label}</span>{" "}
                  <span className="text-muted-foreground">— {k.description}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-border p-5">
            <h3 className="mono-label">Collection rules</h3>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-muted-foreground">
              {tokenRules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Globe;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mono-label flex items-center gap-2">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-5">
      <h3 className="mono-label mb-4">{title}</h3>
      {children}
    </div>
  );
}

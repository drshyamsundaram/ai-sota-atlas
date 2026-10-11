import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Download, ExternalLink, RefreshCw, Server, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { accelerators, serverSystems, hardwareDisclosures, hardwareReferences } from "@/data/hardware";
import { WORKLOADS, type Accelerator, type HardwareSource } from "@/lib/hardware-schema";
import { hardwareQueryOptions } from "@/lib/hardware.functions";
import { csvText } from "@/lib/hardware-sizing";
import { WorkloadSizer } from "@/components/hardware/WorkloadSizer";
import { HardwareBenchmarks } from "@/components/hardware/HardwareBenchmarks";

export const Route = createFileRoute("/hardware")({
  head: () => ({ meta: [
    { title: "Hardware & Chipsets — AI SOTA Shift Tracker" },
    { name: "description", content: "Compare source-backed LLM accelerators and server systems for pretraining, fine-tuning and inference, with memory sizing and MLPerf evidence." },
    { property: "og:title", content: "Hardware & Chipsets — AI SOTA Shift Tracker" },
    { property: "og:description", content: "LLM hardware specifications, workload memory estimates, server comparisons and evidence-backed model connections." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(hardwareQueryOptions),
  component: HardwarePage,
});

function SourceLink({ source }: { source: HardwareSource }) {
  return <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><ExternalLink className="size-3.5" />{source.label}</a>;
}
const gb = (value: number) => `${Number(value.toFixed(1))} GB`;

function HardwarePage() {
  const { data: feed, isFetching, refetch } = useSuspenseQuery(hardwareQueryOptions);
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState("all");
  const [workload, setWorkload] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<Accelerator | null>(null);
  const [view, setView] = useState("accelerators");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState("");
  const filtered = accelerators.filter((a) => (vendor === "all" || a.vendor === vendor) &&
    (workload === "all" || a.workloads.some((w) => w === workload)) &&
    `${a.name} ${a.vendor} ${a.architecture}`.toLowerCase().includes(search.toLowerCase()));
  const filteredSystems = serverSystems.filter((s) => {
    const a = accelerators.find((a) => a.id === s.acceleratorId);
    return (vendor === "all" || a?.vendor === vendor) && (workload === "all" || a?.workloads.some((w) => w === workload)) &&
      `${s.name} ${s.vendor} ${a?.name ?? ""}`.toLowerCase().includes(search.toLowerCase());
  });
  const comparison = selected.map((id) => accelerators.find((a) => a.id === id)).filter((a): a is Accelerator => Boolean(a));
  const sources = useMemo(() => [...accelerators.map((a) => a.source), ...serverSystems.map((s) => s.source), ...hardwareDisclosures.map((d) => d.source), ...hardwareReferences], []);
  function exportCsv() {
    const rows = view === "systems" ? filteredSystems.map((s) => ({ ...s, source: s.source.url, verified: s.source.verified })) :
      filtered.map((a) => ({ ...a, workloads: a.workloads.join("; "), source: a.source.url, verified: a.source.verified }));
    const url = URL.createObjectURL(new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `llm-hardware-${view}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  async function refresh() {
    setRefreshing(true); setRefreshStatus("");
    try {
      const response = await fetch("/api/public/scrape", { method: "POST" });
      if (!response.ok) throw new Error("The primary collection did not finish. Hardware measurements will still be checked.");
      setRefreshStatus("Latest benchmark batch refreshed. Curated specifications retain their verification dates.");
      await Promise.all([client.invalidateQueries({ queryKey: ["kg-dataset"] }), client.invalidateQueries({ queryKey: ["kg-tokens"] })]);
    } catch (e) { setRefreshStatus(e instanceof Error ? e.message : "Refresh unavailable."); }
    finally { await refetch(); setRefreshing(false); }
  }
  return <div className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <nav className="mono-label mb-4 flex flex-wrap gap-x-5 gap-y-2"><Link to="/" className="hover:text-primary">← Dashboard</Link><Link to="/tokens" className="hover:text-primary">Token utilisation</Link><Link to="/knowledge-graph" className="hover:text-primary">LLM & Tokenomics KG</Link><Link to="/docs" className="hover:text-primary">Docs</Link></nav>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-3 text-3xl font-semibold"><Cpu className="size-7 shrink-0 text-primary" />Hardware &amp; Chipsets</h1>
        <p className="mono-label mt-3">Pretraining · full fine-tuning · LoRA / QLoRA · inference</p></div>
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={refreshing || isFetching} onClick={refresh}><RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Collecting…" : "Refresh now"}</Button><Button size="sm" onClick={exportCsv}><Download className="size-4" />CSV</Button></div>
      </div>{refreshStatus && <p role="status" className="mt-3 text-sm text-accent">{refreshStatus}</p>}
    </div></header>
    <main className="mx-auto max-w-7xl px-4 sm:px-6">
      <section className="grid grid-cols-2 gap-5 border-b border-border py-6 md:grid-cols-4">
        {[["Accelerators", accelerators.length], ["Server configurations", serverSystems.length], ["Measured inference results", feed.measurements.length], ["Hardware vendors", new Set(accelerators.map((a) => a.vendor)).size]].map(([label, value]) => <div key={label}><p className="mono-label">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}
      </section>
      <section className="py-7">
        <div className="mb-5 flex flex-wrap gap-3"><Input aria-label="Search hardware" placeholder="Search chip, architecture or server" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-80" />
          <Select value={vendor} onValueChange={setVendor}><SelectTrigger aria-label="Hardware vendor" className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All chip vendors</SelectItem>{[...new Set(accelerators.map((a) => a.vendor))].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          <Select value={workload} onValueChange={setWorkload}><SelectTrigger aria-label="Hardware workload" className="w-full sm:w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All workloads</SelectItem>{WORKLOADS.map((w) => <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>)}</SelectContent></Select>
        </div>
        <Tabs value={view} onValueChange={setView}><TabsList><TabsTrigger value="accelerators"><Cpu className="size-4" />Accelerators</TabsTrigger><TabsTrigger value="systems"><Server className="size-4" />Servers</TabsTrigger></TabsList>
          <TabsContent value="accelerators"><div className="overflow-x-auto rounded-md border border-border"><Table><TableHeader><TableRow><TableHead>Compare</TableHead><TableHead>Accelerator</TableHead><TableHead>Memory / bandwidth</TableHead><TableHead>Power envelope</TableHead><TableHead>Interconnect</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((a) => <TableRow key={a.id}><TableCell><Checkbox aria-label={`Compare ${a.name}`} checked={selected.includes(a.id)} disabled={selected.length >= 4 && !selected.includes(a.id)} onCheckedChange={(v) => setSelected((old) => v ? [...old, a.id] : old.filter((id) => id !== a.id))} /></TableCell>
              <TableCell className="min-w-40"><Button variant="link" className="h-auto p-0 text-left" onClick={() => setDetail(a)}>{a.name}</Button><p className="mono-label">{a.vendor} · {a.architecture}</p></TableCell>
              <TableCell className="min-w-40"><span className="font-mono">{gb(a.memoryGb)}</span><p className="text-xs text-muted-foreground">{a.memoryType} · {a.bandwidthTb ?? "Unknown"} TB/s</p></TableCell><TableCell>{a.powerW === null ? "Not disclosed" : `Up to ${a.powerW} W`}</TableCell><TableCell className="min-w-44 text-xs">{a.interconnect}</TableCell>
              <TableCell className="min-w-44"><Badge variant="outline">Manufacturer specification</Badge><p className="mono-label mt-1">Verified {a.source.verified}</p></TableCell></TableRow>)}{!filtered.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No accelerators match these filters.</TableCell></TableRow>}</TableBody></Table></div></TabsContent>
          <TabsContent value="systems"><div className="overflow-x-auto rounded-md border border-border"><Table><TableHeader><TableRow><TableHead>Server system</TableHead><TableHead>Accelerators / memory</TableHead><TableHead>Host CPU / RAM</TableHead><TableHead>Storage / network</TableHead><TableHead>Topology / cooling</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
            <TableBody>{filteredSystems.map((s) => { const a = accelerators.find((a) => a.id === s.acceleratorId); return <TableRow key={s.id}><TableCell className="min-w-52 font-medium">{s.name}<p className="mono-label">{s.vendor}</p></TableCell><TableCell className="min-w-40">{s.count} × {a?.name}<p className="text-xs text-muted-foreground">{a ? gb(s.count * a.memoryGb) : "Unknown"} aggregate · not a single shared pool</p></TableCell><TableCell className="min-w-48 text-xs">{s.cpu}<p className="mt-2 text-muted-foreground">{s.ram}</p></TableCell><TableCell className="min-w-48 text-xs">{s.storage}<p className="mt-2 text-muted-foreground">{s.network}</p></TableCell><TableCell className="min-w-48 text-xs">{s.topology}<p className="mt-2 text-muted-foreground">{s.powerCooling}</p></TableCell><TableCell className="min-w-44"><SourceLink source={s.source} /><p className="mono-label mt-1">{s.source.verified}</p></TableCell></TableRow>; })}{!filteredSystems.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No server configurations match.</TableCell></TableRow>}</TableBody></Table></div></TabsContent>
        </Tabs>
        <p className="mt-3 text-xs text-muted-foreground">GB and TB/s are decimal; source GiB values are converted and retained in the memory-type label. Prices are not verified. Capacity, precision support and software compatibility are independent constraints.</p>
        {detail && <div className="mt-5 border-l-2 border-accent pl-5"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">{detail.name}</h3><Button size="icon" variant="ghost" aria-label="Close accelerator details" onClick={() => setDetail(null)}><X className="size-4" /></Button></div>
          <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">{[["Compute · theoretical peak", detail.compute], ["Supported precision", detail.precision], ["Software ecosystem", detail.software], ["Availability / cloud", `${detail.availability} · ${detail.cloud}`], ["Form factor", detail.form]].map(([k, v]) => <div key={k}><dt className="mono-label">{k}</dt><dd className="mt-1">{v}</dd></div>)}</dl><p className="mt-4 text-sm"><SourceLink source={detail.source} /></p></div>}
      </section>
      {comparison.length > 0 && <section className="border-t border-border py-7"><div className="mb-4 flex justify-between"><h2 className="text-xl font-semibold">Accelerator comparison · {comparison.length}/4</h2><Button variant="ghost" size="sm" onClick={() => setSelected([])}><X className="size-4" />Clear</Button></div>
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Specification</TableHead>{comparison.map((a) => <TableHead key={a.id} className="min-w-52">{a.name}</TableHead>)}</TableRow></TableHeader><TableBody>
          {([ ["Memory", (a: Accelerator) => `${gb(a.memoryGb)} · ${a.memoryType}`], ["Bandwidth", (a: Accelerator) => `${a.bandwidthTb ?? "Unknown"} TB/s`], ["Power", (a: Accelerator) => a.powerW === null ? "Not disclosed" : `Up to ${a.powerW} W`], ["Precision", (a: Accelerator) => a.precision], ["Compute · dense / sparse", (a: Accelerator) => a.compute], ["Software", (a: Accelerator) => a.software], ["Interconnect", (a: Accelerator) => a.interconnect], ["Cloud", (a: Accelerator) => a.cloud] ] as const).map(([label, get]) => <TableRow key={label}><TableCell className="font-medium">{label}</TableCell>{comparison.map((a) => <TableCell key={a.id} className="whitespace-normal text-sm">{get(a)}</TableCell>)}</TableRow>)}
        </TableBody></Table></div>
      </section>}
      <WorkloadSizer accelerators={accelerators} />
      <HardwareBenchmarks feed={feed} />
      <section className="border-t border-border py-8"><h2 className="text-xl font-semibold">Reported model–hardware relationships</h2><div className="mt-4 space-y-4">{hardwareDisclosures.map((d) => <div key={d.model} className="border-l-2 border-primary pl-4"><p className="font-medium">{d.model} → {accelerators.find((a) => a.id === d.acceleratorId)?.name}</p><p className="mt-1 text-sm text-muted-foreground">{d.detail}</p><p className="mt-2 text-sm"><SourceLink source={d.source} /> · reported training · verified {d.source.verified}</p></div>)}</div>
        <p className="mt-4 text-sm text-muted-foreground">Undisclosed training, fine-tuning and production-serving hardware remain unknown. A measured MLPerf workload is not evidence of a model’s original training hardware.</p>
      </section>
      <section className="border-t border-border py-8"><h2 className="text-xl font-semibold">Sources &amp; verification</h2><ul className="mt-4 grid gap-3 text-sm md:grid-cols-2">{sources.map((s, i) => <li key={`${s.url}:${i}`} className="min-w-0"><SourceLink source={s} /><p className="mono-label mt-1">{s.verified} · {s.url.includes("training_results") || s.label.startsWith("HPE") ? "Reference only" : "Curated evidence"}</p></li>)}</ul>
        <p className="mt-5 text-sm text-muted-foreground">Refresh checks machine-readable MLPerf results; it does not automatically reverify curated product sheets or overwrite their verification dates.</p>
      </section>
    </main>
  </div>;
}
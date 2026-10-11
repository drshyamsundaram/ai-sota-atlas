import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HardwareFeed } from "@/lib/hardware-schema";

export function HardwareBenchmarks({ feed }: { feed: HardwareFeed }) {
  const [query, setQuery] = useState("");
  const rows = feed.measurements.filter((r) => `${r.model} ${r.system} ${r.submitter}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.model.localeCompare(b.model) || b.value - a.value);
  return <section className="border-t border-border py-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Measured inference performance</h2>
      <Input aria-label="Search measured systems" placeholder="Search workload or measured system" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full sm:w-80" />
    </div>
    <p className="mono-label mt-2">MLPerf · closed division · datacenter · Offline · checked {new Date(feed.checkedAt).toLocaleString()} · {rows.length} results</p>
    <p className="mt-3 text-sm text-muted-foreground">Compare the same workload, accuracy target, precision and scenario. Offline tokens/s measures batched throughput, not interactive latency or model quality. System sizes differ.</p>
    {feed.status !== "ok" ? <p role="status" className="mt-4 text-accent">{feed.error}</p> : <div className="mt-4 max-h-[420px] overflow-auto border border-border rounded-md">
      <Table><TableHeader><TableRow><TableHead>Workload / round</TableHead><TableHead>System / submitter</TableHead><TableHead>Accelerators</TableHead><TableHead>Weight precision</TableHead><TableHead className="text-right">Tokens/s</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((r) => <TableRow key={r.id}>
          <TableCell><span className="font-medium">{r.model}</span><p className="mono-label">{r.round} · {r.scenario} · {r.division}</p></TableCell>
          <TableCell className="min-w-52">{r.system}<p className="mono-label">{r.submitter}</p></TableCell><TableCell className="min-w-44">{r.accelerators}</TableCell><TableCell>{r.precision}</TableCell>
          <TableCell className="text-right font-mono">{r.value.toLocaleString()}</TableCell><TableCell><a href={r.sourceUrl} target="_blank" rel="noreferrer" className="text-primary" aria-label={`Source for ${r.system}`}><ExternalLink className="size-4" /></a></TableCell>
        </TableRow>)}{!rows.length && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No measured systems match.</TableCell></TableRow>}</TableBody>
      </Table>
    </div>}
    <p className="mt-4 text-sm text-muted-foreground">MLPerf Training is currently reference-only: time-to-target is tied to prescribed tasks and cannot predict arbitrary LLM pretraining or fine-tuning duration.</p>
  </section>;
}
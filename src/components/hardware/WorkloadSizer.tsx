import { useState } from "react";
import { Cpu, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { sizeWorkload, type SizingInput } from "@/lib/hardware-sizing";
import { WORKLOADS, type Accelerator, type Workload } from "@/lib/hardware-schema";

export function WorkloadSizer({ accelerators }: { accelerators: Accelerator[] }) {
  const [hardware, setHardware] = useState(accelerators[0]?.id ?? "");
  const [input, setInput] = useState<SizingInput>({ parametersB: 8, precisionBytes: 2, workload: "inference",
    sequence: 8192, batch: 1, layers: 32, kvHeads: 8, headDim: 128, kvBytes: 2,
    activationGb: 4, adapterPct: 1, headroomPct: 20, acceleratorGb: 80, kvKnown: true });
  const chip = accelerators.find((a) => a.id === hardware);
  const update = (key: keyof SizingInput, value: number | boolean | Workload) => setInput((old) => ({ ...old, [key]: value }));
  let result: ReturnType<typeof sizeWorkload> | null = null;
  let error = "";
  try { result = sizeWorkload({ ...input, acceleratorGb: chip?.memoryGb ?? 80 }); }
  catch (e) { error = e instanceof Error ? e.message : "Check the workload dimensions."; }
  const numeric = (key: keyof SizingInput, label: string, min = 0, step = 1) => (
    <label className="block space-y-1" key={key}>
      <span className="mono-label">{label}</span>
      <Input aria-label={label} type="number" min={min} step={step} value={typeof input[key] === "number" && Number.isNaN(input[key]) ? "" : String(input[key])}
        onChange={(e) => update(key, e.target.value === "" ? NaN : Number(e.target.value))} />
    </label>
  );
  return <section className="border-t border-border py-8" id="sizing">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><Cpu className="size-5 text-primary" /> Workload sizing</h2>
      <span className="mono-label text-accent">Planning estimate · decimal GB</span>
    </div>
    <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
      <div className="grid content-start gap-4 sm:grid-cols-2 md:grid-cols-3">
        <label className="space-y-1"><span className="mono-label">Workload</span>
          <Select value={input.workload} onValueChange={(v) => setInput((old) => ({ ...old, workload: v as Workload, precisionBytes: v === "qlora" ? 0.5 : 2 }))}>
            <SelectTrigger aria-label="Sizing workload" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{WORKLOADS.map((w) => <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <label className="space-y-1"><span className="mono-label">Accelerator</span>
          <Select value={hardware} onValueChange={setHardware}><SelectTrigger aria-label="Sizing accelerator" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{accelerators.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        {numeric("parametersB", "Model parameters (B)", 0.01, 0.1)}
        <label className="space-y-1"><span className="mono-label">Weight precision</span>
          <Select value={String(input.precisionBytes)} onValueChange={(v) => update("precisionBytes", Number(v))} disabled={input.workload === "qlora"}>
            <SelectTrigger aria-label="Weight precision" className="w-full"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="2">BF16 / FP16 · 2 bytes</SelectItem>
              {input.workload === "qlora" && <SelectItem value="0.5">4-bit base · 0.5 byte</SelectItem>}
              {input.workload === "inference" && <><SelectItem value="1">8-bit · 1 byte</SelectItem><SelectItem value="0.5">4-bit · 0.5 byte</SelectItem></>}
            </SelectContent>
          </Select>
        </label>
        {numeric("sequence", "Context / sequence tokens", 1)}
        {numeric("batch", input.workload === "inference" ? "Concurrent sequences" : "Microbatch sequences", 1)}
        {numeric("activationGb", "Activation / runtime budget (GB)", 0, 0.5)}
        {numeric("headroomPct", "Reserved memory (%)", 0)}
        {(input.workload === "lora" || input.workload === "qlora") && numeric("adapterPct", "Trainable adapter share (%)", 0, 0.1)}
        {input.workload === "inference" && <>
          <label className="flex items-center gap-2 text-sm sm:col-span-2 md:col-span-3">
            <Checkbox checked={input.kvKnown} onCheckedChange={(v) => update("kvKnown", v === true)} /> Known KV-cache architecture
          </label>
          {input.kvKnown && <>{numeric("layers", "Transformer layers", 1)}{numeric("kvHeads", "KV heads (not query heads)", 1)}{numeric("headDim", "Head dimension", 1)}</>}
        </>}
      </div>
      <div className="border-l-2 border-primary pl-5">
        {error ? <p role="alert" className="text-destructive">{error}</p> : result && <>
          <p className="mono-label">{result.complete ? "Estimated memory envelope" : "Partial memory envelope · KV cache unknown"}</p>
          <p className="mt-2 text-4xl font-semibold" data-testid="memory-total">{result.total.toFixed(1)} <span className="text-lg text-muted-foreground">GB</span></p>
          <dl className="mt-5 space-y-2 text-sm">
            {([ ["Model weights", result.weights], ["Adapter weights", result.adapters], ["Gradients + Adam states", result.trainingState],
              ["KV cache (BF16)", result.kvCache], ["Activation / runtime budget", result.activation], ["Reserved headroom", result.headroom] ] as const).map(([label, v]) =>
              <div key={label} className="flex justify-between gap-3 border-b border-border pb-2"><dt className="text-muted-foreground">{label}</dt><dd className="font-mono">{v === null ? "Unknown" : `${v.toFixed(1)} GB`}</dd></div>)}
          </dl>
          <p className="mt-5 font-medium">{result.minimum}–{result.conservative} × {chip?.name ?? "accelerators"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Memory-only lower bound to a 25% contingency envelope; not a validated deployment configuration.</p>
          {!result.complete && <p className="mt-3 text-sm text-accent">Incomplete: unknown KV cache may materially raise this lower bound.</p>}
        </>}
        <div className="mt-5 flex gap-2 text-sm text-muted-foreground"><AlertTriangle className="size-4 shrink-0 text-accent" />
          <p>Weights are not the whole workload. Sharding, communication, quantization metadata and framework support can change fit; no throughput or time-to-train is inferred.</p>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Training assumes BF16 trainable weights and gradients, FP32 master weights and Adam moments (16 bytes per trainable parameter including weights). Activation memory is your explicit budget, not an architecture prediction. QLoRA base weights use 4-bit storage plus the separately budgeted overhead.</p>
        {input.workload === "pretraining" && <p className="mt-3 text-sm text-accent">Pretraining assessment: also plan training-token volume, checkpoint storage, data pipelines, scale-out bandwidth and target utilization. This memory estimate does not size the complete training cluster.</p>}
      </div>
    </div>
  </section>;
}
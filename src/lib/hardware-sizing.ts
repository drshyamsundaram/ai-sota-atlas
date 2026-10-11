import type { Workload } from "./hardware-schema";

export type SizingInput = {
  parametersB: number; precisionBytes: number; workload: Workload;
  sequence: number; batch: number; layers: number; kvHeads: number; headDim: number;
  kvBytes: number; activationGb: number; adapterPct: number; headroomPct: number;
  acceleratorGb: number; kvKnown: boolean;
};

/** Decimal GB; explicit budgets rather than pretending model parameters determine activations. */
export function sizeWorkload(i: SizingInput) {
  const values = [i.parametersB, i.precisionBytes, i.sequence, i.batch, i.layers, i.kvHeads,
    i.headDim, i.kvBytes, i.activationGb, i.adapterPct, i.headroomPct, i.acceleratorGb];
  if (values.some((v) => !Number.isFinite(v) || v < 0) || i.parametersB === 0 || i.acceleratorGb === 0 || i.precisionBytes === 0 || i.sequence < 1 || i.batch < 1 || i.adapterPct > 100 || i.headroomPct >= 100)
    throw new Error("Use positive dimensions, adapter share ≤100%, and headroom below 100%.");
  const full = i.workload === "finetuning" || i.workload === "pretraining";
  const adapter = i.workload === "lora" || i.workload === "qlora";
  const weights = i.parametersB * (i.workload === "qlora" ? 0.5 : i.precisionBytes);
  // Mixed precision Adam: BF16 gradients + FP32 master weights + two FP32 moments = 14 bytes/trainable parameter.
  const trainableB = full ? i.parametersB : adapter ? i.parametersB * i.adapterPct / 100 : 0;
  const trainingState = trainableB * 14;
  const adapters = adapter ? trainableB * 2 : 0;
  const kvCache = i.workload === "inference" && i.kvKnown
    ? 2 * i.layers * i.kvHeads * i.headDim * i.sequence * i.batch * i.kvBytes / 1e9 : null;
  const subtotal = weights + trainingState + adapters + (kvCache ?? 0) + i.activationGb;
  const total = subtotal / (1 - i.headroomPct / 100);
  const minimum = Math.max(1, Math.ceil(total / i.acceleratorGb));
  const conservative = Math.max(minimum, Math.ceil(total * 1.25 / i.acceleratorGb));
  return { weights, trainingState, adapters, kvCache, activation: i.activationGb, subtotal,
    headroom: total - subtotal, total, minimum, conservative,
    complete: i.workload !== "inference" || i.kvKnown };
}

export function csvText(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0] ?? {});
  const escape = (v: unknown) => {
    const text = String(v ?? "");
    // Neutralize spreadsheet formulas, in addition to RFC-style quoting.
    return `"${(/^[=+@-]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
  };
  return [keys.map(escape).join(","), ...rows.map((r) => keys.map((k) => escape(r[k])).join(","))].join("\r\n");
}
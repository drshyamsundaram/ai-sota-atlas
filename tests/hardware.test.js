import { describe, expect, test } from "bun:test";
import { sizeWorkload, csvText } from "../src/lib/hardware-sizing";
import { parseHardwareResults } from "../src/lib/hardware-collector.server";
import { buildGraph } from "../src/lib/graph";
import { recordSchema } from "../src/lib/schema";

const input = { parametersB: 8, precisionBytes: 2, workload: "inference", sequence: 8192,
  batch: 1, layers: 32, kvHeads: 8, headDim: 128, kvBytes: 2, activationGb: 4,
  adapterPct: 1, headroomPct: 20, acceleratorGb: 80, kvKnown: true };
describe("Hardware memory estimates", () => {
  test("separates BF16 weights, KV cache and reserve", () => {
    const r = sizeWorkload(input);
    expect(r.weights).toBe(16); expect(r.kvCache).toBeCloseTo(1.073741824);
    expect(r.total).toBeCloseTo(26.34217728); expect(r.minimum).toBe(1);
  });
  test("full Adam training uses 16 bytes/parameter including weights", () => {
    const r = sizeWorkload({ ...input, workload: "finetuning" });
    expect(r.trainingState).toBe(112); expect(r.kvCache).toBeNull(); expect(r.total).toBe(165);
  });
  test("QLoRA separates base and trainable adapter state", () => {
    const r = sizeWorkload({ ...input, workload: "qlora" });
    expect(r.weights).toBe(4); expect(r.adapters).toBe(0.16); expect(r.trainingState).toBeCloseTo(1.12);
  });
  test("unknown KV is incomplete and invalid inputs fail", () => {
    expect(sizeWorkload({ ...input, kvKnown: false }).complete).toBe(false);
    expect(() => sizeWorkload({ ...input, headroomPct: 100 })).toThrow();
    expect(() => sizeWorkload({ ...input, parametersB: NaN })).toThrow();
  });
  test("CSV quotes fields and neutralizes formulas", () => {
    expect(csvText([{ name: '=1+1', details: 'a,"b"' }])).toContain('"\'=1+1"');
    expect(csvText([{ name: 'a,"b"' }])).toContain('"a,""b"""');
  });
});
test("MLPerf parser retains only valid closed Offline token results", () => {
  const row = { ID: "1", Suite: "datacenter", Scenario: "Offline", Category: "closed", Performance_Units: "Tokens/s", Performance_Result: 123, System: "system", Model: "llama", Accelerator: "8 H100", weight_data_types: "fp8" };
  const result = parseHardwareResults([row, { ...row, Scenario: "Server" }, { ...row, Performance_Result: "bad" }], "v6", "https://example.com/results.json", "2026-10-11");
  expect(result.length).toBe(1); expect(result[0]?.precision).toBe("fp8");
});
test("graph keeps measured systems separate from model versions and training disclosures", () => {
  const record = recordSchema.parse({ source_name: "MLPerf", source_url: "https://example.com", retrieved_at: "2026-10-11", category: "ai_infrastructure", model_name: "llama2-70b", model_version: "Old system label", benchmark_name: "MLPerf", metric_name: "throughput", metric_value: 100, hardware_context: { system: "Measured system", submitter: "OEM", round: "v6", scenario: "Offline", division: "closed", precision: "fp8", accelerators: "8 H100", source_url: "https://example.com" } });
  const graph = buildGraph([record], []);
  expect(graph.nodes.some((n) => n.type === "model" && n.label.includes("Old system"))).toBe(false);
  expect(graph.links.some((l) => l.relation === "benchmarked_on")).toBe(true);
  expect(graph.links.filter((l) => l.relation === "trained_on").length).toBe(1);
  expect(graph.links.some((l) => l.relation === "estimated_suitable_for")).toBe(false);
  const ids = new Set(graph.nodes.map((n) => n.id));
  expect(graph.links.every((l) => ids.has(l.source) && ids.has(l.target))).toBe(true);
});
import type { LeaderboardRecord } from "./schema";
import type { TokenRecord } from "./token-schema";
import { accelerators, hardwareDisclosures, serverSystems } from "@/data/hardware";

export type NodeType = "model" | "developer" | "country" | "benchmark" | "category" | "slice" | "accelerator" | "server" | "hardware_vendor";

export type GraphNode = {
  id: string;
  type: NodeType;
  label: string;
  size: number;
  tokens?: number;
  meta?: Record<string, string | number | null>;
};

export type GraphLink = {
  source: string;
  target: string;
  relation: "builds" | "based_in" | "scored_on" | "belongs_to" | "used_in" | "manufactures" | "contains" | "trained_on" | "finetuned_on" | "served_on" | "benchmarked_on" | "estimated_suitable_for";
  label?: string | undefined;
  weight?: number | undefined;
};

export type KnowledgeGraph = { nodes: GraphNode[]; links: GraphLink[] };

export const NODE_TYPES: { id: NodeType; label: string; color: string }[] = [
  { id: "model", label: "Model", color: "var(--chart-1)" },
  { id: "developer", label: "Developer", color: "var(--chart-2)" },
  { id: "country", label: "Country", color: "var(--chart-3)" },
  { id: "benchmark", label: "Benchmark", color: "var(--chart-4)" },
  { id: "category", label: "Category", color: "var(--chart-5)" },
  { id: "slice", label: "Token slice", color: "var(--muted-foreground)" },
  { id: "accelerator", label: "Accelerator", color: "var(--chart-2)" },
  { id: "server", label: "Server system", color: "var(--chart-5)" },
  { id: "hardware_vendor", label: "Hardware vendor", color: "var(--chart-4)" },
];

/** Infer developer for benchmark-only model names. */
const DEV_HINTS: [RegExp, string, string][] = [
  [/claude/i, "anthropic", "United States"],
  [/\bgpt|\bo[134]\b|openai/i, "openai", "United States"],
  [/gemini|gemma/i, "google", "United States"],
  [/llama/i, "meta-llama", "United States"],
  [/grok/i, "x-ai", "United States"],
  [/phi-?\d/i, "microsoft", "United States"],
  [/nemotron/i, "nvidia", "United States"],
  [/deepseek/i, "deepseek", "China"],
  [/qwen|qwq/i, "qwen", "China"],
  [/kimi|moonshot/i, "moonshotai", "China"],
  [/glm|zhipu/i, "z-ai", "China"],
  [/minimax/i, "minimax", "China"],
  [/ernie/i, "baidu", "China"],
  [/hunyuan/i, "tencent", "China"],
  [/doubao|seed/i, "bytedance", "China"],
  [/mimo/i, "xiaomi", "China"],
  [/mistral|mixtral|magistral|codestral|devstral/i, "mistralai", "France"],
  [/lucie|lighton/i, "lighton", "France"],
  [/luminous|pharia|aleph/i, "aleph-alpha", "Germany"],
  [/sarvam/i, "sarvamai", "India"],
  [/krutrim/i, "krutrim", "India"],
  [/indic|airavata|ai4bharat/i, "ai4bharat", "India"],
  [/bharatgen|param/i, "bharatgen", "India"],
  [/command|cohere/i, "cohere", "Canada"],
];

export const normModel = (s: string) =>
  s
    .toLowerCase()
    .replace(/^[a-z0-9-]+\//, "")
    .replace(/^[^:]{2,20}:\s*/, "")
    .replace(/\s+by\s+[a-z0-9.-]+$/, "")
    .replace(/^(anthropic|openai|google|meta|nvidia|microsoft|xai|x-ai)\s+/, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\b(preview|instruct|chat|latest|thinking|free)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

const CATEGORY_TITLES: Record<string, string> = {
  global_frontier: "Global frontier",
  hallucination_safety: "Hallucination & safety",
  cybersecurity: "Cybersecurity",
  multimodal: "Multimodal",
  ai_infrastructure: "AI infrastructure",
  india: "India",
  china: "China",
  europe: "Europe",
  mea: "Middle East & Africa",
};

export function buildGraph(
  records: LeaderboardRecord[],
  tokens: TokenRecord[],
): KnowledgeGraph & { stats: { matched: number; benchmarkOnly: number; tokenOnly: number } } {
  const nodes = new Map<string, GraphNode>();
  const links = new Map<string, GraphLink>();
  const add = (n: GraphNode) => {
    const cur = nodes.get(n.id);
    if (cur) { cur.meta = { ...cur.meta, ...(n.meta ?? {}) }; return cur; }
    const created = { ...n, meta: { ...(n.meta ?? {}) } };
    nodes.set(n.id, created);
    return created;
  };
  const link = (l: GraphLink) => {
    const k = `${l.source}|${l.relation}|${l.target}`;
    const cur = links.get(k);
    if (cur) cur.weight = (cur.weight ?? 0) + (l.weight ?? 0);
    else links.set(k, l);
  };

  const tokenModels = new Set<string>();
  const benchModels = new Set<string>();

  // Token side
  const tokenByModel = new Map<string, number>();
  for (const t of tokens) {
    const key = normModel(t.model_name);
    const mid = `model:${key}`;
    tokenModels.add(key);
    const devId = `developer:${t.developer.toLowerCase()}`;
    const cId = `country:${t.country}`;
    const sId = `slice:${t.slice_id}`;
    add({ id: mid, type: "model", label: t.model_name, size: 1, meta: { developer: t.developer, country: t.country } });
    add({ id: devId, type: "developer", label: t.developer, size: 1 });
    add({ id: cId, type: "country", label: t.country, size: 1 });
    add({ id: sId, type: "slice", label: t.slice_label, size: 1 });
    link({ source: devId, target: mid, relation: "builds" });
    link({ source: devId, target: cId, relation: "based_in" });
    link({ source: mid, target: sId, relation: "used_in", weight: t.tokens_processed, label: t.tokens_display });
    if (t.slice_id === "overall") {
      tokenByModel.set(mid, (tokenByModel.get(mid) ?? 0) + t.tokens_processed);
      const n = nodes.get(mid);
      if (n) n.meta = { ...n.meta, share_pct: t.token_share_pct, growth_pct: t.token_growth_pct, tokens: t.tokens_display };
    } else if (!tokenByModel.has(mid)) {
      tokenByModel.set(mid, 0);
    }
  }

  // Benchmark side
  for (const r of records) {
    const full = r.model_version && r.category !== "ai_infrastructure" ? `${r.model_name} ${r.model_version}` : r.model_name;
    const key = normModel(full);
    const mid = `model:${key}`;
    benchModels.add(key);
    const bId = `benchmark:${r.benchmark_name}`;
    const catId = `category:${r.category}`;
    const hint = DEV_HINTS.find(([re]) => re.test(full));
    add({ id: mid, type: "model", label: full, size: 1 });
    add({ id: bId, type: "benchmark", label: r.benchmark_name, size: 1, meta: { source: r.source_name, url: r.source_url } });
    add({ id: catId, type: "category", label: CATEGORY_TITLES[r.category] ?? r.category, size: 1 });
    link({
      source: mid,
      target: bId,
      relation: "scored_on",
      label: r.rank ? `#${r.rank}` : r.metric_value != null ? `${r.metric_value} ${r.metric_unit}` : undefined,
    });
    link({ source: bId, target: catId, relation: "belongs_to" });
    const modelNode = nodes.get(mid);
    if (hint && modelNode && !modelNode.meta?.['developer']) {
      const [, dev, country] = hint;
      const devId = `developer:${dev}`;
      const cId = `country:${country}`;
      add({ id: devId, type: "developer", label: dev, size: 1 });
      add({ id: cId, type: "country", label: country, size: 1 });
      link({ source: devId, target: mid, relation: "builds" });
      link({ source: devId, target: cId, relation: "based_in" });
      modelNode.meta = { ...modelNode.meta, developer: dev, country };
    }
  }

  // Hardware provenance: benchmarked-on is not trained-on or production-served-on.
  for (const r of records) {
    if (!r.hardware_context) continue;
    const h = r.hardware_context;
    const mid = `model:${normModel(r.model_name)}`;
    const id = `server:mlperf:${h.submitter}:${h.system}`;
    add({ id, type: "server", label: h.system, size: 4, meta: { vendor: h.submitter,
      precision: h.precision, accelerators: h.accelerators, scenario: h.scenario,
      division: h.division, round: h.round, evidence: "Measured MLPerf result", url: h.source_url } });
    link({ source: mid, target: id, relation: "benchmarked_on", label: `${r.metric_value} ${r.metric_unit} · ${h.round} · ${h.scenario} · ${h.precision}` });
  }
  for (const a of accelerators) {
    const vendorId = `hardware_vendor:${a.vendor}`;
    add({ id: vendorId, type: "hardware_vendor", label: a.vendor, size: 4 });
    add({ id: `accelerator:${a.id}`, type: "accelerator", label: a.name, size: 4,
      meta: { memory_gb: a.memoryGb, bandwidth_tb_s: a.bandwidthTb, evidence: "Manufacturer specification", verified: a.source.verified, url: a.source.url } });
    link({ source: vendorId, target: `accelerator:${a.id}`, relation: "manufactures" });
  }
  for (const s of serverSystems) {
    const vendorId = `hardware_vendor:${s.vendor}`;
    add({ id: vendorId, type: "hardware_vendor", label: s.vendor, size: 4 });
    add({ id: `server:${s.id}`, type: "server", label: s.name, size: 4,
      meta: { count: s.count, evidence: "Manufacturer configuration", url: s.source.url } });
    link({ source: vendorId, target: `server:${s.id}`, relation: "manufactures" });
    link({ source: `server:${s.id}`, target: `accelerator:${s.acceleratorId}`, relation: "contains", label: `${s.count} accelerators` });
  }
  for (const d of hardwareDisclosures) {
    const id = `model:${normModel(d.model)}`;
    add({ id, type: "model", label: d.model, size: 2.5,
      meta: { hardware_evidence: d.detail, hardware_source: d.source.url } });
    link({ source: id, target: `accelerator:${d.acceleratorId}`, relation: d.phase, label: d.detail });
  }

  // Specialist catalogue (unranked): model/platform → category, developer → country.
  for (const s of specialistModels) {
    const id = `model:${normModel(s.name)}`;
    const catId = `category:${s.category}`;
    const devId = `developer:${s.developer}`;
    const cId = `country:${s.country}`;
    add({ id, type: "model", label: s.name, size: 2.5,
      meta: { specialist_kind: s.kind, evidence: s.evidence, benchmarks: s.benchmarks.join(", "), claim: s.claim ?? null, url: s.url } });
    add({ id: catId, type: "category", label: CATEGORY_TITLES[s.category] ?? s.category, size: 1 });
    add({ id: devId, type: "developer", label: s.developer, size: 1 });
    add({ id: cId, type: "country", label: s.country, size: 1 });
    link({ source: id, target: catId, relation: "belongs_to", label: s.kind });
    link({ source: devId, target: id, relation: "builds" });
    link({ source: devId, target: cId, relation: "based_in" });
  }


  // Sizing
  const maxTok = Math.max(1, ...tokenByModel.values());
  const degree = new Map<string, number>();
  for (const l of links.values()) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
  }
  for (const n of nodes.values()) {
    if (n.type === "model") {
      const tok = tokenByModel.get(n.id) ?? 0;
      n.tokens = tok;
      n.size = tok ? 3 + 9 * Math.sqrt(tok / maxTok) : 2.5;
    } else {
      n.size = 3 + Math.min(8, Math.sqrt(degree.get(n.id) ?? 1) * 1.4);
    }
  }

  let matched = 0;
  for (const k of benchModels) if (tokenModels.has(k)) matched++;
  return {
    nodes: [...nodes.values()],
    links: [...links.values()],
    stats: { matched, benchmarkOnly: benchModels.size - matched, tokenOnly: tokenModels.size - matched },
  };
}

/** Small subgraph for the landing card. */
export function miniGraph(g: KnowledgeGraph, maxNodes = 40): KnowledgeGraph {
  const models = g.nodes
    .filter((n) => n.type === "model")
    .sort((a, b) => (b.tokens ?? 0) - (a.tokens ?? 0) || b.size - a.size)
    .slice(0, 14);
  const keep = new Set(models.map((m) => m.id));
  for (const l of g.links) {
    if (keep.size >= maxNodes) break;
    if (l.relation === "used_in") continue;
    if (keep.has(l.source) && !keep.has(l.target)) keep.add(l.target);
    else if (keep.has(l.target) && !keep.has(l.source) && l.relation === "builds") keep.add(l.source);
  }
  for (const l of g.links) {
    if (keep.size >= maxNodes) break;
    if (l.relation === "based_in" && keep.has(l.source)) keep.add(l.target);
  }
  return {
    nodes: g.nodes.filter((n) => keep.has(n.id)).map((n) => ({ ...n })),
    links: g.links.filter((l) => keep.has(l.source) && keep.has(l.target)).map((l) => ({ ...l })),
  };
}

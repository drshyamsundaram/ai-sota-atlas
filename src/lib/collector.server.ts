import { categories, spec } from "@/data/config";
import { recordSchema, type LeaderboardRecord } from "./schema";

/**
 * Server-side collector: fetches the configured leaderboard sources, respects
 * robots.txt, rotates User-Agents, spaces requests with randomized delays and
 * retries transient failures with exponential backoff. Extracted rows are
 * normalized into the same schema the Python pipeline emits.
 */

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];

const pickUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => min + Math.random() * (max - min);

export type SourceOutcome = {
  url: string;
  category: string;
  status: "ok" | "empty" | "blocked" | "failed";
  records: number;
  detail?: string;
};

export type CollectionRun = {
  generated_at: string;
  records: LeaderboardRecord[];
  outcomes: SourceOutcome[];
  duration_ms: number;
};

/* ------------------------------ robots.txt ------------------------------ */

const robotsCache = new Map<string, string[]>();

async function disallowedPaths(origin: string, ua: string): Promise<string[]> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;
  let rules: string[] = [];
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "user-agent": ua },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const text = await res.text();
      let applies = false;
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.split("#")[0]!.trim();
        if (!line) continue;
        const [rawKey, ...rest] = line.split(":");
        const key = rawKey!.trim().toLowerCase();
        const value = rest.join(":").trim();
        if (key === "user-agent") applies = value === "*";
        else if (applies && key === "disallow" && value) rules.push(value);
      }
    }
  } catch {
    rules = [];
  }
  robotsCache.set(origin, rules);
  return rules;
}

async function robotsAllows(url: string, ua: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    const rules = await disallowedPaths(parsed.origin, ua);
    const path = parsed.pathname || "/";
    return !rules.some((rule) => rule === "/" || path.startsWith(rule));
  } catch {
    return false;
  }
}

/* ------------------------- fetch with backoff --------------------------- */

async function fetchWithBackoff(url: string, attempts = 3): Promise<string> {
  let lastError = "unknown error";
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(2 ** attempt * 400 + jitter(0, 400));
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": pickUA(),
          accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (error) {
      lastError = error instanceof Error ? error.message : "fetch error";
    }
  }
  throw new Error(lastError);
}

/* ----------------------------- extraction ------------------------------- */

const stripTags = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const snake = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "score";

function parseNumber(cell: string): { value: number; unit: string } | null {
  const match = cell.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(",", ""));
  if (!Number.isFinite(value)) return null;
  if (cell.includes("%")) return { value, unit: "percent" };
  if (/\$/.test(cell)) return { value, unit: "usd_per_mtok" };
  if (/tok\/s|tokens\/s/i.test(cell)) return { value, unit: "tokens_per_second" };
  if (/\bs\b|sec/i.test(cell) && value < 1000) return { value, unit: "seconds" };
  return { value, unit: "score" };
}

function hostName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function regionFor(category: string): LeaderboardRecord["scope_region"] {
  if (category === "india") return "india";
  if (category === "china") return "china";
  if (category === "europe") return "europe";
  return "global";
}

function extractFromHtml(
  html: string,
  url: string,
  category: string,
  limit: number,
): LeaderboardRecord[] {
  const retrievedAt = new Date().toISOString();
  const out: LeaderboardRecord[] = [];
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];

  for (const table of tables) {
    const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    if (rows.length < 2) continue;
    const cellsOf = (row: string) =>
      (row.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) ?? []).map(stripTags);

    const header = cellsOf(rows[0]!);
    if (header.length < 2) continue;
    const modelIdx = header.findIndex((h) => /model|name|system|llm|agent/i.test(h));
    if (modelIdx === -1) continue;

    for (const row of rows.slice(1)) {
      if (out.length >= limit) break;
      const cells = cellsOf(row);
      if (cells.length !== header.length) continue;
      const modelName = cells[modelIdx];
      if (!modelName || modelName.length < 2 || modelName.length > 90) continue;

      let picked: { name: string; value: number; unit: string } | null = null;
      for (let i = 0; i < cells.length; i++) {
        if (i === modelIdx) continue;
        const head = header[i] ?? "";
        if (/rank|#|index|date|param/i.test(head)) continue;
        const parsed = parseNumber(cells[i] ?? "");
        if (parsed) {
          picked = { name: snake(head || "score"), value: parsed.value, unit: parsed.unit };
          break;
        }
      }
      if (!picked) continue;

      const candidate = {
        source_name: hostName(url),
        source_url: url,
        retrieved_at: retrievedAt,
        category,
        model_name: modelName,
        model_version: null,
        benchmark_name: hostName(url),
        metric_name: picked.name,
        metric_value: picked.value,
        metric_unit: picked.unit,
        rank: out.length + 1,
        date_reported: retrievedAt.slice(0, 10),
        scope_region: regionFor(category),
        task_type: category === "cybersecurity" ? "cybersecurity" : category === "hallucination_safety" ? "hallucination" : "general",
        raw_hash: `${hostName(url)}:${modelName}:${picked.name}`.slice(0, 96),
      };
      const validated = recordSchema.safeParse(candidate);
      if (validated.success) out.push(validated.data);
    }
    if (out.length >= limit) break;
  }
  return out;
}

/* -------------------- Suprmind hallucination metrics -------------------- */

/** Strips run-configuration notes that follow the model name in a cell. */
function cleanSuprmindName(cell: string): string {
  let name = cell
    .split(/\s+(?:AA max run|AA configuration|Not yet publicly|Vectara,|The high setting|HalluHard on)/i)[0]!
    .replace(/[.\s]+$/, "")
    .trim();
  // Drop a trailing sentence fragment after the first period-space.
  const dot = name.indexOf(". ");
  if (dot > 0) name = name.slice(0, dot);
  return name.trim();
}

const SUPRMIND_MAIN_METRICS: { head: RegExp; name: string }[] = [
  { head: /^aa accuracy/i, name: "aa_accuracy" },
  { head: /^aa hallucination/i, name: "aa_hallucination_rate" },
  { head: /^aa index/i, name: "aa_index" },
  { head: /^vectara \(new/i, name: "vectara_hhem_new" },
  { head: /^vectara \(orig/i, name: "vectara_hhem_orig" },
  { head: /^facts/i, name: "facts_grounding" },
  { head: /^simpleqa/i, name: "simpleqa_verified" },
  { head: /^halluhard/i, name: "halluhard" },
];

export async function extractSuprmind(
  pageUrl: string,
  category: string,
): Promise<LeaderboardRecord[]> {
  const html = await fetchWithBackoff(pageUrl);
  const retrievedAt = new Date().toISOString();
  const out: LeaderboardRecord[] = [];
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];

  const push = (
    modelName: string,
    metric: { name: string; value: number; unit: string },
    benchmark: string,
  ) => {
    const candidate = {
      source_name: hostName(pageUrl),
      source_url: pageUrl,
      retrieved_at: retrievedAt,
      category,
      model_name: modelName,
      model_version: null,
      benchmark_name: benchmark,
      metric_name: metric.name,
      metric_value: metric.value,
      metric_unit: metric.unit,
      rank: null,
      date_reported: retrievedAt.slice(0, 10),
      scope_region: regionFor(category),
      task_type: "hallucination",
      raw_hash: `suprmind:${modelName}:${metric.name}`.slice(0, 96),
    };
    const validated = recordSchema.safeParse(candidate);
    if (validated.success) out.push(validated.data);
  };

  for (const table of tables) {
    const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    if (rows.length < 2) continue;
    const cellsOf = (row: string) =>
      (row.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) ?? []).map(stripTags);
    const header = cellsOf(rows[0]!);

    // Main table: Model | Lab | AA accuracy | AA hallucination | ... | HalluHard
    if (header.some((h) => /^aa accuracy/i.test(h))) {
      const modelIdx = header.findIndex((h) => /^model/i.test(h));
      const metricCols = header
        .map((h, i) => ({ i, m: SUPRMIND_MAIN_METRICS.find((mm) => mm.head.test(h)) }))
        .filter((c) => c.m && c.i !== modelIdx);
      for (const row of rows.slice(1)) {
        const cells = cellsOf(row);
        if (cells.length !== header.length) continue;
        const modelName = cleanSuprmindName(cells[modelIdx] ?? "");
        if (!modelName || modelName.length < 2 || modelName.length > 60) continue;
        for (const { i, m } of metricCols) {
          const raw = (cells[i] ?? "").replace(/&Dagger;|‡|†/g, "").trim();
          if (!raw || raw === "-") continue;
          const parsed = parseNumber(raw);
          if (parsed) push(modelName, { name: m!.name, ...parsed }, "suprmind.ai");
        }
      }
      continue;
    }

    // Vectara-style table: Model | Provider | Hallucination Rate | Factual Consistency
    if (header.some((h) => /hallucination rate/i.test(h))) {
      const modelIdx = header.findIndex((h) => /^model/i.test(h));
      const hallIdx = header.findIndex((h) => /hallucination rate/i.test(h));
      const factIdx = header.findIndex((h) => /factual consistency/i.test(h));
      for (const row of rows.slice(1)) {
        const cells = cellsOf(row);
        if (cells.length !== header.length) continue;
        const modelName = (cells[modelIdx] ?? "").trim();
        if (!modelName || modelName.length < 2 || modelName.length > 60) continue;
        for (const [idx, name] of [
          [hallIdx, "hallucination_rate"],
          [factIdx, "factual_consistency"],
        ] as const) {
          if (idx < 0) continue;
          const parsed = parseNumber(cells[idx] ?? "");
          if (parsed) push(modelName, { name, ...parsed }, "vectara_hhem");
        }
      }
    }
  }
  return out;
}

/* ------------------------- Nilgiri cyber range -------------------------- */

const NILGIRI_RESULTS =
  "https://raw.githubusercontent.com/sparclabs/nilgiri/main/docs/leaderboard/results.json";

type NilgiriOverall = {
  avg_flags_captured_at_3?: number;
  avg_milestones_completed_at_3?: number;
};
type NilgiriModel = {
  id: string;
  display_name?: string;
  provider?: string;
  by_token_budget?: Record<string, { overall?: NilgiriOverall }>;
};

/** Nilgiri renders its grid client-side; read the published results.json instead. */
export async function extractNilgiri(pageUrl: string, category: string): Promise<LeaderboardRecord[]> {
  const raw = JSON.parse(await fetchWithBackoff(NILGIRI_RESULTS)) as {
    generated_at?: string;
    benchmark?: { total_flags?: number; total_milestones?: number };
    models?: NilgiriModel[];
  };
  const retrievedAt = new Date().toISOString();
  const reported = raw.generated_at?.slice(0, 10) ?? retrievedAt.slice(0, 10);
  const rows = (raw.models ?? [])
    .map((m) => {
      const budgets = Object.keys(m.by_token_budget ?? {}).sort((a, b) => Number(b) - Number(a));
      const top = budgets[0];
      return { m, budget: top, overall: top ? m.by_token_budget![top]!.overall : undefined };
    })
    .filter((r) => r.overall?.avg_flags_captured_at_3 != null)
    .sort((a, b) => b.overall!.avg_flags_captured_at_3! - a.overall!.avg_flags_captured_at_3!);

  const out: LeaderboardRecord[] = [];
  let lastIssue = "";
  rows.forEach(({ m, budget, overall }, i) => {
    const name = m.display_name ?? m.id;
    const metrics: [string, number | undefined, string][] = [
      ["avg_flags_captured_at_3", overall?.avg_flags_captured_at_3, `flags_of_${raw.benchmark?.total_flags ?? 32}`],
      ["avg_milestones_completed_at_3", overall?.avg_milestones_completed_at_3, `milestones_of_${raw.benchmark?.total_milestones ?? 9}`],
    ];
    for (const [metric, value, unit] of metrics) {
      if (value == null) continue;
      const v = recordSchema.safeParse({
        source_name: "Nilgiri (SPARC Labs)",
        source_url: pageUrl,
        retrieved_at: retrievedAt,
        category,
        model_name: name,
        model_version: m.provider ? `${m.provider} · ${Number(budget) / 1e6}M token budget` : null,
        benchmark_name: "Nilgiri cyber range",
        metric_name: metric,
        metric_value: Number(value.toFixed(2)),
        metric_unit: unit,
        rank: i + 1,
        date_reported: reported,
        scope_region: "global",
        task_type: "cybersecurity",
        raw_hash: `nilgiri:${m.id}:${metric}`,
      });
      if (v.success) out.push(v.data);
      else lastIssue = v.error.issues[0]?.message ?? "invalid";
    }
  });
  if (!out.length) throw new Error(`nilgiri: ${raw.models?.length ?? 0} models, ${rows.length} rows, ${lastIssue}`);
  return out;
}

/* ---------------------------- LiveCodeBench ----------------------------- */

const LCB_RESULTS = "https://livecodebench.github.io/performances_generation.json";

type LcbRow = { model?: string; date?: number; "pass@1"?: number };

/** LiveCodeBench renders client-side; aggregate its published performances JSON. */
export async function extractLiveCodeBench(pageUrl: string, category: string): Promise<LeaderboardRecord[]> {
  const raw = JSON.parse(await fetchWithBackoff(LCB_RESULTS)) as { performances?: LcbRow[] };
  const rows = (raw.performances ?? []).filter(
    (r) => r.model && typeof r["pass@1"] === "number" && typeof r.date === "number",
  );
  if (!rows.length) throw new Error("livecodebench: no performances");

  // Match the site's default view: questions from the most recent 12 months.
  const maxDate = Math.max(...rows.map((r) => r.date!));
  const cutoff = maxDate - 365 * 24 * 3600 * 1000;
  const recent = rows.filter((r) => r.date! >= cutoff);

  const byModel = new Map<string, { sum: number; n: number }>();
  for (const r of recent) {
    const e = byModel.get(r.model!) ?? { sum: 0, n: 0 };
    e.sum += r["pass@1"]!;
    e.n += 1;
    byModel.set(r.model!, e);
  }
  const ranked = [...byModel.entries()]
    .filter(([, e]) => e.n >= 30)
    .map(([model, e]) => ({ model, avg: e.sum / e.n, n: e.n }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10);
  if (!ranked.length) throw new Error("livecodebench: no models with enough questions");

  const retrievedAt = new Date().toISOString();
  const out: LeaderboardRecord[] = [];
  ranked.forEach(({ model, avg, n }, i) => {
    const v = recordSchema.safeParse({
      source_name: "LiveCodeBench",
      source_url: pageUrl,
      retrieved_at: retrievedAt,
      category,
      model_name: model,
      model_version: null,
      benchmark_name: "LiveCodeBench (12-month window)",
      metric_name: "pass_at_1",
      metric_value: Number(avg.toFixed(1)),
      metric_unit: "percent",
      rank: i + 1,
      date_reported: new Date(maxDate).toISOString().slice(0, 10),
      scope_region: "global",
      task_type: "coding",
      raw_hash: `livecodebench:${model}`.slice(0, 96),
    });
    if (v.success) out.push(v.data);
  });
  if (!out.length) throw new Error("livecodebench: rows failed validation");
  return out;
}

function pushRecord(out: LeaderboardRecord[], rec: Record<string, unknown>) {
  const v = recordSchema.safeParse(rec);
  if (v.success) out.push(v.data);
}

/** SWE-bench embeds its full results as JSON in <script id="leaderboard-data">. */
export async function extractSweBench(pageUrl: string, category: string): Promise<LeaderboardRecord[]> {
  const html = await fetchWithBackoff(pageUrl);
  const m = html.match(/<script[^>]*id="leaderboard-data"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("swebench: embedded data not found");
  const boards = JSON.parse(m[1] ?? "[]") as Array<{
    name: string;
    results: Array<{ name?: string; model_display?: string; resolved?: number; date?: string }>;
  }>;
  const verified = boards.find((b) => b.name === "Verified");
  if (!verified) throw new Error("swebench: Verified board missing");
  const best = new Map<string, { resolved: number; date: string | null }>();
  for (const r of verified.results) {
    const model = r.model_display || r.name;
    if (!model || typeof r.resolved !== "number") continue;
    const prev = best.get(model);
    if (!prev || r.resolved > prev.resolved) best.set(model, { resolved: r.resolved, date: r.date ?? null });
  }
  const ranked = [...best.entries()].sort((a, b) => b[1].resolved - a[1].resolved).slice(0, 10);
  const retrievedAt = new Date().toISOString();
  const out: LeaderboardRecord[] = [];
  ranked.forEach(([model, e], i) =>
    pushRecord(out, {
      source_name: "SWE-bench",
      source_url: pageUrl,
      retrieved_at: retrievedAt,
      category,
      model_name: model,
      model_version: null,
      benchmark_name: "SWE-bench Verified",
      metric_name: "resolved_rate",
      metric_value: e.resolved,
      metric_unit: "percent",
      rank: i + 1,
      date_reported: e.date,
      scope_region: "global",
      task_type: "coding",
      raw_hash: `swebench:${model}`.slice(0, 96),
    }),
  );
  if (!out.length) throw new Error("swebench: rows failed validation");
  return out;
}

/** modelgrep server-renders its table: Intelligence index (Artificial Analysis) and Code scores. */
export async function extractModelgrep(pageUrl: string, category: string): Promise<LeaderboardRecord[]> {
  const html = await fetchWithBackoff(pageUrl);
  const body = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
  const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) =>
    [...(r[1] ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => strip(c[1] ?? "")),
  );
  const retrievedAt = new Date().toISOString();
  const out: LeaderboardRecord[] = [];
  const metrics = [
    { col: 2, metric: "intelligence_index", bench: "Artificial Analysis Intelligence Index (via modelgrep)", task: "reasoning" },
    { col: 3, metric: "coding_index", bench: "Artificial Analysis Coding Index (via modelgrep)", task: "coding" },
  ];
  for (const m of metrics) {
    const scored = rows
      .map((c) => ({ model: (c[1] ?? "").split(" ")[0], v: Number.parseFloat(c[m.col] ?? "") }))
      .filter((r) => r.model && Number.isFinite(r.v))
      .sort((a, b) => b.v - a.v)
      .slice(0, 10);
    scored.forEach((r, i) =>
      pushRecord(out, {
        source_name: "modelgrep",
        source_url: pageUrl,
        retrieved_at: retrievedAt,
        category,
        model_name: r.model,
        model_version: null,
        benchmark_name: m.bench,
        metric_name: m.metric,
        metric_value: r.v,
        metric_unit: "index",
        rank: i + 1,
        date_reported: retrievedAt.slice(0, 10),
        scope_region: "global",
        task_type: m.task,
        raw_hash: `modelgrep:${m.metric}:${r.model}`.slice(0, 96),
      }),
    );
  }
  if (!out.length) throw new Error("modelgrep: no rows");
  return out;
}

type Ctx = { pageUrl: string; category: string; retrievedAt: string };
function emit(
  out: LeaderboardRecord[],
  ctx: Ctx,
  r: { source: string; model: string; bench: string; metric: string; value: number; unit: string; rank: number; date: string | null; task: string; key: string; version?: string | null },
) {
  pushRecord(out, {
    source_name: r.source,
    source_url: ctx.pageUrl,
    retrieved_at: ctx.retrievedAt,
    category: ctx.category,
    model_name: r.model,
    model_version: r.version ?? null,
    benchmark_name: r.bench,
    metric_name: r.metric,
    metric_value: r.value,
    metric_unit: r.unit,
    rank: r.rank,
    date_reported: r.date,
    scope_region: "global",
    task_type: r.task,
    raw_hash: r.key.slice(0, 96),
  });
}

/** Developer-origin keyword maps for regional slices of global leaderboards. */
const REGION_HINTS: Record<string, { region: string; hints: RegExp }> = {
  europe: {
    region: "Europe",
    hints: /mistral|magistral|mixtral|ministral|pixtral|aleph|luminous|lighton|poolside|h company|holistic|le chat|deepcogito|cogito|sauerkraut|occiglot|teuken|euro-?llm|salamandra/i,
  },
  china: {
    region: "China",
    hints: /deepseek|qwen|qwq|glm|zhipu|chatglm|moonshot|kimi|yi[- ]|01\.ai|minimax|abab|stepfun|step-|hunyuan|ernie|wenxin|doubao|seed-|bytedance|xiaomi|mimo|kwaipilot|kat-|internlm|baichuan|spark desk|ling-|ring-|dots\.llm|skywork|telechat|sensenova/i,
  },
};

/** Slices LMArena's published ratings to models from a given developer region. */
export async function extractRegional(category: string): Promise<LeaderboardRecord[]> {
  const spec = REGION_HINTS[category];
  if (!spec) throw new Error(`regional: unknown category ${category}`);
  const api =
    "https://datasets-server.huggingface.co/rows?dataset=lmarena-ai/leaderboard-dataset&config=text&split=latest&offset=0&length=100";
  const data = JSON.parse(await fetchWithBackoff(api)) as {
    rows: Array<{ row: { model_name: string; rating: number; category: string; leaderboard_publish_date: string } }>;
  };
  const ctx = { pageUrl: "https://lmarena.ai/leaderboard", category, retrievedAt: new Date().toISOString() };
  const out: LeaderboardRecord[] = [];
  data.rows
    .map((r) => r.row)
    .filter((r) => r.category === "overall" && Number.isFinite(r.rating) && spec.hints.test(r.model_name))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 10)
    .forEach((r, i) =>
      pushRecord(out, {
        source_name: "LMArena",
        source_url: ctx.pageUrl,
        retrieved_at: ctx.retrievedAt,
        category,
        model_name: r.model_name,
        model_version: null,
        benchmark_name: `LMArena Text Arena — ${spec.region} models`,
        metric_name: "arena_rating",
        metric_value: Math.round(r.rating * 10) / 10,
        metric_unit: "elo",
        rank: i + 1,
        date_reported: r.leaderboard_publish_date ?? null,
        scope_region: category,
        task_type: "chat_preference",
        raw_hash: `lmarena:${category}:${r.model_name}`.slice(0, 96),
      }),
    );
  // Also slice modelgrep's server-rendered table (Intelligence index) by region.
  try {
    const mgUrl = "https://modelgrep.com/";
    const html = await fetchWithBackoff(mgUrl);
    const body = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
    const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) =>
      [...(r[1] ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => strip(c[1] ?? "")),
    );
    rows
      .map((c) => ({ model: (c[1] ?? "").split(" ")[0], v: Number.parseFloat(c[2] ?? "") }))
      .filter((r) => r.model && Number.isFinite(r.v) && spec.hints.test(r.model))
      .sort((a, b) => b.v - a.v)
      .slice(0, 10)
      .forEach((r, i) =>
        pushRecord(out, {
          source_name: "modelgrep",
          source_url: mgUrl,
          retrieved_at: ctx.retrievedAt,
          category,
          model_name: r.model,
          model_version: null,
          benchmark_name: `Artificial Analysis Intelligence Index — ${spec.region} models`,
          metric_name: "intelligence_index",
          metric_value: r.v,
          metric_unit: "index",
          rank: i + 1,
          date_reported: ctx.retrievedAt.slice(0, 10),
          scope_region: category,
          task_type: "reasoning",
          raw_hash: `modelgrep:${category}:${r.model}`.slice(0, 96),
        }),
      );
  } catch {
    /* modelgrep slice is best-effort */
  }
  if (!out.length) throw new Error(`regional: no ${spec.region} rows`);
  return out;
}

/** LMArena publishes its ratings as a Hugging Face dataset; read via the datasets-server JSON API. */
export async function extractLmArena(pageUrl: string, category: string): Promise<LeaderboardRecord[]> {
  const api =
    "https://datasets-server.huggingface.co/rows?dataset=lmarena-ai/leaderboard-dataset&config=text&split=latest&offset=0&length=100";
  const data = JSON.parse(await fetchWithBackoff(api)) as {
    rows: Array<{ row: { model_name: string; rating: number; rank: number; category: string; leaderboard_publish_date: string } }>;
  };
  const ctx = { pageUrl, category, retrievedAt: new Date().toISOString() };
  const out: LeaderboardRecord[] = [];
  data.rows
    .map((r) => r.row)
    .filter((r) => r.category === "overall" && Number.isFinite(r.rating))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 10)
    .forEach((r, i) =>
      emit(out, ctx, {
        source: "LMArena", model: r.model_name, bench: "LMArena Text Arena (overall)", metric: "arena_rating",
        value: Math.round(r.rating * 10) / 10, unit: "elo", rank: i + 1, date: r.leaderboard_publish_date ?? null,
        task: "chat_preference", key: `lmarena:${r.model_name}`,
      }),
    );
  if (!out.length) throw new Error("lmarena: no overall rows");
  return out;
}

/** HELM Capabilities publishes per-release JSON; the "Accuracy" table holds the mean score. */
export async function extractHelm(pageUrl: string, category: string): Promise<LeaderboardRecord[]> {
  const base = "https://storage.googleapis.com/crfm-helm-public/capabilities/benchmark_output";
  let release = "v1.12.0";
  try {
    const rels = JSON.parse(await fetchWithBackoff(`${base}/releases.json`)) as unknown;
    if (Array.isArray(rels) && typeof rels[0] === "string") release = rels[0];
  } catch {
    /* fall back to known release */
  }
  const tables = JSON.parse(await fetchWithBackoff(`${base}/releases/${release}/groups/core_scenarios.json`)) as Array<{
    title: string;
    rows: Array<Array<{ value?: unknown }>>;
  }>;
  const t = tables.find((x) => x.title === "Accuracy") ?? tables[0];
  if (!t) throw new Error("helm: no tables");
  const ctx = { pageUrl, category, retrievedAt: new Date().toISOString() };
  const out: LeaderboardRecord[] = [];
  t.rows
    .map((r) => ({ model: String(r[0]?.value ?? ""), v: Number(r[1]?.value) }))
    .filter((r) => r.model && Number.isFinite(r.v))
    .sort((a, b) => b.v - a.v)
    .slice(0, 10)
    .forEach((r, i) =>
      emit(out, ctx, {
        source: "Stanford HELM", model: r.model, bench: `HELM Capabilities (${release})`, metric: "mean_score",
        value: Math.round(r.v * 1000) / 10, unit: "percent", rank: i + 1, date: null, task: "reasoning",
        key: `helm:${release}:${r.model}`,
      }),
    );
  if (!out.length) throw new Error("helm: no rows");
  return out;
}

/** MMMU's leaderboard page loads ./leaderboard_data.json; rank models (not human experts) by MMMU-Pro overall. */
export async function extractMmmu(pageUrl: string, category: string): Promise<LeaderboardRecord[]> {
  const url = new URL("leaderboard_data.json", pageUrl.endsWith("/") ? pageUrl : `${pageUrl}/`).toString();
  const data = JSON.parse(await fetchWithBackoff(url)) as {
    leaderboardData: Array<{ info: { name: string; date?: string; type?: string }; pro?: { overall?: string }; validation?: { overall?: string } }>;
  };
  const ctx = { pageUrl, category, retrievedAt: new Date().toISOString() };
  const out: LeaderboardRecord[] = [];
  const models = data.leaderboardData.filter((m) => m.info.type !== "human_expert");
  const boards = [
    { key: "pro" as const, bench: "MMMU-Pro", metric: "mmmu_pro_overall" },
    { key: "validation" as const, bench: "MMMU (Val)", metric: "mmmu_val_overall" },
  ];
  for (const b of boards) {
    models
      .map((m) => ({ m, v: Number.parseFloat(m[b.key]?.overall ?? "") }))
      .filter((r) => Number.isFinite(r.v))
      .sort((a, b2) => b2.v - a.v)
      .slice(0, 10)
      .forEach((r, i) =>
        emit(out, ctx, {
          source: "MMMU", model: r.m.info.name, bench: b.bench, metric: b.metric, value: r.v, unit: "percent",
          rank: i + 1, date: r.m.info.date ?? null, task: "multimodal", key: `mmmu:${b.metric}:${r.m.info.name}`,
        }),
      );
  }
  if (!out.length) throw new Error("mmmu: no rows");
  return out;
}

/** MLPerf Inference: newest round's summary_results.json; best closed-division datacenter tokens/s per LLM workload. */
export async function extractMlperf(pageUrl: string, category: string): Promise<LeaderboardRecord[]> {
  const { collectHardwareMeasurements } = await import("./hardware-collector.server");
  const feed = await collectHardwareMeasurements();
  if (feed.status !== "ok") throw new Error("mlperf: no results file");
  const ctx = { pageUrl, category, retrievedAt: new Date().toISOString() };
  const best = new Map<string, (typeof feed.measurements)[number]>();
  for (const r of feed.measurements) {
    const model = r.model;
    const prev = best.get(model);
    if (!prev || r.value > prev.value) best.set(model, r);
  }
  const out: LeaderboardRecord[] = [];
  [...best.entries()]
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 10)
    .forEach(([model, r], i) => {
      emit(out, ctx, {
        source: "MLPerf Inference", model,
        bench: `MLPerf Inference ${r.round} (datacenter, offline)`, metric: "throughput_tokens_per_s",
        value: r.value, unit: "tokens/s", rank: i + 1, date: null, task: "infrastructure",
        key: `mlperf:${r.round}:${model}`,
      });
      const row = out.at(-1);
      if (row) row.hardware_context = { system: r.system, submitter: r.submitter,
        round: r.round, scenario: r.scenario, division: r.division, precision: r.precision,
        accelerators: r.accelerators, source_url: r.sourceUrl };
    });
  if (!out.length) throw new Error("mlperf: no LLM tokens/s rows");
  return out;
}


/* ------------------------------ the run --------------------------------- */

export async function runCollection(options?: {
  perSourceLimit?: number;
  maxSourcesPerCategory?: number;
  delayMinMs?: number;
  delayMaxMs?: number;
}): Promise<CollectionRun> {
  const started = Date.now();
  const perSourceLimit = options?.perSourceLimit ?? spec.max_items_per_category;
  const maxPerCategory = options?.maxSourcesPerCategory ?? 6;
  const delayMin = options?.delayMinMs ?? 300;
  const delayMax = options?.delayMaxMs ?? 900;

  const outcomes: SourceOutcome[] = [];
  const records: LeaderboardRecord[] = [];

  // One worker per category → different hosts run in parallel, each host
  // sequentially with a randomized delay between requests.
  await Promise.all(
    categories.map(async (cat) => {
      // Regional categories get a dedicated slice of LMArena's published ratings.
      if (REGION_HINTS[cat.id]) {
        try {
          const found = await extractRegional(cat.id);
          records.push(...found);
          outcomes.push({ url: "https://lmarena.ai/leaderboard", category: cat.id, status: "ok", records: found.length });
        } catch (error) {
          outcomes.push({
            url: "https://lmarena.ai/leaderboard",
            category: cat.id,
            status: "failed",
            records: 0,
            detail: error instanceof Error ? error.message.slice(0, 140) : "error",
          });
        }
      }
      const sources = (cat.sources ?? []).slice(0, maxPerCategory);
      for (const url of sources) {
        await sleep(jitter(delayMin, delayMax));
        const ua = pickUA();
        try {
          if (!(await robotsAllows(url, ua))) {
            outcomes.push({ url, category: cat.id, status: "blocked", records: 0 });
            continue;
          }
          const found = /suprmind\.ai/.test(url)
            ? await extractSuprmind(url, cat.id)
            : /sparclabs\.github\.io\/nilgiri/.test(url)
              ? await extractNilgiri(url, cat.id)
            : /livecodebench\.github\.io/.test(url)
              ? await extractLiveCodeBench(url, cat.id)
              : /swebench\.com/.test(url)
                ? await extractSweBench(url, cat.id)
                : /modelgrep\.com/.test(url)
                  ? await extractModelgrep(url, cat.id)
                  : /lmarena/.test(url)
                    ? await extractLmArena(url, cat.id)
                    : /crfm\.stanford\.edu\/helm/.test(url)
                      ? await extractHelm(url, cat.id)
                      : /mmmu-benchmark\.github\.io/.test(url)
                        ? await extractMmmu(url, cat.id)
                        : /mlcommons|inference_results/.test(url)
                          ? await extractMlperf(url, cat.id)
                  : extractFromHtml(await fetchWithBackoff(url), url, cat.id, perSourceLimit);
          records.push(...found);
          outcomes.push({
            url,
            category: cat.id,
            status: found.length ? "ok" : "empty",
            records: found.length,
          });
        } catch (error) {
          outcomes.push({
            url,
            category: cat.id,
            status: "failed",
            records: 0,
            detail: error instanceof Error ? error.message.slice(0, 140) : "error",
          });
        }
      }
    }),
  );

  return {
    generated_at: new Date().toISOString(),
    records,
    outcomes,
    duration_ms: Date.now() - started,
  };
}

/** Keeps previous rows for any category the run could not refresh. */
export function mergeWithPrevious(
  fresh: LeaderboardRecord[],
  previous: LeaderboardRecord[],
): LeaderboardRecord[] {
  const freshCategories = new Set(fresh.map((r) => r.category));
  const kept = previous.filter((r) => !freshCategories.has(r.category));
  return [...fresh, ...kept];
}

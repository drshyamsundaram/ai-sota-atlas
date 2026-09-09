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
        task_type: "general",
        raw_hash: `${hostName(url)}:${modelName}:${picked.name}`.slice(0, 96),
      };
      const validated = recordSchema.safeParse(candidate);
      if (validated.success) out.push(validated.data);
    }
    if (out.length >= limit) break;
  }
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
  const maxPerCategory = options?.maxSourcesPerCategory ?? 4;
  const delayMin = options?.delayMinMs ?? 300;
  const delayMax = options?.delayMaxMs ?? 900;

  const outcomes: SourceOutcome[] = [];
  const records: LeaderboardRecord[] = [];

  // One worker per category → different hosts run in parallel, each host
  // sequentially with a randomized delay between requests.
  await Promise.all(
    categories.map(async (cat) => {
      const sources = (cat.sources ?? []).slice(0, maxPerCategory);
      for (const url of sources) {
        await sleep(jitter(delayMin, delayMax));
        const ua = pickUA();
        try {
          if (!(await robotsAllows(url, ua))) {
            outcomes.push({ url, category: cat.id, status: "blocked", records: 0 });
            continue;
          }
          const html = await fetchWithBackoff(url);
          const found = extractFromHtml(html, url, cat.id, perSourceLimit);
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

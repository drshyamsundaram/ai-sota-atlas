import { countryFor, tokenSpec } from "@/data/token-config";
import { formatTokens, tokenRecordSchema, type TokenRecord } from "./token-schema";

/**
 * Live token-utilisation collector. Pulls the openly reachable JSON ranking
 * series configured in pipeline/token_config.json, honouring randomized
 * delays, rotating User-Agents and exponential backoff.
 *
 * Each slice URL returns a weekly time series shaped as:
 *   { data: [{ x: "2026-09-07", ys: { "<model_permaslug>": tokens, ... } }, ...] }
 * (the overall endpoint wraps it once more: { data: { data: [...] } }).
 * The latest week gives tokens_processed, the previous week gives growth.
 */

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
];

const pickUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => min + Math.random() * (max - min);

export type TokenSourceOutcome = {
  url: string;
  slice: string;
  status: "ok" | "empty" | "failed";
  records: number;
  detail?: string;
};

export type TokenCollectionRun = {
  generated_at: string;
  records: TokenRecord[];
  outcomes: TokenSourceOutcome[];
  duration_ms: number;
};

async function fetchWithBackoff(url: string, attempts = 3): Promise<unknown> {
  let lastError = "unknown error";
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(2 ** attempt * 400 + jitter(0, 400));
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": pickUA(),
          accept: "application/json,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error instanceof Error ? error.message : "fetch error";
    }
  }
  throw new Error(lastError);
}

type WeekPoint = { x: string; ys: Record<string, number> };

function extractWeeks(payload: unknown): WeekPoint[] {
  const data = (payload as { data?: unknown })?.data;
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { data?: unknown })?.data)
      ? ((data as { data: unknown[] }).data as unknown[])
      : [];
  return rows.filter(
    (r): r is WeekPoint =>
      !!r && typeof (r as WeekPoint).x === "string" && typeof (r as WeekPoint).ys === "object",
  );
}

/** Strip a trailing -YYYYMMDD date suffix from a permaslug to get the base model id. */
const baseModelId = (permaslug: string) => permaslug.replace(/-\d{8}$/, "");

const prettify = (permaslug: string) => {
  const tail = baseModelId(permaslug).split("/").pop() ?? permaslug;
  return tail
    .split(/[-.]/)
    .filter(Boolean)
    .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
};

async function fetchModelNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  try {
    const payload = (await fetchWithBackoff("https://openrouter.ai/api/v1/models", 2)) as {
      data?: { id?: string; name?: string }[];
    };
    for (const m of payload.data ?? []) {
      if (m.id && m.name) names.set(m.id.toLowerCase(), m.name);
    }
  } catch {
    // name lookup is best-effort; fall back to prettified slugs
  }
  return names;
}

function parseSeries(
  payload: unknown,
  slice: { id: string; label: string; url: string },
  limit: number,
  names: Map<string, string>,
): TokenRecord[] {
  const weeks = extractWeeks(payload);
  if (weeks.length === 0) return [];
  const latest = weeks[weeks.length - 1]!;
  const previous = weeks.length > 1 ? weeks[weeks.length - 2]! : null;
  const retrievedAt = new Date().toISOString();

  const entries = Object.entries(latest.ys)
    .filter(([slug, tokens]) => slug !== "Others" && Number.isFinite(tokens) && tokens > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const total = entries.reduce((sum, [, t]) => sum + t, 0) || 1;
  const out: TokenRecord[] = [];

  entries.forEach(([permaslug, tokens], i) => {
    const developer = permaslug.split("/")[0] ?? "unknown";
    const prevTokens = previous?.ys[permaslug];
    const growth =
      prevTokens && prevTokens > 0
        ? Number((((tokens - prevTokens) / prevTokens) * 100).toFixed(2))
        : null;
    const validated = tokenRecordSchema.safeParse({
      source_name: "openrouter.ai",
      source_url: slice.url,
      retrieved_at: retrievedAt,
      slice_id: slice.id,
      slice_label: slice.label,
      rank: i + 1,
      model_id: permaslug,
      model_name: names.get(baseModelId(permaslug).toLowerCase()) ?? prettify(permaslug),
      developer,
      country: countryFor(developer),
      tokens_processed: Math.round(tokens),
      tokens_display: formatTokens(tokens),
      token_share_pct: Number(((tokens / total) * 100).toFixed(2)),
      token_growth_pct: growth,
    });
    if (validated.success) out.push(validated.data);
  });
  return out;
}

type ModelRankingRow = {
  date: string;
  model_permaslug: string;
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
};

/**
 * Full per-model ranking feed (~500 models, all providers incl. Anthropic).
 * Shape: { data: [{ date, model_permaslug, total_prompt_tokens, total_completion_tokens }] }
 * Tokens are summed per base model across the returned days; growth compares
 * the latest day against the previous day.
 */
function parseModelRanking(
  payload: unknown,
  slice: { id: string; label: string; url: string },
  limit: number,
  names: Map<string, string>,
): TokenRecord[] {
  const rows = ((payload as { data?: unknown })?.data ?? []) as ModelRankingRow[];
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const latestDate = dates[dates.length - 1];
  const prevDate = dates.length > 1 ? dates[dates.length - 2] : null;

  const totals = new Map<string, number>();
  const latestDay = new Map<string, number>();
  const prevDay = new Map<string, number>();
  for (const r of rows) {
    if (!r?.model_permaslug) continue;
    const key = baseModelId(r.model_permaslug).replace(/:free$/, "");
    const tokens = (r.total_prompt_tokens ?? 0) + (r.total_completion_tokens ?? 0);
    if (!Number.isFinite(tokens) || tokens <= 0) continue;
    totals.set(key, (totals.get(key) ?? 0) + tokens);
    if (r.date === latestDate) latestDay.set(key, (latestDay.get(key) ?? 0) + tokens);
    if (prevDate && r.date === prevDate) prevDay.set(key, (prevDay.get(key) ?? 0) + tokens);
  }

  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const total = entries.reduce((sum, [, t]) => sum + t, 0) || 1;
  const retrievedAt = new Date().toISOString();
  const out: TokenRecord[] = [];

  entries.forEach(([modelId, tokens], i) => {
    const developer = modelId.split("/")[0] ?? "unknown";
    // Day-over-day growth only when both days report this model with a full
    // day of traffic; the feed is sparse, so partial days would produce noise.
    const last = latestDay.get(modelId);
    const before = prevDay.get(modelId);
    const growth =
      last && before && before > 0 && last / before < 20 && before / last < 20
        ? Number((((last - before) / before) * 100).toFixed(2))
        : null;
    const validated = tokenRecordSchema.safeParse({
      source_name: "openrouter.ai",
      source_url: slice.url,
      retrieved_at: retrievedAt,
      slice_id: slice.id,
      slice_label: slice.label,
      rank: i + 1,
      model_id: modelId,
      model_name: names.get(modelId.toLowerCase()) ?? prettify(modelId),
      developer,
      country: countryFor(developer),
      tokens_processed: Math.round(tokens),
      tokens_display: formatTokens(tokens),
      token_share_pct: Number(((tokens / total) * 100).toFixed(2)),
      token_growth_pct: growth,
    });
    if (validated.success) out.push(validated.data);
  });
  return out;
}

export async function runTokenCollection(options?: {
  maxSlices?: number;
  limitPerSlice?: number;
}): Promise<TokenCollectionRun> {
  const started = Date.now();
  const slices = tokenSpec.slices.slice(0, options?.maxSlices ?? tokenSpec.slices.length);
  const limit = options?.limitPerSlice ?? tokenSpec.max_models_per_slice;

  const names = await fetchModelNames();
  const records: TokenRecord[] = [];
  const outcomes: TokenSourceOutcome[] = [];

  for (const slice of slices) {
    await sleep(jitter(250, 900));
    try {
      const payload = await fetchWithBackoff(slice.url);
      const found = slice.url.includes("/rankings/models")
        ? parseModelRanking(payload, slice, Math.max(limit, 25), names)
        : parseSeries(payload, slice, limit, names);
      records.push(...found);
      outcomes.push({
        url: slice.url,
        slice: slice.id,
        status: found.length ? "ok" : "empty",
        records: found.length,
      });
    } catch (error) {
      outcomes.push({
        url: slice.url,
        slice: slice.id,
        status: "failed",
        records: 0,
        detail: error instanceof Error ? error.message.slice(0, 140) : "error",
      });
    }
  }

  return {
    generated_at: new Date().toISOString(),
    records,
    outcomes,
    duration_ms: Date.now() - started,
  };
}

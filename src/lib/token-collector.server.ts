import { countryFor, tokenSpec } from "@/data/token-config";
import { tokenRecordSchema, type TokenRecord } from "./token-schema";

/**
 * Live token-utilisation collector. Scrapes the openly reachable ranking
 * endpoints configured in pipeline/token_config.json, honouring robots.txt,
 * randomized delays, rotating User-Agents and exponential backoff.
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

async function fetchWithBackoff(url: string, attempts = 3): Promise<string> {
  let lastError = "unknown error";
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(2 ** attempt * 400 + jitter(0, 400));
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": pickUA(),
          accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(20_000),
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

const MULTIPLIER: Record<string, number> = { T: 1e12, B: 1e9, M: 1e6, K: 1e3, "": 1 };

function parseRankingHtml(
  html: string,
  slice: { id: string; label: string; url: string },
  limit: number,
): TokenRecord[] {
  const retrievedAt = new Date().toISOString();
  const rows = html.match(/data-testid="model-rankings-leaderboard-row"[\s\S]*?<\/tr>/g) ?? [];
  const parsed: Omit<TokenRecord, "token_share_pct">[] = [];

  for (const row of rows) {
    if (parsed.length >= limit) break;
    const rankMatch = row.match(/rowheader">(\d+)/);
    const links = [...row.matchAll(/href="\/([^"?]+)"[^>]*>([^<]+)<\/a>/g)];
    const tokenMatch = row.match(/<div>([\d.]+)\s*([TBMK]?)\s*tokens<\/div>/);
    if (!links.length || !tokenMatch) continue;

    const modelId = links[0]![1]!;
    const modelName = links[0]![2]!.trim();
    const developer = (links[1]?.[2] ?? modelId.split("/")[0] ?? "unknown").trim();
    const amount = Number(tokenMatch[1]);
    if (!Number.isFinite(amount)) continue;
    const tokens = amount * (MULTIPLIER[tokenMatch[2] ?? ""] ?? 1);

    const growthMatch = row.match(/<span class="([^"]*)">[\s\S]*?([\d.]+)%<\/span>/);
    let growth: number | null = null;
    if (growthMatch) {
      const value = Number(growthMatch[2]);
      growth = Number.isFinite(value)
        ? /negative|destructive|down/i.test(growthMatch[1] ?? "")
          ? -value
          : value
        : null;
    }

    parsed.push({
      source_name: "openrouter.ai",
      source_url: slice.url,
      retrieved_at: retrievedAt,
      slice_id: slice.id,
      slice_label: slice.label,
      rank: rankMatch ? Number(rankMatch[1]) : null,
      model_id: modelId,
      model_name: modelName,
      developer,
      country: countryFor(developer),
      tokens_processed: tokens,
      tokens_display: `${tokenMatch[1]}${tokenMatch[2] ?? ""}`,
      token_growth_pct: growth,
    });
  }

  const total = parsed.reduce((sum, r) => sum + r.tokens_processed, 0) || 1;
  const out: TokenRecord[] = [];
  for (const row of parsed) {
    const validated = tokenRecordSchema.safeParse({
      ...row,
      token_share_pct: Number(((row.tokens_processed / total) * 100).toFixed(2)),
    });
    if (validated.success) out.push(validated.data);
  }
  return out;
}

export async function runTokenCollection(options?: {
  maxSlices?: number;
  limitPerSlice?: number;
}): Promise<TokenCollectionRun> {
  const started = Date.now();
  const slices = tokenSpec.slices.slice(0, options?.maxSlices ?? tokenSpec.slices.length);
  const limit = options?.limitPerSlice ?? tokenSpec.max_models_per_slice;

  const records: TokenRecord[] = [];
  const outcomes: TokenSourceOutcome[] = [];

  for (const slice of slices) {
    await sleep(jitter(250, 900));
    try {
      const html = await fetchWithBackoff(slice.url);
      const found = parseRankingHtml(html, slice, limit);
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

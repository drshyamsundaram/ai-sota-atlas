import { z } from "zod";

export const tokenRecordSchema = z.object({
  source_name: z.string().min(1),
  source_url: z.string().url(),
  retrieved_at: z.string().min(4),
  slice_id: z.string().min(1),
  slice_label: z.string().min(1),
  rank: z.number().int().nullable(),
  model_id: z.string().min(1),
  model_name: z.string().min(1),
  developer: z.string().min(1),
  country: z.string().min(1),
  tokens_processed: z.number().nonnegative(),
  tokens_display: z.string().min(1),
  token_share_pct: z.number(),
  token_growth_pct: z.number().nullable(),
});

export const tokenDatasetSchema = z.object({
  generated_at: z.string().optional(),
  ingested_at: z.string().optional(),
  record_count: z.number().optional(),
  records: z.array(tokenRecordSchema),
});

export type TokenRecord = z.infer<typeof tokenRecordSchema>;
export type TokenDataset = z.infer<typeof tokenDatasetSchema>;

export function parseTokenDataset(input: unknown): TokenDataset {
  if (Array.isArray(input)) return tokenDatasetSchema.parse({ records: input });
  return tokenDatasetSchema.parse(input);
}

/** Human friendly token count, e.g. 18.7T */
export function formatTokens(value: number): string {
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [scale, suffix] of units) {
    if (value >= scale) return `${(value / scale).toFixed(value / scale >= 100 ? 0 : 1)}${suffix}`;
  }
  return String(Math.round(value));
}

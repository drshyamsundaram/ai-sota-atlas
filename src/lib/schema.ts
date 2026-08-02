import { z } from "zod";

export const scopeRegions = ["global", "india", "china", "europe", "us", "unknown"] as const;

export const recordSchema = z.object({
  source_name: z.string().min(1),
  source_url: z.string().url(),
  retrieved_at: z.string().min(4),
  category: z.string().min(1),
  model_name: z.string().min(1),
  model_version: z.string().nullable().optional(),
  benchmark_name: z.string().min(1),
  metric_name: z.string().min(1),
  metric_value: z.number().nullable(),
  metric_unit: z.string().default("score"),
  rank: z.number().int().nullable().optional(),
  date_reported: z.string().nullable().optional(),
  scope_region: z.enum(scopeRegions).catch("unknown"),
  task_type: z.string().default("general"),
  raw_hash: z.string().default(""),
});

export const datasetSchema = z.object({
  generated_at: z.string().optional(),
  record_count: z.number().optional(),
  records: z.array(recordSchema),
});

export type LeaderboardRecord = z.infer<typeof recordSchema>;
export type Dataset = z.infer<typeof datasetSchema>;

/** Accepts either a bare array or the full dataset envelope. */
export function parseDataset(input: unknown): Dataset {
  if (Array.isArray(input)) return datasetSchema.parse({ records: input });
  return datasetSchema.parse(input);
}

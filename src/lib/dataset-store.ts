import type { Dataset, LeaderboardRecord } from "./schema";

/**
 * In-memory store for the most recently ingested dataset.
 *
 * Lives for the lifetime of the server instance: the scheduled job pushes a
 * fresh dataset to /api/public/ingest, and the dashboard polls
 * /api/public/dataset to pick it up without a redeploy.
 */
type StoredDataset = {
  generated_at: string;
  ingested_at: string;
  record_count: number;
  records: LeaderboardRecord[];
};

let latest: StoredDataset | null = null;

export function setLatestDataset(dataset: Dataset): StoredDataset {
  latest = {
    generated_at: dataset.generated_at ?? new Date().toISOString(),
    ingested_at: new Date().toISOString(),
    record_count: dataset.records.length,
    records: dataset.records,
  };
  return latest;
}

export function getLatestDataset(): StoredDataset | null {
  return latest;
}

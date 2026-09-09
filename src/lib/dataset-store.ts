import type { Dataset, LeaderboardRecord } from "./schema";

/**
 * Durable store for the most recently ingested dataset.
 */
type StoredDataset = {
  generated_at: string;
  ingested_at: string;
  record_count: number;
  records: LeaderboardRecord[];
};

export async function setLatestDataset(dataset: Dataset): Promise<StoredDataset> {
  const latest: StoredDataset = {
    generated_at: dataset.generated_at ?? new Date().toISOString(),
    ingested_at: new Date().toISOString(),
    record_count: dataset.records.length,
    records: dataset.records,
  };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("leaderboard_datasets").upsert({
    id: "latest",
    ...latest,
  });
  if (error) throw new Error(`Could not store dataset: ${error.message}`);
  return latest;
}

export async function getLatestDataset(): Promise<StoredDataset | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("leaderboard_datasets")
    .select("generated_at, ingested_at, record_count, records")
    .eq("id", "latest")
    .maybeSingle();
  if (error) throw new Error(`Could not load dataset: ${error.message}`);
  if (!data) return null;
  return {
    generated_at: data.generated_at,
    ingested_at: data.ingested_at,
    record_count: data.record_count,
    records: data.records as unknown as LeaderboardRecord[],
  };
}

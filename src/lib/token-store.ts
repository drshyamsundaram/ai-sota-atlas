import type { TokenRecord } from "./token-schema";

export type StoredTokenDataset = {
  generated_at: string;
  ingested_at: string;
  record_count: number;
  records: TokenRecord[];
};

export async function setLatestTokenDataset(input: {
  generated_at: string;
  records: TokenRecord[];
}): Promise<StoredTokenDataset> {
  const latest: StoredTokenDataset = {
    generated_at: input.generated_at,
    ingested_at: new Date().toISOString(),
    record_count: input.records.length,
    records: input.records,
  };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("token_datasets")
    .upsert({ id: "latest", ...latest } as never);
  if (error) throw new Error(`Could not store token dataset: ${error.message}`);
  return latest;
}

export async function getLatestTokenDataset(): Promise<StoredTokenDataset | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("token_datasets")
    .select("generated_at, ingested_at, record_count, records")
    .eq("id", "latest")
    .maybeSingle();
  if (error) throw new Error(`Could not load token dataset: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as StoredTokenDataset;
  return {
    generated_at: row.generated_at,
    ingested_at: row.ingested_at,
    record_count: row.record_count,
    records: (row.records ?? []) as TokenRecord[],
  };
}

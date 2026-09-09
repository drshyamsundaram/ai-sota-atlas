CREATE TABLE public.leaderboard_datasets (
  id text PRIMARY KEY,
  generated_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  record_count integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  records jsonb NOT NULL DEFAULT '[]'::jsonb
);
GRANT SELECT ON public.leaderboard_datasets TO anon, authenticated;
GRANT ALL ON public.leaderboard_datasets TO service_role;
ALTER TABLE public.leaderboard_datasets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leaderboard datasets are publicly readable"
ON public.leaderboard_datasets
FOR SELECT
TO anon, authenticated
USING (true);
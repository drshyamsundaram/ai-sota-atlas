CREATE TABLE IF NOT EXISTS public.token_datasets (
  id text PRIMARY KEY,
  generated_at timestamptz NOT NULL DEFAULT now(),
  ingested_at timestamptz NOT NULL DEFAULT now(),
  record_count integer NOT NULL DEFAULT 0,
  records jsonb NOT NULL DEFAULT '[]'::jsonb
);
GRANT ALL ON public.token_datasets TO service_role;
ALTER TABLE public.token_datasets ENABLE ROW LEVEL SECURITY;
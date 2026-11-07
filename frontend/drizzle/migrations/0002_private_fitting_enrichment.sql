CREATE TABLE public.fitting_enrichment (session_hash text PRIMARY KEY REFERENCES public.fitting_sessions(session_hash) ON DELETE CASCADE, payload jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.fitting_enrichment TO service_role;
REVOKE ALL ON public.fitting_enrichment FROM anon, authenticated;
ALTER TABLE public.fitting_enrichment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service scoped enrichment" ON public.fitting_enrichment FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TABLE public.fitting_blueprints (
 session_hash text PRIMARY KEY REFERENCES public.fitting_sessions(session_hash) ON DELETE CASCADE,
 payload jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fitting_blueprints TO service_role;
REVOKE ALL ON public.fitting_blueprints FROM anon, authenticated;
ALTER TABLE public.fitting_blueprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages private blueprints" ON public.fitting_blueprints FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TABLE public.fitting_head_selections (
 session_hash text PRIMARY KEY REFERENCES public.fitting_sessions(session_hash) ON DELETE CASCADE,
 payload jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fitting_head_selections TO service_role;
REVOKE ALL ON public.fitting_head_selections FROM anon, authenticated;
ALTER TABLE public.fitting_head_selections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages private head selections" ON public.fitting_head_selections FOR ALL TO service_role USING (true) WITH CHECK (true);
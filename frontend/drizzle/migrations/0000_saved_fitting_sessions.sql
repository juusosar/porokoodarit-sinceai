CREATE TABLE public.fitting_sessions (
 session_hash text PRIMARY KEY,
 snapshot jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fitting_sessions TO service_role;
REVOKE ALL ON public.fitting_sessions FROM anon, authenticated;
ALTER TABLE public.fitting_sessions ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.fitting_sessions IS 'Private fitting snapshots; server access scoped by SHA-256 hash of a per-browser 256-bit capability token. No direct visitor Data API access.';
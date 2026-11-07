CREATE TABLE public.swing_submissions (session_hash text PRIMARY KEY REFERENCES public.fitting_sessions(session_hash) ON DELETE CASCADE, object_path text NOT NULL, filename text NOT NULL, mime_type text NOT NULL, size_bytes bigint NOT NULL, status text NOT NULL DEFAULT 'awaiting_upload', metadata jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.swing_submissions TO service_role;
REVOKE ALL ON public.swing_submissions FROM anon, authenticated;
ALTER TABLE public.swing_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only privileged swing access" ON public.swing_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Deny direct swing storage access" ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated USING (bucket_id <> 'swing-videos') WITH CHECK (bucket_id <> 'swing-videos');
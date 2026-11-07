import { useCallback, useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { prepareSwing, finishSwing, readSwing, deleteSwing } from '@/lib/swing.functions';
import { getFittingToken } from '@/lib/fitting-session';
import { inspectVideo } from '@/lib/video-metadata';
import { videoTimingSchema } from '@/lib/swing-schema';

type Timing = Awaited<ReturnType<typeof inspectVideo>>;
type Phase = 'selection' | 'preview' | 'uploading' | 'checking' | 'saved';
export function useSwingUpload(enabled: boolean) {
  const prepare = useServerFn(prepareSwing), finish = useServerFn(finishSwing), read = useServerFn(readSwing), remove = useServerFn(deleteSwing);
  const [phase, setPhase] = useState<Phase>('selection');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [name, setName] = useState('');
  const [size, setSize] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const localUrl = useRef<string | null>(null);
  const restore = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const saved = await read({ data: { token: getFittingToken() } });
      if (saved?.url) {
        setUrl(saved.url); setName(saved.filename); setSize(saved.size); setUploaded(true);
        const parsed = videoTimingSchema.safeParse(saved.metadata);
        setTiming(parsed.success ? parsed.data : null); setPhase('saved');
      } else if (saved?.status === 'awaiting_upload') setError('The previous upload did not finish. Please select your video again.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your video. Try again.'); }
    finally { setBusy(false); }
  }, [read]);
  useEffect(() => { if (enabled) void restore(); }, [enabled, restore]);
  useEffect(() => () => { xhrRef.current?.abort(); if (localUrl.current) URL.revokeObjectURL(localUrl.current); }, []);
  async function select(next: File) {
    setBusy(true); setError('');
    try {
      const details = await inspectVideo(next);
      if (localUrl.current) URL.revokeObjectURL(localUrl.current);
      localUrl.current = URL.createObjectURL(next);
      setFile(next); setUrl(localUrl.current); setTiming(details); setName(next.name); setSize(next.size); setUploaded(false); setPhase('preview');
    } catch { setError('This video could not be read. Choose an MP4, MOV or WebM under 50 MB and 10 minutes.'); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!file || !timing) return;
    setBusy(true); setError('');
    try {
      if (!uploaded) {
        setPhase('uploading'); setProgress(0);
        const signed = await prepare({ data: { token: getFittingToken(), video: { filename: file.name, mime: file.type as 'video/mp4' | 'video/quicktime' | 'video/webm', size: file.size } } });
        // Signed browser requests must use the browser-facing storage origin.
        const target = new URL(signed.signedUrl);
        const publicOrigin = new URL(import.meta.env['VITE_SUPABASE_URL']);
        target.protocol = publicOrigin.protocol; target.host = publicOrigin.host;
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest(); xhrRef.current = xhr;
          xhr.open('PUT', target.toString()); xhr.setRequestHeader('Content-Type', file.type);
          xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
          xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed. Your video is still here; try again.'));
          xhr.onerror = () => reject(new Error('Connection lost. Try again when you are online.'));
          xhr.onabort = () => reject(new Error('Upload stopped. Your profile is safe.'));
          xhr.send(file);
        });
        setUploaded(true);
      }
      setPhase('checking');
      await finish({ data: { token: getFittingToken(), timing } });
      setPhase('saved'); setProgress(100);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send your video. Try again.'); setPhase('preview'); }
    finally { setBusy(false); xhrRef.current = null; }
  }
  async function discard() {
    setBusy(true); setError('');
    try {
      await remove({ data: { token: getFittingToken() } });
      if (localUrl.current) { URL.revokeObjectURL(localUrl.current); localUrl.current = null; }
      setUrl(null); setFile(null); setTiming(null); setUploaded(false); setPhase('selection');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete your video. Try again.'); }
    finally { setBusy(false); }
  }
  return { phase, file, url, timing, name, size, progress, error, busy, select, submit, discard, restore, cancel: () => xhrRef.current?.abort(), failPlayback: () => setError('Your browser cannot play this video. Choose another video or export an MP4 original.') };
}
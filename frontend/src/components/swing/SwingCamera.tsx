import { useEffect, useRef, useState } from 'react';
import { Camera, Circle, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SwingCamera({ onVideo, onClose }: { onVideo: (file: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), recorder = useRef<MediaRecorder | null>(null);
  const [error, setError] = useState(''), [recording, setRecording] = useState(false), [fps, setFps] = useState<number | null>(null);
  useEffect(() => () => { if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); }, []);
  async function open() {
    try {
      if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined') throw new Error('This browser cannot record. Use your phone’s slow-motion camera and upload the original.');
      const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', frameRate: { ideal: 60 } }, audio: false });
      stream.current = next; setFps(next.getVideoTracks()[0]?.getSettings().frameRate ?? null);
      if (video.current) { video.current.srcObject = next; await video.current.play(); }
    } catch { setError('Camera unavailable or permission denied. Use your phone’s slow-motion camera, then upload the original.'); }
  }
  function start() {
    if (!stream.current) return;
    const mime = ['video/mp4', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    if (!mime) { setError('Recording format unsupported. Use your phone camera.'); return; }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream.current, { mimeType: mime }); recorder.current = rec;
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => { stream.current?.getTracks().forEach(t => t.stop()); onVideo(new File(chunks, `swing.${mime === 'video/mp4' ? 'mp4' : 'webm'}`, { type: mime })); };
    rec.start(); setRecording(true);
  }
  return <section className="space-y-4 rounded-lg border border-border bg-card p-4"><div className="flex items-center justify-between"><h2 className="font-display text-2xl uppercase italic">Frame your swing</h2><Button variant="ghost" size="icon" title="Close camera" aria-label="Close camera" onClick={onClose}><X /></Button></div><p className="text-sm text-muted-foreground">Best option: your phone’s slow-motion mode at 240 fps. Browser recording may not capture impact clearly.</p><div className="relative aspect-video bg-background"><video ref={video} muted playsInline className="h-full w-full object-contain" /><div className="pointer-events-none absolute inset-[12%] border border-primary"><div className="absolute inset-y-0 left-1/2 border-l border-primary/50" /><div className="absolute inset-x-0 bottom-[10%] border-t border-primary" /></div></div>{fps !== null && <p className="text-xs text-muted-foreground">Camera reports {Math.round(fps)} fps · capture timing still needs verification</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex flex-wrap gap-3"><Button onClick={() => void open()} disabled={fps !== null}><Camera />Enable camera</Button>{fps !== null && <Button onClick={() => recording ? recorder.current?.stop() : start()}><span>{recording ? <Square className="size-4" /> : <Circle className="size-4" />}</span>{recording ? 'Stop recording' : 'Start recording'}</Button>}</div></section>;
}
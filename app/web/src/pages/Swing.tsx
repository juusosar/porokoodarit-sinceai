import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { useFit } from "@/lib/fit-store";
import { analyzeVideo, MAX_SECONDS, type SwingAnalysis } from "@/lib/pose/analyze";
import { getPoseLandmarker } from "@/lib/pose/landmarker";
import { drawSkeleton } from "@/lib/pose/overlay";
import { cn } from "@/lib/utils";

// Opt-in club tracking (Modal GPU, POR-10) ships behind a flag; off until the service is deployed.
const CLUB_TRACKING = import.meta.env.VITE_CLUB_TRACKING === "true";
// Lab error model for video tempo: +-1 frame plus 12 ms.
const TEMPO_EXTRA_SD_S = 0.012;

type Phase = "idle" | "loading" | "analyzing" | "done" | "error";

export function Swing() {
  const { setMeasurement } = useFit();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SwingAnalysis | null>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getPoseLandmarker().catch(() => undefined); // warm up model while the user reads
    return () => {
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  // Runs inside the file-pick gesture: iOS Safari only loads an unplayed video after a user gesture.
  function onFile(file: File | undefined) {
    const video = videoRef.current;
    if (!file || !video) return;
    abortRef.current?.abort();
    setMeasurement("backswing_s", null);
    setMeasurement("downswing_s", null);
    setResult(null);
    setProgress(0);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(file);
    video.src = urlRef.current;
    video.load();
    video
      .play()
      .then(() => video.pause())
      .catch(() => undefined);
    setHasVideo(true);
    setPhase("loading");
  }

  async function onLoaded() {
    const video = videoRef.current;
    if (!video || phase !== "loading") return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase("analyzing");
    try {
      const r = await analyzeVideo(video, { onProgress: setProgress, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setResult(r);
      if (r.tempo) {
        const sd = r.tempo.frameUncertaintyS + TEMPO_EXTRA_SD_S;
        setMeasurement("backswing_s", { value: r.tempo.backswingS, sd, source: "measured", method: "video_pose" });
        setMeasurement("downswing_s", { value: r.tempo.downswingS, sd, source: "measured", method: "video_pose" });
        setPhase("done");
      } else {
        setPhase("error");
      }
      video.currentTime = r.window?.start ?? 0;
    } catch (e) {
      if (!ctrl.signal.aborted && (e as Error).name !== "AbortError") setPhase("error");
    }
  }

  // Keep the skeleton in sync with playback.
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !result) return;
    let raf = 0;
    const draw = () => {
      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }
      const i = Math.min(result.frames.length - 1, Math.round(video.currentTime * result.fps));
      drawSkeleton(canvas, result.frames[i]?.landmarks ?? null);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [result]);

  const busy = phase === "loading" || phase === "analyzing";
  const t = result?.tempo;
  return (
    <div className="space-y-5">
      <h1 className="text-4xl">Your swing</h1>
      <p className="text-sm text-muted-foreground">
        Film face-on, whole body in frame, phone at hip height. Up to {MAX_SECONDS} s.{" "}
        <span className="text-foreground">Your video stays on this phone.</span> Only timing numbers are sent.
      </p>

      <label
        aria-disabled={busy}
        className={cn(
          buttonVariants({ variant: phase === "done" ? "outline" : "default" }),
          "w-full",
          busy ? "pointer-events-none opacity-50" : "cursor-pointer",
        )}
      >
        {phase === "done" ? "Try another swing" : busy ? "Reading…" : "Film or pick your swing"}
        <input
          type="file"
          accept="video/*"
          capture="environment"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      <div className={cn("relative bg-black", !hasVideo && "hidden")}>
        <video
          ref={videoRef}
          muted
          playsInline
          controls={phase === "done"}
          preload="auto"
          onLoadedData={onLoaded}
          className="block w-full"
        />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      </div>

      {phase === "analyzing" && (
        <div role="status" className="space-y-1">
          <p className="text-sm">Reading your swing… {Math.round(progress * 100)}%</p>
          <div className="h-1 bg-muted">
            <div className="h-1 bg-primary" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

      {phase === "done" && t && (
        <dl className="grid grid-cols-3 border border-border bg-card p-3 text-center" data-testid="tempo">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Backswing</dt>
            <dd className="font-display text-2xl italic">{t.backswingS.toFixed(2)} s</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Downswing</dt>
            <dd className="font-display text-2xl italic">{t.downswingS.toFixed(2)} s</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Tempo</dt>
            <dd className="font-display text-2xl italic">{t.ratio ? `${t.ratio.toFixed(1)}:1` : "–"}</dd>
          </div>
        </dl>
      )}

      {phase === "error" && (
        <p role="alert" className="border border-destructive p-3 text-sm">
          Couldn't read that one{result?.error ? ` (${result.error})` : ""}. Try again with your whole body in frame, or
          skip: we'll use your answers.
        </p>
      )}

      {CLUB_TRACKING && phase === "done" && <p className="text-xs text-muted-foreground">Club tracking: coming soon.</p>}

      <div className="flex gap-3">
        <Link to="/launch-monitor" className={buttonVariants()}>
          {phase === "done" ? "Nice. Next" : "Next"}
        </Link>
        {phase !== "done" && (
          <Link to="/launch-monitor" className={buttonVariants({ variant: "ghost" })}>
            Skip
          </Link>
        )}
      </div>
    </div>
  );
}

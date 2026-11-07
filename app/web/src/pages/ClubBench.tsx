import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getClubDetector, hasShaderF16, type ClubDetector, type Detection } from "@/lib/club/detector";
import { runClubBenchmark } from "@/lib/club/benchmark";
import type { BenchSummary } from "@/lib/club/stats";

// Dev page (not linked from the flow): how long does on-device club tracking take on this phone?
// Full 640 px frames, every frame at the chosen rate, no crop. The video stays on the device.
const FPS_OPTIONS = [240, 120, 60, 30];

type Phase = "idle" | "loading-model" | "ready" | "running" | "done" | "error";

// Last run (partial ones too) survives a tab crash: shown on reload.
const SAVE_KEY = "takomo.clubBench.last";
type Report = Record<string, unknown>;
function save(r: Report) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(r));
  } catch {
    /* private mode / quota: live view still works */
  }
}
function loadSaved(): Report | null {
  try {
    const v = localStorage.getItem(SAVE_KEY);
    return v ? (JSON.parse(v) as Report) : null;
  } catch {
    return null;
  }
}

const fmt = (v: number, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : "–");

export function ClubBench() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [det, setDet] = useState<ClubDetector | null>(null);
  const [f16, setF16] = useState<boolean | null>(null);
  const [fps, setFps] = useState(30); // start small, then scale up
  const [maxSeconds, setMaxSeconds] = useState(1);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [summary, setSummary] = useState<BenchSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [stopped, setStopped] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [saved] = useState<Report | null>(loadSaved);
  const videoRef = useRef<HTMLVideoElement>(null);
  const workRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    hasShaderF16().then(setF16);
    setPhase("loading-model");
    getClubDetector()
      .then((d) => {
        setDet(d);
        setPhase("ready");
      })
      .catch((e) => {
        setError(`model failed to load: ${(e as Error).message}`);
        setPhase("error");
      });
    return () => {
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  // Inside the file-pick gesture: iOS Safari only loads an unplayed video after a user gesture.
  function onFile(file: File | undefined) {
    const video = videoRef.current;
    if (!file || !video) return;
    abortRef.current?.abort();
    setSummary(null);
    setReport(null);
    setStopped(null);
    setDuration(0);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(file);
    video.src = urlRef.current;
    video.load();
    video
      .play()
      .then(() => video.pause())
      .catch(() => undefined);
  }

  function drawView(box: Detection | null) {
    const video = videoRef.current;
    const view = viewRef.current;
    if (!video || !view) return;
    view.width = 320;
    view.height = Math.round((320 * video.videoHeight) / Math.max(video.videoWidth, 1));
    const ctx = view.getContext("2d")!;
    ctx.drawImage(video, 0, 0, view.width, view.height);
    if (box) {
      ctx.strokeStyle = "#FF6E01";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        (box.x - box.w / 2) * view.width,
        (box.y - box.h / 2) * view.height,
        box.w * view.width,
        box.h * view.height,
      );
    }
  }

  async function run() {
    const video = videoRef.current;
    const work = workRef.current;
    if (!det || !video || !work) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase("running");
    setSummary(null);
    setError(null);
    setStopped(null);
    setCopied(false);
    setReport(null);
    const base = {
      backend: det.backend,
      shaderF16: f16,
      modelLoadMs: Math.round(det.loadMs),
      sampleFps: fps,
      video: `${video.videoWidth}x${video.videoHeight}, ${video.duration.toFixed(2)} s`,
      userAgent: navigator.userAgent,
    };
    try {
      const r = await runClubBenchmark(det, video, work, {
        sampleFps: fps,
        maxSeconds,
        signal: ctrl.signal,
        onStats: (s) => {
          setSummary(s);
          save({ ...base, partial: "in progress (page may have crashed)", ...s });
        },
        onFrame: (i, n, box) => {
          setProgress([i + 1, n]);
          if (i % 4 === 0) drawView(box); // keep the preview cheap
        },
      });
      const final = { ...base, partial: r.stopped, ...r.summary };
      save(final);
      setSummary(r.summary);
      setStopped(r.stopped);
      setReport(final);
      setPhase("done");
    } catch (e) {
      save({ ...base, partial: `error: ${(e as Error).message}` });
      setError((e as Error).message);
      setPhase("error");
    }
  }

  const frames = Math.floor(Math.min(duration, maxSeconds) * fps);

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4">
      <h1 className="font-display text-3xl font-bold uppercase italic">Club tracking benchmark</h1>
      <p className="text-sm text-muted-foreground">
        Runs the club detector (YOLO11m, FP16) on every frame, full 640 px, on this device. Nothing is uploaded.
      </p>

      <dl className="grid grid-cols-2 gap-x-4 text-sm">
        <dt>Backend</dt>
        <dd>{det ? det.backend : phase === "loading-model" ? "loading model (~40 MB)…" : "–"}</dd>
        <dt>WebGPU shader-f16</dt>
        <dd>{f16 === null ? "–" : f16 ? "yes" : "no"}</dd>
        <dt>Model load</dt>
        <dd>{det ? `${fmt(det.loadMs)} ms` : "–"}</dd>
      </dl>
      {det?.error && (
        <p className="text-sm text-destructive">
          WebGPU failed, using CPU (about 2–3 s per frame, keep runs short): {det.error}
        </p>
      )}
      {saved && phase !== "running" && phase !== "done" && (
        <details className="text-sm">
          <summary>Last run: {String(saved.partial ?? "complete")}</summary>
          <pre className="whitespace-pre-wrap break-all">{JSON.stringify(saved, null, 2)}</pre>
        </details>
      )}

      <label className="block text-sm font-medium">
        Swing clip (slow-mo is fine)
        <input
          type="file"
          accept="video/*"
          className="mt-1 block w-full text-sm"
          onChange={(e) => onFile(e.target.files?.[0])}
          disabled={phase === "running"}
        />
      </label>

      <div className="flex gap-4 text-sm">
        <label>
          Frame rate{" "}
          <select value={fps} onChange={(e) => setFps(Number(e.target.value))} disabled={phase === "running"}>
            {FPS_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </select>
        </label>
        <label>
          Max seconds{" "}
          <input
            type="number"
            min={0.5}
            max={10}
            step={0.5}
            value={maxSeconds}
            onChange={(e) => setMaxSeconds(Number(e.target.value) || 1)}
            className="w-16"
            disabled={phase === "running"}
          />
        </label>
      </div>
      {duration > 0 && (
        <p className="text-sm">
          Clip {fmt(duration, 2)} s → {frames} frames
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={run} disabled={!det || !duration || phase === "running"}>
          Run
        </Button>
        {phase === "running" && (
          <Button variant="outline" onClick={() => abortRef.current?.abort()}>
            Stop
          </Button>
        )}
      </div>

      {phase === "running" && (
        <p className="text-sm">
          Frame {progress[0]} / {progress[1]}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <video
        ref={videoRef}
        className="pointer-events-none absolute h-px w-px opacity-0"
        playsInline
        muted
        preload="auto"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      <canvas ref={workRef} className="hidden" />
      <canvas ref={viewRef} className="w-full max-w-xs" />

      {summary && (
        <section className="space-y-2">
          {phase === "running" && <p className="text-sm">Live, updates every 10 frames</p>}
          {stopped && <p className="text-sm text-destructive">Partial run ({stopped}).</p>}
          <dl className="grid grid-cols-2 gap-x-4 text-sm">
            <dt>Frames</dt>
            <dd>{summary.frames}</dd>
            <dt className="font-bold">Total time</dt>
            <dd className="font-bold">{fmt(summary.wallS, 1)} s</dd>
            <dt>Per frame (all-in)</dt>
            <dd>{fmt(summary.msPerFrame)} ms</dd>
            <dt>Inference median / p90</dt>
            <dd>
              {fmt(summary.inferMedianMs)} / {fmt(summary.inferP90Ms)} ms
            </dd>
            <dt>First inference (warm-up)</dt>
            <dd>{fmt(summary.firstInferMs)} ms</dd>
            <dt>Inference first 20 → last 20</dt>
            <dd>
              {fmt(summary.inferFirst20Ms)} → {fmt(summary.inferLast20Ms)} ms
            </dd>
            <dt>Seek (decode) mean</dt>
            <dd>{fmt(summary.seekMeanMs)} ms</dd>
            <dt>Pre-process mean</dt>
            <dd>{fmt(summary.prepMeanMs)} ms</dd>
            <dt>Shaft detected</dt>
            <dd>{fmt(summary.detectedShare * 100)} %</dd>
          </dl>
          {report && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigator.clipboard
                  .writeText(JSON.stringify(report, null, 2))
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false))
              }
            >
              {copied ? "Copied" : "Copy results"}
            </Button>
          )}
        </section>
      )}
    </main>
  );
}

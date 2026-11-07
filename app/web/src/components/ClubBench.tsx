import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getClubDetector, hasShaderF16, type ClubDetector } from "@/lib/club/detector";
import { getPoseLandmarker } from "@/lib/pose/landmarker";
import { runSwingPipeline, type StageTiming, type SwingPipelineResult } from "@/lib/swing/pipeline";

// Dev page (not linked from the flow): main's swing processing (pose -> phases -> club track -> tempo, path) run
// on this device, with timings per stage. The video never leaves the device.

type Phase = "idle" | "loading" | "ready" | "running" | "done" | "error";
type Mode = "downswing" | "all" | "pose-only";

// Last run (partial ones too) survives a tab crash: shown on reload.
const SAVE_KEY = "takomo.clubBench.last";
type Report = Record<string, unknown>;
function save(r: Report) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(r));
  } catch {
    /* private mode / quota */
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

const fmt = (v: number | null | undefined, d = 0) => (v != null && Number.isFinite(v) ? v.toFixed(d) : "–");
const perFrame = (s: StageTiming) => (s.frames ? s.ms / s.frames : NaN);

function stageRow(name: string, s: StageTiming) {
  return (
    <>
      <dt className="font-medium">{name}</dt>
      <dd>
        {s.frames} frames, {fmt(s.ms / 1000, 1)} s ({fmt(perFrame(s))} ms/frame)
        <br />
        <span className="text-muted-foreground">
          decode {fmt(s.decodeMs / Math.max(s.frames, 1))} · pose {fmt(s.poseMs / Math.max(s.frames, 1))} · club{" "}
          {fmt(s.clubMs / Math.max(s.frames, 1))} ms/frame
        </span>
      </dd>
    </>
  );
}

export function ClubBench() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [det, setDet] = useState<ClubDetector | null>(null);
  const [f16, setF16] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("downswing");
  const [progress, setProgress] = useState<{ stage: 1 | 2; done: number; total: number } | null>(null);
  const [result, setResult] = useState<SwingPipelineResult | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved] = useState<Report | null>(loadSaved);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    hasShaderF16().then(setF16);
    setPhase("loading");
    Promise.all([getClubDetector(), getPoseLandmarker()])
      .then(([d]) => {
        setDet(d);
        setPhase("ready");
      })
      .catch((e) => {
        setError(`models failed to load: ${(e as Error).message}`);
        setPhase("error");
      });
    return () => abortRef.current?.abort();
  }, []);

  async function run() {
    if (!det || !file) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase("running");
    setResult(null);
    setReport(null);
    setError(null);
    setCopied(false);
    setProgress(null);
    const base = { backend: det.backend, shaderF16: f16, modelLoadMs: Math.round(det.loadMs), mode, userAgent: navigator.userAgent };
    save({ ...base, partial: "in progress (page may have crashed)" });
    let last = 0;
    try {
      const r = await runSwingPipeline(file, {
        detector: mode === "pose-only" ? null : det,
        landmarker: await getPoseLandmarker(),
        clubWindow: mode === "all" ? "all" : "downswing",
        signal: ctrl.signal,
        onProgress: (stage, done, total) => {
          const now = performance.now();
          if (now - last > 200 || done === total) {
            last = now; // throttle React updates: they cost more than a frame on a phone
            setProgress({ stage, done, total });
          }
        },
      });
      const rep: Report = {
        ...base,
        video: `${r.width}x${r.height}, ${r.durationS.toFixed(2)} s, ${fmt(r.clipFps)} fps`,
        totalS: +(r.timings.totalMs / 1000).toFixed(1),
        pass1: r.timings.pass1,
        pass2: r.timings.pass2,
        events: r.events,
        tempo: r.tempo,
        clubPathDeg: r.clubPathDeg,
        clubRawShare: +r.clubRawShare.toFixed(2),
        clubShare: +r.clubShare.toFixed(2),
      };
      save(rep);
      setResult(r);
      setReport(rep);
      setPhase("done");
    } catch (e) {
      const msg = (e as Error).name === "AbortError" ? "stopped by user" : (e as Error).message;
      save({ ...base, partial: `error: ${msg}` });
      setError(msg);
      setPhase("error");
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4">
      <h1 className="font-display text-3xl font-bold uppercase italic">Swing processing benchmark</h1>
      <p className="text-sm text-muted-foreground">
        Pose at 30 fps over the clip finds the swing phases, then pose + club detector run at the clip&apos;s own frame
        rate around the downswing. Same logic as the Python pipeline. Nothing is uploaded.
      </p>

      <dl className="grid grid-cols-2 gap-x-4 text-sm">
        <dt>Club model backend</dt>
        <dd>{det ? det.backend : phase === "loading" ? "loading models (~45 MB)…" : "–"}</dd>
        <dt>WebGPU shader-f16</dt>
        <dd>{f16 === null ? "–" : f16 ? "yes" : "no"}</dd>
      </dl>
      {det?.error && <p className="text-sm text-destructive">WebGPU failed, club model on CPU (slow): {det.error}</p>}
      {saved && phase !== "running" && phase !== "done" && (
        <details className="text-sm">
          <summary>Last run: {String(saved.partial ?? "complete")}</summary>
          <pre className="whitespace-pre-wrap break-all">{JSON.stringify(saved, null, 2)}</pre>
        </details>
      )}

      <label className="block text-sm font-medium">
        Swing clip (slow-mo is fine, max 10 s)
        <input
          type="file"
          accept="video/*"
          className="mt-1 block w-full text-sm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={phase === "running"}
        />
      </label>

      <label className="block text-sm">
        Club detector on{" "}
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} disabled={phase === "running"}>
          <option value="downswing">downswing only (fast)</option>
          <option value="all">every frame (worst case)</option>
          <option value="pose-only">off (pose + phases only)</option>
        </select>
      </label>

      <div className="flex gap-2">
        <Button onClick={run} disabled={!det || !file || phase === "running"}>
          Run
        </Button>
        {phase === "running" && (
          <Button variant="outline" onClick={() => abortRef.current?.abort()}>
            Stop
          </Button>
        )}
      </div>

      {phase === "running" && progress && (
        <p className="text-sm">
          {progress.stage === 1 ? "Pass 1 (pose, 30 fps)" : "Pass 2 (pose + club)"}: {progress.done} / ~{progress.total}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && report && (
        <section className="space-y-2">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="font-bold">Total time</dt>
            <dd className="font-bold">{fmt(result.timings.totalMs / 1000, 1)} s</dd>
            <dt>Video</dt>
            <dd>{String(report.video)}</dd>
            {stageRow("Pass 1", result.timings.pass1)}
            {stageRow("Pass 2", result.timings.pass2)}
            <dt>Tempo</dt>
            <dd>
              {result.tempo
                ? `${fmt(result.tempo.backswingS, 2)} s / ${fmt(result.tempo.downswingS, 2)} s = ${result.tempo.ratio}:1`
                : "–"}
            </dd>
            <dt>Club path</dt>
            <dd>{fmt(result.clubPathDeg, 1)}°</dd>
            <dt>Club found (raw / filled)</dt>
            <dd>
              {fmt(result.clubRawShare * 100)} % / {fmt(result.clubShare * 100)} %
            </dd>
            <dt>Top / impact</dt>
            <dd>
              {fmt(result.events.Top, 2)} s / {fmt(result.events.Impact, 2)} s
            </dd>
          </dl>
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
        </section>
      )}
    </main>
  );
}

"""Run main's swing algorithm (upstream/, verbatim copy) on keypoints from the device.

Adapters here fix the upstream assumptions that don't hold for the app, without editing upstream/ (so a sync
from main stays a plain copy, see app/vision/sync-main.sh):

- fps: upstream preprocessing guesses 240 fps for any file under 100 fps. The device sends the real rate
  (sample rate x slow-mo factor the golfer picked) and real-time timestamps, so 4x slow-mo and normal clips work.
- aspect ratio: upstream hand travel scales x by a fixed 9/16 (portrait). x is rescaled so the real frame
  aspect ratio is used (landscape clips no longer under-read lateral travel).
- missing phases: upstream speed code crashes without a downswing time; here speed is skipped instead.
- rules: upstream categorize_* / predict_fitting are not used. Only measurements leave this module; the engine
  owns flex, head and tempo decisions.
"""

from __future__ import annotations

import math
from functools import cache
from importlib import resources

import numpy as np
import pandas as pd

from ..schema import EvidenceSource, Observation
from .schema import SwingAnalysis, SwingAnalyzeRequest
from .upstream import swing_analytics as upstream_analytics
from .upstream.phase_detector import KinematicPhaseDetector

UPSTREAM_ASPECT = 0.5625  # 9/16, hard-coded in upstream get_top_bottom_d
WRIST_VIS_MIN = 0.2  # same as upstream video_preprocessing
DEFAULT_HEIGHT_M = 1.75  # used only when the golfer gave no height; widens the speed SD
DEFAULT_SHAFT_M = 0.90  # upstream default 7-iron shaft; the DTL shaft-length read is not wired up yet
TEMPO_EXTRA_SD_S = 0.012  # lab error model: +-1 frame + 12 ms (same as the on-device tempo)
# Not validated against TrackMan yet (upstream commit "speed detection working?"): wide on purpose, so the
# engine treats it as a hint next to answers / carry / launch monitor. Calibrate from evaluate_against_test_set.
VIDEO_SPEED_SD_MPH = 12.0
HEIGHT_UNKNOWN_SPEED_SHARE = 0.05  # ~ +-9 cm height uncertainty -> ~5 % speed
# Same limits as Measurements (outside them the engine would reject the value).
BACKSWING_S = (0.3, 3.0)
DOWNSWING_S = (0.1, 1.0)
SPEED_MPH = (35.0, 125.0)
# Speed = hand travel / downswing time; at 30-60 fps one frame is 10-15 % of a downswing (upstream is built for
# 240 fps). Below this real sample rate only tempo is returned.
SPEED_MIN_FPS = 100.0


@cache
def upstream_version() -> str:
    try:
        sha = resources.files(__package__).joinpath("upstream/UPSTREAM").read_text().split()[0]
        return f"main@{sha[:7]}"
    except (FileNotFoundError, IndexError, OSError):
        return "main@unknown"


def _col(values: list[float | None]) -> np.ndarray:
    return np.array([np.nan if v is None else v for v in values], dtype=float)


def _frames(req: SwingAnalyzeRequest) -> pd.DataFrame:
    p = req.pose
    df = pd.DataFrame({"frame_idx": np.arange(len(p.t_ms)), "timestamp_ms": np.asarray(p.t_ms, dtype=float)})
    for k, tr in p.landmarks.items():
        df[f"landmark_{k}_x"] = _col(tr.x)
        df[f"landmark_{k}_y"] = _col(tr.y)
        df[f"landmark_{k}_vis"] = _col(tr.v)
    return df


def _wrists(df: pd.DataFrame) -> pd.DataFrame:
    """The phase detector's input, as upstream preprocessing builds it: wrists with visibility > 0.2."""
    out = df[["frame_idx", "timestamp_ms"]].copy()
    for side, k in (("lw", 15), ("rw", 16)):
        ok = df[f"landmark_{k}_vis"].fillna(0) > WRIST_VIS_MIN
        out[f"{side}_x"] = df[f"landmark_{k}_x"].where(ok)
        out[f"{side}_y"] = df[f"landmark_{k}_y"].where(ok)
    return out


def _obs(value: float, sd: float, source: EvidenceSource, method: str) -> Observation:
    return Observation(value=round(value, 3), sd=round(sd, 3), source=source, method=method)


def analyze(req: SwingAnalyzeRequest) -> SwingAnalysis:
    fps = req.pose.fps
    df = _frames(req)
    wrists = _wrists(df)
    if wrists[["lw_y", "rw_y"]].notna().any(axis=1).mean() < 0.6:
        return SwingAnalysis(algorithm=upstream_version(), notes=["body_not_visible"])
    try:
        ph = KinematicPhaseDetector().detect_phases_from_dataframe(wrists, fps=fps)
    except Exception:  # upstream raises ValueError / IndexError on clips it can't read
        return SwingAnalysis(algorithm=upstream_version(), notes=["phases_not_found"])

    events_ms = {k: float(v) for k, v in ph["event_timestamps_ms"].items()}
    back, down = ph.get("backswing_s"), ph.get("downswing_s")
    res = SwingAnalysis(algorithm=upstream_version(), events_ms=events_ms)
    notes = res.notes
    if back is None or down is None:
        notes.append("phases_out_of_order")
        return res
    if not (BACKSWING_S[0] <= back <= BACKSWING_S[1] and DOWNSWING_S[0] <= down <= DOWNSWING_S[1]):
        notes.append("timing_implausible")
        return res
    sd_t = 1.0 / fps + TEMPO_EXTRA_SD_S
    res.backswing_s = _obs(back, sd_t, EvidenceSource.measured, "video_pose_server")
    res.downswing_s = _obs(down, sd_t, EvidenceSource.measured, "video_pose_server")

    # Club speed: upstream double-pendulum model on the face-on clip.
    if fps < SPEED_MIN_FPS:
        notes.append("speed_needs_slow_motion")
        return res
    sw = df.copy()
    sw["swing_phase"] = [ph["frame_to_phase"].get(i, "Address") for i in range(len(sw))]
    frame_to_event = {f: e for e, f in ph["event_frames"].items()}
    sw["swing_event"] = [frame_to_event.get(i, "") for i in range(len(sw))]
    sw["downswing_s"] = [down] + [np.nan] * (len(sw) - 1)
    aspect = req.pose.width / req.pose.height
    for k in ("15", "16"):  # upstream multiplies dx by 9/16: rescale so the product uses the real aspect ratio
        sw[f"landmark_{k}_x"] = sw[f"landmark_{k}_x"] * (aspect / UPSTREAM_ASPECT)
    height_m = req.height_cm / 100 if req.height_cm else DEFAULT_HEIGHT_M
    if not req.height_cm:
        notes.append("height_default")
    try:
        speed = float(upstream_analytics.calculate_club_speed(sw, user_h=height_m, shaft_m=DEFAULT_SHAFT_M))
    except Exception:
        speed = math.nan
    if not math.isfinite(speed) or not (SPEED_MPH[0] <= speed <= SPEED_MPH[1]):
        notes.append("speed_implausible")
        return res
    sd = VIDEO_SPEED_SD_MPH if req.height_cm else math.hypot(VIDEO_SPEED_SD_MPH, HEIGHT_UNKNOWN_SPEED_SHARE * speed)
    # "estimated": a model reading (hand travel -> club speed), not a direct measurement like a launch monitor.
    res.video_speed_7i_mph = _obs(speed, sd, EvidenceSource.estimated, "video_pendulum")
    return res

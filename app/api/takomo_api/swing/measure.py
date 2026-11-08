"""Run the team's swing algorithm (upstream/, Katariina's research code) on keypoints from the device.

Adapters here fix the upstream assumptions that don't hold for the app, so upstream/ stays the research code
as written (see app/vision/research/README.md):

- fps: upstream preprocessing guesses 240 fps for any file under 100 fps. The device sends the real rate
  (sample rate x slow-mo factor the golfer picked) and real-time timestamps, so 4x slow-mo and normal clips work.
- aspect ratio: upstream hand travel scales x by a fixed 9/16 (portrait). x is rescaled so the real frame
  aspect ratio is used (landscape clips no longer under-read lateral travel).
- missing phases: upstream speed code crashes without a downswing time; here speed is skipped instead.
- down-the-line: upstream measures shaft px in its desktop preprocessing (cv2 + YOLO). Here the device sends the
  club-head box per frame and the same rule runs on the API, then upstream calculate_shaft_length_m.
- gaps: wrists for the speed read are visibility-masked and gap-filled, so one dropped frame at Top/Impact
  doesn't lose the speed (upstream reads the raw frame).
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
from .schema import DtlClip, DtlDetails, PoseSeries, SwingAnalysis, SwingAnalyzeRequest, SwingDetails
from .upstream import swing_analytics as upstream_analytics
from .upstream.phase_detector import KinematicPhaseDetector

UPSTREAM_ASPECT = 0.5625  # 9/16, hard-coded in upstream get_top_bottom_d
WRIST_VIS_MIN = 0.2  # same as upstream video_preprocessing
DEFAULT_HEIGHT_M = 1.75  # used only when the golfer gave no height; widens the speed SD
DEFAULT_SHAFT_M = 0.90  # upstream default 7-iron shaft, used without a down-the-line clip
# Down-the-line shaft read, same limits as upstream video_preprocessing (static frames before address, max 40)
STATIC_FRAMES_MAX = 40
SHAFT_PX_SHARE = (0.05, 0.6)  # wrist -> club head distance, share of frame height
SHOULDER_VIS_MIN = 0.25
SHOULDER_PX_SHARE = (0.05, 0.60)  # shoulder width, share of frame width
SHAFT_M = (0.6, 1.2)  # outside -> misread (a 7-iron is ~0.94 m long, hands sit below the grip end)
SHAFT_SD_M = 0.08
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


def _frames(p: PoseSeries) -> pd.DataFrame:
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


def _shaft_length(dtl: DtlClip, height_m: float, notes: list[str]) -> tuple[float | None, DtlDetails]:
    """main's DTL read: median wrist -> club-head distance over the still frames before address, scaled by the
    widest shoulder distance (upstream calculate_shaft_length_m: shoulders ~0.16 x height)."""
    p = dtl.pose
    W, H = p.width, p.height
    df = _frames(p)
    address_ms = None
    try:
        ph = KinematicPhaseDetector().detect_phases_from_dataframe(_wrists(df), fps=p.fps)
        addr = int(ph["event_frames"]["Address"])
        address_ms = float(ph["event_timestamps_ms"]["Address"])
    except Exception:
        addr = 0
    if addr < 5:  # no clear takeaway found (Address 0): use upstream's default address frame
        addr = 30
    cutoff = min(addr, STATIC_FRAMES_MAX, len(p.t_ms))
    info = DtlDetails(samples=len(p.t_ms), address_ms=address_ms, still_samples=cutoff, head_found=0)
    hx, hy = _col(dtl.club_head.x), _col(dtl.club_head.y)
    wx = (df["landmark_15_x"] + df["landmark_16_x"]).to_numpy() / 2
    wy = (df["landmark_15_y"] + df["landmark_16_y"]).to_numpy() / 2
    d = np.hypot((hx - wx) * W, (hy - wy) * H)[:cutoff]
    info.head_found = int(np.isfinite(d).sum())
    d = d[np.isfinite(d) & (d > SHAFT_PX_SHARE[0] * H) & (d < SHAFT_PX_SHARE[1] * H)]
    if not len(d):
        notes.append("dtl_no_club_head")
        return None, info
    info.shaft_px = round(float(np.median(d)), 1)
    ok = (df["landmark_11_vis"].fillna(0) > SHOULDER_VIS_MIN) & (df["landmark_12_vis"].fillna(0) > SHOULDER_VIS_MIN)
    sh = np.hypot((df["landmark_12_x"] - df["landmark_11_x"]) * W, (df["landmark_12_y"] - df["landmark_11_y"]) * H)
    sh = sh[ok & (sh > SHOULDER_PX_SHARE[0] * W) & (sh < SHOULDER_PX_SHARE[1] * W)]
    if sh.empty:
        notes.append("dtl_no_shoulders")
        return None, info
    info.shoulder_px = round(float(sh.max()), 1)
    px = pd.DataFrame({"shaft_len_px": [float(np.median(d))], "shoulder_width_px": [float(sh.max())]})
    try:
        m = float(upstream_analytics.calculate_shaft_length_m(user_h=height_m, df=px))
    except Exception:
        m = math.nan
    if not math.isfinite(m) or not (SHAFT_M[0] <= m <= SHAFT_M[1]):
        notes.append("dtl_shaft_implausible")
        return None, info
    return m, info


def _obs(value: float, sd: float, source: EvidenceSource, method: str) -> Observation:
    return Observation(value=round(value, 3), sd=round(sd, 3), source=source, method=method)


def analyze(req: SwingAnalyzeRequest) -> SwingAnalysis:
    fps = req.pose.fps
    df = _frames(req.pose)
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

    height_m = req.height_cm / 100 if req.height_cm else DEFAULT_HEIGHT_M
    if not req.height_cm:
        notes.append("height_default")
    shaft_m = DEFAULT_SHAFT_M
    t = req.pose.t_ms
    det = SwingDetails(
        samples=len(t),
        fps=fps,
        duration_s=round((t[-1] - t[0]) / 1000, 3),
        tempo_ratio=ph.get("tempo_ratio"),
        height_m=height_m,
        height_from="profile" if req.height_cm else "default",
        shaft_m=shaft_m,
        shaft_from="default",
    )
    res.details = det
    if req.dtl is not None:
        measured, det.dtl = _shaft_length(req.dtl, height_m, notes)
        if measured is not None:
            det.shaft_m, det.shaft_from = round(measured, 3), "down_the_line"
            shaft_m = measured
            res.shaft_length_m = _obs(measured, SHAFT_SD_M, EvidenceSource.measured, "video_dtl_shaft")

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
    for k in ("15", "16"):
        # Upstream reads raw wrists at the Top and Impact frames: a dropped or occluded frame there would give NaN or
        # a wrong hand travel. Mask low visibility and fill gaps like the phase detector does for its own input.
        ok = sw[f"landmark_{k}_vis"].fillna(0) > WRIST_VIS_MIN
        for a in ("x", "y"):
            sw[f"landmark_{k}_{a}"] = sw[f"landmark_{k}_{a}"].where(ok).interpolate(limit_direction="both")
        # upstream multiplies dx by 9/16: rescale so the product uses the real aspect ratio
        sw[f"landmark_{k}_x"] = sw[f"landmark_{k}_x"] * (aspect / UPSTREAM_ASPECT)
    try:
        speed = float(upstream_analytics.calculate_club_speed(sw, user_h=height_m, shaft_m=shaft_m))
        travel = float(upstream_analytics.get_top_bottom_d(sw, user_h=height_m))  # same number the speed model uses
        if math.isfinite(travel):
            det.hand_travel_m, det.hand_speed_mps = round(travel, 3), round(travel / down, 2)
    except Exception:
        speed = math.nan
    if not math.isfinite(speed) or not (SPEED_MPH[0] <= speed <= SPEED_MPH[1]):
        notes.append("speed_implausible")
        return res
    sd = VIDEO_SPEED_SD_MPH if req.height_cm else math.hypot(VIDEO_SPEED_SD_MPH, HEIGHT_UNKNOWN_SPEED_SHARE * speed)
    # "estimated": a model reading (hand travel -> club speed), not a direct measurement like a launch monitor.
    res.video_speed_7i_mph = _obs(speed, sd, EvidenceSource.estimated, "video_pendulum")
    return res

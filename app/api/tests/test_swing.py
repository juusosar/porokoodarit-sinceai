"""Swing analysis on the API: main's algorithm (swing/upstream) on device keypoints -> measurements only."""

import math
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from takomo_api.engine import fit as engine
from takomo_api.main import create_app
from takomo_api.schema import FitRequest
from takomo_api.swing import measure
from takomo_api.swing.schema import SwingAnalyzeRequest
from takomo_api.swing.upstream.phase_detector import KinematicPhaseDetector

# Synthetic face-on swing (real time, s): still until 1.0, top 1.9, impact 2.15, finish 2.8, still after.
ADDR, TOP, IMPACT, FINISH, END = 1.0, 1.9, 2.15, 2.8, 4.0


def _hands(t: float) -> tuple[float, float]:
    """Mean wrist (x, y), MediaPipe space (y down)."""
    if t < ADDR:
        return 0.50, 0.62
    if t < TOP:  # rise + move away from the target
        s = math.sin((t - ADDR) / (TOP - ADDR) * math.pi / 2) ** 2
        return 0.50 + 0.12 * s, 0.62 - 0.37 * s
    if t < IMPACT:  # accelerating plunge back to the ball
        s = ((t - TOP) / (IMPACT - TOP)) ** 2
        return 0.62 - 0.12 * s, 0.25 + 0.37 * s
    if t < FINISH:
        s = math.sin((t - IMPACT) / (FINISH - IMPACT) * math.pi / 2)
        return 0.50 - 0.14 * s, 0.62 - 0.40 * s
    return 0.36, 0.22


def payload(fps: float = 240.0, width: int = 1080, height: int = 1920, height_cm: float | None = 180, **kw) -> dict:
    n = int(END * fps)
    t = [i / fps for i in range(n)]
    hands = [_hands(x) for x in t]
    const = lambda v: [v] * n  # noqa: E731
    lm = {
        "15": {"x": [h[0] - 0.01 for h in hands], "y": [h[1] for h in hands], "v": const(0.9)},
        "16": {"x": [h[0] + 0.01 for h in hands], "y": [h[1] for h in hands], "v": const(0.9)},
        "11": {"x": const(0.42), "y": const(0.30), "v": const(0.9)},
        "12": {"x": const(0.58), "y": const(0.30), "v": const(0.9)},
        **{k: {"x": const(0.5), "y": const(0.16), "v": const(0.9)} for k in ("0", "1", "2")},
        **{k: {"x": const(0.5), "y": const(0.90), "v": const(0.9)} for k in ("27", "28")},
    }
    body = {"pose": {"fps": fps, "t_ms": [x * 1000 for x in t], "width": width, "height": height, "landmarks": lm}}
    if height_cm is not None:
        body["height_cm"] = height_cm
    return body | kw


def run(**kw):
    return measure.analyze(SwingAnalyzeRequest.model_validate(payload(**kw)))


def test_tempo_and_events_from_upstream_detector():
    r = run()
    assert r.algorithm.startswith("main@") and r.algorithm != "main@unknown"
    assert r.backswing_s is not None and r.downswing_s is not None
    assert r.backswing_s.value == pytest.approx(TOP - ADDR, abs=0.15)  # takeaway onset: hands ease out
    assert r.downswing_s.value == pytest.approx(IMPACT - TOP, abs=0.03)
    assert r.backswing_s.method == "video_pose_server" and r.backswing_s.source == "measured"
    assert r.backswing_s.sd == pytest.approx(1 / 240 + 0.012, abs=1e-3)
    order = ["Address", "Top", "Impact", "Finish"]
    assert [r.events_ms[e] for e in order] == sorted(r.events_ms[e] for e in order)


def test_real_fps_not_a_240_guess():
    """Same swing sampled at 30 real fps (normal clip) or sent as 4x slow-mo: timing stays in real seconds."""
    r30 = run(fps=30.0)
    assert r30.downswing_s is not None
    assert r30.downswing_s.value == pytest.approx(IMPACT - TOP, abs=0.1)
    assert r30.backswing_s.sd > run().backswing_s.sd  # coarser sampling -> wider SD
    # one 30 fps frame is ~15 % of a downswing: no speed from it
    assert r30.video_speed_7i_mph is None and "speed_needs_slow_motion" in r30.notes
    r120 = run(fps=120.0)  # 4x slow-mo
    assert r120.video_speed_7i_mph is not None
    assert r120.video_speed_7i_mph.value == pytest.approx(run().video_speed_7i_mph.value, rel=0.15)


def test_speed_is_an_estimate_with_wide_sd():
    r = run()
    s = r.video_speed_7i_mph
    assert s is not None and s.source == "estimated" and s.method == "video_pendulum"
    assert measure.SPEED_MPH[0] <= s.value <= measure.SPEED_MPH[1]
    assert s.sd == measure.VIDEO_SPEED_SD_MPH
    no_h = run(height_cm=None)
    assert "height_default" in no_h.notes and no_h.video_speed_7i_mph.sd > s.sd


def test_aspect_ratio_used_for_lateral_hand_travel():
    """Upstream hard-codes 9/16: the same normalised motion in a landscape frame is wider, so faster."""
    portrait = run(width=1080, height=1920).video_speed_7i_mph.value
    landscape = run(width=1920, height=1080).video_speed_7i_mph.value
    assert landscape > portrait


def test_unreadable_clips_give_notes_not_errors():
    body = payload()
    n = len(body["pose"]["t_ms"])
    for k in ("15", "16"):
        body["pose"]["landmarks"][k]["v"] = [0.05] * n
    r = measure.analyze(SwingAnalyzeRequest.model_validate(body))
    assert r.backswing_s is None and r.notes == ["body_not_visible"]

    still = payload()
    for k in ("15", "16"):
        tr = still["pose"]["landmarks"][k]
        tr["x"], tr["y"] = [0.5] * n, [0.6] * n
    r = measure.analyze(SwingAnalyzeRequest.model_validate(still))
    assert r.backswing_s is None and r.video_speed_7i_mph is None and r.notes


def test_request_validation():
    body = payload()
    body["pose"]["landmarks"]["15"]["x"].pop()
    with pytest.raises(ValueError):
        SwingAnalyzeRequest.model_validate(body)
    body = payload()
    del body["pose"]["landmarks"]["16"]
    with pytest.raises(ValueError):
        SwingAnalyzeRequest.model_validate(body)
    body = payload()
    body["pose"]["landmarks"]["99"] = body["pose"]["landmarks"]["0"]
    with pytest.raises(ValueError):
        SwingAnalyzeRequest.model_validate(body)


def test_endpoint_round_trip_and_body_cap():
    c = TestClient(create_app())
    body = payload(fps=60.0)
    r = c.post("/v1/swing/analyze", json=body)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["backswing_s"]["value"] > 0 and out["algorithm"].startswith("main@")
    # a 10 s 240 fps clip, rounded to 4 decimals like the device sends it, fits under the swing cap
    long = payload(fps=240.0)
    long["pose"]["t_ms"] = [i * 1000 / 240 for i in range(2400)]
    for tr in long["pose"]["landmarks"].values():
        for key in ("x", "y", "v"):
            tr[key] = [round(v, 4) for v in (tr[key] * 3)[:2400]]
    assert c.post("/v1/swing/analyze", json=long).status_code == 200
    junk = b"x" * 700_000
    assert c.post("/v1/swing/analyze", content=junk, headers={"content-type": "application/json"}).status_code == 413
    assert c.post("/v1/fit", content=b"x" * 70_000, headers={"content-type": "application/json"}).status_code == 413


VIDEO_FAST = {"value": 95, "sd": 12, "source": "estimated", "method": "video_pendulum"}
LAUNCH_MONITOR = {"value": 70, "sd": 1.5, "source": "measured", "method": "launch_monitor"}


def _fit(meas: dict):
    return engine.run(FitRequest.model_validate({"step": "swing", "measurements": meas}))


def _codes(state) -> set[str]:
    return {r.code for p in state.parts.values() for r in p.reasons}


def test_engine_owns_video_speed():
    base, fast = _fit({}), _fit({"video_speed_7i_mph": VIDEO_FAST})
    assert fast.estimates["speed_7i_mph"].low > base.estimates["speed_7i_mph"].low
    assert "SPEED_FROM_VIDEO" in _codes(fast) and "SPEED_MEASURED" not in _codes(fast)
    both = _fit({"speed_7i_mph": LAUNCH_MONITOR, "video_speed_7i_mph": VIDEO_FAST})
    est = both.estimates["speed_7i_mph"]
    assert (est.low + est.high) / 2 == pytest.approx(70, abs=2)  # launch monitor dominates
    assert "SPEED_MEASURED" in _codes(both)
    # the launch monitor is still offered as the next step when only video speed is known
    assert any(s.input == "launch_monitor" for s in fast.next_steps)


def test_measure_never_applies_fitting_rules():
    """Fixes live in measure.py; upstream categorize_* / predict_fitting (main's own rules) are never called."""
    code = open(measure.__file__).read().split('"""', 2)[2]
    assert "categorize_" not in code and "predict_fitting" not in code


FIXTURE = Path(__file__).parent / "fixtures" / "main_pose_30fps.csv"  # 3 real swings, main's CSV (30 fps)


def _fixture_requests():
    d = pd.read_csv(FIXTURE)
    for name, g in d.groupby("video_name"):
        col = lambda c, g=g: [None if pd.isna(v) else float(v) for v in g[c]]  # noqa: E731
        lm = {k: {"x": col(f"landmark_{k}_x"), "y": col(f"landmark_{k}_y"), "v": col(f"landmark_{k}_vis")} for k in IDS}
        t = (g.timestamp_ms - g.timestamp_ms.iloc[0]).tolist()
        pose = {"fps": 30.0, "t_ms": t, "width": 1080, "height": 1920, "landmarks": lm}
        yield name, g, SwingAnalyzeRequest.model_validate({"pose": pose, "height_cm": 180})


IDS = ("0", "1", "2", "11", "12", "15", "16", "27", "28")


@pytest.mark.parametrize("name", ["swing1.mp4", "swing2.mp4", "swing3.mp4"])
def test_real_clips_match_upstream_called_directly(name):
    """Parity: the adapter feeds main's detector exactly what main's preprocessing would (wrists, vis > 0.2)."""
    _, g, req = next(x for x in _fixture_requests() if x[0] == name)
    wr = pd.DataFrame(
        {"frame_idx": g.frame_idx.values, "timestamp_ms": (g.timestamp_ms - g.timestamp_ms.iloc[0]).values}
    )
    for side, k in (("lw", 15), ("rw", 16)):
        ok = g[f"landmark_{k}_vis"].fillna(0).values > 0.2
        wr[f"{side}_x"] = np.where(ok, g[f"landmark_{k}_x"].values, np.nan)
        wr[f"{side}_y"] = np.where(ok, g[f"landmark_{k}_y"].values, np.nan)
    direct = KinematicPhaseDetector().detect_phases_from_dataframe(wr, fps=30.0)
    r = measure.analyze(req)
    assert r.backswing_s.value == direct["backswing_s"] and r.downswing_s.value == direct["downswing_s"]
    assert r.events_ms == {k: float(v) for k, v in direct["event_timestamps_ms"].items()}
    assert 0.5 < r.backswing_s.value < 1.2 and 0.2 < r.downswing_s.value < 0.4


def test_dropped_frame_at_top_keeps_speed():
    body = payload()
    full = run().video_speed_7i_mph.value
    top = int(TOP * 240)
    for k in ("15", "16"):
        tr = body["pose"]["landmarks"][k]
        for i in range(top - 2, top + 3):
            tr["x"][i] = tr["y"][i] = tr["v"][i] = None
    r = measure.analyze(SwingAnalyzeRequest.model_validate(body))
    assert r.video_speed_7i_mph is not None
    assert r.video_speed_7i_mph.value == pytest.approx(full, rel=0.05)


def dtl_clip(fps: float = 240.0, head: bool = True) -> dict:
    """Down-the-line clip of the same swing: club head seen at address only, shoulders open up mid-swing."""
    clip = payload(fps=fps)["pose"]
    n = len(clip["t_ms"])
    sh_l, sh_r = clip["landmarks"]["11"], clip["landmarks"]["12"]
    sh_l["x"], sh_r["x"] = [0.47] * n, [0.53] * n
    turn = int(1.6 * fps)
    sh_l["x"][turn], sh_r["x"][turn] = 0.4075, 0.5925  # widest: 200 px at 1080 wide
    wx = (clip["landmarks"]["15"]["x"][0] + clip["landmarks"]["16"]["x"][0]) / 2  # 0.50
    wy = clip["landmarks"]["15"]["y"][0]  # 0.62
    still = int(0.15 * fps)
    # head 590 px from the hands (dx 130 px, dy 576 px in 1080 x 1920) -> 590 * 0.16 * 1.8 / 200 = 0.85 m
    hx = [wx + 130 / 1080 if head and i < still else None for i in range(n)]
    hy = [wy + 576 / 1920 if head and i < still else None for i in range(n)]
    return {"pose": clip, "club_head": {"x": hx, "y": hy}}


def test_dtl_clip_measures_shaft_and_feeds_speed():
    without = run()
    body = payload() | {"dtl": dtl_clip()}
    r = measure.analyze(SwingAnalyzeRequest.model_validate(body))
    assert r.shaft_length_m is not None and r.shaft_length_m.method == "video_dtl_shaft"
    assert r.shaft_length_m.value == pytest.approx(0.85, abs=0.02)
    # shorter shaft than the 0.90 m default -> a little less club-head speed for the same hands
    assert r.video_speed_7i_mph.value < without.video_speed_7i_mph.value
    assert r.backswing_s.value == without.backswing_s.value  # tempo stays from the face-on clip


def test_dtl_without_club_head_keeps_default_shaft():
    body = payload() | {"dtl": dtl_clip(head=False)}
    r = measure.analyze(SwingAnalyzeRequest.model_validate(body))
    assert r.shaft_length_m is None and "dtl_no_club_head" in r.notes
    assert r.video_speed_7i_mph.value == run().video_speed_7i_mph.value


def test_dtl_validation():
    bad = dtl_clip()
    bad["club_head"]["x"].pop()
    with pytest.raises(ValueError):
        SwingAnalyzeRequest.model_validate(payload() | {"dtl": bad})


def test_details_show_every_number_of_the_read():
    d = run().details
    assert d.samples == 960 and d.fps == 240 and d.duration_s == pytest.approx(4.0, abs=0.01)
    assert d.height_from == "profile" and d.height_m == pytest.approx(1.8)
    assert d.shaft_from == "default" and d.shaft_m == measure.DEFAULT_SHAFT_M
    assert d.hand_travel_m > 0 and d.hand_speed_mps > 0
    assert d.tempo_ratio == pytest.approx(run().backswing_s.value / run().downswing_s.value, rel=0.02)
    assert run(height_cm=None).details.height_from == "default"
    dd = measure.analyze(SwingAnalyzeRequest.model_validate(payload() | {"dtl": dtl_clip()})).details
    assert dd.shaft_from == "down_the_line" and dd.dtl.shaft_px > dd.dtl.shoulder_px > 0
    assert 0 < dd.dtl.head_found <= dd.dtl.still_samples

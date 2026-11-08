"""Contract for POST /v1/swing/analyze: pose keypoints in, measurements out.

The video never leaves the device. The browser runs MediaPipe pose and sends only the few landmarks the
upstream algorithm reads (head, shoulders, wrists, ankles), normalised to the frame (0..1, MediaPipe space).
The response holds measurements only (Observations with an SD); the fitting engine decides what they mean.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from ..schema import Observation, _Model

# MediaPipe pose landmark ids the upstream code reads: 0-2 nose/eyes (body height), 11/12 shoulders,
# 15/16 wrists (phases, hand travel), 27/28 ankles (body height).
LANDMARK_IDS = ("0", "1", "2", "11", "12", "15", "16", "27", "28")
MAX_FRAMES = 2400  # 10 s at 240 fps real time


class LandmarkTrack(_Model):
    """One landmark over time. null = not detected in that frame."""

    x: list[float | None]
    y: list[float | None]
    v: list[float | None] = Field(description="MediaPipe visibility 0..1")


class PoseSeries(_Model):
    fps: float = Field(gt=0, le=1000, description="Samples per second of REAL swing time (sample rate x slow-mo)")
    t_ms: list[float] = Field(min_length=10, max_length=MAX_FRAMES, description="Real swing time per sample, ms")
    width: int = Field(gt=0, le=10_000, description="Video frame width in px (aspect ratio for hand travel)")
    height: int = Field(gt=0, le=10_000)
    landmarks: dict[Literal[LANDMARK_IDS], LandmarkTrack]  # type: ignore[valid-type]

    @model_validator(mode="after")
    def _same_length(self) -> PoseSeries:
        n = len(self.t_ms)
        for k, tr in self.landmarks.items():
            if not (len(tr.x) == len(tr.y) == len(tr.v) == n):
                raise ValueError(f"landmark {k}: x/y/v must have {n} values like t_ms")
        for k in ("15", "16"):
            if k not in self.landmarks:
                raise ValueError("wrists (15, 16) are required")
        return self


class SwingAnalyzeRequest(_Model):
    view: Literal["face_on"] = Field(default="face_on", description="Only face-on is analysed (tempo + speed)")
    pose: PoseSeries
    height_cm: float | None = Field(default=None, ge=120, le=230, description="Golfer height, scales hand travel")


class SwingAnalysis(_Model):
    backswing_s: Observation | None = None
    downswing_s: Observation | None = None
    video_speed_7i_mph: Observation | None = None
    events_ms: dict[str, float] = Field(default_factory=dict, description="Swing event times, real ms")
    algorithm: str = Field(description="Upstream code version, e.g. 'main@7234843'")
    notes: list[str] = Field(default_factory=list, description="Why a value is missing or less certain")

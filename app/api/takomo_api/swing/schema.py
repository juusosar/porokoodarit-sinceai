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


class ClubHeadTrack(_Model):
    """Club-head box centre per sample from the on-device detector, normalised to the frame; null = not run / none."""

    x: list[float | None]
    y: list[float | None]


class DtlClip(_Model):
    """Optional down-the-line clip: pose + club head at address -> the golfer's shaft length (main's DTL read)."""

    pose: PoseSeries
    club_head: ClubHeadTrack

    @model_validator(mode="after")
    def _same_length(self) -> DtlClip:
        n = len(self.pose.t_ms)
        if not (len(self.club_head.x) == len(self.club_head.y) == n):
            raise ValueError(f"club_head x/y must have {n} values like pose.t_ms")
        for k in ("11", "12"):
            if k not in self.pose.landmarks:
                raise ValueError("shoulders (11, 12) are required for the down-the-line clip")
        return self


class SwingAnalyzeRequest(_Model):
    view: Literal["face_on"] = Field(default="face_on", description="Main clip is face-on (tempo + speed)")
    pose: PoseSeries
    dtl: DtlClip | None = Field(default=None, description="Optional down-the-line clip for shaft length")
    height_cm: float | None = Field(default=None, ge=120, le=230, description="Golfer height, scales hand travel")


class DtlDetails(_Model):
    samples: int
    address_ms: float | None = Field(default=None, description="Takeaway start in the down-the-line clip, real ms")
    still_samples: int = Field(description="Samples before address used for the read (main: max 40)")
    head_found: int = Field(description="Still samples where the club head was found")
    shaft_px: float | None = Field(default=None, description="Median hands -> club head distance, px")
    shoulder_px: float | None = Field(default=None, description="Widest shoulder distance in the clip, px")


class SwingDetails(_Model):
    """Every intermediate number of the read, for the result screen (how we got there)."""

    samples: int
    fps: float = Field(description="Real-time samples per second used")
    duration_s: float
    tempo_ratio: float | None = None
    height_m: float = Field(description="Height used to scale hand travel")
    height_from: Literal["profile", "default"]
    shaft_m: float = Field(description="Hands -> club head length used in the speed model")
    shaft_from: Literal["down_the_line", "default"]
    hand_travel_m: float | None = Field(default=None, description="Hands, top -> impact (upstream get_top_bottom_d)")
    hand_speed_mps: float | None = Field(default=None, description="Mean hand speed in the downswing")
    dtl: DtlDetails | None = None


class SwingAnalysis(_Model):
    backswing_s: Observation | None = None
    downswing_s: Observation | None = None
    video_speed_7i_mph: Observation | None = None
    shaft_length_m: Observation | None = Field(
        default=None,
        description="Golfer's own shaft, hands to club head at address (down-the-line clip); used for speed",
    )
    events_ms: dict[str, float] = Field(default_factory=dict, description="Swing event times, real ms")
    details: SwingDetails | None = None
    algorithm: str = Field(description="Upstream code version, e.g. 'main@7234843'")
    notes: list[str] = Field(default_factory=list, description="Why a value is missing or less certain")

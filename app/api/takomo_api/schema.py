"""Shared fit-state contract (v1, best guess).

Pydantic models here are the single source of truth. `python -m takomo_api.export_schema`
writes app/shared/fit_state.schema.json, and the web app generates its TS types from that
file (`npm run gen:types`). CI fails if the two drift.

Vocabulary
- Spec part: one buildable piece of the iron set (head, shaft, length, lie, grip, hand, purchase).
- Evidence: where an input value came from (asked / measured / estimated / default), with an SD.
- Reason code: stable id for a "why" line (see app/shared/reason_codes.json). The LLM host only
  rephrases reason codes; it never decides a spec.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SCHEMA_VERSION = "1"


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


# ------------------------------------------------------------------ enums
class EvidenceSource(StrEnum):
    asked = "asked"  # golfer told us (questionnaire)
    measured = "measured"  # phone photo/video, launch monitor, ball-line test
    estimated = "estimated"  # derived/inferred (e.g. carry -> speed, category prior)
    default = "default"  # nothing known yet, population default


class SpecPart(StrEnum):
    head = "head"
    shaft = "shaft"
    length = "length"
    lie = "lie"
    grip = "grip"
    hand = "hand"
    purchase = "purchase"


HeadSlug = Literal["101-mkii", "201-mkii", "201t-mkii", "301-cb", "301-mb"]
Flex = Literal["lady", "senior", "regular", "stiff", "x-stiff"]
Grip = Literal["standard", "midsize", "oversize"]
Hand = Literal["right", "left"]
Purchase = Literal["stock", "custom"]
Characteristic = Literal[
    "forgiveness", "distance", "forged feel", "distance control", "workability", "less offset", "more offset"
]


# ------------------------------------------------------------------ inputs
class Observation(_Model):
    """One value for one input, from one source, with its uncertainty (1 SD, same unit)."""

    value: float
    sd: float = Field(ge=0)
    source: EvidenceSource
    method: str | None = Field(default=None, description="e.g. 'questionnaire', 'photo', 'video_240fps'")


class Answers(_Model):
    """Questionnaire answers. Every field optional so the engine can run after each step."""

    age: int | None = Field(default=None, ge=10, le=100)
    sex: Literal["male", "female"] | None = None
    hand: Hand | None = None
    score_bucket: int | None = Field(default=None, ge=1, le=5)
    speed_7i_mph: float | None = Field(default=None, gt=0)
    carry_7i_yd: float | None = Field(default=None, gt=0)
    own_7i_loft_deg: float | None = Field(default=None, gt=15, lt=45)
    characteristics: list[Characteristic] = Field(default_factory=list, max_length=3)
    flight: Literal["low", "mid", "high"] | None = None
    tempo: Literal["smooth", "moderate", "quick"] | None = None
    height_cm: float | None = Field(default=None, gt=100, lt=230)
    wrist_to_floor_cm: float | None = Field(default=None, gt=50, lt=120)
    glove: Literal["XS", "S", "M", "M/L", "L", "XL"] | None = None


class Measurements(_Model):
    """Values measured on the phone / launch monitor. Keys follow lab phone_measurements.csv."""

    height_cm: Observation | None = None
    wrist_to_floor_cm: Observation | None = None
    hand_length_cm: Observation | None = None
    speed_7i_mph: Observation | None = None
    backswing_s: Observation | None = None
    downswing_s: Observation | None = None
    lie_need_deg: Observation | None = None

    @model_validator(mode="after")
    def _plausible(self) -> Measurements:
        for name, (lo, hi) in MEASUREMENT_BOUNDS.items():
            o = getattr(self, name)
            if o is not None and not lo <= o.value <= hi:
                raise ValueError(f"{name} {o.value} outside plausible range {lo}..{hi}")
        return self


# Plausible ranges for measured values (same spirit as Answers bounds); outside -> 422.
MEASUREMENT_BOUNDS = {
    "height_cm": (100, 230),
    "wrist_to_floor_cm": (50, 120),
    "hand_length_cm": (12, 26),
    "speed_7i_mph": (30, 130),
    "backswing_s": (0.3, 3.0),
    "downswing_s": (0.1, 1.0),
    "lie_need_deg": (-10, 10),
}


class FitRequest(_Model):
    schema_version: Literal["1"] = SCHEMA_VERSION
    step: str = Field(description="UI step that triggered this run, e.g. 'profile', 'swing'")
    answers: Answers = Field(default_factory=Answers)
    measurements: Measurements = Field(default_factory=Measurements)
    previous: FitState | None = Field(default=None, description="Last fit state, used to build the diff")


# ------------------------------------------------------------------ outputs
class Reason(_Model):
    code: str = Field(description="Id from reason_codes.json, e.g. 'LENGTH_FROM_HEIGHT'")
    params: dict[str, str | float | int] = Field(default_factory=dict)


class Range(_Model):
    low: float
    high: float


class CloseCall(_Model):
    alternative: str = Field(description="Value on the other side of the line")
    margin: float = Field(description="Distance to the decision line, in the input's unit")
    unit: str
    note_code: str | None = None


class PartState(_Model):
    part: SpecPart
    value: str | float | None = Field(description="Chosen value; None = not enough evidence yet")
    label: str = Field(description="Display text, e.g. '+0.5 in', 'KBS Tour Lite R'")
    range: Range | None = Field(default=None, description="Plausible numeric range (length/lie)")
    confidence: float = Field(ge=0, le=1)
    evidence: list[EvidenceSource] = Field(default_factory=list)
    reasons: list[Reason] = Field(default_factory=list)
    close_call: CloseCall | None = None


class HeadOption(_Model):
    head: HeadSlug
    score: float
    probability: float = Field(ge=0, le=1)


class Change(_Model):
    part: SpecPart
    before: str | None
    after: str | None
    confidence_before: float | None = None
    confidence_after: float


class FitState(_Model):
    schema_version: Literal["1"] = SCHEMA_VERSION
    step: str
    parts: dict[SpecPart, PartState]
    head_options: list[HeadOption] = Field(default_factory=list)
    changes: list[Change] = Field(default_factory=list, description="Diff vs previous state")
    buildable: bool
    warnings: list[Reason] = Field(default_factory=list)


FitRequest.model_rebuild()

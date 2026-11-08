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
    measured = "measured"  # device photo/video, launch monitor, ball-line test
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
    speed_7i_mph: float | None = Field(default=None, ge=30, le=130)
    carry_7i_yd: float | None = Field(default=None, ge=40, le=260)
    own_7i_loft_deg: float | None = Field(default=None, gt=15, lt=45)
    characteristics: list[Characteristic] = Field(default_factory=list, max_length=3)
    flight: Literal["low", "mid", "high"] | None = None
    tempo: Literal["smooth", "moderate", "quick"] | None = None
    height_cm: float | None = Field(default=None, gt=100, lt=230)
    wrist_to_floor_cm: float | None = Field(default=None, gt=50, lt=120)
    glove: Literal["XS", "S", "M", "M/L", "L", "XL"] | None = None


class Measurements(_Model):
    """Values measured on the device / launch monitor. Keys follow lab phone_measurements.csv."""

    height_cm: Observation | None = None
    wrist_to_floor_cm: Observation | None = None
    hand_length_cm: Observation | None = None
    speed_7i_mph: Observation | None = None
    backswing_s: Observation | None = None
    downswing_s: Observation | None = None
    lie_need_deg: Observation | None = None
    # Launch monitor (own 7-iron, mean of the session). Carry here is measured, so no over-report correction.
    carry_7i_yd: Observation | None = None
    launch_deg: Observation | None = None
    spin_rpm: Observation | None = None
    landing_deg: Observation | None = None
    # Ball-line lie test: mean tilt of the transferred line, + = leans toward the toe (club too upright).
    # method carries the shot count, e.g. "ball_line_tap_n5". The engine turns it into a lie need.
    ball_line_tilt_deg: Observation | None = None

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
    "carry_7i_yd": (40, 260),
    "launch_deg": (5, 40),
    "spin_rpm": (1000, 12000),
    "landing_deg": (15, 65),
    "ball_line_tilt_deg": (-25, 25),
}


class FitRequest(_Model):
    schema_version: Literal["1"] = SCHEMA_VERSION
    step: str = Field(pattern=r"^[a-z_]{1,32}$", description="UI step that triggered this run, e.g. 'profile', 'swing'")
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


class EvidenceItem(_Model):
    """One input behind a part, with its share of the fused estimate (the "Why" drawer)."""

    input: str = Field(description="Input key, e.g. 'speed_7i_mph', 'flight', 'tempo'")
    label: str = Field(description="Display text, e.g. 'Launch monitor speed'")
    value: str = Field(description="Display value with unit, e.g. '82 mph'")
    source: EvidenceSource
    method: str | None = None
    weight: float = Field(ge=0, le=1, description="Share of the estimate (inverse-variance weight); 1 = decided it")


class NextStep(_Model):
    """A missing or weak input, ranked by how much it would raise confidence."""

    input: str = Field(description="What to add, e.g. 'ball_line_test', 'launch_monitor'")
    parts: list[SpecPart] = Field(default_factory=list, description="Parts it would firm up")
    gain: float = Field(ge=0, description="Expected confidence gain, weighted sum over parts")
    code: str = Field(description="Reason code for the prompt line")


class PartState(_Model):
    part: SpecPart
    value: str | float | None = Field(description="Chosen value; None = not enough evidence yet")
    label: str = Field(description="Display text, e.g. '+0.5 in', 'KBS Tour Lite R'")
    range: Range | None = Field(default=None, description="Plausible numeric range (length/lie)")
    confidence: float = Field(ge=0, le=1)
    evidence: list[EvidenceSource] = Field(default_factory=list)
    reasons: list[Reason] = Field(default_factory=list)
    close_call: CloseCall | None = None
    inputs: list[EvidenceItem] = Field(default_factory=list, description="Evidence chain behind the value")


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


class StockBlocker(_Model):
    part: SpecPart
    custom_value: str = Field(description="What the fit needs, e.g. '-2°'")
    stock_value: str = Field(description="What stock would give, e.g. 'Standard'")
    impact_code: str = Field(description="Reason code describing the trade-off")
    params: dict[str, str | float | int] = Field(default_factory=dict)


class StockAdvice(_Model):
    """Stock vs custom (POR-17). Stock = faster delivery + 30-day returns; custom = no returns."""

    recommended: Purchase
    blockers: list[StockBlocker] = Field(default_factory=list, description="Parts that make the fit custom")
    stock_alternative: dict[SpecPart, str] = Field(
        default_factory=dict, description="Nearest stock build (labels) if the golfer prefers stock"
    )
    one_tweak_from_stock: bool = False
    close_call_parts: list[SpecPart] = Field(
        default_factory=list, description="Custom parts where standard is nearly as likely (stock worth considering)"
    )


class FitState(_Model):
    schema_version: Literal["1"] = SCHEMA_VERSION
    step: str
    parts: dict[SpecPart, PartState]
    head_options: list[HeadOption] = Field(default_factory=list)
    changes: list[Change] = Field(default_factory=list, description="Diff vs previous state")
    buildable: bool
    warnings: list[Reason] = Field(default_factory=list)
    stock_advice: StockAdvice | None = None
    estimates: dict[str, Range] = Field(
        default_factory=dict, description="Fused input estimates, mean +- 1 SD (e.g. speed_7i_mph)"
    )
    next_steps: list[NextStep] = Field(default_factory=list, description="Best inputs to add next, highest gain first")


FitRequest.model_rebuild()

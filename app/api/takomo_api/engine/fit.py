"""FitRequest -> FitState.

M2 (POR-9): resolve each input from the best available source (measured > asked > default),
run today's Takomo rules, validate, and emit per-part values, evidence tags and reason codes.
Confidence here is a coarse placeholder from evidence quality; M3 (POR-15) replaces it with
error-weighted fusion, ranges and close calls.
"""

from __future__ import annotations

import bisect
import math
from dataclasses import dataclass

from ..schema import (
    Change,
    EvidenceSource,
    FitRequest,
    FitState,
    HeadOption,
    PartState,
    Reason,
    SpecPart,
)
from . import catalogue as C
from . import rules as R
from .validate import problems

E = EvidenceSource

# Population defaults used before the golfer has told us anything. Tagged "default".
DEFAULTS = dict(
    age=40,
    sex="male",
    hand="right",
    score_bucket=5,
    swing_bucket=3,
    flight="mid",
    tempo="moderate",
    height_cm=175.0,
    wrist_to_floor_cm=86.0,
    glove="M",
)
# Placeholder confidence per evidence source (M3 replaces with fused SDs).
SOURCE_CONFIDENCE = {E.measured: 0.9, E.asked: 0.7, E.estimated: 0.5, E.default: 0.2}
SPEED_RANGE = {1: "under 60", 2: "60-70", 3: "71-80", 4: "81-90", 5: "over 90"}
FLEX_CODE = {"lady": "L", "senior": "A", "regular": "R", "stiff": "S", "x-stiff": "X"}


@dataclass
class Resolved:
    """Inputs fed to the rules, plus where each came from."""

    answers: R.Answers
    src: dict[str, EvidenceSource]


def _pick(name: str, asked, measured=None) -> tuple[object, EvidenceSource]:
    if measured is not None:
        return measured.value, measured.source
    if asked is not None:
        return asked, E.asked
    return DEFAULTS[name], E.default


def resolve(req: FitRequest) -> Resolved:
    a, m = req.answers, req.measurements
    src: dict[str, EvidenceSource] = {}

    def take(name, asked, measured=None):
        v, s = _pick(name, asked, measured)
        src[name] = s
        return v

    age = take("age", a.age)
    sex = take("sex", a.sex)
    hand = take("hand", a.hand)
    score_bucket = take("score_bucket", a.score_bucket)
    flight = take("flight", a.flight)
    height = take("height_cm", a.height_cm, m.height_cm)
    w2f = take("wrist_to_floor_cm", a.wrist_to_floor_cm, m.wrist_to_floor_cm)

    # swing speed: measured speed > asked speed > asked carry (estimated) > default
    if m.speed_7i_mph is not None:
        swing_bucket, src["swing"] = R.swing_bucket_from_speed(m.speed_7i_mph.value), m.speed_7i_mph.source
    elif a.speed_7i_mph is not None:
        swing_bucket, src["swing"] = R.swing_bucket_from_speed(a.speed_7i_mph), E.asked
    elif a.carry_7i_yd is not None:
        swing_bucket, src["swing"] = R.swing_bucket_from_carry(a.carry_7i_yd), E.estimated
    else:
        swing_bucket, src["swing"] = DEFAULTS["swing_bucket"], E.default

    # tempo: measured back+down swing time > asked > default (lab baseline thresholds)
    if m.backswing_s is not None and m.downswing_s is not None:
        tot = m.backswing_s.value + m.downswing_s.value
        tempo, src["tempo"] = ("quick" if tot < 1.05 else "smooth" if tot > 1.35 else "moderate"), E.measured
    else:
        tempo = take("tempo", a.tempo)

    # glove: measured hand length > asked glove > default
    if m.hand_length_cm is not None:
        glove = C.GLOVE_ORDER[bisect.bisect_right(C.GLOVE_EDGES_CM, m.hand_length_cm.value)]
        src["glove"] = m.hand_length_cm.source
    else:
        glove = take("glove", a.glove)

    ans = R.Answers(
        age=int(age),
        sex=str(sex),
        score_bucket=int(score_bucket),
        swing_bucket=int(swing_bucket),
        characteristics=list(a.characteristics),
        flight=str(flight),
        tempo=str(tempo),
        height_cm=float(height),
        wrist_to_floor_cm=float(w2f),
        glove=str(glove),
        handedness=str(hand),
    )
    return Resolved(ans, src)


def _conf(src: dict[str, EvidenceSource], keys: list[str]) -> tuple[float, list[EvidenceSource]]:
    sources = [src[k] for k in keys]
    order = [E.asked, E.measured, E.estimated, E.default]
    tags = sorted(set(sources), key=order.index)
    return min(SOURCE_CONFIDENCE[s] for s in sources), tags


def feet_inches(cm: float) -> str:
    total = round(cm / 2.54)
    return f"{total // 12}'{total % 12}\""


def _signed(v: float, unit: str) -> str:
    return "Standard" if v == 0 else f"{v:+g}{unit}"


def _head_probs(ranked: list[tuple[str, float, dict]]) -> list[HeadOption]:
    mx = max(s for _, s, _ in ranked)
    w = [math.exp(s - mx) for _, s, _ in ranked]
    tot = sum(w)
    return [
        HeadOption(head=h, score=s, probability=round(x / tot, 3))
        for (h, s, _), x in zip(ranked, w, strict=True)
    ]


def run(req: FitRequest) -> FitState:
    res = resolve(req)
    a, src = res.answers, res.src
    ranked = R.score_heads(a)
    head_slug = ranked[0][0]
    trace: list[str] = []
    sh = R.pick_shaft(head_slug, a, trace)
    length = R.length_for(a, sh["flex"], trace)
    lie = R.lie_for(a, trace)
    lie_reason = Reason(code="LIE_FROM_STATIC", params={"lie": _signed(lie, "°")})
    lie_keys = ["height_cm", "wrist_to_floor_cm"]
    if req.measurements.lie_need_deg is not None:
        obs = req.measurements.lie_need_deg
        lie = int(max(-3, min(3, round(obs.value))))
        src["lie_need"] = obs.source
        lie_keys = ["lie_need"]
        lie_reason = Reason(code="LIE_FROM_SHOTS", params={"lie": _signed(lie, "°")})
    grip = R.grip_for(a, trace)
    purchase = R.purchase_for(head_slug, sh, length, lie, grip)

    parts: dict[SpecPart, PartState] = {}

    # head
    h = C.head(head_slug)
    reasons = []
    if src["score_bucket"] != E.default:
        reasons.append(Reason(code="HEAD_SKILL_MATCH", params={"score_label": h["target_score_label"]}))
    reasons.append(Reason(code="HEAD_SPEED_MATCH", params={"speed_range": SPEED_RANGE[a.swing_bucket]}))
    if a.characteristics:
        reasons.append(Reason(code="HEAD_PRIORITY", params={"priorities": ", ".join(a.characteristics[:3])}))
    if a.score_bucket == 5 and a.swing_bucket in (4, 5):
        reasons.append(Reason(code="HEAD_OVER92_CAP"))
    if "forgiveness" in a.characteristics[:3]:
        reasons.append(Reason(code="HEAD_FORGIVENESS_PENALTY"))
    conf, ev = _conf(src, ["score_bucket", "swing"])
    parts[SpecPart.head] = PartState(
        part=SpecPart.head, value=head_slug, label=h["name"], confidence=conf, evidence=ev, reasons=reasons
    )

    # shaft
    why_graphite = (
        "lighter flex"
        if sh["flex"] in ("lady", "senior")
        else "ladies build"
        if a.sex == "female"
        else "age 70+"
        if a.age >= 70
        else None
    )
    reasons = [
        Reason(
            code="FLEX_FROM_SPEED", params={"flex": sh["flex"], "speed_range": SPEED_RANGE[a.swing_bucket]}
        ),
        Reason(code="MATERIAL_GRAPHITE", params={"why": why_graphite})
        if sh["material"] == "graphite" and why_graphite
        else Reason(code="MATERIAL_STEEL"),
        Reason(code="SHAFT_MODEL_MATCH", params={"model": sh["model"], "flight": a.flight, "tempo": a.tempo}),
    ]
    if src["swing"] == E.estimated:
        reasons.append(Reason(code="SPEED_FROM_CARRY"))
    elif src["swing"] == E.measured:
        reasons.append(Reason(code="SPEED_MEASURED", params={"speed_range": SPEED_RANGE[a.swing_bucket]}))
    conf, ev = _conf(src, ["swing", "sex", "age", "flight", "tempo"])
    parts[SpecPart.shaft] = PartState(
        part=SpecPart.shaft,
        value=sh["slug"],
        label=f"{sh['model']} {FLEX_CODE[sh['flex']]} {sh['material']}",
        confidence=conf,
        evidence=ev,
        reasons=reasons,
    )

    # length
    reasons = [
        Reason(
            code="LENGTH_FROM_HEIGHT",
            params={"height": feet_inches(a.height_cm), "length": _signed(length, " in")},
        )
    ]
    if sh["flex"] == "lady":
        reasons.append(Reason(code="LENGTH_LADY_FLEX"))
    conf, ev = _conf(src, ["height_cm"])
    parts[SpecPart.length] = PartState(
        part=SpecPart.length,
        value=length,
        label=_signed(length, " in"),
        confidence=conf,
        evidence=ev,
        reasons=reasons,
    )

    # lie
    conf, ev = _conf(src, lie_keys)
    parts[SpecPart.lie] = PartState(
        part=SpecPart.lie,
        value=lie,
        label=_signed(lie, "°"),
        confidence=conf,
        evidence=ev,
        reasons=[lie_reason],
    )

    # grip
    if req.measurements.hand_length_cm is not None:
        r = Reason(
            code="GRIP_FROM_HAND",
            params={"hand_len": f"{req.measurements.hand_length_cm.value:.1f} cm", "grip": grip},
        )
    elif src["glove"] != E.default:
        r = Reason(code="GRIP_FROM_GLOVE", params={"grip": grip, "glove": a.glove})
    else:
        r = Reason(code="NEED_MORE_EVIDENCE", params={"next_step": "Your glove size or a hand photo"})
    conf, ev = _conf(src, ["glove"])
    parts[SpecPart.grip] = PartState(
        part=SpecPart.grip, value=grip, label=grip.capitalize(), confidence=conf, evidence=ev, reasons=[r]
    )

    # hand
    conf, ev = _conf(src, ["hand"])
    parts[SpecPart.hand] = PartState(
        part=SpecPart.hand,
        value=a.handedness,
        label=a.handedness.capitalize(),
        confidence=conf,
        evidence=ev,
        reasons=[
            Reason(code="HAND_ASKED", params={"hand": a.handedness})
            if src["hand"] != E.default
            else Reason(code="HAND_DEFAULT", params={"hand": a.handedness})
        ],
    )

    # purchase
    if purchase == "stock":
        reasons = [Reason(code="PURCHASE_STOCK")]
    else:
        why = []
        if sh["material"] != "steel" or sh["model"] not in h["stock_shafts"]:
            why.append("the shaft")
        if length != 0:
            why.append("length")
        if lie != 0:
            why.append("lie")
        if grip not in R.STOCK_GRIPS:
            why.append("oversize grip")
        reasons = [Reason(code="PURCHASE_CUSTOM", params={"why": ", ".join(why)})]
    conf = min(p.confidence for p in parts.values())
    ev = sorted(
        {e for p in parts.values() for e in p.evidence},
        key=[E.asked, E.measured, E.estimated, E.default].index,
    )
    parts[SpecPart.purchase] = PartState(
        part=SpecPart.purchase,
        value=purchase,
        label=purchase.capitalize(),
        confidence=conf,
        evidence=ev,
        reasons=reasons,
    )

    issues = problems(head_slug, sh["slug"], length, lie, grip, a.handedness)
    warnings = [Reason(code="UNBUILDABLE", params={"detail": i}) for i in issues]
    return FitState(
        step=req.step,
        parts=parts,
        head_options=_head_probs(ranked),
        changes=diff(req.previous, parts),
        buildable=not issues,
        warnings=warnings,
    )


def diff(previous: FitState | None, parts: dict[SpecPart, PartState]) -> list[Change]:
    out = []
    for k, p in parts.items():
        before = previous.parts.get(k) if previous else None
        if before is None or before.label != p.label or abs(before.confidence - p.confidence) > 1e-9:
            out.append(
                Change(
                    part=k,
                    before=before.label if before else None,
                    after=p.label,
                    confidence_before=before.confidence if before else None,
                    confidence_after=p.confidence,
                )
            )
    return out

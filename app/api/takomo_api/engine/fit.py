"""FitRequest -> FitState.

1. Fuse every source per input into an estimate with an SD (fusion.py, POR-15).
2. Run today's Takomo rules (rules.py) on the most likely inputs, so the spec stays comparable to
   Takomo's own tool and always buildable.
3. Turn the estimate's uncertainty into per-part confidence, ranges and close calls: confidence is
   the probability that the chosen option is right given the evidence; a close call is flagged when
   the neighbouring option has >= CLOSE_CALL_P of that probability mass.
4. Stock vs custom advice (POR-17): which parts force custom, and what stock would trade away.
"""

from __future__ import annotations

import math
from dataclasses import replace

from ..schema import (
    Change,
    CloseCall,
    EvidenceItem,
    EvidenceSource,
    FitRequest,
    FitState,
    HeadOption,
    NextStep,
    PartState,
    Range,
    Reason,
    SpecPart,
    StockAdvice,
    StockBlocker,
)
from . import catalogue as C
from . import fusion as Fu
from . import rules as R
from .validate import problems

E = EvidenceSource
ORDER = [E.asked, E.measured, E.estimated, E.default]
CLOSE_CALL_P = 0.3

DEFAULTS = dict(age=40, sex="male", hand="right", flight="mid", tempo="moderate", glove="M")
# Population score-bucket mix (lab SIMULATOR): used when the golfer hasn't answered.
SCORE_PRIOR = [0.02, 0.06, 0.18, 0.34, 0.40]
# 85 % report ~2.5 strokes better than their average -> some mass one bucket worse.
SCORE_SHIFT_P = 0.3
SPEED_RANGE = {1: "under 60", 2: "60-70", 3: "71-80", 4: "81-90", 5: "over 90"}
FLEX_CODE = {"lady": "L", "senior": "A", "regular": "R", "stiff": "S", "x-stiff": "X"}
GRIP_EDGES_CM = [18.59, 20.22]  # glove M|M/L (standard|midsize), L|XL (midsize|oversize)
# Categorical inputs (flight, tempo): population mix, and how often an answer is right (lab SIMULATOR:
# ~70 %, else one step off). A measurement is a likelihood on top; the posterior picks the class.
TEMPO_CLASSES = ("quick", "moderate", "smooth")
TEMPO_PRIOR = {"quick": 0.18, "moderate": 0.56, "smooth": 0.26}
TEMPO_EDGES_S = (1.05, 1.35)  # backswing + downswing: under = quick, over = smooth
FLIGHT_CLASSES = ("low", "mid", "high")
FLIGHT_PRIOR = {"low": 0.13, "mid": 0.64, "high": 0.23}
ANSWER_RIGHT_P = 0.7
# Weight of each part in the "what to add next" gain (head and shaft matter most to a golfer).
GAIN_WEIGHT = {SpecPart.head: 2.0, SpecPart.shaft: 2.0, SpecPart.lie: 1.5, SpecPart.length: 1.0, SpecPart.grip: 1.0}
NEXT_STEP_MIN_GAIN = 0.05


def _tags(*groups) -> list[EvidenceSource]:
    s: set[EvidenceSource] = set()
    for g in groups:
        s |= set(g) if isinstance(g, list | set | tuple) else {g}
    if len(s) > 1:
        s.discard(E.default)
    return sorted(s, key=ORDER.index)


def feet_inches(cm: float) -> str:
    total = round(cm / 2.54)
    return f"{total // 12}'{total % 12}\""


def _signed(v: float, unit: str) -> str:
    return "Standard" if v == 0 else f"{v:+g}{unit}"


def _shaft_label(sh: dict) -> str:
    return f"{sh['model']} {FLEX_CODE[sh['flex']]} {sh['material']}"


def _score_probs(asked: int | None) -> list[float]:
    if asked is None:
        return SCORE_PRIOR
    p = [0.0] * 5
    if asked < 5:
        p[asked - 1], p[asked] = 1 - SCORE_SHIFT_P, SCORE_SHIFT_P
    else:
        p[4] = 1.0
    return p


def _length_bins(flex: str) -> list[tuple[float, float, float]]:
    """(height_lo, height_hi, length) bins from the length-by-height table (+ ladies add-back)."""
    rows = C.rules()["length_by_height_cm"]
    add = C.rules()["lady_flex_length_adjustment_in"] if flex == "lady" else 0
    out, lo = [], -math.inf
    for r in rows:
        hi = r["below_cm"] if r["below_cm"] is not None else math.inf
        out.append((lo, hi, max(-1.5, min(1.5, round((r["length_in"] + add) * 2) / 2))))
        lo = hi
    return out


def _discrete(probs: dict, chosen) -> tuple[float, object | None, float]:
    """Return (p_chosen, best neighbour, p_neighbour) from an option -> probability map."""
    p = probs.get(chosen, 0.0)
    rest = [(v, q) for v, q in probs.items() if v != chosen]
    if not rest:
        return p, None, 0.0
    alt, q = max(rest, key=lambda t: t[1])
    return p, alt, q


FORGED = ("301-cb", "301-mb")
# characteristic -> (rating key, higher rating is better)
PRIORITY_RATING = {
    "forgiveness": ("forgiveness", True),
    "distance": ("distance", True),
    "forged feel": ("feel", True),
    "distance control": ("distance_control", True),
    "workability": ("workability", True),
    "more offset": ("offset", True),
    "less offset": ("offset", False),
}


STRONG_RATING = 3  # a head is only "strong" on a priority at 3+ of 5 (offset: 2 or less for "less offset")


def _priority_split(head_slug: str, rival: str | None, priorities: list[str]) -> tuple[list[str], list[str]]:
    """(strong, weak): priorities the pick is genuinely good at (absolute bar and >= rival), and priorities
    the rival rates better on. A priority that is neither (both heads mediocre) is left unsaid."""
    hr = C.head(head_slug)["ratings"]
    rr = C.head(rival)["ratings"] if rival else None
    strong, weak = [], []
    for c in priorities:
        key, up = PRIORITY_RATING[c]
        good = hr[key] >= STRONG_RATING if up else hr[key] <= 5 - STRONG_RATING
        if c == "forged feel":
            good = head_slug in FORGED
        beats = rr is None or (hr[key] >= rr[key] if up else hr[key] <= rr[key])
        if good and beats:
            strong.append(c)
        elif rr is not None and not beats:
            weak.append(c)
    return strong, weak


def _shaft_feel(sh: dict) -> Reason:
    w = sh["weight_g"]
    feel = (
        "heavier, steadier feel and more control"
        if w >= 115
        else "mid weight, a balance of control and easy speed"
        if w >= 90
        else "light, easier to swing and helps the ball up"
    )
    return Reason(code="SHAFT_WEIGHT_FEEL", params={"weight_g": w, "feel": feel})


def _shaft_launch(sh: dict) -> Reason:
    fp = sh.get("flight_profile") or ["mid"]
    launch = (
        "lower, more penetrating flight"
        if "high" not in fp and "low" in fp
        else "higher launch, softer landing"
        if "high" in fp and "low" not in fp
        else "mid launch"
    )
    return Reason(code="SHAFT_LAUNCH", params={"launch": launch})


def _shaft_tradeoff(sh: dict, alt_sh: dict) -> Reason:
    d = alt_sh["weight_g"] - sh["weight_g"]
    if alt_sh["flex"] != sh["flex"]:
        softer = C.flex_index(alt_sh["flex"]) < C.flex_index(sh["flex"])
        tradeoff = (
            "softer flex, easier to launch and a little higher, with less control at the top of your speed range"
            if softer
            else "firmer flex, a little lower and tighter, better if your speed is at the top of the range"
        )
    elif abs(d) >= 10:
        tradeoff = (
            "lighter, easier to swing, slightly higher flight" if d < 0 else "heavier, steadier, slightly lower flight"
        )
    else:
        tradeoff = "very similar weight and flight"
    return Reason(code="SHAFT_ALT_TRADEOFF", params={"alternative": _shaft_label(alt_sh), "tradeoff": tradeoff})


def _offline_yd(loft_deg: float, lie_err_deg: float, speed_mph: float) -> float:
    """Start-line miss for a 7-iron whose lie is lie_err_deg off (face tilt ~ tan(loft) * sin(err))."""
    aim = math.atan(math.tan(math.radians(loft_deg)) * math.sin(math.radians(abs(lie_err_deg))))
    carry = max(speed_mph, 40) * Fu.YD_PER_MPH_AT_REF
    return round(carry * math.tan(aim), 1)


def _answer_prior(classes: tuple[str, ...], asked: str | None, population: dict[str, float]) -> dict[str, float]:
    """P(true class | answer). Wrong answers are one step off (lab error model)."""
    if asked is None:
        return dict(population)
    i = classes.index(asked)
    near = [c for j, c in enumerate(classes) if abs(j - i) == 1]
    out = {c: 0.1 for c in classes}  # two steps off: rare, but a measurement must be able to win
    out[asked] = ANSWER_RIGHT_P
    for c in near:
        out[c] = (1 - ANSWER_RIGHT_P) / len(near)
    t = sum(out.values())
    return {c: v / t for c, v in out.items()}


def _posterior(prior: dict[str, float], like: dict[str, float] | None) -> dict[str, float]:
    if like is None:
        return prior
    post = {c: prior[c] * like[c] for c in prior}
    t = sum(post.values())
    return {c: v / t for c, v in post.items()} if t > 0 else prior


def _tempo_likelihood(back: float, down: float, sd: float) -> dict[str, float]:
    est = Fu.Estimate(back + down, max(sd, 1e-3))
    lo, hi = TEMPO_EDGES_S
    return {
        "quick": est.prob_between(-math.inf, lo),
        "moderate": est.prob_between(lo, hi),
        "smooth": est.prob_between(hi, math.inf),
    }


# Observations converted from another quantity (carry -> speed, score -> speed): shown as approximate.
CONVERTED = {"launch_monitor_carry", "carry_loft_corrected", "score_prior"}

METHOD_LABEL = {
    "population_prior": "Typical golfer (starting point)",
    "questionnaire": "Your answer",
    "glove": "Your glove size",
    "launch_monitor": "Launch monitor speed",
    "trackman": "TrackMan speed",
    "radar": "Radar speed",
    "launch_monitor_carry": "Launch monitor carry",
    "carry_loft_corrected": "Your carry answer (corrected)",
    "score_prior": "Your typical score",
    "static_chart": "Height + wrist-to-floor chart",
    "photo": "Photo measurement",
    "video_pose": "Swing video (on device)",
    "landing_angle": "Launch monitor landing angle",
    "launch_spin": "Launch monitor launch + spin",
}


def _label(o) -> str:
    m = o.method or ""
    if m.startswith("ball_line"):
        return "Ball-line test"
    return METHOD_LABEL.get(m, m.replace("_", " ").capitalize() or o.source.value.capitalize())


def _items(input_key: str, est: Fu.Estimate, fmt) -> list[EvidenceItem]:
    out = [
        EvidenceItem(
            input=input_key,
            label=_label(o),
            value=f"≈{fmt(o.value)} (converted)" if o.method in CONVERTED else fmt(o.value),
            source=o.source,
            method=o.method,
            weight=round(w, 3),
        )
        for o, w in est.items
        if w >= 0.01
    ]
    return sorted(out, key=lambda i: -i.weight)


def _cat_item(input_key: str, label: str, value: str, src: EvidenceSource, method: str | None) -> EvidenceItem:
    return EvidenceItem(input=input_key, label=label, value=value, source=src, method=method, weight=1.0)


def run(req: FitRequest, *, plan_next: bool = True) -> FitState:
    a, m = req.answers, req.measurements
    fz = Fu.fuse(a, m)

    src = {k: (E.asked if getattr(a, k) is not None else E.default) for k in ("age", "sex", "hand", "flight")}
    src["tempo"] = E.asked if a.tempo else E.default
    # tempo: answer as prior, video timing as likelihood (a noisy clip can't overrule a clear answer)
    tempo_like = None
    if m.backswing_s is not None and m.downswing_s is not None:
        tempo_like = _tempo_likelihood(
            m.backswing_s.value, m.downswing_s.value, math.hypot(m.backswing_s.sd, m.downswing_s.sd)
        )
    tempo_p = _posterior(_answer_prior(TEMPO_CLASSES, a.tempo, TEMPO_PRIOR), tempo_like)
    tempo = max(TEMPO_CLASSES, key=lambda c: tempo_p[c])
    if tempo_like is not None:
        src["tempo"] = E.measured
    # flight: answer as prior, launch-monitor landing angle (or launch + spin) as likelihood
    flight_est = Fu.flight_need(m, a.own_7i_loft_deg, fz.speed.mean)
    flight_like = Fu.flight_probs(flight_est) if flight_est is not None else None
    flight_p = _posterior(_answer_prior(FLIGHT_CLASSES, a.flight, FLIGHT_PRIOR), flight_like)
    flight = max(FLIGHT_CLASSES, key=lambda c: flight_p[c])
    if flight_like is not None:
        src["flight"] = E.measured
    src["score"] = E.asked if a.score_bucket is not None else E.default

    # glove: measured hand length wins; else the golfer's own glove answer (no shrinkage); else default
    if m.hand_length_cm is not None:
        glove = Fu.glove_from_hand(fz.hand.mean)
    else:
        glove = a.glove or DEFAULTS["glove"]

    speed_p = Fu.speed_bucket_probs(fz.speed)
    score_p = _score_probs(a.score_bucket)
    swing_bucket = max(range(1, 6), key=lambda b: speed_p[b - 1])
    score_bucket = max(range(1, 6), key=lambda b: score_p[b - 1])

    base = R.Answers(
        age=a.age if a.age is not None else DEFAULTS["age"],
        sex=a.sex or DEFAULTS["sex"],
        score_bucket=score_bucket,
        swing_bucket=swing_bucket,
        characteristics=list(a.characteristics),
        flight=flight,
        tempo=tempo,
        height_cm=fz.height.mean,
        wrist_to_floor_cm=fz.w2f.mean,
        glove=glove,
        handedness=a.hand or DEFAULTS["hand"],
    )

    # ---------------------------------------------------------------- head: P(top) over input uncertainty
    p_top: dict[str, float] = {h: 0.0 for h in C.HEAD_ORDER}
    for sb in range(1, 6):
        for sc in range(1, 6):
            w = speed_p[sb - 1] * score_p[sc - 1]
            if w < 1e-4:
                continue
            p_top[R.score_heads(replace(base, swing_bucket=sb, score_bucket=sc))[0][0]] += w
    tot = sum(p_top.values())
    p_top = {h: v / tot for h, v in p_top.items()}
    modal = {h: s for h, s, _ in R.score_heads(base)}
    head_slug = max(C.HEAD_ORDER, key=lambda h: (p_top[h], modal[h]))
    head_options = sorted(
        (HeadOption(head=h, score=modal[h], probability=round(p_top[h], 3)) for h in C.HEAD_ORDER),
        key=lambda o: (-o.probability, -o.score),
    )

    trace: list[str] = []
    sh = R.pick_shaft(head_slug, base, trace)
    length = R.length_for(base, sh["flex"], trace)
    if fz.lie_measured:
        lie = int(max(-3, min(3, round(fz.lie.mean))))
    else:
        lie = R.lie_for(base, trace)
    grip = R.grip_for(base, trace)
    purchase = R.purchase_for(head_slug, sh, length, lie, grip)
    h = C.head(head_slug)
    parts: dict[SpecPart, PartState] = {}

    # ---------------------------------------------------------------- head
    p, alt, q = _discrete(p_top, head_slug)
    # rival for "why this one": only a head still in contention (>= 10 %), so the explainer may name it
    rival = alt if alt and q >= 0.1 else None
    strong, weak = _priority_split(head_slug, rival, a.characteristics[:3])
    reasons = []
    if src["score"] != E.default:
        reasons.append(Reason(code="HEAD_SKILL_MATCH", params={"score_label": h["target_score_label"]}))
    reasons.append(Reason(code="HEAD_SPEED_MATCH", params={"speed_range": SPEED_RANGE[swing_bucket]}))
    if strong:
        reasons.append(Reason(code="HEAD_PRIORITY", params={"priorities": ", ".join(strong)}))
    if weak:
        reasons.append(
            Reason(
                code="HEAD_ALT_STRONGER",
                params={"alternative": C.head(rival)["name"], "priorities": ", ".join(weak)},
            )
        )
    if score_bucket == 5 and swing_bucket in (4, 5) and src["score"] != E.default:
        reasons.append(Reason(code="HEAD_OVER92_CAP"))
    if "forgiveness" in a.characteristics[:3] and head_slug not in FORGED and rival in FORGED:
        reasons.append(Reason(code="HEAD_FORGIVENESS_PENALTY"))
    cc = None
    if alt and (q >= CLOSE_CALL_P or (q >= 0.1 and abs(modal[head_slug] - modal[alt]) <= 1)):
        cc = CloseCall(
            alternative=C.head(alt)["name"],
            margin=round(p - q, 3),
            unit="probability",
            note_code="CLOSE_CALL",
        )
    speed_items = _items("speed_7i_mph", fz.speed, lambda v: f"{v:.0f} mph")
    score_item = (
        [_cat_item("score_bucket", "Your typical score", h_score_label(a.score_bucket), E.asked, "questionnaire")]
        if a.score_bucket is not None
        else []
    )
    parts[SpecPart.head] = PartState(
        part=SpecPart.head,
        value=head_slug,
        label=h["name"],
        confidence=round(p, 3),
        evidence=_tags(fz.speed.sources, src["score"]),
        reasons=reasons,
        close_call=cc,
        inputs=score_item + speed_items,
    )

    # ---------------------------------------------------------------- shaft (flex from speed bucket)
    why_graphite = (
        "lighter flex"
        if sh["flex"] in ("lady", "senior")
        else "ladies build"
        if base.sex == "female"
        else "age 70+"
        if base.age >= 70
        else None
    )
    flight_txt = base.flight if src["flight"] != E.default else f"{base.flight} (assumed)"
    tempo_txt = base.tempo if src["tempo"] != E.default else f"{base.tempo} (assumed)"
    reasons = [
        Reason(code="FLEX_FROM_SPEED", params={"flex": sh["flex"], "speed_range": SPEED_RANGE[swing_bucket]}),
        Reason(code="MATERIAL_GRAPHITE", params={"why": why_graphite})
        if sh["material"] == "graphite" and why_graphite
        else Reason(code="MATERIAL_STEEL"),
        Reason(
            code="SHAFT_MODEL_MATCH",
            params={"model": sh["model"], "flight": flight_txt, "tempo": tempo_txt},
        ),
        _shaft_launch(sh),
        _shaft_feel(sh),
    ]
    top_speed = max(fz.speed.items, key=lambda t: t[1])[0]
    if E.measured in fz.speed.sources:
        reasons.append(Reason(code="SPEED_MEASURED", params={"speed_range": SPEED_RANGE[swing_bucket]}))
    elif top_speed.method == "carry_loft_corrected" and a.carry_7i_yd is not None:
        used = round(max(a.carry_7i_yd - Fu.CARRY_OVER_REPORT_YD, Fu.MIN_TRUE_CARRY_YD))
        reasons.append(Reason(code="SPEED_FROM_CARRY"))
        reasons.append(Reason(code="CARRY_READ", params={"said": round(a.carry_7i_yd), "used": used}))
        if a.own_7i_loft_deg is not None:
            reasons.append(Reason(code="SPEED_FROM_CARRY_LOFT", params={"loft": round(a.own_7i_loft_deg, 1)}))
        else:
            reasons.append(Reason(code="SPEED_FROM_CARRY_TYPICAL_LOFT", params={"loft": round(Fu.REF_LOFT_DEG)}))
    elif top_speed.method == "launch_monitor_carry":
        reasons.append(Reason(code="SPEED_FROM_CARRY"))
    elif top_speed.method == "score_prior":
        reasons.append(Reason(code="SPEED_FROM_SCORE"))
    if flight_est is not None:
        reasons.append(Reason(code="FLIGHT_FROM_LAUNCH", params={"flight": flight}))
    if tempo_like is not None:
        if max(TEMPO_CLASSES, key=lambda c: tempo_like[c]) == tempo:
            reasons.append(Reason(code="TEMPO_FROM_VIDEO", params={"tempo": tempo}))
        else:
            reasons.append(Reason(code="TEMPO_VIDEO_UNCLEAR", params={"tempo": tempo}))
    cc = None
    neighbours = [b for b in (swing_bucket - 1, swing_bucket + 1) if 1 <= b <= 5]
    nb = max(neighbours, key=lambda b: speed_p[b - 1])
    if speed_p[nb - 1] >= CLOSE_CALL_P:
        alt_sh = R.pick_shaft(head_slug, replace(base, swing_bucket=nb), [])
        if alt_sh["slug"] != sh["slug"]:
            reasons.append(_shaft_tradeoff(sh, alt_sh))
            edge = Fu.SPEED_EDGES[min(nb, swing_bucket) - 1]
            cc = CloseCall(
                alternative=_shaft_label(alt_sh),
                margin=round(abs(fz.speed.mean - edge), 1),
                unit="mph",
                note_code="CLOSE_CALL",
            )
    cat_conf = min(flight_p[flight], tempo_p[tempo])
    shaft_inputs = list(speed_items)
    if flight_est is not None:
        o = flight_est.items[0][0]
        shaft_inputs.append(
            _cat_item(
                "flight",
                _label(o),
                f"needs ~{o.value:.0f}° landing → {flight}" + (" (weighed with your answer)" if a.flight else ""),
                E.measured,
                o.method,
            )
        )
    elif a.flight is not None:
        shaft_inputs.append(_cat_item("flight", "Your ball flight answer", flight, E.asked, "questionnaire"))
    if tempo_like is not None:
        shaft_inputs.append(
            _cat_item(
                "tempo",
                "Swing video (on device)",
                f"{tempo} ({m.backswing_s.value + m.downswing_s.value:.2f} s)",
                src["tempo"],
                "video_pose",
            )
        )
    if a.tempo is not None:
        shaft_inputs.append(_cat_item("tempo", "Your tempo answer", a.tempo, E.asked, "questionnaire"))
    parts[SpecPart.shaft] = PartState(
        part=SpecPart.shaft,
        value=sh["slug"],
        label=_shaft_label(sh),
        range=Range(low=round(fz.speed.mean - fz.speed.sd, 1), high=round(fz.speed.mean + fz.speed.sd, 1)),
        confidence=round(speed_p[swing_bucket - 1] * (0.5 + 0.5 * cat_conf), 3),
        evidence=_tags(fz.speed.sources, src["flight"], src["tempo"], src["sex"], src["age"]),
        reasons=reasons,
        close_call=cc,
        inputs=shaft_inputs,
    )

    # ---------------------------------------------------------------- length (height bins)
    lprobs: dict[float, float] = {}
    for lo, hi, L in _length_bins(sh["flex"]):
        lprobs[L] = lprobs.get(L, 0.0) + fz.height.prob_between(lo, hi)
    p, alt, q = _discrete(lprobs, length)
    reasons = [
        Reason(
            code="LENGTH_FROM_HEIGHT",
            params={"height": feet_inches(fz.height.mean), "length": _signed(length, " in")},
        )
    ]
    if sh["flex"] == "lady":
        reasons.append(Reason(code="LENGTH_LADY_FLEX"))
    reasons.append(Reason(code="LENGTH_EFFECT"))
    in_range = [L for L, pr in lprobs.items() if pr >= 0.1] or [length]
    parts[SpecPart.length] = PartState(
        part=SpecPart.length,
        value=length,
        label=_signed(length, " in"),
        range=Range(low=min(in_range), high=max(in_range)),
        confidence=round(p, 3),
        evidence=_tags(fz.height.sources),
        reasons=reasons,
        inputs=_items("height_cm", fz.height, lambda v: f"{v:.0f} cm"),
        close_call=CloseCall(alternative=_signed(alt, " in"), margin=round(p - q, 3), unit="probability")
        if alt is not None and q >= CLOSE_CALL_P
        else None,
    )

    # ---------------------------------------------------------------- lie
    lie_est = fz.lie if fz.lie_measured else Fu.Estimate(fz.lie.mean, fz.lie.sd, fz.lie.sources)
    if not fz.lie_measured:
        lie_est.mean = R.lie_continuous(base.height_cm, base.wrist_to_floor_cm)
    liep = {
        d: lie_est.prob_between(-math.inf if d == -3 else d - 0.5, math.inf if d == 3 else d + 0.5)
        for d in C.load()["lie_options_deg"]
    }
    p, alt, q = _discrete(liep, lie)
    right = base.handedness == "right"
    lie_effect = Reason(
        code="LIE_EFFECT",
        params={
            "offline_yd": _offline_yd(h["seven_iron_loft_deg"], 1, fz.speed.mean),
            "upright_dir": "left" if right else "right",
            "flat_dir": "right" if right else "left",
        },
    )
    code = (
        "LIE_FROM_BALL_LINE"
        if m.ball_line_tilt_deg is not None and m.lie_need_deg is None
        else "LIE_FROM_SHOTS"
        if fz.lie_measured
        else "LIE_FROM_STATIC"
    )
    lie_rng = [d for d, pr in liep.items() if pr >= 0.1] or [lie]
    parts[SpecPart.lie] = PartState(
        part=SpecPart.lie,
        value=lie,
        label=_signed(lie, "°"),
        range=Range(low=min(lie_rng), high=max(lie_rng)),
        confidence=round(p, 3),
        evidence=_tags(lie_est.sources),
        reasons=[Reason(code=code, params={"lie": _signed(lie, "°")}), lie_effect]
        + (
            [Reason(code="NEED_MORE_EVIDENCE", params={"next_step": "Your wrist-to-floor measurement"})]
            if not fz.lie_measured and a.wrist_to_floor_cm is None and m.wrist_to_floor_cm is None
            else []
        ),
        inputs=_items("lie_need_deg", lie_est, lambda v: f"{v:+.1f}°"),
        close_call=CloseCall(alternative=_signed(alt, "°"), margin=round(p - q, 3), unit="probability")
        if alt is not None and q >= CLOSE_CALL_P
        else None,
    )

    # ---------------------------------------------------------------- grip
    e0, e1 = GRIP_EDGES_CM
    gprobs = {
        "standard": fz.hand.prob_between(-math.inf, e0),
        "midsize": fz.hand.prob_between(e0, e1),
        "oversize": fz.hand.prob_between(e1, math.inf),
    }
    p, alt, q = _discrete(gprobs, grip)
    if m.hand_length_cm is not None:
        r = Reason(code="GRIP_FROM_HAND", params={"hand_len": f"{fz.hand.mean:.1f} cm", "grip": grip})
    elif a.glove is not None:
        r = Reason(code="GRIP_FROM_GLOVE", params={"grip": grip, "glove": glove})
    else:
        r = Reason(code="NEED_MORE_EVIDENCE", params={"next_step": "Your glove size"})
    parts[SpecPart.grip] = PartState(
        part=SpecPart.grip,
        value=grip,
        label=grip.capitalize(),
        confidence=round(p, 3),
        evidence=_tags(fz.hand.sources),
        reasons=[r],
        inputs=_items("hand_length_cm", fz.hand, lambda v: f"{v:.1f} cm"),
        close_call=CloseCall(alternative=alt.capitalize(), margin=round(p - q, 3), unit="probability")
        if alt is not None and q >= CLOSE_CALL_P
        else None,
    )

    # ---------------------------------------------------------------- hand
    parts[SpecPart.hand] = PartState(
        part=SpecPart.hand,
        value=base.handedness,
        label=base.handedness.capitalize(),
        confidence=0.95 if src["hand"] == E.asked else 0.5,
        evidence=[src["hand"]],
        reasons=[
            Reason(code="HAND_ASKED", params={"hand": base.handedness})
            if src["hand"] != E.default
            else Reason(code="HAND_DEFAULT", params={"hand": base.handedness})
        ],
    )

    # ---------------------------------------------------------------- purchase + advice
    advice = stock_advice(head_slug, sh, length, lie, grip, purchase, fz, base.handedness)
    # custom only because of a part where standard is nearly as likely -> say stock is worth a look
    near_std = {SpecPart.length: lprobs.get(0.0, 0.0), SpecPart.lie: liep.get(0, 0.0)}
    advice.close_call_parts = [b.part for b in advice.blockers if near_std.get(b.part, 0.0) >= CLOSE_CALL_P]
    if purchase == "stock":
        reasons = [Reason(code="PURCHASE_STOCK")]
    else:
        reasons = [Reason(code="PURCHASE_CUSTOM", params={"why": ", ".join(b.part.value for b in advice.blockers)})]
        if advice.close_call_parts and len(advice.close_call_parts) == len(advice.blockers):
            reasons.append(
                Reason(code="STOCK_CLOSE_CALL", params={"parts": ", ".join(x.value for x in advice.close_call_parts)})
            )
    deps = [parts[k] for k in (SpecPart.shaft, SpecPart.length, SpecPart.lie, SpecPart.grip)]
    parts[SpecPart.purchase] = PartState(
        part=SpecPart.purchase,
        value=purchase,
        label=purchase.capitalize(),
        confidence=round(min(p.confidence for p in deps), 3),
        evidence=_tags(*[p.evidence for p in deps]),
        reasons=reasons,
    )

    issues = problems(head_slug, sh["slug"], length, lie, grip, base.handedness)
    est = {
        "speed_7i_mph": fz.speed,
        "height_cm": fz.height,
        "wrist_to_floor_cm": fz.w2f,
        "hand_length_cm": fz.hand,
        "lie_need_deg": lie_est,
    }
    state = FitState(
        step=req.step,
        parts=parts,
        head_options=head_options,
        changes=diff(req.previous, parts),
        buildable=not issues,
        warnings=[Reason(code="UNBUILDABLE", params={"detail": i}) for i in issues]
        + [Reason(code="CONTRADICTION", params=c) for c in Fu.contradictions(a, m)],
        stock_advice=advice,
        estimates={k: Range(low=round(v.mean - v.sd, 2), high=round(v.mean + v.sd, 2)) for k, v in est.items()},
    )
    if plan_next:
        state.next_steps = next_steps(req, state, fz, tempo)
    return state


def h_score_label(bucket: int) -> str:
    return {1: "under 71", 2: "71-77", 3: "78-84", 4: "85-92", 5: "over 92"}[bucket]


def next_steps(req: FitRequest, state: FitState, fz: Fu.Fused, tempo: str) -> list[NextStep]:
    """Rank missing inputs by expected confidence gain: rerun the engine as if each were measured at today's
    best estimate (so the value stays, only the uncertainty shrinks)."""
    from ..schema import Observation

    a, m = req.answers, req.measurements
    meas = lambda v, sd, method: Observation(value=v, sd=sd, source=E.measured, method=method)  # noqa: E731
    cands: list[tuple[str, str, dict, dict]] = []
    if m.speed_7i_mph is None:
        upd = {"speed_7i_mph": meas(min(max(fz.speed.mean, 31), 129), 1.5, "launch_monitor")}
        if m.landing_deg is None:
            flight_center = {"low": 47.0, "mid": 40.0, "high": 32.0}[req.answers.flight or "mid"]
            upd["landing_deg"] = meas(flight_center, 1.0, "landing_angle")
        cands.append(("launch_monitor", "NEXT_LAUNCH_MONITOR", upd, {}))
    if m.lie_need_deg is None and m.ball_line_tilt_deg is None:
        tilt = (fz.lie.mean - Fu.BALL_LINE_B) / Fu.BALL_LINE_K
        cands.append(
            (
                "ball_line_test",
                "NEXT_BALL_LINE",
                {"ball_line_tilt_deg": meas(max(-24, min(24, tilt)), 0.9, "ball_line_tap_n5")},
                {},
            )
        )
    if m.backswing_s is None:
        tot = {"quick": 0.95, "moderate": 1.2, "smooth": 1.47}[tempo]
        cands.append(
            (
                "swing_video",
                "NEXT_SWING_VIDEO",
                {
                    "backswing_s": meas(tot * 0.76, 0.02, "video_pose"),
                    "downswing_s": meas(tot * 0.24, 0.02, "video_pose"),
                },
                {},
            )
        )
    if m.hand_length_cm is None and a.glove is None:
        cands.append(("glove_size", "NEXT_GLOVE", {}, {"glove": Fu.glove_from_hand(fz.hand.mean)}))
    if a.height_cm is None and m.height_cm is None:
        cands.append(("height", "NEXT_HEIGHT", {}, {"height_cm": round(fz.height.mean, 1)}))
    if a.carry_7i_yd is None and a.speed_7i_mph is None and m.speed_7i_mph is None and m.carry_7i_yd is None:
        cands.append(
            (
                "carry",
                "NEXT_CARRY",
                {},
                {"carry_7i_yd": round(fz.speed.mean * Fu.YD_PER_MPH_AT_REF + Fu.CARRY_OVER_REPORT_YD)},
            )
        )
    out = []
    for key, code, mupd, aupd in cands:
        try:
            r2 = req.model_copy(
                update={
                    "measurements": m.model_copy(update=mupd),
                    "answers": a.model_copy(update=aupd),
                    "previous": None,
                }
            )
            s2 = run(r2, plan_next=False)
        except Exception:  # a candidate must never break the fit
            continue
        gains = {
            part: w * max(0.0, s2.parts[part].confidence - state.parts[part].confidence)
            for part, w in GAIN_WEIGHT.items()
        }
        gain = sum(gains.values())
        if gain >= NEXT_STEP_MIN_GAIN:
            parts = [p for p, g in sorted(gains.items(), key=lambda t: -t[1]) if g >= 0.02]
            out.append(NextStep(input=key, parts=parts, gain=round(gain, 3), code=code))
    return sorted(out, key=lambda n: -n.gain)[:3]


def stock_advice(
    head_slug: str, sh: dict, length: float, lie: int, grip: str, purchase: str, fz, hand: str = "right"
) -> StockAdvice:
    """What makes this fit custom, and what the nearest stock build would trade away."""
    h = C.head(head_slug)
    blockers: list[StockBlocker] = []
    alt: dict[SpecPart, str] = {SpecPart.head: h["name"]}
    stock_shaft = sh
    if not (sh["material"] == "steel" and sh["model"] in h["stock_shafts"]):
        cands = [
            s for s in C.shafts_for_head(head_slug) if s["material"] == "steel" and s["model"] in h["stock_shafts"]
        ]
        target = C.flex_index(sh["flex"])
        stock_label = "No stock shaft"
        if cands:
            stock_shaft = min(cands, key=lambda s: (abs(C.flex_index(s["flex"]) - target), C.flex_index(s["flex"])))
            stock_label = _shaft_label(stock_shaft)
        blockers.append(
            StockBlocker(
                part=SpecPart.shaft,
                custom_value=_shaft_label(sh),
                stock_value=stock_label,
                impact_code="STOCK_SHAFT_TRADEOFF",
                params={
                    "flex_change": stock_shaft["flex"] != sh["flex"],
                    "stock_value": stock_label,
                    "custom_value": _shaft_label(sh),
                },
            )
        )
        alt[SpecPart.shaft] = stock_label
    else:
        alt[SpecPart.shaft] = _shaft_label(sh)
    if length != 0:
        blockers.append(
            StockBlocker(
                part=SpecPart.length,
                custom_value=_signed(length, " in"),
                stock_value="Standard",
                impact_code="STOCK_LENGTH_TRADEOFF",
                params={"delta_in": abs(length), "direction": "shorter" if length > 0 else "longer"},
            )
        )
    alt[SpecPart.length] = "Standard"
    if lie != 0:
        # A standard club on a golfer who needs `lie`: error = 0 - lie. Too upright (need flatter) -> toe up
        # -> face points left (right-handed). Offline ~ carry * tan(atan(tan(loft) * sin(err))).
        err = -lie
        blockers.append(
            StockBlocker(
                part=SpecPart.lie,
                custom_value=_signed(lie, "°"),
                stock_value="Standard",
                impact_code="STOCK_LIE_TRADEOFF",
                params={
                    "offline_yd": _offline_yd(h["seven_iron_loft_deg"], err, fz.speed.mean),
                    # toe-up starts it left for a right-hander, right for a left-hander
                    "direction": ("left" if err > 0 else "right")
                    if hand == "right"
                    else ("right" if err > 0 else "left"),
                },
            )
        )
    alt[SpecPart.lie] = "Standard"
    if grip not in R.STOCK_GRIPS:
        blockers.append(
            StockBlocker(
                part=SpecPart.grip,
                custom_value=grip.capitalize(),
                stock_value="Midsize",
                impact_code="STOCK_GRIP_TRADEOFF",
            )
        )
        alt[SpecPart.grip] = "Midsize"
    else:
        alt[SpecPart.grip] = grip.capitalize()
    return StockAdvice(
        recommended=purchase,
        blockers=blockers,
        stock_alternative=alt,
        one_tweak_from_stock=len(blockers) == 1,
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

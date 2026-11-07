"""Evidence fusion (POR-15): turn every source for an input into one estimate with an SD.

Each source becomes an Observation (value, sd, source). Self-reports get bias corrections and
SDs from the lab's error model (TAKOMO_FITTING_LAB_2026 docs/SIMULATOR.md). Sources are combined
by inverse-variance weighting with a weak population prior, so "nothing known" is a wide estimate,
not a fake exact value. Numbers are first guesses; M7 (POR-19) tunes them on the train split.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from ..schema import Answers, EvidenceSource, Measurements, Observation
from . import catalogue as C

E = EvidenceSource

# Population priors (mean, sd). Tagged "default" when they dominate.
PRIOR = {
    "height_cm": (175.0, 9.0),
    "wrist_to_floor_cm": (87.0, 5.0),
    "speed_7i_mph": (74.0, 10.0),
    "hand_length_cm": (18.9, 1.0),
    "lie_need_deg": (0.0, 2.0),
}

# Self-report error model: (bias to subtract, sd)
ASKED = {
    "height_cm": (1.0, 2.0),  # ~1 cm tall
    "wrist_to_floor_cm": (0.5, 4.0),  # +-3 cm, 15 % systematic 2.5-4 cm
    "speed_7i_mph": (2.0, 5.0),  # reported ~2 mph high
}
CARRY_OVER_REPORT_YD = 15.0  # median over-report vs true mean carry
CARRY_SD_YD = 9.0
MEASURED_CARRY_SD_YD = 4.0  # session mean carry vs carry-per-mph model (ball, strike, conditions)
MIN_TRUE_CARRY_YD = 40.0  # floor so tiny/odd carries can't produce ~0 mph with huge weight
MIN_CARRY_SPEED_SD = 3.0
REF_LOFT_DEG = 31.0  # population mean own 7-iron loft
LOFT_SD_DEG = 1.8
YD_PER_MPH_AT_REF = 1.75  # carry per mph of club speed for a 31 deg 7-iron (rough, tune in M7)
CARRY_PCT_PER_DEG = 0.018  # stronger loft -> longer carry, ~4 deg = 10 yd
GLOVE_HAND_CM = {"XS": 16.3, "S": 17.3, "M": 18.2, "M/L": 19.0, "L": 19.8, "XL": 20.7}
GLOVE_SD_CM = 0.75  # 65 % right, 30 % one size off
STATIC_LIE_PERSONAL_SD = 1.0  # delivered lie need = static chart +- 1 deg
WEIGHT_TAG_MIN = 0.1  # a source must carry >= 10 % weight to be shown as evidence

# Score-bucket speed prior (lab train split: true 7i speed by answered score bucket).
SCORE_SPEED_MPH = {1: 84.0, 2: 79.0, 3: 76.0, 4: 72.0, 5: 67.0}
SCORE_SPEED_SD = 12.0  # wider than the lab spread (8.5): answered scores run optimistic; best on train

# Ball-line test -> lie need. lie_need = BALL_LINE_K * tilt + BALL_LINE_B. The mark exaggerates (face rotates
# with lie), so k < 1. Fitted on lab train (see docs/RECOMMENDATION_ENGINE.md); SD covers shot scatter and the
# unknown lie of the golfer's own club.
BALL_LINE_K = -0.65
BALL_LINE_B = 0.4
BALL_LINE_SD = 0.5

# Needed ball flight as a 7-iron landing angle (lab SIMULATOR: steeper than 45 -> low, shallower than 35 -> high).
FLIGHT_LOW_ABOVE_DEG = 45.0
FLIGHT_HIGH_BELOW_DEG = 35.0
LANDING_BIAS_DEG = 0.5  # measured landing vs needed, lab train
LANDING_PER_LOFT_DEG = 1.14  # stronger own loft -> shallower landing than a 31 deg reference club
LANDING_SD_DEG = 1.2  # own loft known
# No landing angle: estimate it from launch, spin and club speed (lab train fit, residual SD 1.8).
LAUNCH_FIT = (0.9897, -0.000371, 0.6139, -21.87)
LAUNCH_FIT_SD_DEG = 1.8


@dataclass
class Estimate:
    mean: float
    sd: float
    sources: list[EvidenceSource] = field(default_factory=list)
    # (observation, weight) for every source incl. the population prior (method "population_prior")
    items: list[tuple[Observation, float]] = field(default_factory=list)

    def prob_between(self, lo: float, hi: float) -> float:
        return _cdf((hi - self.mean) / self.sd) - _cdf((lo - self.mean) / self.sd)


def _cdf(z: float) -> float:
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def combine(name: str, obs: list[Observation]) -> Estimate:
    mu0, sd0 = PRIOR[name]
    prior = Observation(value=mu0, sd=sd0, source=E.default, method="population_prior")
    allobs = [prior, *obs]
    w = [1 / max(o.sd, 1e-6) ** 2 for o in allobs]
    tot = sum(w)
    mean = sum(o.value * wi for o, wi in zip(allobs, w, strict=True)) / tot
    order = [E.asked, E.measured, E.estimated, E.default]
    tags = sorted({o.source for o, wi in zip(allobs, w, strict=True) if wi / tot >= WEIGHT_TAG_MIN}, key=order.index)
    items = [(o, wi / tot) for o, wi in zip(allobs, w, strict=True)]
    return Estimate(mean=mean, sd=math.sqrt(1 / tot), sources=tags, items=items)


def _asked(name: str, value: float | None, method="questionnaire") -> list[Observation]:
    if value is None:
        return []
    bias, sd = ASKED[name]
    return [Observation(value=value - bias, sd=sd, source=E.asked, method=method)]


def carry_to_speed(carry_yd: float, loft_deg: float | None, measured: bool = False) -> Observation:
    """Carry -> estimated 7-iron speed, corrected for own-club loft.

    A remembered carry (questionnaire) is also corrected for over-report. A launch-monitor carry is not: it
    is the session mean, so only the carry-per-mph model error is left.
    """
    loft = loft_deg if loft_deg is not None else REF_LOFT_DEG
    loft_sd = 0.3 if loft_deg is not None else LOFT_SD_DEG
    over = 0.0 if measured else CARRY_OVER_REPORT_YD
    carry_sd = MEASURED_CARRY_SD_YD if measured else CARRY_SD_YD
    true_carry = max(carry_yd - over, MIN_TRUE_CARRY_YD)
    yd_per_mph = YD_PER_MPH_AT_REF * (1 + CARRY_PCT_PER_DEG * (REF_LOFT_DEG - loft))
    speed = true_carry / yd_per_mph
    rel_sd = math.hypot(carry_sd / true_carry, CARRY_PCT_PER_DEG * loft_sd)
    return Observation(
        value=speed,
        sd=max(speed * rel_sd, MIN_CARRY_SPEED_SD),
        source=E.estimated,
        method="launch_monitor_carry" if measured else "carry_loft_corrected",
    )


def ball_line_lie(tilt: Observation) -> Observation:
    """Mean ball-line tilt -> delivered lie need (deg, + = more upright)."""
    return Observation(
        value=BALL_LINE_K * tilt.value + BALL_LINE_B,
        sd=math.hypot(BALL_LINE_SD, abs(BALL_LINE_K) * tilt.sd),
        source=E.measured,
        method=tilt.method or "ball_line",
    )


def flight_need(m: Measurements, loft_deg: float | None, speed_mph: float) -> Estimate | None:
    """Needed 7-iron landing angle from launch-monitor numbers, or None without them."""
    loft = loft_deg if loft_deg is not None else REF_LOFT_DEG
    loft_sd = 0.0 if loft_deg is not None else LOFT_SD_DEG
    if m.landing_deg is not None:
        o = m.landing_deg
        mean = o.value + LANDING_BIAS_DEG + LANDING_PER_LOFT_DEG * (REF_LOFT_DEG - loft)
        sd = math.sqrt(LANDING_SD_DEG**2 + o.sd**2 + (LANDING_PER_LOFT_DEG * loft_sd) ** 2)
        method = "landing_angle"
    elif m.launch_deg is not None and m.spin_rpm is not None:
        a, b, c, d = LAUNCH_FIT
        mean = a * m.launch_deg.value + b * m.spin_rpm.value + c * speed_mph + d
        sd = math.sqrt(LAUNCH_FIT_SD_DEG**2 + (a * m.launch_deg.sd) ** 2 + (b * m.spin_rpm.sd) ** 2)
        method = "launch_spin"
    else:
        return None
    obs = Observation(value=mean, sd=sd, source=E.measured, method=method)
    return Estimate(mean=mean, sd=sd, sources=[E.measured], items=[(obs, 1.0)])


def flight_probs(est: Estimate) -> dict[str, float]:
    return {
        "low": est.prob_between(FLIGHT_LOW_ABOVE_DEG, math.inf),
        "mid": est.prob_between(FLIGHT_HIGH_BELOW_DEG, FLIGHT_LOW_ABOVE_DEG),
        "high": est.prob_between(-math.inf, FLIGHT_HIGH_BELOW_DEG),
    }


def static_lie(height_cm: float, w2f_cm: float) -> float:
    from .rules import lie_continuous

    return lie_continuous(height_cm, w2f_cm)


@dataclass
class Fused:
    height: Estimate
    w2f: Estimate
    speed: Estimate
    hand: Estimate
    lie: Estimate
    lie_measured: bool


def fuse(a: Answers, m: Measurements) -> Fused:
    def meas(o: Observation | None) -> list[Observation]:
        return [o] if o is not None else []

    height = combine("height_cm", _asked("height_cm", a.height_cm) + meas(m.height_cm))
    w2f = combine("wrist_to_floor_cm", _asked("wrist_to_floor_cm", a.wrist_to_floor_cm) + meas(m.wrist_to_floor_cm))

    speed_obs = _asked("speed_7i_mph", a.speed_7i_mph) + meas(m.speed_7i_mph)
    if m.carry_7i_yd is not None:
        speed_obs.append(carry_to_speed(m.carry_7i_yd.value, a.own_7i_loft_deg, measured=True))
    elif a.carry_7i_yd is not None:
        speed_obs.append(carry_to_speed(a.carry_7i_yd, a.own_7i_loft_deg))
    if a.score_bucket is not None:
        speed_obs.append(
            Observation(
                value=SCORE_SPEED_MPH[a.score_bucket], sd=SCORE_SPEED_SD, source=E.estimated, method="score_prior"
            )
        )
    speed = combine("speed_7i_mph", speed_obs)

    hand_obs = meas(m.hand_length_cm)
    if a.glove is not None:
        hand_obs.append(Observation(value=GLOVE_HAND_CM[a.glove], sd=GLOVE_SD_CM, source=E.asked, method="glove"))
    hand = combine("hand_length_cm", hand_obs)

    # Lie need: static chart from fused body numbers (+ personal delivery offset) and any shot evidence.
    chart = static_lie(height.mean, w2f.mean)
    # d(lie)/d(height) and d(lie)/d(w2f) from the lie plane
    from .rules import LIE_PLANE

    _, b, c = LIE_PLANE
    chart_sd = math.sqrt((b * height.sd) ** 2 + (c * w2f.sd) ** 2 + STATIC_LIE_PERSONAL_SD**2)
    chart_src = E.default if E.default in height.sources and E.default in w2f.sources else E.estimated
    lie_obs = [Observation(value=chart, sd=chart_sd, source=chart_src, method="static_chart")] + meas(m.lie_need_deg)
    if m.ball_line_tilt_deg is not None and m.lie_need_deg is None:
        lie_obs.append(ball_line_lie(m.ball_line_tilt_deg))
    lie = combine("lie_need_deg", lie_obs)
    # body-number sources carry through to the chart estimate
    if chart_src == E.estimated:
        order = [E.asked, E.measured, E.estimated, E.default]
        lie.sources = sorted(set(lie.sources) | set(height.sources) | set(w2f.sources), key=order.index)
        if E.default in lie.sources and E.default not in height.sources + w2f.sources:
            lie.sources.remove(E.default)
    return Fused(
        height=height,
        w2f=w2f,
        speed=speed,
        hand=hand,
        lie=lie,
        lie_measured=m.lie_need_deg is not None or m.ball_line_tilt_deg is not None,
    )


CONTRADICTION_Z = 2.5  # asked vs measured this many combined SDs apart -> ask a follow-up (POR-15)
UNITS = {"height_cm": "cm", "wrist_to_floor_cm": "cm", "speed_7i_mph": "mph"}


def contradictions(a: Answers, m: Measurements) -> list[dict]:
    """Inputs where the golfer's answer and a measurement disagree beyond noise.

    The UI turns each into one follow-up question ("which is right?") and drops the losing source:
    params.input = answer key to clear, params.measurement = measurement key to clear.
    """
    out = []

    def check(answer_key: str, asked: list[Observation], meas_key: str, asked_val: float, asked_unit: str) -> None:
        meas = getattr(m, meas_key)
        if not asked or meas is None:
            return
        o = asked[0]
        if abs(o.value - meas.value) / math.hypot(o.sd, meas.sd) > CONTRADICTION_Z:
            out.append(
                {
                    "input": answer_key,
                    "measurement": meas_key,
                    "asked": round(asked_val, 1),
                    "asked_unit": asked_unit,
                    "measured": round(meas.value, 1),
                    "unit": UNITS[meas_key],
                }
            )

    for name in UNITS:
        if getattr(a, name) is not None:
            check(name, _asked(name, getattr(a, name)), name, getattr(a, name), UNITS[name])
    if a.carry_7i_yd is not None:
        check("carry_7i_yd", [carry_to_speed(a.carry_7i_yd, a.own_7i_loft_deg)], "speed_7i_mph", a.carry_7i_yd, "yd")
    return out


# ------------------------------------------------------------------ discretisation helpers
SPEED_EDGES = [60.0, 70.0, 80.0, 90.0]  # bucket 1 | 2 | 3 | 4 | 5 (whole-number pack ranges, see rules)


def speed_bucket_probs(est: Estimate) -> list[float]:
    edges = [-math.inf, *SPEED_EDGES, math.inf]
    return [est.prob_between(edges[i], edges[i + 1]) for i in range(5)]


def glove_from_hand(cm: float) -> str:
    import bisect

    return C.GLOVE_ORDER[bisect.bisect_right(C.GLOVE_EDGES_CM, cm)]

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


@dataclass
class Estimate:
    mean: float
    sd: float
    sources: list[EvidenceSource] = field(default_factory=list)

    def prob_between(self, lo: float, hi: float) -> float:
        return _cdf((hi - self.mean) / self.sd) - _cdf((lo - self.mean) / self.sd)


def _cdf(z: float) -> float:
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def combine(name: str, obs: list[Observation]) -> Estimate:
    mu0, sd0 = PRIOR[name]
    items = [(mu0, sd0, E.default)] + [(o.value, max(o.sd, 1e-6), o.source) for o in obs]
    w = [1 / s**2 for _, s, _ in items]
    tot = sum(w)
    mean = sum(v * wi for (v, _, _), wi in zip(items, w, strict=True)) / tot
    order = [E.asked, E.measured, E.estimated, E.default]
    tags = sorted(
        {src for (_, _, src), wi in zip(items, w, strict=True) if wi / tot >= WEIGHT_TAG_MIN}, key=order.index
    )
    return Estimate(mean=mean, sd=math.sqrt(1 / tot), sources=tags)


def _asked(name: str, value: float | None, method="questionnaire") -> list[Observation]:
    if value is None:
        return []
    bias, sd = ASKED[name]
    return [Observation(value=value - bias, sd=sd, source=E.asked, method=method)]


def carry_to_speed(carry_yd: float, loft_deg: float | None) -> Observation:
    """Reported carry -> estimated 7-iron speed, corrected for over-report and own-club loft."""
    loft = loft_deg if loft_deg is not None else REF_LOFT_DEG
    loft_sd = 0.3 if loft_deg is not None else LOFT_SD_DEG
    true_carry = max(carry_yd - CARRY_OVER_REPORT_YD, MIN_TRUE_CARRY_YD)
    yd_per_mph = YD_PER_MPH_AT_REF * (1 + CARRY_PCT_PER_DEG * (REF_LOFT_DEG - loft))
    speed = true_carry / yd_per_mph
    rel_sd = math.hypot(CARRY_SD_YD / true_carry, CARRY_PCT_PER_DEG * loft_sd)
    return Observation(
        value=speed, sd=max(speed * rel_sd, MIN_CARRY_SPEED_SD), source=E.estimated, method="carry_loft_corrected"
    )


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
    if a.carry_7i_yd is not None:
        speed_obs.append(carry_to_speed(a.carry_7i_yd, a.own_7i_loft_deg))
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
    lie = combine("lie_need_deg", lie_obs)
    # body-number sources carry through to the chart estimate
    if chart_src == E.estimated:
        order = [E.asked, E.measured, E.estimated, E.default]
        lie.sources = sorted(set(lie.sources) | set(height.sources) | set(w2f.sources), key=order.index)
        if E.default in lie.sources and E.default not in height.sources + w2f.sources:
            lie.sources.remove(E.default)
    return Fused(height=height, w2f=w2f, speed=speed, hand=hand, lie=lie, lie_measured=m.lie_need_deg is not None)


# ------------------------------------------------------------------ discretisation helpers
SPEED_EDGES = [60.0, 70.0, 80.0, 90.0]  # bucket 1 | 2 | 3 | 4 | 5 (whole-number pack ranges, see rules)


def speed_bucket_probs(est: Estimate) -> list[float]:
    edges = [-math.inf, *SPEED_EDGES, math.inf]
    return [est.prob_between(edges[i], edges[i + 1]) for i in range(5)]


def glove_from_hand(cm: float) -> str:
    import bisect

    return C.GLOVE_ORDER[bisect.bisect_right(C.GLOVE_EDGES_CM, cm)]

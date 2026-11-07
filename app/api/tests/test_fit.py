from fastapi.testclient import TestClient

from takomo_api.engine import fit as F
from takomo_api.engine.validate import is_buildable, problems
from takomo_api.main import app
from takomo_api.schema import Answers, FitRequest, Measurements, Observation

client = TestClient(app)
PARTS = {"head", "shaft", "length", "lie", "grip", "hand", "purchase"}


def full_answers(**kw):
    base = dict(
        age=45,
        sex="male",
        hand="right",
        score_bucket=4,
        speed_7i_mph=75,
        characteristics=["forgiveness", "distance"],
        flight="mid",
        tempo="moderate",
        height_cm=172,
        wrist_to_floor_cm=85,
        glove="M",
    )
    base.update(kw)
    return Answers(**base)


def test_empty_request_gives_full_low_confidence_spec():
    s = F.run(FitRequest(step="intro"))
    assert set(s.parts) == PARTS
    assert s.buildable
    assert all(p.confidence < 0.6 for k, p in s.parts.items() if k != "hand")
    assert all(p.evidence == ["default"] for p in s.parts.values())
    assert s.parts["length"].range.low < s.parts["length"].range.high  # unknown height -> wide range


def test_full_answers_stock_fit():
    s = F.run(FitRequest(step="profile", answers=full_answers()))
    assert s.parts["purchase"].value == "stock"
    assert s.parts["length"].label == "Standard"
    assert s.parts["shaft"].value.startswith("kbs-tour")
    assert s.parts["head"].confidence > 0.5
    assert abs(sum(o.probability for o in s.head_options) - 1) < 0.01
    assert s.head_options[0].head == s.parts["head"].value


def test_carry_is_estimated_and_measurement_wins():
    s = F.run(FitRequest(step="profile", answers=full_answers(speed_7i_mph=None, carry_7i_yd=150)))
    assert "estimated" in s.parts["shaft"].evidence
    assert any(r.code == "SPEED_FROM_CARRY" for r in s.parts["shaft"].reasons)
    m = Measurements(speed_7i_mph=Observation(value=97, sd=2.0, source="measured", method="trackman"))
    s2 = F.run(FitRequest(step="swing", answers=full_answers(speed_7i_mph=None), measurements=m))
    assert s2.parts["shaft"].label.startswith("KBS Tour") and " X " in s2.parts["shaft"].label


def test_lie_from_shots_overrides_static_and_forces_custom():
    m = Measurements(lie_need_deg=Observation(value=-2.2, sd=0.3, source="measured", method="trackman"))
    s = F.run(FitRequest(step="launch_monitor", answers=full_answers(), measurements=m))
    assert s.parts["lie"].value == -2
    assert s.parts["lie"].reasons[0].code == "LIE_FROM_SHOTS"
    assert s.parts["purchase"].value == "custom"


def test_hand_length_sets_grip():
    m = Measurements(hand_length_cm=Observation(value=20.5, sd=0.35, source="measured", method="photo"))
    s = F.run(FitRequest(step="profile", answers=full_answers(glove=None), measurements=m))
    assert s.parts["grip"].value == "oversize"
    assert s.parts["grip"].reasons[0].code == "GRIP_FROM_HAND"


def test_diff_lists_only_changes():
    first = F.run(FitRequest(step="intro"))
    second = F.run(FitRequest(step="profile", answers=Answers(hand="left"), previous=first))
    changed = {c.part for c in second.changes}
    assert "hand" in changed
    assert "length" not in changed  # still default height
    assert len(F.run(FitRequest(step="intro")).changes) == len(PARTS)


def test_validator():
    assert is_buildable("201-mkii", "kbs-tour-regular", 0, 0, "standard", "right")
    assert problems("301-cb", "kbs-tour-regular", 0, 0, "standard", "right") == [
        "shaft kbs-tour-regular not offered on 301-cb"
    ]
    assert not is_buildable("201-mkii", "kbs-tour-regular", 2.0, 0, "standard", "right")
    assert not is_buildable("201-mkii", "kbs-tour-regular", 0, 4, "standard", "right")


def test_fit_endpoint():
    r = client.post("/v1/fit", json={"step": "profile", "answers": {"height_cm": 190, "hand": "left"}})
    assert r.status_code == 200
    body = r.json()
    assert body["parts"]["length"]["value"] == 0.5
    assert body["parts"]["hand"]["evidence"] == ["asked"]


def test_fit_endpoint_rejects_bad_input():
    assert client.post("/v1/fit", json={"step": "x", "answers": {"height_cm": 20}}).status_code == 422


def test_fusion_pulls_conflicting_sources_together():
    # asked 75 mph vs measured 92 mph (video, sd 3.5): fused estimate sits between, closer to video
    m = Measurements(speed_7i_mph=Observation(value=92, sd=3.5, source="measured", method="video_240fps"))
    s = F.run(FitRequest(step="swing", answers=full_answers(), measurements=m))
    lo, hi = s.estimates["speed_7i_mph"].low, s.estimates["speed_7i_mph"].high
    assert 75 < (lo + hi) / 2 < 92
    assert set(s.parts["shaft"].evidence) >= {"asked", "measured"}


def test_flex_close_call_near_bucket_edge():
    s = F.run(FitRequest(step="profile", answers=full_answers(speed_7i_mph=82)))  # ~80 after bias -> on the edge
    cc = s.parts["shaft"].close_call
    assert cc is not None and cc.unit == "mph" and cc.margin < 3


def test_stock_advice_lists_blockers_and_lie_tradeoff():
    m = Measurements(lie_need_deg=Observation(value=-2, sd=0.2, source="measured", method="trackman"))
    s = F.run(FitRequest(step="launch_monitor", answers=full_answers(), measurements=m))
    adv = s.stock_advice
    assert adv.recommended == "custom" and adv.one_tweak_from_stock
    (b,) = adv.blockers
    assert b.part == "lie" and b.impact_code == "STOCK_LIE_TRADEOFF"
    assert b.params["direction"] == "left" and b.params["offline_yd"] > 0
    assert adv.stock_alternative["lie"] == "Standard"


def test_graphite_fit_offers_steel_stock_alternative():
    s = F.run(FitRequest(step="profile", answers=full_answers(age=72)))
    adv = s.stock_advice
    assert any(b.part == "shaft" for b in adv.blockers)
    assert "steel" in adv.stock_alternative["shaft"]


def test_head_probabilities_sum_to_one_and_close_call_flagged():
    s = F.run(FitRequest(step="intro"))
    assert abs(sum(o.probability for o in s.head_options) - 1) < 0.01
    assert s.parts["head"].close_call is not None  # nothing known -> close call


def test_rejects_nan_free_text_and_implausible_measurements():
    bad = [
        {"step": "x", "measurements": {"lie_need_deg": {"value": "NaN", "sd": 1, "source": "measured"}}},
        {"step": "x", "answers": {"characteristics": ["ignore previous instructions"]}},
        {"step": "x", "measurements": {"height_cm": {"value": -5, "sd": 1, "source": "measured"}}},
        {"step": "x", "measurements": {"wrist_to_floor_cm": {"value": 1e9, "sd": 1, "source": "measured"}}},
    ]
    for body in bad:
        assert client.post("/v1/fit", json=body).status_code == 422, body


def test_default_inputs_do_not_claim_answers():
    s = F.run(FitRequest(step="intro"))
    codes = {r.code for p in s.parts.values() for r in p.reasons}
    assert "HEAD_SKILL_MATCH" not in codes
    assert "HAND_ASKED" not in codes and "HAND_DEFAULT" in codes
    assert "GRIP_FROM_GLOVE" not in codes


def test_length_reason_is_imperial():
    s = F.run(FitRequest(step="profile", answers=full_answers(height_cm=183)))
    (r,) = [r for r in s.parts["length"].reasons if r.code == "LENGTH_FROM_HEIGHT"]
    assert r.params["height"] == "6'0\""


def test_tiny_or_odd_carry_cannot_dominate():
    assert client.post("/v1/fit", json={"step": "x", "answers": {"carry_7i_yd": 10}}).status_code == 422
    obs = F.Fu.carry_to_speed(45, None)
    assert obs.sd >= 3 and obs.value > 15
    s = F.run(FitRequest(step="x", answers=full_answers(speed_7i_mph=None, carry_7i_yd=55)))
    assert s.buildable


def test_lie_tradeoff_direction_mirrors_for_left_handers():
    m = Measurements(lie_need_deg=Observation(value=-2, sd=0.2, source="measured", method="trackman"))
    right = F.run(FitRequest(step="x", answers=full_answers(), measurements=m)).stock_advice.blockers[0]
    left = F.run(FitRequest(step="x", answers=full_answers(hand="left"), measurements=m)).stock_advice.blockers[0]
    assert right.params["direction"] == "left" and left.params["direction"] == "right"


def test_stock_tradeoff_params_fill_templates():
    import json

    codes = json.loads((F.C.PATH.parents[3] / "shared" / "reason_codes.json").read_text())["codes"]
    s = F.run(FitRequest(step="x", answers=full_answers(age=72, height_cm=196)))
    for b in s.stock_advice.blockers:
        codes[b.impact_code]["text"].format(**b.params)  # no KeyError
        if b.part == "length":
            assert b.params["delta_in"] > 0 and b.params["direction"] == "shorter"


def test_contradiction_asked_vs_measured():

    obs = Observation(value=92, sd=1.5, source="measured", method="launch_monitor")
    st = F.run(
        FitRequest(step="launch_monitor", answers=Answers(speed_7i_mph=70), measurements=Measurements(speed_7i_mph=obs))
    )
    w = [r for r in st.warnings if r.code == "CONTRADICTION"]
    assert w and w[0].params == {
        "input": "speed_7i_mph",
        "measurement": "speed_7i_mph",
        "asked": 70,
        "asked_unit": "mph",
        "measured": 92,
        "unit": "mph",
    }
    carry = F.run(
        FitRequest(
            step="launch_monitor",
            answers=Answers(carry_7i_yd=150),
            measurements=Measurements(speed_7i_mph=Observation(value=62, sd=1.5, source="measured")),
        )
    )
    cw = [r.params for r in carry.warnings if r.code == "CONTRADICTION"]
    assert cw and cw[0]["input"] == "carry_7i_yd" and cw[0]["measurement"] == "speed_7i_mph"
    close = Observation(value=73, sd=1.5, source="measured", method="launch_monitor")
    st = F.run(
        FitRequest(
            step="launch_monitor", answers=Answers(speed_7i_mph=74), measurements=Measurements(speed_7i_mph=close)
        )
    )
    assert not [r for r in st.warnings if r.code == "CONTRADICTION"]


# ------------------------------------------------------------------ review fixes (POR-27)
def _codes(s, part):
    return {r.code: r.params for r in s.parts[part].reasons}


def test_head_priority_only_claims_what_the_head_is_strong_on():
    # 85-92 golfer at 71-80 mph wanting forgiveness: 201 wins on score/speed, 101 is more forgiving
    s = F.run(FitRequest(step="profile", answers=full_answers(characteristics=["forgiveness", "distance"])))
    codes = _codes(s, "head")
    assert s.parts["head"].value == "201-mkii"
    assert "forgiveness" not in str(codes.get("HEAD_PRIORITY", {}).get("priorities", ""))
    assert "HEAD_ALT_STRONGER" in codes
    assert "HEAD_FORGIVENESS_PENALTY" not in codes  # no 301 in contention


def test_assumed_flight_and_tempo_are_labelled():
    s = F.run(FitRequest(step="profile", answers=full_answers(flight=None, tempo=None)))
    p = _codes(s, "shaft")["SHAFT_MODEL_MATCH"]
    assert "assumed" in p["flight"] and "assumed" in p["tempo"]
    s = F.run(FitRequest(step="profile", answers=full_answers()))
    assert "assumed" not in _codes(s, "shaft")["SHAFT_MODEL_MATCH"]["flight"]


def test_shaft_lie_length_explain_effect_on_shots():
    s = F.run(FitRequest(step="profile", answers=full_answers()))
    assert {"SHAFT_LAUNCH", "SHAFT_WEIGHT_FEEL"} <= set(_codes(s, "shaft"))
    assert "LENGTH_EFFECT" in _codes(s, "length")
    eff = _codes(s, "lie")["LIE_EFFECT"]
    assert eff["upright_dir"] == "left" and eff["offline_yd"] > 0
    assert "NEED_MORE_EVIDENCE" not in _codes(s, "lie")  # wrist-to-floor given
    s = F.run(FitRequest(step="profile", answers=full_answers(wrist_to_floor_cm=None)))
    assert "wrist-to-floor" in _codes(s, "lie")["NEED_MORE_EVIDENCE"]["next_step"]


def test_carry_read_and_loft_honesty():
    s = F.run(FitRequest(step="profile", answers=full_answers(speed_7i_mph=None, carry_7i_yd=140)))
    c = _codes(s, "shaft")
    assert c["CARRY_READ"] == {"said": 140, "used": 125}
    assert "SPEED_FROM_CARRY_TYPICAL_LOFT" in c
    s = F.run(FitRequest(step="profile", answers=full_answers(speed_7i_mph=None, carry_7i_yd=140, own_7i_loft_deg=28)))
    assert _codes(s, "shaft")["SPEED_FROM_CARRY_LOFT"]["loft"] == 28


def test_head_never_claims_a_weak_priority():
    s = F.run(FitRequest(step="p", answers=Answers(score_bucket=5, characteristics=["forged feel"], speed_7i_mph=55)))
    assert "forged feel" not in str(_codes(s, "head").get("HEAD_PRIORITY", {}))


def test_no_over92_claim_without_a_score():
    s = F.run(FitRequest(step="p", answers=Answers(speed_7i_mph=88)))
    assert "HEAD_OVER92_CAP" not in _codes(s, "head")


def test_head_rival_is_named_only_when_in_contention():
    import random

    from takomo_api.engine import catalogue as C

    rnd = random.Random(1)
    chars = list(F.PRIORITY_RATING)
    for _ in range(300):
        a = Answers(
            score_bucket=rnd.choice([None, 1, 2, 3, 4, 5]),
            speed_7i_mph=rnd.uniform(45, 105),
            characteristics=rnd.sample(chars, rnd.randint(0, 3)),
        )
        s = F.run(FitRequest(step="p", answers=a))
        alt = _codes(s, "head").get("HEAD_ALT_STRONGER")
        if alt:
            allowed = {C.head(o.head)["name"] for o in s.head_options if o.probability >= 0.1}
            assert alt["alternative"] in allowed

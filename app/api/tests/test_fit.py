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
    assert all(p.confidence <= 0.2 for p in s.parts.values())
    assert all("default" in p.evidence for p in s.parts.values())


def test_full_answers_stock_fit():
    s = F.run(FitRequest(step="profile", answers=full_answers()))
    assert s.parts["purchase"].value == "stock"
    assert s.parts["length"].label == "Standard"
    assert s.parts["shaft"].value.startswith("kbs-tour")
    assert s.parts["head"].confidence == 0.7
    assert abs(sum(o.probability for o in s.head_options) - 1) < 0.01
    assert s.head_options[0].head == s.parts["head"].value


def test_carry_is_estimated_and_measurement_wins():
    s = F.run(FitRequest(step="profile", answers=full_answers(speed_7i_mph=None, carry_7i_yd=150)))
    assert "estimated" in s.parts["shaft"].evidence
    assert any(r.code == "SPEED_FROM_CARRY" for r in s.parts["shaft"].reasons)
    m = Measurements(speed_7i_mph=Observation(value=92, sd=3.5, source="measured", method="video_240fps"))
    s2 = F.run(FitRequest(step="swing", answers=full_answers(), measurements=m))
    assert s2.parts["shaft"].label.startswith("KBS Tour") and " X " in s2.parts["shaft"].label


def test_lie_from_shots_overrides_static_and_forces_custom():
    m = Measurements(lie_need_deg=Observation(value=-2.2, sd=0.8, source="measured", method="ball_line"))
    s = F.run(FitRequest(step="launch_monitor", answers=full_answers(), measurements=m))
    assert s.parts["lie"].value == -2
    assert s.parts["lie"].reasons[0].code == "LIE_FROM_SHOTS"
    assert s.parts["purchase"].value == "custom"


def test_hand_length_sets_grip():
    m = Measurements(hand_length_cm=Observation(value=20.5, sd=0.35, source="measured", method="photo"))
    s = F.run(FitRequest(step="profile", answers=full_answers(), measurements=m))
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

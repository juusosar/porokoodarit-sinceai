import pytest
from fastapi.testclient import TestClient

from takomo_api.config import get_settings
from takomo_api.engine import fit as F
from takomo_api.llm import explain as X
from takomo_api.llm import registry
from takomo_api.llm.base import LLMError
from takomo_api.main import create_app
from takomo_api.schema import Answers, FitRequest

STATE = F.run(
    FitRequest(
        step="profile",
        answers=Answers(age=45, sex="male", hand="right", score_bucket=4, speed_7i_mph=75, height_cm=190, glove="M"),
    )
)


class FakeProvider:
    name = "fake"

    def __init__(self, out=None, err=None):
        self.out, self.err, self.calls = out, err, []

    def available(self):
        return True

    def generate_json(self, req):
        self.calls.append(req)
        if self.err:
            raise self.err
        return self.out


@pytest.fixture
def fake(monkeypatch):
    def use(out=None, err=None):
        p = FakeProvider(out, err)
        monkeypatch.setitem(registry.providers(), "fake", p)
        registry.set_role("step_line", registry.RoleConfig("fake", "fake-1"))
        return p

    yield use
    registry.reset()


def good_out():
    head = STATE.parts["head"].label
    return {
        "spoken_line": f"Nice. {head} it is, and +0.5 in length for your height.",
        "caption": f"{head}, +0.5 in longer.",
        "parts": {"head": "Forgiving and long.", "length": "+0.5 in keeps posture natural."},
    }


def test_llm_output_passes_guard(fake):
    p = fake(good_out())
    e = X.explain(STATE)
    assert e.source == "llm" and e.provider == "fake" and e.parts["length"]
    # only engine labels/codes go to the model, never raw answers
    assert "190" not in p.calls[0].user.split("FIT_STATE")[1]


def test_guard_blocks_wrong_head_and_numbers(fake):
    allowed = {F.C.head(o.head)["name"] for o in STATE.head_options if o.probability >= 0.1}
    allowed.add(STATE.parts["head"].label)
    other = next(h["name"] for h in F.C.load()["heads"] if h["name"] not in allowed)
    for bad in (
        {**good_out(), "spoken_line": f"Go with the {other}."},
        {**good_out(), "caption": "Lie +3° upright."},
    ):
        fake(bad)
        e = X.explain(STATE)
        assert e.source == "template" and e.fallback_reason.startswith("guard")


def test_provider_error_falls_back(fake):
    fake(err=LLMError("timeout"))
    e = X.explain(STATE)
    assert e.source == "template" and "timeout" in e.fallback_reason
    assert set(e.parts) == set(STATE.parts)
    assert "?" not in " ".join(e.parts.values())  # all template params filled


def test_no_key_uses_templates():
    registry.reset()
    e = X.explain(STATE, "final_walkthrough")
    assert e.source == "template"
    assert STATE.parts["head"].label in e.spoken_line


def test_settings_locked_outside_demo_mode():
    c = TestClient(create_app())
    assert c.get("/v1/settings").json()["roles"]["step_line"]["provider"] == "gemini"
    r = c.put("/v1/settings", json={"step_line": {"provider": "template", "model": "-"}})
    assert r.status_code == 403


def test_settings_switch_in_demo_mode(monkeypatch):
    monkeypatch.setenv("TAKOMO_DEMO_MODE", "true")
    get_settings.cache_clear()
    try:
        c = TestClient(create_app())
        r = c.put("/v1/settings", json={"step_line": {"provider": "template", "model": "-"}})
        assert r.status_code == 200 and r.json()["roles"]["step_line"]["provider"] == "template"
        assert c.put("/v1/settings", json={"step_line": {"provider": "nope", "model": "x"}}).status_code == 422
        body = c.post("/v1/explain", json={"state": STATE.model_dump(mode="json")}).json()
        assert body["source"] == "template"
    finally:
        registry.reset()
        get_settings.cache_clear()

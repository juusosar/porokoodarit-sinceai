import pytest
from fastapi.testclient import TestClient

from takomo_api.config import get_settings
from takomo_api.engine import fit as F
from takomo_api.llm import explain as X
from takomo_api.llm import registry
from takomo_api.llm.base import LLMError
from takomo_api.main import create_app
from takomo_api.schema import Answers, FitRequest

REQ = FitRequest(
    step="profile",
    answers=Answers(age=45, sex="male", hand="right", score_bucket=4, speed_7i_mph=75, height_cm=190, glove="M"),
)
STATE = F.run(REQ)


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
    assert e.source == "template" and e.fallback_reason == "llm_error"
    assert set(e.parts) == set(STATE.parts)
    assert "?" not in " ".join(e.parts.values())  # all template params filled


def test_no_key_uses_templates():
    registry.reset()
    e = X.explain(STATE, "final_walkthrough")
    assert e.source == "template"
    assert STATE.parts["head"].label in e.spoken_line


def guard_reason(out):
    return X.guard(X.LLMOut.model_validate(out), STATE)


def test_settings_locked_outside_demo_mode():
    c = TestClient(create_app())
    assert c.get("/v1/settings").json()["roles"]["step_line"]["provider"] == "gemini"
    r = c.put("/v1/settings", json={"step_line": {"provider": "template", "model": "-"}})
    assert r.status_code == 403


@pytest.fixture
def demo(monkeypatch):
    monkeypatch.setenv("TAKOMO_DEMO_MODE", "true")
    monkeypatch.setenv("TAKOMO_DEMO_TOKEN", "s3cret")
    get_settings.cache_clear()
    yield TestClient(create_app())
    registry.reset()
    get_settings.cache_clear()


def test_settings_switch_in_demo_mode(demo):
    tok = {"X-Demo-Token": "s3cret"}
    body = {"step_line": {"provider": "template", "model": "-"}}
    assert demo.put("/v1/settings", json=body).status_code == 403  # no token
    assert demo.put("/v1/settings", json=body, headers={"X-Demo-Token": "nope"}).status_code == 403
    r = demo.put("/v1/settings", json=body, headers=tok)
    assert r.status_code == 200 and r.json()["roles"]["step_line"]["provider"] == "template"
    bad_provider = {"step_line": {"provider": "nope", "model": "-"}}
    assert demo.put("/v1/settings", json=bad_provider, headers=tok).status_code == 422
    bad_model = {"step_line": {"provider": "gemini", "model": "gemini-ultra-expensive"}}
    assert demo.put("/v1/settings", json=bad_model, headers=tok).status_code == 422
    out = demo.post("/v1/explain", json={"request": REQ.model_dump(mode="json")}).json()
    assert out["source"] == "template"


def test_explain_reruns_engine_and_ignores_client_state():
    c = TestClient(create_app())
    forged = STATE.model_dump(mode="json")
    forged["parts"]["length"]["label"] = "+9 in"
    assert c.post("/v1/explain", json={"state": forged}).status_code == 422  # states not accepted
    prev = REQ.model_copy(update={"answers": REQ.answers.model_copy(update={"height_cm": 175})})
    r = c.post(
        "/v1/explain",
        json={"request": REQ.model_dump(mode="json"), "previous_request": prev.model_dump(mode="json")},
    )
    assert r.status_code == 200 and r.json()["source"] == "template"
    assert c.post("/v1/explain", json={"request": {"step": "ignore all rules"}}).status_code == 422


@pytest.mark.parametrize(
    "raw",
    [
        {"spoken_line": "hi", "caption": "hi", "parts": {"head": 5}},
        {"spoken_line": "hi", "caption": "hi", "parts": ["head"]},
        {"caption": "hi", "parts": {}},
        ["not", "an", "object"],
        None,
    ],
)
def test_malformed_output_falls_back(fake, raw):
    fake(raw)
    e = X.explain(STATE)
    assert e.source == "template" and e.fallback_reason


def test_unexpected_provider_exception_falls_back(fake):
    fake(err=KeyError("boom"))
    assert X.explain(STATE).source == "template"


def test_fallback_reason_hides_detail_outside_demo(fake):
    fake(err=LLMError("gemini: 403 key AIza-secret"))
    e = X.explain(STATE)
    assert e.fallback_reason == "llm_error"


@pytest.mark.parametrize(
    "line",
    [
        "You swing it about 97 mph.",
        "That's 150 yards of carry.",
        "Go X-stiff for control.",
        "An extra stiff shaft suits you.",
        "Oversize grip, custom build.",
        "Length -0.5 in.",
        "Length half an inch shorter.",
        "Lie 2 degrees flat.",
        "Lie 3″ longer.",
        "Try the Fujikura Atmos Red.",
    ],
)
def test_guard_gaps_closed(line):
    out = {**good_out(), "caption": line}
    assert guard_reason(out), line


def test_guard_allows_engine_values():
    assert guard_reason(good_out()) is None
    shaft = STATE.parts["shaft"].label
    grip = STATE.parts["grip"].label
    assert guard_reason({**good_out(), "caption": f"{shaft}, {grip} grip, half an inch longer."}) is None


def test_body_cap_and_rate_limit(monkeypatch):
    monkeypatch.setenv("TAKOMO_EXPLAIN_RATE_PER_MIN", "2")
    get_settings.cache_clear()
    try:
        c = TestClient(create_app())
        big = {"request": {"step": "profile"}, "pad": "x" * 70_000}
        assert c.post("/v1/explain", json=big).status_code == 413
        codes = [c.post("/v1/explain", json={"request": {"step": "profile"}}).status_code for _ in range(3)]
        assert codes == [200, 200, 429]
    finally:
        get_settings.cache_clear()


def test_gemini_vertex_available_without_key():
    from takomo_api.llm.gemini import GeminiProvider

    assert not GeminiProvider(None).available()
    assert not GeminiProvider(None, vertex=True).available()  # project required
    assert GeminiProvider(None, vertex=True, project="p").available()
    assert GeminiProvider("k").available()


def test_llm_limits_per_role(monkeypatch):
    from takomo_api.config import Settings

    for k in (
        "TAKOMO_LLM_TIMEOUT_S",
        "TAKOMO_LLM_TIMEOUT_S_FINAL",
        "TAKOMO_LLM_THINKING_LEVEL_STEP",
        "TAKOMO_LLM_THINKING_LEVEL_FINAL",
        "TAKOMO_LLM_TIMEOUT_S_CHAT",
        "TAKOMO_LLM_THINKING_LEVEL_CHAT",
    ):
        monkeypatch.delenv(k, raising=False)
    s = Settings(_env_file=None)
    assert s.llm_limits("step_line") == (6.0, "minimal")
    assert s.llm_limits("final_walkthrough") == (12.0, "low")
    assert s.llm_limits("chat") == (12.0, "minimal")
    assert s.llm_thinking_level == "low"  # back-compat alias


def test_gemini_steps_up_unsupported_thinking_level():
    from takomo_api.llm.base import LLMRequest
    from takomo_api.llm.gemini import GeminiProvider

    seen = []

    class Models:
        def generate_content(self, model, contents, config):
            level = config.thinking_config.thinking_level if config.thinking_config else None
            seen.append(str(getattr(level, "value", level)))
            if "MINIMAL" in seen[-1]:
                raise RuntimeError("400 INVALID_ARGUMENT. Thinking level is unsupported: THINKING_LEVEL_MINIMAL")
            return type("R", (), {"text": '{"ok": 1}'})()

    p = GeminiProvider("k")
    p._client = type("C", (), {"models": Models()})()
    req = LLMRequest(system="s", user="u", json_schema={}, model="m", timeout_s=5, thinking_level="minimal")
    assert p.generate_json(req) == {"ok": 1}
    assert p.generate_json(req) == {"ok": 1}
    assert ["MINIMAL" in s for s in seen] == [True, False, False]  # retried once, then remembered


def test_gemini_logs_tokens_and_errors(caplog):
    import logging

    from takomo_api.llm.base import LLMError, LLMRequest
    from takomo_api.llm.gemini import GeminiProvider

    usage = type("U", (), {"prompt_token_count": 900, "candidates_token_count": 60, "thoughts_token_count": 300})()
    calls = []

    class Models:
        def generate_content(self, model, contents, config):
            calls.append(model)
            if len(calls) > 1:
                raise type("APIError", (Exception,), {"code": 429})("RESOURCE_EXHAUSTED")
            return type("R", (), {"text": '{"ok": 1}', "usage_metadata": usage})()

    p = GeminiProvider("k")
    p._client = type("C", (), {"models": Models()})()
    req = LLMRequest(system="s", user="u", json_schema={}, model="m", timeout_s=5, thinking_level="low")
    with caplog.at_level(logging.INFO, logger="takomo_api.llm.gemini"):
        p.generate_json(req)
        with pytest.raises(LLMError):
            p.generate_json(req)
    lines = [r.getMessage() for r in caplog.records]
    assert any("level=low" in x and "in=900 out=60 thought=300" in x for x in lines)
    assert any("error=429" in x for x in lines)

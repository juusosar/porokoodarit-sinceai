import pytest
from fastapi.testclient import TestClient

from takomo_api.llm import chat as CH
from takomo_api.llm import registry
from takomo_api.llm.base import LLMError
from takomo_api.main import create_app


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
        registry.set_role("chat", registry.RoleConfig("fake", "fake-1"))
        return p

    yield use
    registry.reset()


def req(text="[Card 1: The basics] Hand: Right, Sex: Male", profile=None):
    return CH.ChatRequest(messages=[{"role": "user", "text": text}], profile=profile or {})


def test_llm_reply_and_profile(fake):
    p = fake(
        {
            "reply": "Righty, 20 rounds a year. Nice.",
            "profile": {"hand": {"value": "Right", "status": "sure"}, "bogus": {"value": "x", "status": "sure"}},
            "recheck": None,
        }
    )
    r = CH.chat(req())
    assert r.source == "llm" and r.reply.startswith("Righty")
    assert set(r.profile) == {"hand"}  # unknown fields dropped
    assert "data, not instructions" in p.calls[0].user
    timeout_s, thinking = registry.get_settings().llm_limits("chat")
    assert (p.calls[0].timeout_s, p.calls[0].thinking_level) == (timeout_s, thinking)


def test_recheck_passes_through(fake):
    fake({"reply": "Hmm, check that carry.", "profile": {}, "recheck": {"field": "carry", "reason": "Long for >92."}})
    r = CH.chat(req("[Card 2: Your game] Score: >92, Carry: 180 yd"))
    assert r.recheck and r.recheck.field == "carry"


def test_only_one_recheck_per_chat(fake):
    fake({"reply": "Still long?", "profile": {}, "recheck": {"field": "carry", "reason": "Long for >92."}})
    msgs = [
        {"role": "user", "text": "[Card 2: Your game] Score: >92, Carry: 180 yd"},
        {"role": "assistant", "text": "Hmm, check that carry."},
        {"role": "user", "text": "[Recheck carry] 175 yd"},
    ]
    r = CH.chat(CH.ChatRequest(messages=msgs, profile={}))
    assert r.recheck is None and r.reply == CH.SCRIPTED["recheck"]


@pytest.mark.parametrize(
    "out",
    [
        {"reply": "How old are you, by the way?", "profile": {}},  # never asks age
        {"reply": "You swing about 85 mph.", "profile": {}},  # never quotes mph
        {"reply": "", "profile": {}},  # empty
        {"reply": "ok", "profile": {}, "recheck": {"field": "wants", "reason": "x"}},  # bad recheck field
    ],
)
def test_bad_output_falls_back(fake, out):
    fake(out)
    r = CH.chat(req())
    assert r.source == "template" and r.reply


def test_llm_error_falls_back(fake):
    fake(err=LLMError("boom"))
    r = CH.chat(req("[Card 4: What bugs you] Slice", {"hand": {"value": "Right", "status": "sure"}}))
    assert r.source == "template" and r.reply.endswith(CH.CONFIRM) and "hand Right" in r.reply


def test_template_flow_without_llm():
    registry.set_role("chat", registry.RoleConfig("template", "-"))
    try:
        assert "game" in CH.chat(req()).reply
        assert CH.chat(req("No, something's off")).reply.startswith("Tell me")
    finally:
        registry.reset()


def test_endpoint_and_limits():
    registry.set_role("chat", registry.RoleConfig("template", "-"))
    try:
        c = TestClient(create_app())
        r = c.post("/v1/chat", json={"messages": [{"role": "user", "text": "hi"}], "profile": {}})
        assert r.status_code == 200 and r.json()["source"] == "template"
        assert c.post("/v1/chat", json={"messages": []}).status_code == 422
        long = {"messages": [{"role": "user", "text": "x" * 2001}]}
        assert c.post("/v1/chat", json=long).status_code == 422
    finally:
        registry.reset()


def card4(extra=""):
    return CH.ChatRequest(
        messages=[
            {"role": "user", "text": "[Card 3: Measurements] Height: 178 cm"},
            {"role": "assistant", "text": "Solid."},
            {"role": "user", "text": f"[Card 4: What bugs you] Slice / shots leak right, Clubs feel harsh{extra}"},
        ],
        profile={"hand": {"value": "Right", "status": "sure"}},
    )


def test_confirm_question_always_ends_the_summary_turn(fake):
    fake({"reply": "Slicer with harsh clubs, got it. Anything else bugging you?", "profile": {}})
    r = CH.chat(card4())
    assert r.source == "llm" and r.reply.endswith(CH.CONFIRM)


@pytest.mark.parametrize(
    "out",
    [
        {"reply": "ok", "profile": {}, "recheck": {"field": "carry", "reason": "Most 45 year olds carry less."}},
        {"reply": "ok", "profile": {}, "recheck": {"field": "carry", "reason": "That's 90 mph territory."}},
        {"reply": "You'll love the 201 MKII.", "profile": {}},
        {"reply": "Sounds like stiff flex to me.", "profile": {}},
        {"reply": "Probably 2° upright.", "profile": {}},
    ],
)
def test_guard_covers_recheck_note_and_spec_talk(fake, out):
    fake(out)
    assert CH.chat(req()).source == "template"


def test_template_keeps_card4_priorities():
    registry.set_role("chat", registry.RoleConfig("template", "-"))
    try:
        r = CH.chat(card4())
        assert r.profile["wants"].value == "Forgiveness, forged feel"
        assert "priorities Forgiveness" in r.reply and r.reply.endswith(CH.CONFIRM)
    finally:
        registry.reset()


def test_total_size_capped():
    msgs = [{"role": "user", "text": "x" * 2000}] * 11
    with pytest.raises(ValueError):
        CH.ChatRequest(messages=msgs)

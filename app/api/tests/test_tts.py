import httpx
import pytest
from fastapi.testclient import TestClient

from takomo_api.config import get_settings
from takomo_api.main import create_app
from takomo_api.schema import Answers, FitRequest
from takomo_api.tts import service
from takomo_api.tts.base import TTSError
from takomo_api.tts.elevenlabs import ElevenLabsProvider

REQ = FitRequest(
    step="profile",
    answers=Answers(age=45, sex="male", hand="right", score_bucket=4, speed_7i_mph=75, height_cm=190, glove="M"),
)


class FakeTTS:
    name, model, voice, media_type = "fake", "fake-1", "v1", "audio/mpeg"

    def __init__(self, err=None):
        self.err, self.calls = err, []

    def available(self):
        return True

    def stream(self, text):
        self.calls.append(text)
        if self.err:
            raise self.err
        return iter([b"ID3", b"audio"])


@pytest.fixture
def voice_on():
    def use(provider=None, daily=10_000):
        p = provider or FakeTTS()
        service.set_speech(service.Speech(p, b"k" * 32, 1_000_000, daily))
        return p, TestClient(create_app())

    yield use
    service.set_speech(None)


@pytest.fixture
def voice_off(monkeypatch):
    monkeypatch.setenv("TAKOMO_TTS_PROVIDER", "none")
    get_settings.cache_clear()
    service.set_speech(None)
    yield TestClient(create_app())
    service.set_speech(None)
    get_settings.cache_clear()


def explain(c):
    r = c.post("/v1/explain", json={"request": REQ.model_dump(mode="json")})
    assert r.status_code == 200
    return r.json()


def test_off_by_default_no_route_no_token(voice_off):
    e = explain(voice_off)
    assert e["audio_token"] is None
    assert voice_off.get("/v1/speak", params={"text": "hi", "token": "x" * 32}).status_code == 404
    assert voice_off.get("/v1/settings").json()["voice"]["on"] is False


def test_signed_line_streams_and_caches(voice_on):
    p, c = voice_on()
    e = explain(c)
    q = {"text": e["spoken_line"], "token": e["audio_token"]}
    r = c.get("/v1/speak", params=q)
    assert r.status_code == 200 and r.content == b"ID3audio"
    assert r.headers["content-type"] == "audio/mpeg" and r.headers["x-cache"] == "miss"
    r2 = c.get("/v1/speak", params=q)
    assert r2.content == b"ID3audio" and r2.headers["x-cache"] == "hit"
    assert len(p.calls) == 1


def test_unsigned_or_tampered_text_refused(voice_on):
    p, c = voice_on()
    e = explain(c)
    r = c.get("/v1/speak", params={"text": e["spoken_line"] + " buy now", "token": e["audio_token"]})
    assert r.status_code == 403
    assert c.get("/v1/speak", params={"text": "free tts", "token": "0" * 32}).status_code == 403
    assert p.calls == []


def test_provider_error_is_502_and_budget_is_503(voice_on):
    _, c = voice_on(FakeTTS(err=TTSError("http 401")))
    e = explain(c)
    assert c.get("/v1/speak", params={"text": e["spoken_line"], "token": e["audio_token"]}).status_code == 502
    _, c = voice_on(daily=5)
    e = explain(c)
    assert c.get("/v1/speak", params={"text": e["spoken_line"], "token": e["audio_token"]}).status_code == 503


def test_cache_is_bounded():
    cache = service.AudioCache(10)
    cache.put("a", b"12345")
    cache.put("b", b"12345")
    cache.put("c", b"12345")
    assert cache.get("a") is None and cache.get("c") == b"12345"


def test_elevenlabs_request_shape():
    seen = {}

    def handler(req: httpx.Request):
        seen["url"], seen["key"], seen["body"] = str(req.url), req.headers["xi-api-key"], req.content
        return httpx.Response(200, content=b"mp3bytes")

    p = ElevenLabsProvider("sk", voice="VOICE", transport=httpx.MockTransport(handler))
    assert b"".join(p.stream("Hello")) == b"mp3bytes"
    assert "/v1/text-to-speech/VOICE/stream" in seen["url"] and "output_format=mp3_44100_64" in seen["url"]
    assert seen["key"] == "sk" and b'"eleven_flash_v2_5"' in seen["body"]


def test_elevenlabs_error_raises_before_audio():
    p = ElevenLabsProvider("bad", voice="V", transport=httpx.MockTransport(lambda r: httpx.Response(401, text="no")))
    with pytest.raises(TTSError, match="401"):
        p.stream("Hello")


def test_no_key_means_unavailable():
    assert not ElevenLabsProvider(None, voice="V").available()


class Flaky(FakeTTS):
    def __init__(self, first_err=None, mid_err=None):
        super().__init__()
        self.first_err, self.mid_err = first_err, mid_err

    def stream(self, text):
        self.calls.append(text)

        def gen():
            if self.first_err:
                raise self.first_err
            yield b"ID3"
            if self.mid_err:
                raise self.mid_err
            yield b"rest"

        return gen()


def test_error_before_first_byte_is_502_and_refunded(voice_on):
    _, c = voice_on(Flaky(first_err=httpx.ReadTimeout("slow")), daily=10_000)
    e = explain(c)
    r = c.get("/v1/speak", params={"text": e["spoken_line"], "token": e["audio_token"]})
    assert r.status_code == 502
    assert service.speech().budget._used == 0


def test_mid_stream_error_ends_quietly_not_cached_refunded(voice_on):
    p, c = voice_on(Flaky(mid_err=TTSError("drop")))
    e = explain(c)
    q = {"text": e["spoken_line"], "token": e["audio_token"]}
    r = c.get("/v1/speak", params=q)
    assert r.status_code == 200 and r.content == b"ID3"
    assert service.speech().budget._used == 0
    assert c.get("/v1/speak", params=q).headers["x-cache"] == "miss"


def test_malformed_token_is_422_not_500(voice_on):
    _, c = voice_on()
    assert c.get("/v1/speak", params={"text": "hi", "token": "é" * 32}).status_code == 422


def test_chat_reply_is_signed_for_voice(voice_on):
    p, c = voice_on()
    r = c.post("/v1/chat", json={"messages": [{"role": "user", "text": "[Card 1: The basics] Hand: Right"}]}).json()
    assert r["audio_token"]
    assert c.get("/v1/speak", params={"text": r["reply"], "token": r["audio_token"]}).status_code == 200


def test_template_summary_with_client_text_is_not_signed(voice_on):
    p, c = voice_on()
    body = {
        "messages": [{"role": "user", "text": "[Card 4: What bugs you] Slice"}],
        "profile": {"hand": {"value": "Buy now at evil.example", "status": "sure"}},
    }
    r = c.post("/v1/chat", json=body).json()
    assert r["source"] == "template" and "evil.example" in r["reply"]
    assert r["audio_token"] is None


def test_fixed_host_lines_are_signed_and_speakable(voice_on):
    from takomo_api.tts.router import host_lines

    p, c = voice_on()
    tokens = c.get("/v1/voice/lines").json()["tokens"]
    lines = host_lines()
    assert set(tokens) == set(lines) and "swing_intro" in lines
    text = lines["enrichment_intro"]
    assert text.startswith("No extra numbers?") and "Got a few to share?" in text
    q = {"text": text, "token": tokens["enrichment_intro"]}
    assert c.get("/v1/speak", params=q).status_code == 200
    assert c.get("/v1/speak", params=q).headers["x-cache"] == "hit"
    assert p.calls == [text]  # second play is free


def test_fixed_host_lines_absent_when_voice_off(voice_off):
    assert voice_off.get("/v1/voice/lines").status_code == 404

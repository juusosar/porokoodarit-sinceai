"""Signed, cached, budgeted speech for host lines.

Only text the API itself produced can be spoken: /v1/explain signs each spoken_line (HMAC) and /v1/speak
checks the signature, so the endpoint is not an open TTS proxy on our ElevenLabs bill.
Audio is cached in memory by (provider, model, voice, text): template lines and repeat lines cost nothing.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import threading
import time
from collections import OrderedDict
from collections.abc import Iterator

from ..config import get_settings
from .base import TTSError, TTSProvider
from .elevenlabs import ElevenLabsProvider

log = logging.getLogger(__name__)


class AudioCache:
    """LRU of finished clips, bounded by total bytes."""

    def __init__(self, max_bytes: int):
        self.max_bytes = max_bytes
        self._items: OrderedDict[str, bytes] = OrderedDict()
        self._size = 0
        self._lock = threading.Lock()

    def get(self, key: str) -> bytes | None:
        with self._lock:
            v = self._items.get(key)
            if v is not None:
                self._items.move_to_end(key)
            return v

    def put(self, key: str, value: bytes) -> None:
        if len(value) > self.max_bytes:
            return
        with self._lock:
            old = self._items.pop(key, None)
            if old is not None:
                self._size -= len(old)
            self._items[key] = value
            self._size += len(value)
            while self._size > self.max_bytes:
                _, v = self._items.popitem(last=False)
                self._size -= len(v)


class DailyBudget:
    """Characters sent to the paid provider per UTC day, per instance. Cache hits are free."""

    def __init__(self, max_chars: int):
        self.max_chars = max_chars
        self._day = ""
        self._used = 0
        self._lock = threading.Lock()

    def take(self, n: int) -> bool:
        day = time.strftime("%Y-%m-%d", time.gmtime())
        with self._lock:
            if day != self._day:
                self._day, self._used = day, 0
            if self._used + n > self.max_chars:
                return False
            self._used += n
            return True


class Speech:
    def __init__(self, provider: TTSProvider | None, signing_key: bytes, cache_bytes: int, daily_chars: int):
        self.provider = provider
        self._key = signing_key
        self.cache = AudioCache(cache_bytes)
        self.budget = DailyBudget(daily_chars)

    def available(self) -> bool:
        return self.provider is not None and self.provider.available()

    def sign(self, text: str) -> str | None:
        if not self.available():
            return None
        return hmac.new(self._key, text.encode(), hashlib.sha256).hexdigest()[:32]

    def verify(self, text: str, token: str) -> bool:
        expected = self.sign(text)
        return expected is not None and hmac.compare_digest(expected, token)

    def _cache_key(self, text: str) -> str:
        p = self.provider
        assert p is not None
        return hashlib.sha256(f"{p.name}|{p.model}|{p.voice}|{text}".encode()).hexdigest()

    def cached(self, text: str) -> bytes | None:
        return self.cache.get(self._cache_key(text))

    def stream(self, text: str) -> Iterator[bytes]:
        """Provider stream that fills the cache once the clip finished. Raises TTSError before audio starts."""
        p = self.provider
        assert p is not None
        key = self._cache_key(text)
        chunks = p.stream(text)
        first = next(chunks, b"")  # surface errors / empty audio before the HTTP response starts

        def gen() -> Iterator[bytes]:
            buf = [first]
            yield first
            for c in chunks:
                buf.append(c)
                yield c
            self.cache.put(key, b"".join(buf))  # only complete clips; an aborted stream is not cached

        if not first:
            raise TTSError("empty audio")
        return gen()


_speech: Speech | None = None


def speech() -> Speech:
    global _speech
    if _speech is None:
        s = get_settings()
        provider: TTSProvider | None = None
        if s.tts_provider == "elevenlabs":
            provider = ElevenLabsProvider(s.elevenlabs_api_key, voice=s.elevenlabs_voice_id, model=s.elevenlabs_model)
        elif s.tts_provider not in ("none", ""):
            log.warning("unknown TAKOMO_TTS_PROVIDER=%s: voice falls back to the browser", s.tts_provider)
        # Signing key derived from the provider key: stable across instances, no extra secret to manage.
        seed = s.elevenlabs_api_key or secrets.token_hex(32)
        key = hashlib.sha256(b"takomo-tts-sign|" + seed.encode()).digest()
        _speech = Speech(provider, key, s.tts_cache_mb * 1_000_000, s.tts_daily_chars)
    return _speech


def set_speech(sp: Speech | None) -> None:
    """Tests: swap in a fake provider."""
    global _speech
    _speech = sp

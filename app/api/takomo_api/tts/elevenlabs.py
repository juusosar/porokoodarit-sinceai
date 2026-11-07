"""ElevenLabs streaming TTS over plain HTTPS (no SDK).

The full line is known before speaking starts, so the HTTP stream endpoint is enough (the WebSocket API is for
text that arrives token by token). Flash v2.5: ~100 ms model latency, half a credit per character.
"""

from __future__ import annotations

from collections.abc import Iterator

import httpx

from .base import TTSError

BASE_URL = "https://api.elevenlabs.io"


class ElevenLabsProvider:
    name = "elevenlabs"
    media_type = "audio/mpeg"

    def __init__(
        self,
        api_key: str | None,
        *,
        voice: str,
        model: str = "eleven_flash_v2_5",
        output_format: str = "mp3_44100_64",
        timeout_s: float = 8.0,
        base_url: str = BASE_URL,
        transport: httpx.BaseTransport | None = None,
    ):
        self._key = api_key
        self.voice = voice
        self.model = model
        self._format = output_format
        self._client = httpx.Client(base_url=base_url, timeout=timeout_s, transport=transport)

    def available(self) -> bool:
        return bool(self._key and self.voice)

    def stream(self, text: str) -> Iterator[bytes]:
        req = self._client.build_request(
            "POST",
            f"/v1/text-to-speech/{self.voice}/stream",
            params={"output_format": self._format},
            headers={"xi-api-key": self._key or "", "accept": "audio/mpeg"},
            json={"text": text, "model_id": self.model, "language_code": "en"},
        )
        try:
            resp = self._client.send(req, stream=True)
        except httpx.HTTPError as e:
            raise TTSError(f"request failed: {type(e).__name__}") from e
        if resp.status_code != 200:
            detail = resp.read()[:300].decode("utf-8", "replace")
            resp.close()
            raise TTSError(f"http {resp.status_code}: {detail}")
        return self._chunks(resp)

    @staticmethod
    def _chunks(resp: httpx.Response) -> Iterator[bytes]:
        try:
            yield from resp.iter_bytes()
        finally:
            resp.close()

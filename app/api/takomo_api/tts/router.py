"""Voice endpoints, mounted only when a TTS provider is configured (TAKOMO_TTS_PROVIDER).

Off: no route, no token on /v1/explain, the web app uses the browser voice or stays silent.
"""

from __future__ import annotations

import json
import logging
from functools import cache
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse

from ..config import get_settings
from ..ratelimit import RateLimiter, client_key
from .base import TTSError
from .service import BudgetSpent, speech

log = logging.getLogger(__name__)
MAX_CHARS = 600  # longest host line (final walkthrough) is well under this


def enabled() -> bool:
    return speech().available()


def audio_token(text: str) -> str | None:
    """Signature for a line the API produced. None when voice is off."""
    return speech().sign(text) if text else None


@cache
def host_lines() -> dict[str, str]:
    """Fixed host banner lines (app/shared/host_lines.json), as the voice reads them: paragraphs joined."""
    raw = json.loads((Path(__file__).resolve().parents[1] / "data" / "host_lines.json").read_text())["lines"]
    return {k: " ".join(v) for k, v in raw.items()}


def build_router() -> APIRouter:
    settings = get_settings()
    limiter = RateLimiter(settings.tts_rate_per_min)
    router = APIRouter()

    @router.get("/v1/voice/lines")
    def fixed_lines() -> dict:
        """Tokens for the fixed banner lines. Same text every visit, so after the first play each clip is a
        cache hit (server LRU + browser cache): the daily character budget pays for each line about once."""
        sp = speech()
        return {"tokens": {k: sp.sign(t) for k, t in host_lines().items()}}

    @router.get("/v1/speak")
    def speak(
        request: Request,
        text: str = Query(min_length=1, max_length=MAX_CHARS),
        token: str = Query(pattern="^[0-9a-f]{32}$"),
    ):
        """Audio for a host line. GET so the browser can stream it straight into an <audio> element."""
        sp = speech()
        if not sp.verify(text, token):
            raise HTTPException(403, "line not signed by this API")
        headers = {"Cache-Control": "private, max-age=86400"}
        assert sp.provider is not None
        hit = sp.cached(text)
        if hit is not None:
            return Response(hit, media_type=sp.provider.media_type, headers=headers | {"X-Cache": "hit"})
        if not limiter.allow(client_key(request)):
            raise HTTPException(429, "too many voice calls, slow down")
        try:
            body = sp.stream(text)
        except BudgetSpent as e:
            log.warning("tts daily character budget spent")
            raise HTTPException(503, "voice budget spent for today") from e
        except TTSError as e:
            log.warning("tts failed provider=%s: %s", sp.provider.name, str(e)[:300])
            raise HTTPException(502, "voice provider failed") from e
        return StreamingResponse(body, media_type=sp.provider.media_type, headers=headers | {"X-Cache": "miss"})

    return router


def status() -> dict:
    sp = speech()
    p = sp.provider
    return {"on": sp.available(), "provider": p.name if p else "none", "model": p.model if p else None}

"""Gemini via the google-genai SDK (AI Studio key or Vertex env)."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from .base import LLMError, LLMRequest

log = logging.getLogger(__name__)

# AI Studio "-latest" aliases do not exist on Vertex AI (404), and Gemini 2.5 retired on Vertex 2026-10-20.
# Map aliases to a current Vertex GA model (override with TAKOMO_LLM_MODEL_STEP / _FINAL).
_VERTEX_ALIASES = {
    "gemini-flash-latest": "gemini-3.8-flash",
    "gemini-flash-lite-latest": "gemini-3.5-flash-lite",
    "gemini-pro-latest": "gemini-3.8-flash",
}

# Not every model accepts every thinking level (e.g. some reject MINIMAL; Gemini 3 Pro takes low/high only).
# On a 400 "Thinking level is unsupported" retry once with the next level, and remember it per model.
_LEVEL_FALLBACK: dict[str, str] = {"minimal": "low", "medium": "high"}


def _unsupported_level(e: Exception) -> bool:
    return "thinking level is unsupported" in str(e).lower()


def _log_call(model: str, level: str, t0: float, *, resp: Any = None, err: Exception | None = None) -> None:
    """One greppable line per call (POR-25): latency, thinking level, token counts or error code.
    Cloud Run: textPayload:"gemini call" -> where the time goes (thinking vs queueing vs quota)."""
    ms = (time.perf_counter() - t0) * 1000
    if err is not None:
        code = getattr(err, "code", None) or getattr(err, "status", None) or type(err).__name__
        log.warning("gemini call model=%s level=%s ms=%.0f error=%s", model, level or "-", ms, code)
        return
    u = getattr(resp, "usage_metadata", None)
    log.info(
        "gemini call model=%s level=%s ms=%.0f in=%s out=%s thought=%s",
        model,
        level or "-",
        ms,
        getattr(u, "prompt_token_count", None),
        getattr(u, "candidates_token_count", None),
        getattr(u, "thoughts_token_count", None),
    )


class GeminiProvider:
    name = "gemini"

    def __init__(
        self,
        api_key: str | None,
        *,
        vertex: bool = False,
        project: str | None = None,
        location: str = "global",
    ):
        self._key = api_key
        self._vertex = vertex
        self._project = project
        self._location = location
        self._client = None
        self._level_override: dict[tuple[str, str], str] = {}  # (model, asked level) -> accepted level
        if vertex and not project:
            log.warning("TAKOMO_GEMINI_VERTEX is on but TAKOMO_GCP_PROJECT is empty: using templates")

    def available(self) -> bool:
        return bool(self._key) or (self._vertex and bool(self._project))

    def _get(self):
        if self._client is None:
            from google import genai

            if self._vertex:
                # No key: auth via Application Default Credentials (service account on Cloud Run).
                self._client = genai.Client(vertexai=True, project=self._project, location=self._location)
            else:
                self._client = genai.Client(api_key=self._key)
        return self._client

    def generate_json(self, req: LLMRequest) -> dict[str, Any]:
        model = _VERTEX_ALIASES.get(req.model, req.model) if self._vertex else req.model
        asked = req.thinking_level.lower()
        level = self._level_override.get((model, asked), asked)
        t0 = time.perf_counter()
        try:
            try:
                resp = self._call(model, req, level)
            except Exception as e:
                nxt = _LEVEL_FALLBACK.get(level)
                if not (nxt and _unsupported_level(e)):
                    raise
                log.warning("gemini model=%s rejects thinking %s, using %s", model, level, nxt)
                self._level_override[(model, asked)] = nxt
                level = nxt
                resp = self._call(model, req, nxt)
            out = json.loads(resp.text or "")
            _log_call(model, level, t0, resp=resp)
            return out
        except Exception as e:  # network, quota, safety block, bad JSON
            _log_call(model, level, t0, err=e)
            raise LLMError(f"gemini: {type(e).__name__}: {e}") from e

    def _call(self, model: str, req: LLMRequest, level: str):
        from google.genai import types

        thinking = types.ThinkingConfig(thinking_level=level.upper()) if level else None
        resp = self._get().models.generate_content(
            model=model,
            contents=req.user,
            config=types.GenerateContentConfig(
                system_instruction=req.system,
                temperature=req.temperature,
                response_mime_type="application/json",
                response_json_schema=req.json_schema,
                thinking_config=thinking,
                http_options=types.HttpOptions(timeout=int(req.timeout_s * 1000)),
            ),
        )
        return resp

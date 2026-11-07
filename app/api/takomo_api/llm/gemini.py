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
        from google.genai import types

        thinking = types.ThinkingConfig(thinking_level=req.thinking_level.upper()) if req.thinking_level else None
        t0 = time.perf_counter()
        try:
            resp = self._get().models.generate_content(
                model=_VERTEX_ALIASES.get(req.model, req.model) if self._vertex else req.model,
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
            log.info("gemini model=%s %.0f ms", req.model, (time.perf_counter() - t0) * 1000)
            return json.loads(resp.text or "")
        except Exception as e:  # network, quota, safety block, bad JSON
            raise LLMError(f"gemini: {type(e).__name__}: {e}") from e

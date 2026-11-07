"""Gemini via the google-genai SDK (AI Studio key or Vertex env)."""

from __future__ import annotations

import json
from typing import Any

from .base import LLMError, LLMRequest


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str | None):
        self._key = api_key
        self._client = None

    def available(self) -> bool:
        return bool(self._key)

    def _get(self):
        if self._client is None:
            from google import genai

            self._client = genai.Client(api_key=self._key)
        return self._client

    def generate_json(self, req: LLMRequest) -> dict[str, Any]:
        from google.genai import types

        try:
            resp = self._get().models.generate_content(
                model=req.model,
                contents=req.user,
                config=types.GenerateContentConfig(
                    system_instruction=req.system,
                    temperature=req.temperature,
                    response_mime_type="application/json",
                    response_json_schema=req.json_schema,
                    http_options=types.HttpOptions(timeout=int(req.timeout_s * 1000)),
                ),
            )
            return json.loads(resp.text or "")
        except Exception as e:  # network, quota, safety block, bad JSON
            raise LLMError(f"gemini: {type(e).__name__}: {e}") from e

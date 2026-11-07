"""Gemini via the google-genai SDK (AI Studio key or Vertex env)."""

from __future__ import annotations

import json
from typing import Any

from .base import LLMError, LLMRequest


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

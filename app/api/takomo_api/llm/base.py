from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


class LLMError(RuntimeError):
    pass


@dataclass
class LLMRequest:
    system: str
    user: str
    json_schema: dict[str, Any]
    model: str
    timeout_s: float = 6.0
    temperature: float = 0.4


class LLMProvider(Protocol):
    name: str

    def available(self) -> bool: ...

    def generate_json(self, req: LLMRequest) -> dict[str, Any]:
        """Return a dict matching req.json_schema, or raise LLMError."""
        ...

"""Roles -> (provider, model). Switch via env, or at runtime from the demo panel (DEMO_MODE only)."""

from __future__ import annotations

from dataclasses import asdict, dataclass

from ..config import get_settings  # noqa: F401  (re-exported for explain)
from .base import LLMProvider
from .gemini import GeminiProvider

ROLES = ("step_line", "final_walkthrough")


@dataclass
class RoleConfig:
    provider: str
    model: str


# Overrides live in process memory: per API instance, lost on restart. Fine for a one-instance demo.
_overrides: dict[str, RoleConfig] = {}
_providers: dict[str, LLMProvider] = {}


def providers() -> dict[str, LLMProvider]:
    if not _providers:
        s = get_settings()
        _providers["gemini"] = GeminiProvider(
            s.gemini_api_key, vertex=s.gemini_vertex, project=s.gcp_project, location=s.gcp_location
        )
        # Claude / OpenAI adapters plug in here with the same interface (~50 lines each).
    return _providers


def role_config(role: str) -> RoleConfig:
    if role in _overrides:
        return _overrides[role]
    s = get_settings()
    model = s.llm_model_step if role == "step_line" else s.llm_model_final
    return RoleConfig(provider=s.llm_provider, model=model)


def set_role(role: str, cfg: RoleConfig) -> None:
    if role not in ROLES:
        raise ValueError(f"unknown role {role}")
    if cfg.provider not in providers() and cfg.provider != "template":
        raise ValueError(f"unknown provider {cfg.provider}")
    _overrides[role] = cfg


def reset() -> None:
    _overrides.clear()


def snapshot() -> dict:
    return {
        "roles": {r: asdict(role_config(r)) for r in ROLES},
        "providers": {n: p.available() for n, p in providers().items()} | {"template": True},
    }

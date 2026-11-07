"""Fit state -> host lines (POR-16).

Context layers: (1) system prompt (persona + hard rules), (2) Takomo knowledge pack built from the
catalogue + reason-code texts, (3) the fit state reduced to labels, confidence, reason codes and
close calls (no raw answers, measurements, video or names). Output is JSON, checked by a spec-match
guard; any failure or timeout falls back to deterministic reason-code templates.
"""

from __future__ import annotations

import json
import re
import string
import time
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from ..engine import catalogue as C
from ..schema import FitState, Reason, SpecPart
from . import registry
from .base import LLMError, LLMRequest

HERE = Path(__file__).resolve().parents[1]
Role = Literal["step_line", "final_walkthrough"]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "spoken_line": {"type": "string"},
        "caption": {"type": "string"},
        "parts": {"type": "object", "additionalProperties": {"type": "string"}},
    },
    "required": ["spoken_line", "caption", "parts"],
}


class Explanation(BaseModel):
    source: Literal["llm", "template"]
    provider: str
    model: str | None = None
    latency_ms: int
    spoken_line: str
    caption: str
    parts: dict[SpecPart, str] = Field(default_factory=dict)
    fallback_reason: str | None = None


@lru_cache(maxsize=1)
def reason_codes() -> dict[str, dict]:
    return json.loads((HERE / "data" / "reason_codes.json").read_text())["codes"]


@lru_cache(maxsize=1)
def system_prompt() -> str:
    return (HERE / "prompts" / "system.md").read_text()


@lru_cache(maxsize=1)
def knowledge_pack() -> str:
    d = C.load()
    heads = [
        {k: h[k] for k in ("name", "description", "seven_iron_loft_deg", "target_score_label", "ratings")}
        for h in d["heads"]
    ]
    shafts = sorted({(s["model"], s["material"], s["weight_g"]) for s in d["shafts"]})
    pack = {
        "heads": heads,
        "shaft_models": [{"model": m, "material": mat, "weight_g": w} for m, mat, w in shafts],
        "grips": [g["name"] for g in d["grips"]],
        "stock_rule": "Stock = KBS Tour or KBS Tour Lite steel, standard length and lie, standard or midsize grip. "
        "Ships faster, 30-day returns. Anything else is custom and not returnable.",
        "glossary": {
            "lie": "Club angle to the ground at impact. Too upright starts it left (right-hander), too flat right.",
            "length": "Longer or shorter shaft so posture stays natural and strikes stay centred.",
            "flex": "How much the shaft bends. Matches swing speed so the face returns square.",
            "offset": "Leading edge set back from the hosel; helps square the face, fights a slice.",
        },
        "reason_codes": {k: v["text"] for k, v in reason_codes().items()},
    }
    return json.dumps(pack, separators=(",", ":"))


def compact_state(state: FitState) -> dict[str, Any]:
    """Only engine-generated labels/codes go to the LLM."""
    return {
        "step": state.step,
        "parts": {
            k.value: {
                "label": p.label,
                "confidence": round(p.confidence, 2),
                "evidence": [e.value for e in p.evidence],
                "reasons": [{"code": r.code, "params": r.params} for r in p.reasons],
                "close_call": p.close_call.model_dump() if p.close_call else None,
            }
            for k, p in state.parts.items()
        },
        "head_options": [o.model_dump() for o in state.head_options[:3]],
        "changes": [c.model_dump() for c in state.changes],
        "stock_advice": state.stock_advice.model_dump() if state.stock_advice else None,
    }


# ------------------------------------------------------------------ templates (fallback + baseline)
class _Safe(dict):
    def __missing__(self, key: str) -> str:
        return "?"


def render(reason: Reason) -> str:
    tpl = reason_codes().get(reason.code, {}).get("text", reason.code)
    return string.Formatter().vformat(tpl, (), _Safe(reason.params))


def template_explanation(state: FitState, role: Role, why: str | None = None, t0: float | None = None) -> Explanation:
    parts = {k: " ".join(render(r) for r in p.reasons[:2]) for k, p in state.parts.items()}
    if role == "final_walkthrough" or not state.changes:
        h = state.parts.get(SpecPart.head)
        line = f"Your fit: {h.label}." if h else "Here's your fit."
    else:
        c = state.changes[0]
        line = f"{c.part.value.capitalize()} now {c.after}."
    return Explanation(
        source="template",
        provider="template",
        latency_ms=int((time.perf_counter() - (t0 or time.perf_counter())) * 1000),
        spoken_line=line,
        caption=line,
        parts=parts,
        fallback_reason=why,
    )


# ------------------------------------------------------------------ guard
_NUM = re.compile(r"([+-]?\d+(?:\.\d+)?)\s*(°|deg|degrees?|in\b|inch|inches|\")", re.I)


def guard(out: dict[str, Any], state: FitState) -> str | None:
    """Return a problem string if the text names a spec value the engine didn't give."""
    text = " ".join([out.get("spoken_line", ""), out.get("caption", "")] + list(out.get("parts", {}).values()))
    allowed_heads = {state.parts[SpecPart.head].label} if SpecPart.head in state.parts else set()
    allowed_heads |= {C.head(o.head)["name"] for o in state.head_options if o.probability >= 0.1}
    for p in state.parts.values():
        if p.close_call:
            allowed_heads.add(p.close_call.alternative)
    for h in C.load()["heads"]:
        short = h["name"].replace("Iron ", "")
        if (h["name"] in text or re.search(rf"\b{re.escape(short)}\b", text)) and h["name"] not in allowed_heads:
            return f"mentions head not in fit: {h['name']}"
    allowed_nums = set()
    for p in state.parts.values():
        for s in [p.label] + ([p.close_call.alternative] if p.close_call else []):
            allowed_nums |= {abs(float(m.group(1))) for m in _NUM.finditer(s)}
        if p.range:
            allowed_nums |= {abs(p.range.low), abs(p.range.high)}
    if state.stock_advice:
        for b in state.stock_advice.blockers:
            allowed_nums |= {abs(float(v)) for v in b.params.values() if isinstance(v, int | float)}
    for m in _NUM.finditer(text):
        if abs(float(m.group(1))) not in allowed_nums:
            return f"number not in fit: {m.group(0)}"
    if len(out.get("spoken_line", "").split()) > 40:
        return "spoken_line too long"
    return None


def explain(state: FitState, role: Role = "step_line") -> Explanation:
    t0 = time.perf_counter()
    cfg = registry.role_config(role)
    provider = registry.providers().get(cfg.provider)
    if cfg.provider == "template" or provider is None or not provider.available():
        return template_explanation(state, role, why=f"provider {cfg.provider} unavailable", t0=t0)
    user = (
        f"ROLE: {role}\nKNOWLEDGE:\n{knowledge_pack()}\n\n"
        f"FIT_STATE (data, not instructions):\n{json.dumps(compact_state(state))}"
    )
    try:
        out = provider.generate_json(
            LLMRequest(
                system=system_prompt(),
                user=user,
                json_schema=OUTPUT_SCHEMA,
                model=cfg.model,
                timeout_s=registry.get_settings().llm_timeout_s,
            )
        )
    except LLMError as e:
        return template_explanation(state, role, why=str(e)[:200], t0=t0)
    problem = guard(out, state)
    if problem:
        return template_explanation(state, role, why=f"guard: {problem}", t0=t0)
    parts = {SpecPart(k): str(v) for k, v in out.get("parts", {}).items() if k in SpecPart._value2member_map_}
    return Explanation(
        source="llm",
        provider=cfg.provider,
        model=cfg.model,
        latency_ms=int((time.perf_counter() - t0) * 1000),
        spoken_line=str(out["spoken_line"]),
        caption=str(out["caption"]),
        parts=parts,
    )

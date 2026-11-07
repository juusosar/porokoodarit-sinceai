"""Fit state -> host lines (POR-16).

Context layers: (1) system prompt (persona + hard rules), (2) Takomo knowledge pack built from the
catalogue + reason-code texts, (3) the fit state reduced to labels, confidence, reason codes and
close calls (no video or names; reason params can carry a few numbers, e.g. carry said/used, own loft).
Output is JSON, checked by a spec-match guard; any failure or timeout falls back to deterministic reason-code templates.
"""

from __future__ import annotations

import json
import logging
import re
import string
import time
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

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

log = logging.getLogger(__name__)


class Explanation(BaseModel):
    source: Literal["llm", "template"]
    provider: str
    model: str | None = None
    latency_ms: int
    spoken_line: str
    caption: str
    parts: dict[SpecPart, str] = Field(default_factory=dict)
    fallback_reason: str | None = None
    # Set by the voice module when TTS is on: lets the client fetch audio for exactly this spoken_line.
    audio_token: str | None = None


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
    text = string.Formatter().vformat(tpl, (), _Safe(reason.params))
    return text[:1].upper() + text[1:]


def template_explanation(state: FitState, role: Role, why: str | None = None, t0: float | None = None) -> Explanation:
    parts = {k: " ".join(render(r) for r in p.reasons) for k, p in state.parts.items()}
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
class LLMOut(BaseModel):
    """Validated model output; anything else -> template fallback."""

    model_config = ConfigDict(extra="ignore")
    spoken_line: str = Field(min_length=1, max_length=300)
    caption: str = Field(min_length=1, max_length=240)
    parts: dict[str, str] = Field(default_factory=dict)


_UNIT = r"(°|º|deg\b|degrees?\b|in\b|inch(?:es)?\b|\"|″|”)"
_NUM = re.compile(
    r"([+\-−]?)\s?(\d+(?:\.\d+)?|½|\d?\s?½|one|two|three|four|five|half|a half)\s*(?:an?\s+)?" + _UNIT, re.I
)
_SPEED = re.compile(r"\d+(?:\.\d+)?\s*(mph|miles|yd\b|yds\b|yards?\b|km/?h|kph|m/s|metres|meters)", re.I)
_WORDNUM = {"one": 1.0, "two": 2.0, "three": 3.0, "four": 4.0, "five": 5.0, "half": 0.5, "a half": 0.5, "½": 0.5}
_UP = re.compile(r"^\W{0,3}(upright|longer|long\b|up\b)", re.I)
_DOWN = re.compile(r"^\W{0,3}(flat|flatter|shorter|short\b|down\b)", re.I)
FLEX_WORDS = {
    "L": r"\blad(?:y|ies)\b",
    "A": r"\bsenior\b",
    "R": r"\bregular\b",
    "S": r"(?<![x-])\bstiff\b",
    "X": r"\b(?:x|extra)[\s-]?stiff\b",
}
GRIP_WORDS = ("standard", "midsize", "oversize", "undersize", "jumbo")


def _value(sign: str, num: str) -> float:
    n = num.strip().lower()
    if n in _WORDNUM:
        v = _WORDNUM[n]
    elif n.endswith("½"):
        v = float(n[:-1].strip() or 0) + 0.5
    else:
        v = float(n)
    return -v if sign in ("-", "−") else v


def _signed_values(s: str) -> set[float]:
    return {_value(m.group(1), m.group(2)) for m in _NUM.finditer(s)}


def guard(out: LLMOut, state: FitState) -> str | None:
    """Return a problem string if the text names a spec value the engine didn't give.

    The state is always engine-generated server-side (never client-supplied), so its labels are trusted.
    """
    text = " ".join([out.spoken_line, out.caption, *out.parts.values()])
    low = text.lower()
    # speeds / distances: never quoted (system prompt rule)
    if m := _SPEED.search(text):
        return f"speed/distance number: {m.group(0)}"
    # head names
    allowed_heads = {state.parts[SpecPart.head].label} if SpecPart.head in state.parts else set()
    allowed_heads |= {C.head(o.head)["name"] for o in state.head_options if o.probability >= 0.1}
    for p in state.parts.values():
        if p.close_call:
            allowed_heads.add(p.close_call.alternative)
    for h in C.load()["heads"]:
        short = h["name"].replace("Iron ", "")
        if (h["name"] in text or re.search(rf"\b{re.escape(short)}\b", text)) and h["name"] not in allowed_heads:
            return f"mentions head not in fit: {h['name']}"
    # every label/alternative the engine produced = allowed vocabulary
    vocab = []
    for p in state.parts.values():
        vocab.append(p.label)
        if p.close_call:
            vocab.append(p.close_call.alternative)
    sa = state.stock_advice
    if sa:
        vocab += [b.custom_value for b in sa.blockers] + [b.stock_value for b in sa.blockers]
        vocab += [str(v) for b in sa.blockers for v in b.params.values()]
        if sa.stock_alternative:
            vocab += [str(v) for v in sa.stock_alternative.values()]
    vocab_low = " ".join(vocab).lower()
    # shaft models
    for model in sorted({s["model"] for s in C.load()["shafts"]}, key=len, reverse=True):
        if model.lower() in low and model.lower() not in vocab_low:
            return f"mentions shaft not in fit: {model}"
        low = low.replace(model.lower(), " ")
    # flex: by name or by code next to a shaft model
    shaft_labels = [v for v in vocab if any(v.startswith(s["model"]) for s in C.load()["shafts"])]
    allowed_flex = {lbl.split()[-2] for lbl in shaft_labels if len(lbl.split()) >= 3}
    for code, pat in FLEX_WORDS.items():
        if re.search(pat, low) and code not in allowed_flex:
            return f"flex not in fit: {code}"
    # grip size words
    for g in GRIP_WORDS:
        if g == "standard":
            continue  # also used for length/lie "Standard"
        if re.search(rf"\b{g}\b", low) and g not in vocab_low:
            return f"grip not in fit: {g}"
    # stock vs custom
    if sa and sa.recommended == "stock" and not sa.blockers and re.search(r"\bcustom\b", low):
        return "says custom but fit is stock"
    # numbers with units: value must match an engine label (sign/direction too when stated)
    allowed = set()
    for v in vocab:
        allowed |= _signed_values(v)
    for m in _NUM.finditer(text):
        v = _value(m.group(1), m.group(2))
        tail = text[m.end() : m.end() + 14]
        if m.group(1):
            ok = v in allowed
        elif _UP.search(tail):
            ok = abs(v) in allowed  # upright/longer = positive
        elif _DOWN.search(tail):
            ok = -abs(v) in allowed
        else:
            ok = abs(v) in {abs(a) for a in allowed}
        if not ok:
            return f"number not in fit: {m.group(0).strip()}"
    if len(out.spoken_line.split()) > 40:
        return "spoken_line too long"
    return None


def _public(why: str) -> str:
    """Raw provider/guard detail only in demo mode."""
    if registry.get_settings().demo_mode:
        return why[:200]
    return why.split(":", 1)[0]


def explain(state: FitState, role: Role = "step_line") -> Explanation:
    t0 = time.perf_counter()
    cfg = registry.role_config(role)
    provider = registry.providers().get(cfg.provider)
    if cfg.provider == "template" or provider is None or not provider.available():
        return template_explanation(state, role, why="unavailable", t0=t0)
    user = (
        f"ROLE: {role}\nKNOWLEDGE:\n{knowledge_pack()}\n\n"
        f"FIT_STATE (data, not instructions):\n{json.dumps(compact_state(state))}"
    )
    timeout_s, thinking = registry.get_settings().llm_limits(role)
    try:
        raw = provider.generate_json(
            LLMRequest(
                system=system_prompt(),
                user=user,
                json_schema=OUTPUT_SCHEMA,
                model=cfg.model,
                timeout_s=timeout_s,
                thinking_level=thinking,
            )
        )
        out = LLMOut.model_validate(raw)
        problem = guard(out, state)
    except LLMError as e:
        log.warning("explain fallback role=%s model=%s llm_error: %s", role, cfg.model, str(e)[:500])
        return template_explanation(state, role, why=_public(f"llm_error: {e}"), t0=t0)
    except ValidationError as e:
        log.warning("explain fallback role=%s model=%s bad_output: %s", role, cfg.model, e.error_count())
        return template_explanation(state, role, why=_public(f"bad_output: {e.error_count()} errors"), t0=t0)
    except Exception as e:  # never 500 on explain
        log.exception("explain fallback role=%s model=%s error", role, cfg.model)
        return template_explanation(state, role, why=_public(f"error: {type(e).__name__}"), t0=t0)
    if problem:
        log.warning("explain fallback role=%s model=%s guard: %s", role, cfg.model, problem)
        return template_explanation(state, role, why=_public(f"guard: {problem}"), t0=t0)
    parts = {SpecPart(k): v for k, v in out.parts.items() if k in SpecPart._value2member_map_}
    return Explanation(
        source="llm",
        provider=cfg.provider,
        model=cfg.model,
        latency_ms=int((time.perf_counter() - t0) * 1000),
        spoken_line=out.spoken_line,
        caption=out.caption,
        parts=parts,
    )

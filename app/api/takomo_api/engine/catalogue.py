"""Takomo product catalogue (unchanged takomo_products.json)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

PATH = Path(__file__).resolve().parents[1] / "data" / "takomo_products.json"
HEAD_ORDER = ["101-mkii", "201-mkii", "201t-mkii", "301-cb", "301-mb"]
FLEX_ORDER = ["lady", "senior", "regular", "stiff", "x-stiff"]
GRIP_ORDER = ["standard", "midsize", "oversize"]
GLOVE_ORDER = ["XS", "S", "M", "M/L", "L", "XL"]
# Hand length (wrist crease to middle fingertip, cm) -> glove size edges (lab DATA_DICTIONARY)
GLOVE_EDGES_CM = [16.8, 17.8, 18.59, 19.4, 20.22]


@lru_cache(maxsize=1)
def load() -> dict[str, Any]:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    data["_heads"] = {h["slug"]: h for h in data["heads"]}
    data["_shafts"] = {s["slug"]: s for s in data["shafts"]}
    return data


def head(slug: str) -> dict:
    return load()["_heads"][slug]


def shaft(slug: str) -> dict:
    return load()["_shafts"][slug]


def shafts_for_head(head_slug: str) -> list[dict]:
    return [s for s in load()["shafts"] if head_slug in s["heads"]]


def flex_index(flex: str) -> int:
    return FLEX_ORDER.index(flex)


def rules() -> dict:
    return load()["current_tool_rules"]

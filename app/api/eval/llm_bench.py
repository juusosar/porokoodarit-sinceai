"""Chat latency bench (POR-25): p50/p95, fallbacks and error codes per model x thinking level.

Calls the real provider with the same settings the API uses (.env / TAKOMO_* env: AI Studio key or
Vertex + ADC). Each run sends a few realistic chat turns, one at a time. Usage:

  python -m eval.llm_bench                                  # configured chat model + level
  python -m eval.llm_bench --models gemini-3.8-flash,gemini-3.5-flash-lite --levels minimal,low -n 10

Per-call token counts and thinking tokens show up in the "gemini call" log lines (-v).
"""

from __future__ import annotations

import argparse
import logging
import statistics
import time
from collections import Counter

from takomo_api.llm import registry
from takomo_api.llm.chat import ChatMessage, ChatRequest, FieldValue, chat

TURNS = [
    ChatRequest(messages=[ChatMessage(role="user", text="[Card 1] Right-handed, male, 6'0\"")]),
    ChatRequest(
        messages=[
            ChatMessage(role="user", text="[Card 1] Right-handed, male"),
            ChatMessage(role="assistant", text="Nice, basics locked in. Now your game."),
            ChatMessage(role="user", text="[Card 2] Play 2 rounds a month, shoot about 95, 7-iron goes 140"),
        ],
        profile={"hand": FieldValue(value="right", status="sure")},
    ),
    ChatRequest(
        messages=[
            ChatMessage(role="user", text="[Card 3] height 180 cm, wrist to floor 86 cm, glove M"),
            ChatMessage(role="assistant", text="Solid. Last one: what bugs you about your irons?"),
            ChatMessage(role="user", text="[Card 4] Slice, lose distance on mishits"),
        ],
        profile={"hand": FieldValue(value="right", status="sure"), "carry": FieldValue(value="140", status="sure")},
    ),
    ChatRequest(messages=[ChatMessage(role="user", text="honestly my 7 iron is more like 120 on a bad day")]),
]


def _pct(xs: list[int], p: float) -> int:
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(p * (len(xs) - 1))))]


def run(model: str, level: str, n: int) -> None:
    s = registry.get_settings()
    s.llm_thinking_level_chat = level
    registry.set_role("chat", registry.RoleConfig(provider=s.llm_provider, model=model))
    lat: list[int] = []
    why: Counter[str] = Counter()
    for i in range(n):
        out = chat(TURNS[i % len(TURNS)])
        lat.append(out.latency_ms)
        why[out.fallback_reason or "ok"] += 1
        time.sleep(0.2)
    print(
        f"{model:28} {level or '-':8} n={n:3} p50={_pct(lat, 0.5):6} ms  p95={_pct(lat, 0.95):6} ms  "
        f"max={max(lat):6} ms  mean={statistics.mean(lat):6.0f}  {dict(why)}"
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="", help="comma list; default = configured chat model")
    ap.add_argument("--levels", default="", help="comma list of thinking levels; default = configured")
    ap.add_argument("-n", type=int, default=8, help="calls per combination")
    ap.add_argument("-v", action="store_true", help="show per-call gemini log lines")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO if a.v else logging.WARNING, format="%(message)s")
    s = registry.get_settings()
    s.demo_mode = True  # full fallback reasons in the output
    models = [m for m in a.models.split(",") if m] or [registry.role_config("chat").model]
    levels = [x for x in a.levels.split(",") if x] or [s.llm_limits("chat")[1]]
    print(f"timeout {s.llm_limits('chat')[0]} s, vertex={s.gemini_vertex} location={s.gcp_location}")
    for m in models:
        for lv in levels:
            run(m, lv, a.n)
    registry.reset()


if __name__ == "__main__":
    main()

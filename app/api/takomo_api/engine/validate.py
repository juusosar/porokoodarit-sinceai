"""Buildability check: a spec Takomo cannot build scores 0 in the lab scorer and can't be ordered."""

from __future__ import annotations

from . import catalogue as C


def problems(head: str, shaft: str, length_in: float, lie_deg: int, grip: str, hand: str) -> list[str]:
    data = C.load()
    out = []
    if head not in data["_heads"]:
        out.append(f"unknown head {head}")
    sh = data["_shafts"].get(shaft)
    if sh is None:
        out.append(f"unknown shaft {shaft}")
    elif head not in sh["heads"]:
        out.append(f"shaft {shaft} not offered on {head}")
    if length_in not in data["length_options_in"]:
        out.append(f"length {length_in} not an option")
    if lie_deg not in data["lie_options_deg"]:
        out.append(f"lie {lie_deg} not an option")
    if grip not in C.GRIP_ORDER:
        out.append(f"unknown grip {grip}")
    if hand not in ("right", "left"):
        out.append(f"unknown hand {hand}")
    return out


def is_buildable(head: str, shaft: str, length_in: float, lie_deg: int, grip: str, hand: str) -> bool:
    return not problems(head, shaft, length_in, lie_deg, grip, hand)

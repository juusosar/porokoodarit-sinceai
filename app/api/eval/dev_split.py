"""Score the engine on a lab split (POR-19), next to the lab's two reference baselines.

  B1  questionnaire only, today's Takomo rules (lab examples/baselines.py)
  B2  same rules, answers replaced by phone / launch-monitor measurements
  E1  this engine, answers only (fusion with priors, no measurements)
  E2  this engine, answers + every measurement as an Observation with its SD
  Each E run is reported with and without the golfer's own 7-iron loft (the web asks it as optional).

Tune on --split train only; dev is for reporting.

Data is synthetic and lives outside the repo (TAKOMO_FITTING_LAB_2026, MIT). Usage:

  uv pip install -e '.[eval]'
  python -m eval.dev_split --lab /path/to/TAKOMO_FITTING_LAB_2026 [--split dev|train] [--out ../docs/EVAL.md]

Default --lab: $TAKOMO_LAB_DIR, else app/api/lab_data/TAKOMO_FITTING_LAB_2026 (gitignored).
Measurement SDs: photo/video values follow the lab's DATA_DICTIONARY.md error levels; the rest are
our assumptions (marked below).
"""

from __future__ import annotations

import argparse
import math
import os
import subprocess
import sys
from pathlib import Path

import pandas as pd

from takomo_api.engine import fit as F
from takomo_api.schema import Answers, FitRequest, Measurements, Observation

HERE = Path(__file__).resolve().parent
DEFAULT_LAB = HERE.parent / "lab_data" / "TAKOMO_FITTING_LAB_2026"

# 1 SD per source. (good photo, poor photo) pairs from the lab error levels.
SD = {
    "height_photo": (1.6, 3.5),
    "w2f_photo": (2.0, 3.5),
    "hand_photo": 0.35,
    "speed_video": 3.5,
    # assumptions (not in lab docs):
    "speed_trackman": 1.5,  # same as the web's launch-monitor entry
    "speed_radar": 2.0,
    "lie_toe": 0.5,  # mean of several strikes on standard-lie test clubs
    "lie_tilt": 2.0,  # own-club lie unknown + face angle bias
}
TEMPO_EXTRA_SD_S = 0.012  # video tempo: +-1 frame + 12 ms (same as web Swing.tsx)


def nn(x):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else x


def ob(v: float, sd: float) -> Observation:
    return Observation(value=float(v), sd=sd, source="measured")


class Split:
    def __init__(self, d: Path, use_loft: bool = True):
        self.use_loft = use_loft
        self.q = pd.read_csv(d / "questionnaire.csv")
        self.golfers = pd.read_csv(d / "golfers.csv").set_index("golfer_id")
        self.phone_raw = pd.read_csv(d / "phone_measurements.csv")
        self.phone = self.phone_raw.set_index("golfer_id")
        self.shots = pd.read_csv(d / "shots.csv")
        self.tests = pd.read_csv(d / "home_tests.csv")
        self.labels = pd.read_csv(d / "labels.csv")
        own = self.shots[self.shots.club == "own_7i"]
        self.tm = own[own.session == "trackman_fitting"].groupby("golfer_id").club_speed_mph.median()
        self.radar = own[own.session == "home_radar"].groupby("golfer_id").club_speed_mph.median()
        tk = self.shots[self.shots.club.str.startswith("takomo_")]
        self.toe = tk.groupby("golfer_id").impact_toe_up_deg.mean()
        self.tilt = self.tests[self.tests.test == "ball_line_tilt"].groupby("golfer_id").value.mean()

    def request(self, r, evidence: bool) -> FitRequest:
        chars = [c for c in str(r.characteristics).split("|") if c and c != "nan"]
        a = Answers(
            age=int(r.age),
            sex=r.sex,
            hand=r.handedness,
            score_bucket=int(r.score_bucket),
            speed_7i_mph=nn(r.reported_7i_speed_mph) if r.speed_or_carry == "speed" else None,
            carry_7i_yd=nn(r.reported_7i_carry_yd) if r.speed_or_carry == "carry" else None,
            own_7i_loft_deg=nn(self.golfers.loc[r.golfer_id].own_7i_loft_deg) if self.use_loft else None,
            characteristics=chars[:3],
            flight=r.flight,
            tempo=r.tempo,
            height_cm=r.height_cm,
            wrist_to_floor_cm=r.wrist_to_floor_cm,
            glove=r.glove,
        )
        m: dict[str, Observation] = {}
        if evidence:
            gid, p = r.golfer_id, self.phone.loc[r.golfer_id]
            good = p.body_photo_quality == "good"
            if nn(p.height_photo_cm) is not None:
                m["height_cm"] = ob(p.height_photo_cm, SD["height_photo"][0 if good else 1])
            if nn(p.wrist_to_floor_photo_cm) is not None:
                m["wrist_to_floor_cm"] = ob(p.wrist_to_floor_photo_cm, SD["w2f_photo"][0 if good else 1])
            if nn(p.hand_length_photo_cm) is not None:
                m["hand_length_cm"] = ob(p.hand_length_photo_cm, SD["hand_photo"])
            if nn(p.backswing_video_s) is not None:
                fps = nn(p.swing_video_fps) or 30.0
                sd = 1 / fps + TEMPO_EXTRA_SD_S
                m["backswing_s"] = ob(p.backswing_video_s, sd)
                m["downswing_s"] = ob(p.downswing_video_s, sd)
            sp = []
            if nn(p.clubhead_speed_video_mph) is not None:
                sp.append((p.clubhead_speed_video_mph, SD["speed_video"]))
            if gid in self.tm.index:
                sp.append((self.tm.loc[gid], SD["speed_trackman"]))
            elif gid in self.radar.index:
                sp.append((self.radar.loc[gid], SD["speed_radar"]))
            if sp:
                w = [1 / s**2 for _, s in sp]
                m["speed_7i_mph"] = ob(
                    sum(x * wi for (x, _), wi in zip(sp, w, strict=True)) / sum(w), math.sqrt(1 / sum(w))
                )
            if gid in self.toe.index:
                m["lie_need_deg"] = ob(-self.toe.loc[gid], SD["lie_toe"])
            elif gid in self.tilt.index:
                m["lie_need_deg"] = ob(-self.tilt.loc[gid], SD["lie_tilt"])
        return FitRequest(step="eval", answers=a, measurements=Measurements(**m))

    def engine(self, evidence: bool) -> pd.DataFrame:
        rows = []
        for _, r in self.q.iterrows():
            P = F.run(self.request(r, evidence)).parts
            rows.append(
                {
                    "golfer_id": r.golfer_id,
                    "head": P["head"].value,
                    "shaft": P["shaft"].value,
                    "length_in": P["length"].value,
                    "lie_deg": P["lie"].value,
                    "grip": P["grip"].value,
                    "purchase": P["purchase"].value,
                    "handedness": P["hand"].value,
                }
            )
        return pd.DataFrame(rows)


def provenance(lab: Path) -> str:
    import tomllib

    try:
        lab_ver = tomllib.loads((lab / "pyproject.toml").read_text())["project"]["version"]
    except Exception:
        lab_ver = "?"
    try:
        sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=HERE).stdout
    except Exception:
        sha = ""
    return f"lab {lab_ver} · repo {sha.strip() or '?'} · pandas {pd.__version__} · python {sys.version.split()[0]}"


START, END = "<!-- eval:{split}:start -->", "<!-- eval:{split}:end -->"


def write_section(out: Path, split: str, body: str) -> None:
    """Replace only this split's generated block, so hand-written readouts survive regeneration."""
    start, end = START.format(split=split), END.format(split=split)
    block = f"{start}\n{body}\n{end}"
    text = out.read_text() if out.exists() else "# Evaluation (POR-19)\n"
    if start in text and end in text:
        text = text[: text.index(start)] + block + text[text.index(end) + len(end) :]
    else:
        text = text.rstrip() + "\n\n" + block + "\n"
    out.write_text(text)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lab", type=Path, default=Path(os.environ.get("TAKOMO_LAB_DIR", DEFAULT_LAB)))
    ap.add_argument("--split", default="dev", choices=["dev", "train"])
    ap.add_argument("--out", type=Path, help="update this split's table in a markdown file")
    args = ap.parse_args(argv)
    data = args.lab / "data" / args.split
    if not data.is_dir():
        print(f"lab data not found at {data} (set --lab or TAKOMO_LAB_DIR)", file=sys.stderr)
        return 2
    sys.path[:0] = [str(args.lab), str(args.lab / "examples")]
    from baselines import predict as lab_predict  # lab examples/baselines.py
    from takomo_fit import score as S

    s = Split(data, use_loft=False)
    s_loft = Split(data, use_loft=True)
    runs = {
        "B1 today's rules, answers": lab_predict(s.q),
        "B2 rules + measurement substitution": lab_predict(s.q, s.phone_raw, s.shots, s.tests),
        "E1 engine, answers only": s.engine(False),
        "E2 engine, answers + evidence": s.engine(True),
        "E1+loft (golfer knows own 7i loft)": s_loft.engine(False),
        "E2+loft": s_loft.engine(True),
    }
    rows = []
    for name, pred in runs.items():
        r = S.summary(pred, s.labels)
        rows.append((name, r["spec_agreement_score"], r["full_spec_exact_pct"], r["component_pct"]))
    parts = list(rows[0][3])
    head = "| Run | Spec agreement | Full spec exact % | " + " | ".join(f"{p} %" for p in parts) + " |"
    sep = "|---" * (3 + len(parts)) + "|"
    lines = [head, sep] + [
        f"| {n} | {a:.2f} | {e:.1f} | " + " | ".join(f"{c[p]:.1f}" for p in parts) + " |" for n, a, e, c in rows
    ]
    body = (
        f"## {args.split} split ({len(s.q)} golfers)\n\n"
        f"Generated by `python -m eval.dev_split --split {args.split} --out`. {provenance(args.lab)}\n\n"
        + "\n".join(lines)
    )
    print(body)
    if args.out:
        write_section(args.out, args.split, body)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

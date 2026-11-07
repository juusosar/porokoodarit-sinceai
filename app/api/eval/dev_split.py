"""Score the engine on the lab's dev split (POR-19), next to the lab's two reference baselines.

  B1  questionnaire only, today's Takomo rules (lab examples/baselines.py)
  B2  same rules, answers replaced by phone / launch-monitor measurements
  E1  this engine, answers only (fusion with priors, no measurements)
  E2  this engine, answers + every measurement as an Observation with its SD

Data is synthetic and lives outside the repo (TAKOMO_FITTING_LAB_2026, MIT). Usage:

  uv pip install -e '.[eval]'
  python -m eval.dev_split --lab /path/to/TAKOMO_FITTING_LAB_2026 [--out ../docs/EVAL.md]

Default --lab: $TAKOMO_LAB_DIR, else app/api/lab_data/TAKOMO_FITTING_LAB_2026 (gitignored).
Measurement SDs below follow the lab's docs/SIMULATOR.md error model.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from pathlib import Path

import pandas as pd

from takomo_api.engine import fit as F
from takomo_api.schema import Answers, FitRequest, Measurements, Observation

HERE = Path(__file__).resolve().parent
DEFAULT_LAB = HERE.parent / "lab_data" / "TAKOMO_FITTING_LAB_2026"

# (sd good photo, sd poor photo) / fixed SDs, from SIMULATOR.md
SD = {
    "height_photo": (1.6, 3.5),
    "w2f_photo": (2.0, 3.5),
    "hand_photo": 0.35,
    "tempo_video": 0.03,
    "speed_video": 3.5,
    "speed_trackman": 1.0,
    "speed_radar": 2.0,
    "lie_toe": 0.5,
    "lie_tilt": 1.2,
}


def nn(x):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else x


def ob(v: float, sd: float) -> Observation:
    return Observation(value=float(v), sd=sd, source="measured")


class Split:
    def __init__(self, d: Path):
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
            own_7i_loft_deg=nn(self.golfers.loc[r.golfer_id].own_7i_loft_deg),
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
                m["backswing_s"] = ob(p.backswing_video_s, SD["tempo_video"])
                m["downswing_s"] = ob(p.downswing_video_s, SD["tempo_video"])
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


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lab", type=Path, default=Path(os.environ.get("TAKOMO_LAB_DIR", DEFAULT_LAB)))
    ap.add_argument("--out", type=Path, help="write a markdown table here")
    args = ap.parse_args(argv)
    if not (args.lab / "data" / "dev").is_dir():
        print(f"lab data not found at {args.lab} (set --lab or TAKOMO_LAB_DIR)", file=sys.stderr)
        return 2
    sys.path[:0] = [str(args.lab), str(args.lab / "examples")]
    from baselines import predict as lab_predict  # lab examples/baselines.py
    from takomo_fit import score as S

    s = Split(args.lab / "data" / "dev")
    runs = {
        "B1 today's rules, answers": lab_predict(s.q),
        "B2 rules + measurement substitution": lab_predict(s.q, s.phone_raw, s.shots, s.tests),
        "E1 engine, answers only": s.engine(False),
        "E2 engine, answers + evidence": s.engine(True),
    }
    rows = []
    for name, pred in runs.items():
        r = S.summary(pred, s.labels)
        comp = r["component_pct"]
        rows.append((name, r["spec_agreement_score"], r["full_spec_exact_pct"], comp))
    parts = list(rows[0][3])
    head = "| Run | Spec agreement | Full spec exact % | " + " | ".join(f"{p} %" for p in parts) + " |"
    sep = "|---" * (3 + len(parts)) + "|"
    lines = [head, sep] + [
        f"| {n} | {a:.2f} | {e:.1f} | " + " | ".join(f"{c[p]:.1f}" for p in parts) + " |" for n, a, e, c in rows
    ]
    table = "\n".join(lines)
    print(table)
    if args.out:
        args.out.write_text(
            "# Dev-split evaluation (POR-19)\n\n"
            f"Synthetic lab data, dev split ({len(s.q)} golfers). Generated by `python -m eval.dev_split --out`.\n"
            "Engine numbers are untuned first guesses (fusion SDs from the lab error model).\n\n" + table + "\n"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

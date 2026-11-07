"""Input fusion for the recommendation engine: launch monitor, ball-line test, flight, tempo, evidence chain,
next steps, stock close calls (docs/RECOMMENDATION_ENGINE.md)."""

import json
from pathlib import Path

from takomo_api.engine import fit as F
from takomo_api.engine import fusion as Fu
from takomo_api.schema import Answers, FitRequest, Measurements, Observation

CODES = json.loads((Path(F.__file__).resolve().parents[1] / "data" / "reason_codes.json").read_text())["codes"]


def full_answers(**kw):
    base = dict(
        age=45,
        sex="male",
        hand="right",
        score_bucket=4,
        speed_7i_mph=75,
        characteristics=["forgiveness", "distance"],
        flight="mid",
        tempo="moderate",
        height_cm=172,
        wrist_to_floor_cm=85,
        glove="M",
    )
    base.update(kw)
    return Answers(**base)


def meas(v, sd, method):
    return Observation(value=v, sd=sd, source="measured", method=method)


def run(answers=None, **m):
    return F.run(FitRequest(step="t", answers=answers or full_answers(), measurements=Measurements(**m)))


def speed_mid(s):
    r = s.estimates["speed_7i_mph"]
    return (r.low + r.high) / 2


def test_launch_monitor_carry_is_not_treated_as_a_remembered_carry():
    a = Answers(score_bucket=3)
    remembered = F.run(FitRequest(step="t", answers=a.model_copy(update={"carry_7i_yd": 150})))
    measured = run(a, carry_7i_yd=meas(150, 1, "launch_monitor"))
    # a remembered 150 yd is corrected down ~15 yd; a measured 150 yd is not
    assert speed_mid(measured) - speed_mid(remembered) > 4
    o = Fu.carry_to_speed(150, None, measured=True)
    assert o.method == "launch_monitor_carry" and abs(o.value - 150 / Fu.YD_PER_MPH_AT_REF) < 0.01


def test_measured_carry_replaces_remembered_carry():
    s = run(full_answers(speed_7i_mph=None, carry_7i_yd=200), carry_7i_yd=meas(140, 1, "launch_monitor"))
    methods = [i.method for i in s.parts["head"].inputs]
    assert "launch_monitor_carry" in methods and "carry_loft_corrected" not in methods


def test_ball_line_tilt_toward_toe_means_flatter():
    s = run(ball_line_tilt_deg=meas(5.0, 0.7, "ball_line_tap_n5"))
    lie = s.parts["lie"]
    assert lie.value < 0
    assert lie.reasons[0].code == "LIE_FROM_BALL_LINE"
    assert lie.inputs[0].label == "Ball-line test" and lie.inputs[0].weight > 0.5
    up = run(ball_line_tilt_deg=meas(-5.0, 0.7, "ball_line_tap_n5")).parts["lie"]
    assert up.value > 0


def test_toe_test_beats_ball_line():
    s = run(lie_need_deg=meas(2, 0.3, "trackman"), ball_line_tilt_deg=meas(5.0, 0.7, "ball_line_tap_n5"))
    assert s.parts["lie"].value == 2 and s.parts["lie"].reasons[0].code == "LIE_FROM_SHOTS"


def test_landing_angle_sets_flight_over_the_answer():
    s = run(full_answers(flight="high"), landing_deg=meas(48, 0.5, "landing_angle"))
    sh = s.parts["shaft"]
    assert any(r.code == "FLIGHT_FROM_LAUNCH" and r.params["flight"] == "low" for r in sh.reasons)
    assert "measured" in sh.evidence
    assert any(i.input == "flight" and "→ low" in i.value for i in sh.inputs)


def test_launch_and_spin_without_landing():
    est = Fu.flight_need(
        Measurements(launch_deg=meas(14, 0.5, "lm"), spin_rpm=meas(4500, 100, "lm")), None, speed_mph=80
    )
    assert est is not None and est.items[0][0].method == "launch_spin"
    assert Fu.flight_need(Measurements(launch_deg=meas(14, 0.5, "lm")), None, 80) is None


def test_clear_video_tempo_beats_answer_but_noisy_video_does_not():
    clear = run(
        full_answers(tempo="smooth"),
        backswing_s=meas(0.72, 0.02, "video_pose"),
        downswing_s=meas(0.24, 0.02, "video_pose"),
    )
    assert any(r.code == "TEMPO_FROM_VIDEO" and r.params["tempo"] == "quick" for r in clear.parts["shaft"].reasons)
    # 1.36 s total sits on the smooth/moderate edge; with a big SD the "moderate" answer should stand
    noisy = run(
        full_answers(tempo="moderate"),
        backswing_s=meas(1.1, 0.25, "video_pose"),
        downswing_s=meas(0.3, 0.25, "video_pose"),
    )
    assert any(
        r.code == "TEMPO_VIDEO_UNCLEAR" and r.params["tempo"] == "moderate" for r in noisy.parts["shaft"].reasons
    )


def test_evidence_weights_are_shares():
    s = run(speed_7i_mph=meas(85, 1.5, "launch_monitor"))
    speed = [i for i in s.parts["head"].inputs if i.input == "speed_7i_mph"]
    assert abs(sum(i.weight for i in speed) - 1) < 0.03
    assert speed[0].label == "Launch monitor speed" and speed[0].weight > 0.8


def test_next_steps_rank_missing_inputs_and_drop_once_given():
    s = run()
    keys = [n.input for n in s.next_steps]
    assert "ball_line_test" in keys and "launch_monitor" in keys
    assert all(n.code in CODES for n in s.next_steps)
    assert s.next_steps == sorted(s.next_steps, key=lambda n: -n.gain)
    s2 = run(
        speed_7i_mph=meas(75, 1.5, "launch_monitor"),
        landing_deg=meas(40, 0.5, "landing_angle"),
        ball_line_tilt_deg=meas(0, 0.7, "ball_line_tap_n5"),
    )
    keys2 = [n.input for n in s2.next_steps]
    assert "ball_line_test" not in keys2 and "launch_monitor" not in keys2


def test_stock_close_call_when_custom_only_by_a_hair():
    # lie need just past -0.5: custom -1, but standard nearly as likely
    s = run(lie_need_deg=meas(-0.7, 0.3, "trackman"))
    adv = s.stock_advice
    assert s.parts["lie"].value == -1
    assert "lie" in adv.close_call_parts
    assert [b.part for b in adv.blockers] == ["lie"]
    assert any(r.code == "STOCK_CLOSE_CALL" for r in s.parts["purchase"].reasons)
    clear = run(lie_need_deg=meas(-0.9, 0.3, "trackman"))
    assert clear.stock_advice.close_call_parts == []


def test_every_emitted_code_exists():
    s = run(
        full_answers(tempo="smooth"),
        backswing_s=meas(0.72, 0.02, "video_pose"),
        downswing_s=meas(0.24, 0.02, "video_pose"),
        landing_deg=meas(48, 0.5, "landing_angle"),
        ball_line_tilt_deg=meas(5.0, 0.7, "ball_line_tap_n5"),
    )
    codes = [r.code for p in s.parts.values() for r in p.reasons] + [n.code for n in s.next_steps]
    assert codes and all(c in CODES for c in codes)

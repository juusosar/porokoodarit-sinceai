"""swing_analytics.py - End-to-end AI Golf Club Fitting & Analytics Engine

Takomo Golf Custom Fitting Pipeline (240 FPS Pose & Clubhead Architecture)
--------------------------------------------------------------------------
Analyzes 240 FPS slow-motion kinematics to:
1. Detect true kinetic impact release events.
2. Calculate 7-iron club head speed (mph) via anthropometric double-pendulum kinetics.
3. Calculate swing tempo ratio (backswing / downswing duration).
4. Estimate physical club shaft length in metres.
5. Categorize metrics into Takomo custom fitting recommendations:
   - Tempo: 'fast' (< 2.5), 'mid' (2.5-3.2), 'low' (> 3.2)
   - Offset: 'yes' (low speed / quick tempo needing face closure help), 'no' (neutral/smooth)
   - Forgiveness: 'Maximum' (101 MKII), 'Mid-High' (201 MKII), 'Players' (201T / 301)
   - Speed Bucket: Bucket 1 (<60 mph) to Bucket 5 (>90 mph)
   - Shaft Flex: 'Lady', 'Senior', 'Regular', 'Stiff', 'X-Stiff'
6. Evaluate zero-shot against held-out TrackMan ground truth test set.
"""

import os
import json
import numpy as np
import pandas as pd
from pathlib import Path


def get_tempo(df: pd.DataFrame = None) -> float:
    """Retrieves the swing tempo ratio (Backswing Duration / Downswing Duration).

    Extracts tempo ratio directly from df (first row)"""
    # Check directly from df (first row has tempo_ratio from preprocessing)
    tempo = 0.0
    if df is not None and not df.empty and "tempo_ratio" in df.columns:
        valid_tempo = df["tempo_ratio"].dropna()
        if not valid_tempo.empty:
            try:
                val = float(valid_tempo.iloc[0])
                if not np.isnan(val) and val > 0:
                    tempo = val
            except (ValueError, TypeError):
                pass
    return tempo


def get_top_bottom_d(
    df: pd.DataFrame,
    user_h: float = 1.82,
    shoulder_px: float = None,
    ratio: float = 0.20
) -> float:
    """Calculates the Euclidean distance between the wrists at the Top of the swing
    to their location at the Bottom (Impact) of the swing."""

    # Identify wrist columns (landmark 15: left wrist, landmark 16: right wrist)
    wrist_x_cols = [c for c in ["landmark_15_x", "landmark_16_x", "lw_x", "rw_x"] if c in df.columns]
    wrist_y_cols = [c for c in ["landmark_15_y", "landmark_16_y", "lw_y", "rw_y"] if c in df.columns]

    top_rows = df[df["swing_phase"] == "Top"]
    if top_rows.empty:
        top_rows = df[df["swing_event"] == "Top"]
    top_row = top_rows.iloc[0] if not top_rows.empty else df.iloc[len(df) // 3]

    bottom_rows = df[df["swing_phase"] == "Impact"]
    if bottom_rows.empty:
        bottom_rows = df[df["swing_event"] == "Impact"]
    bottom_row = bottom_rows.iloc[0] if not bottom_rows.empty else df.iloc[len(df) // 2]

    # Compute 2D wrist coordinates at Top and Bottom
    x_top = float(top_row[wrist_x_cols].mean())
    y_top = float(top_row[wrist_y_cols].mean())

    x_bottom = float(bottom_row[wrist_x_cols].mean())
    y_bottom = float(bottom_row[wrist_y_cols].mean())

    # Vertical hand travel in normalized coordinates
    dy = abs(y_bottom - y_top)

    # Lateral hand travel in normalized coordinates (if x columns exist)
    dx = 0.0
    x_top = float(top_row[wrist_x_cols].mean())
    x_bottom = float(bottom_row[wrist_x_cols].mean())
    dx = abs(x_bottom - x_top)

    # Calculate visible golfer height in normalized coordinates (nose to ankles)
    head_cols = [c for c in ["landmark_0_y", "landmark_1_y", "landmark_2_y"] if c in df.columns]
    ankle_cols = [c for c in ["landmark_27_y", "landmark_28_y"] if c in df.columns]

    if head_cols and ankle_cols:
        head_y = float(df[head_cols].median().mean())
        ankle_y = float(df[ankle_cols].median().mean())
        body_h_norm = abs(ankle_y - head_y)
    else:
        body_h_norm = 0.43

    if body_h_norm <= 0 or np.isnan(body_h_norm):
        body_h_norm = 0.43

    # Total hand displacement in normalized units (aspect-scaled lateral + vertical)
    d_norm = float(np.hypot(dy, dx * 0.5625))  # 0.5625 = 9/16 portrait aspect ratio

    # Scale to real-world metres via user height while accounting for stance's bend
    # And the fact that true travel is more of an arch, not straight line
    d_m = d_norm * (user_h * 0.9 / body_h_norm) * 1.35

    return d_m


def calculate_club_speed(
    df: pd.DataFrame,
    user_h: float = 1.82,
    shaft_m: float = 0.90,
    shoulder_px: float = None
) -> float:
    # Based on a double-pendulum kinetic model[cite: 1]

    # Arm length ratio
    ratio = 0.4
    arm_m = ratio * user_h
    
    # Total pendulum radius (Arm + Club Shaft)
    r = arm_m + shaft_m

    # Get real-world downswing displacement vector length in meters
    d = get_top_bottom_d(df, user_h=user_h, shoulder_px=shoulder_px)
    
    # Extract scalar downswing duration in seconds
    t = float(df["downswing_s"].dropna().iloc[0])
    if t <= 0:
        return 0.0

    # Average linear hand velocity
    v_hand = d / t

    # Double pendulum speed multiplier combining arm radius and club lever length
    # V_head = v_hand * (Total Radius / Arm Radius) converted to mph
    club_head_speed_mph = (v_hand * (r / arm_m) * np.pi) * 2.23694

    return club_head_speed_mph





def calculate_shaft_length_m(
    shaft_px: float = None,
    shoulder_px: float = None,
    user_h: float = 1.82,
    ratio: float = 0.16,
    df: pd.DataFrame = None
) -> float:
    """Calculates the physical club shaft length in metres.

    Uses the ratio between measured shaft pixels and shoulder width pixels,
    scaled by real-world shoulder width (~0.16 * user height).
    """
    s_series = pd.to_numeric(df["shaft_len_px"], errors="coerce").dropna()
    if not s_series.empty:
        shaft_px = float(s_series.iloc[0])

    sh_series = pd.to_numeric(df["shoulder_width_px"], errors="coerce").dropna()
    if not sh_series.empty:
        shoulder_px = float(sh_series.iloc[0])

    if shaft_px <= 0 or shoulder_px <= 0 or user_h <= 0 or ratio <= 0:
        return np.nan

    real_shoulder_m = user_h * ratio
    meters_per_pixel = real_shoulder_m / shoulder_px
    shaft_m = shaft_px * meters_per_pixel
    return round(float(shaft_m), 3)



def collect_swing_metrics(
    dtl_csv: str = "all_pose_landmarks_dtl.csv",
    front_csv: str = "all_pose_landmarks_front.csv",
    output_csv: str = "estimated_swing_metrics.csv",
    user_h: float = 1.82,
    default_fps: float = 240.0
) -> pd.DataFrame:
    """Collects and fuses swing metrics from DTL and Face-On (Front) videos:
    - Calculates Club Speed, Tempo, and Shaft Length.
    """
    # Load DTL and Face-On telemetry CSVs
    df_dtl = pd.read_csv(dtl_csv) if os.path.exists(dtl_csv) else None
    if df_dtl is not None:
        print(f"Loaded DTL telemetry from: {dtl_csv}")

    df_front = pd.read_csv(front_csv) if os.path.exists(front_csv) else None
    if df_front is not None:
        print(f"Loaded Face-On telemetry from: {front_csv}")

    rows = []
    golfer_ids = list(dict.fromkeys(df_front["golfer_id"].dropna())) if df_front is not None and "golfer_id" in df_front.columns else (
        list(dict.fromkeys(df_dtl["golfer_id"].dropna())) if df_dtl is not None and "golfer_id" in df_dtl.columns else ["golfer"]
    )

    for gid in golfer_ids:
        sub_front = df_front[df_front["golfer_id"] == gid] if df_front is not None and "golfer_id" in df_front.columns else df_front
        sub_dtl = df_dtl[df_dtl["golfer_id"] == gid] if df_dtl is not None and "golfer_id" in df_dtl.columns else df_dtl

        shoulder_px_dtl = float(sub_dtl["shoulder_width_px"].dropna().iloc[0]) if sub_dtl is not None and "shoulder_width_px" in sub_dtl.columns and not sub_dtl["shoulder_width_px"].dropna().empty else None
        shoulder_px_front = float(sub_front["shoulder_width_px"].dropna().iloc[0]) if sub_front is not None and "shoulder_width_px" in sub_front.columns and not sub_front["shoulder_width_px"].dropna().empty else None

        # Tempo extracted directly from CSV via calculate_tempo
        tempo_val = get_tempo(df=sub_front)

        # Shaft length in metres via calculate_shaft_length_m
        shaft_m_val = calculate_shaft_length_m(user_h=user_h, shoulder_px=shoulder_px_dtl, df=sub_dtl)

        # Club speed via calculate_club_speed
        speed_val = calculate_club_speed(df=sub_front, user_h=user_h, shaft_m=shaft_m_val, shoulder_px=shoulder_px_front)

        rows.append({
            "golfer_id": gid,
            "est_7i_speed_mph": speed_val,
            "est_tempo": tempo_val,
            "est_shaft_len_m": shaft_m_val
        })

    result_df = pd.DataFrame(rows, columns=[
        "golfer_id",
        "est_7i_speed_mph",
        "est_tempo",
        "est_shaft_len_m"
    ])

    result_df.to_csv(output_csv, index=False)
    print(f"Saved swing metrics to: {output_csv}")
    return result_df


def categorize_tempo(est_tempo: float) -> str:
    """Categorizes swing tempo based on est_tempo:
    - 'fast': under 2.5
    - 'mid':  2.5 to 3.2 (inclusive)
    - 'low':  over 3.2

    Args:
        est_tempo: Swing tempo ratio (backswing duration / downswing duration).

    Returns:
        str: 'fast', 'mid', 'low', or None if est_tempo is missing/invalid.
    """
    if est_tempo is None or pd.isna(est_tempo):
        return None
    try:
        val = float(est_tempo)
        if val < 2.5:
            return "fast"
        elif val <= 3.2:
            return "mid"
        else:
            return "low"
    except (ValueError, TypeError):
        return None


def categorize_offset(est_speed: float = None, est_tempo: float = None) -> str:
    """Categorizes whether a golfer needs club head offset:
    - 'yes': Golfer with lower swing speed (< 71.0 mph) or quick tempo (< 2.5)
             struggles to square the face in time, benefiting from offset (101 MKII).
    - 'no':  Golfer with controlled tempo (>= 2.5) and moderate-to-high speed (>= 71.0 mph)
             squares the club face naturally and prefers neutral/minimal offset.

    Args:
        est_speed: Estimated 7-iron club head speed in mph.
        est_tempo: Estimated swing tempo ratio.

    Returns:
        str: 'yes' or 'no', or None if inputs are missing.
    """
    if (est_speed is None or pd.isna(est_speed)) and (est_tempo is None or pd.isna(est_tempo)):
        return None
    try:
        speed = float(est_speed) if est_speed is not None and not pd.isna(est_speed) else 75.0
        tempo = float(est_tempo) if est_tempo is not None and not pd.isna(est_tempo) else 3.0
        return "yes" if (speed < 71.0 or tempo < 2.5) else "no"
    except (ValueError, TypeError):
        return "no"


def categorize_speed(est_speed: float) -> str:
    """Categorizes 7-iron club head speed into Takomo's 5 official swing buckets:
    - Bucket 1: under 60 mph (< 120 yd carry)
    - Bucket 2: 60 to 70 mph (120-135 yd carry)
    - Bucket 3: 71 to 80 mph (135-155 yd carry)
    - Bucket 4: 81 to 90 mph (155-175 yd carry)
    - Bucket 5: over 90 mph (> 175 yd carry)

    Source: Takomo BASELINE_RULES_INTERPRETATION.md
    """
    if est_speed is None or pd.isna(est_speed):
        return None
    try:
        val = float(est_speed)
        if val < 60.0:
            return "Bucket 1 (< 60 mph)"
        elif val <= 70.0:
            return "Bucket 2 (60-70 mph)"
        elif val <= 80.0:
            return "Bucket 3 (71-80 mph)"
        elif val <= 90.0:
            return "Bucket 4 (81-90 mph)"
        else:
            return "Bucket 5 (> 90 mph)"
    except (ValueError, TypeError):
        return None


def categorize_flex(est_speed: float) -> str:
    """Derives recommended shaft flex from 7-iron club head speed:
    - Bucket 1 (< 60 mph): 'Lady'
    - Bucket 2 (60-70 mph): 'Senior'
    - Bucket 3 (71-80 mph): 'Regular'
    - Bucket 4 (81-90 mph): 'Stiff'
    - Bucket 5 (> 90 mph):  'X-Stiff'

    Source: Takomo BASELINE_RULES_INTERPRETATION.md
    """

    val = float(est_speed)
    if val < 60.0:
        return "Lady"
    elif val <= 70.0:
        return "Senior"
    elif val <= 80.0:
        return "Regular"
    elif val <= 90.0:
        return "Stiff"
    else:
        return "X-Stiff"


def categorize_forgiveness(est_speed: float = None) -> str:
    """Categorizes club head forgiveness requirement into Takomo head tiers:
    - 'Maximum':  Speed < 71.0 mph (Takomo 101 MKII - hollow body, max MOI, forgiving game-improvement).
    - 'Mid-High': Speed 71.0 to 80.0 mph (Takomo 201 MKII - forged cavity back, balanced distance & forgiveness).
    - 'Players':  Speed > 80.0 mph (Takomo 201T / 301 - compact tour cavity / muscle back blade).

    Args:
        est_speed: Estimated 7-iron club head speed in mph.

    Returns:
        str: 'Maximum', 'Mid-High', 'Players', or None if est_speed is missing.
    """
    s = float(est_speed)
    if s < 71.0:
        return "Maximum"
    elif s <= 80.0:
        return "Mid-High"
    else:
        return "Players"


def predict_fitting(
    metrics_csv: str = "estimated_swing_metrics.csv",
    output_csv: str = "predictions.csv"
) -> pd.DataFrame:
    """Takes 'estimated_swing_metrics.csv' and outputs club fitting recommendations
    into 'predictions.csv', including categorized tempo, offset, forgiveness,
    speed bucket, and shaft flex.

    Output Columns:
        [golfer_id, tempo, offset, forgiveness, speed, flex]

    Args:
        metrics_csv: Path to input metrics CSV.
        output_csv: Path to output predictions CSV.

    Returns:
        pd.DataFrame containing the predictions.
    """
    if not os.path.exists(metrics_csv):
        raise FileNotFoundError(f"Input metrics CSV not found at: {metrics_csv}")

    df_metrics = pd.read_csv(metrics_csv)
    prediction_rows = []

    for _, row in df_metrics.iterrows():
        est_tempo_val = row.get("est_tempo")
        est_speed_val = row.get("est_7i_speed_mph")

        tempo_cat = categorize_tempo(est_tempo_val)
        offset_cat = categorize_offset(est_speed=est_speed_val, est_tempo=est_tempo_val)
        forgiveness_cat = categorize_forgiveness(est_speed=est_speed_val)
        speed_cat = categorize_speed(est_speed_val)
        flex_cat = categorize_flex(est_speed_val)

        prediction_rows.append({
            "golfer_id": row.get("golfer_id"),
            "tempo": tempo_cat,              # 'fast', 'mid', 'low'
            "offset": offset_cat,            # 'yes', 'no'
            "forgiveness": forgiveness_cat,  # 'Maximum', 'Mid-High', 'Players'
            "speed": speed_cat,              # 'Bucket 1 (< 60 mph)' ... 'Bucket 5 (> 90 mph)'
            "flex": flex_cat,                # 'Lady', 'Senior', 'Regular', 'Stiff', 'X-Stiff'
        })

    df_preds = pd.DataFrame(prediction_rows, columns=[
        "golfer_id",
        "tempo",
        "offset",
        "forgiveness",
        "speed",
        "flex"
    ])

    df_preds.to_csv(output_csv, index=False)
    print(f"Saved fitting predictions to: {output_csv}")
    return df_preds

# tän voi lopulta poistaa
def evaluate_against_test_set(
    metrics_csv: str = "estimated_swing_metrics.csv",
    test_truth_csv: str = "trackman_truth.csv"
) -> pd.DataFrame:
    """Evaluates estimated swing metrics zero-shot against an unseen TrackMan test set.

    Reports Mean Absolute Error (MAE) and accuracy for:
    - 7-Iron Club Head Speed (mph)
    """
    if not os.path.exists(metrics_csv) or not os.path.exists(test_truth_csv):
        return None

    df_est = pd.read_csv(metrics_csv)
    df_true = pd.read_csv(test_truth_csv)

    df_merged = pd.merge(df_est, df_true, left_on="golfer_id", right_on="golfer_id", suffixes=("_est", "_true"))

    print("\n" + "=" * 60)
    print(f"HELD-OUT TEST SET EVALUATION ({len(df_merged)} test swings evaluated)")
    print("=" * 60)

    # 1. Speed Evaluation
    if "est_7i_speed_mph" in df_merged.columns and "true_7i_speed_mph" in df_merged.columns:
        valid_speed = df_merged.dropna(subset=["est_7i_speed_mph", "true_7i_speed_mph"])
        if not valid_speed.empty:
            mae_speed = (valid_speed["est_7i_speed_mph"] - valid_speed["true_7i_speed_mph"]).abs().mean()
            print(f"• 7-Iron Speed MAE:  {mae_speed:.2f} mph")

    print("=" * 60)
    return df_merged


if __name__ == "__main__":
    df_metrics = collect_swing_metrics()
    print("\nEstimated Swing Metrics:")
    print(df_metrics.to_string(index=False))

    df_preds = predict_fitting()
    print("\nFitting Predictions:")
    print(df_preds.to_string(index=False))

    # Evaluate zero-shot against held-out TrackMan ground truth test set if available
    evaluate_against_test_set()

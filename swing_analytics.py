import os
import json
import numpy as np
import pandas as pd
from pathlib import Path


def calculate_tempo(phases: dict = None, fps: float = 30.0, df_video: pd.DataFrame = None) -> float:
    """Retrieves or calculates the swing tempo ratio (Backswing Duration / Downswing Duration).

    Extracts tempo ratio directly from df_video (first row) or from phases dict.
    Otherwise, computes from timestamps or frame indices.

    Args:
        phases: Dictionary containing detected event timestamps or frame indices.
        fps: Video frame rate (used if only frame indices are available).
        df_video: DataFrame slice for the specific video (optional).

    Returns:
        float: Tempo ratio rounded to 2 decimal places (e.g. 2.85 for a 2.85:1 tempo).
               Returns np.nan if phases are missing or invalid.
    """
    # 0. Check directly from df_video (first row has tempo_ratio from preprocessing)
    if df_video is not None and not df_video.empty and "tempo_ratio" in df_video.columns:
        valid_tempo = df_video["tempo_ratio"].dropna()
        if not valid_tempo.empty:
            try:
                val = float(valid_tempo.iloc[0])
                if not np.isnan(val):
                    return round(val, 2)
            except (ValueError, TypeError):
                pass

    if not isinstance(phases, dict):
        return np.nan

    # 1. Use pre-calculated tempo_ratio from phase_detector if available
    if phases.get("tempo_ratio") is not None:
        return float(phases["tempo_ratio"])

    # 2. Use timestamps in milliseconds if available
    timestamps_ms = phases.get("event_timestamps_ms", {})
    t_addr_ms = timestamps_ms.get("Address")
    t_top_ms = timestamps_ms.get("Top")
    t_impact_ms = timestamps_ms.get("Impact")

    if t_addr_ms is not None and t_top_ms is not None and t_impact_ms is not None:
        t_back_s = (t_top_ms - t_addr_ms) / 1000.0
        t_down_s = (t_impact_ms - t_top_ms) / 1000.0
    else:
        # 3. Fallback to event frame indices
        frames = phases.get("event_frames", {})
        f_addr = frames.get("Address")
        f_top = frames.get("Top")
        f_impact = frames.get("Impact")

        if f_addr is None or f_top is None or f_impact is None:
            return np.nan

        video_fps = phases.get("fps", fps) or 30.0
        t_back_s = (f_top - f_addr) / float(video_fps)
        t_down_s = (f_impact - f_top) / float(video_fps)

    # Validate physical progression (Address < Top < Impact)
    if t_back_s <= 0 or t_down_s <= 0:
        return np.nan

    tempo_ratio = round(float(t_back_s / t_down_s), 2)
    return tempo_ratio


def calculate_club_speed(df_video: pd.DataFrame, phases: dict, fps: float = 30.0, user_height_m: float = 1.78) -> float:
    """Estimates 7-iron club head speed in mph at impact.

    (Step 2 Implementation Placeholder)
    """
    return np.nan


def calculate_club_path(df_video: pd.DataFrame, phases: dict) -> float:
    """Estimates the horizontal club delivery path angle in degrees (In-to-Out vs Out-to-In)

    using the Hand Path Proxy (MediaPipe lead/trail wrists 15 & 16) through impact.

    Method:
        1. Identifies the Impact frame (from phases dict or lowest wrist elevation).
        2. Extracts a small window of frames around impact (3 frames before to 3 frames after).
        3. Computes the horizontal hand movement vector dx across the impact window.
        4. Compares against the target line reference to determine:
           - Positive (+) = In-to-Out delivery path (Draw bias -> No offset need)
           - Zero (~0.0°) = Neutral / Square path
           - Negative (-) = Out-to-In delivery path (Fade/Slice bias -> Offset need)

    Args:
        df_video: DataFrame containing telemetry rows for the specific video.
        phases: Dict containing detected phase frame indices (must contain 'Impact').

    Returns:
        float: Club path angle in degrees rounded to 1 decimal place.
               Returns np.nan if impact or telemetry data is missing.
    """
    if df_video.empty:
        return np.nan

    # 1. Identify Impact Frame
    event_frames = phases.get("event_frames", {}) if isinstance(phases, dict) else {}
    impact_frame = event_frames.get("Impact")

    # If not in phases dict, look directly in df_video's swing_event column
    if (impact_frame is None or pd.isna(impact_frame)) and "swing_event" in df_video.columns:
        impact_rows = df_video[df_video["swing_event"] == "Impact"]
        if not impact_rows.empty:
            impact_frame = int(impact_rows["frame_idx"].iloc[0])

    wrist_y_cols = [c for c in ["landmark_15_y", "landmark_16_y", "lw_y", "rw_y"] if c in df_video.columns]
    wrist_x_cols = [c for c in ["landmark_15_x", "landmark_16_x", "lw_x", "rw_x"] if c in df_video.columns]

    if not wrist_x_cols or not wrist_y_cols:
        return np.nan

    if impact_frame is None or pd.isna(impact_frame):
        if "frame_idx" in df_video.columns:
            half_df = df_video.iloc[len(df_video) // 3:]
            impact_frame = int(half_df[wrist_y_cols].mean(axis=1).idxmax())
        else:
            return np.nan

    impact_frame = int(impact_frame)

    # 2. Extract window of 3 frames before to 3 frames after impact
    window_frames = list(range(impact_frame - 3, impact_frame + 4))
    sub_df = df_video[df_video["frame_idx"].isin(window_frames)].sort_values("frame_idx")

    if len(sub_df) < 2 and "frame_idx" in df_video.columns:
        idx_matches = df_video.index[df_video["frame_idx"] == impact_frame].tolist()
        if idx_matches:
            mid = idx_matches[0]
            sub_df = df_video.iloc[max(0, mid - 3):min(len(df_video), mid + 4)]

    sub_copy = sub_df.copy()
    sub_copy["wrist_x"] = sub_copy[wrist_x_cols].mean(axis=1)
    sub_copy["wrist_y"] = sub_copy[wrist_y_cols].mean(axis=1)
    valid_wrists = sub_copy.dropna(subset=["wrist_x", "wrist_y"])

    if len(valid_wrists) < 2:
        return np.nan

    wx = valid_wrists["wrist_x"].values

    # 3. Compute horizontal delivery displacement (dx) across the impact release window
    # In Down-the-Line view:
    # dx > 0: hands move outward/away from the body to the right (In-to-Out)
    # dx < 0: hands pull inward towards the body to the left (Out-to-In)
    dx = float(wx[-1] - wx[0])

    # Angular conversion calibrated against typical physical hand path span (0.4 normalized width)
    # This yields realistic golf launch monitor path angles (e.g. -6° to +6°)
    angle_deg = float(np.degrees(np.arctan2(dx, 0.40)))

    return round(float(np.clip(angle_deg, -12.0, 12.0)), 1)


def calculate_swing_plane(df_video: pd.DataFrame, phases: dict) -> float:
    """Estimates the vertical swing plane / delivery steepness in degrees.

    (Step 4 Implementation Placeholder)
    """
    return np.nan


def collect_swing_metrics(
    landmarks_csv: str = "all_pose_landmarks_front.csv",
    output_csv: str = "estimated_swing_metrics_front.csv",
    user_height_m: float = 1.78
) -> pd.DataFrame:
    """Collects swing metrics piece-by-piece and exports 'estimated_swing_metrics.csv'.

    Columns:
        [golfer_id, est_7i_speed_mph, est_tempo, est_club_path, est_swing_plane]

    Args:
        landmarks_csv: Path to CSV containing MediaPipe landmarks.
        output_csv: Path to write the output CSV ('estimated_swing_metrics.csv').
        user_height_m: Golfer height in meters (default 1.78m) for pixel-to-meter scaling.

    Returns:
        pd.DataFrame containing the collected metrics.
    """
    rows = []

    # 1. Load landmarks CSV if available
    df_all = None
    if os.path.exists(landmarks_csv):
        df_all = pd.read_csv(landmarks_csv)

    # 2. Find all unique golfer IDs from CSV or available JSON phase files
    golfer_ids = []
    id_col = "golfer_id" if (df_all is not None and "golfer_id" in df_all.columns) else "video_name"
    if df_all is not None and id_col in df_all.columns:
        golfer_ids = list(df_all[id_col].unique())

    # Fallback to search for swing_phases_*.json if CSV not yet created
    if not golfer_ids:
        for json_path in Path(".").glob("swing_phases_*.json"):
            gid = json_path.stem.replace("swing_phases_", "")
            golfer_ids.append(gid)

    if not golfer_ids:
        # Default single golfer fallback
        golfer_ids = ["swing_analysis"]

    for gid in golfer_ids:
        stem = Path(str(gid)).stem
        # Video-specific telemetry slice
        df_video = pd.DataFrame()
        fps = 30.0
        if df_all is not None and id_col in df_all.columns:
            df_video = df_all[df_all[id_col] == gid].copy()
            if not df_video.empty and "timestamp_ms" in df_video.columns and len(df_video) > 1:
                dt_ms = df_video["timestamp_ms"].diff().median()
                if dt_ms and dt_ms > 0:
                    fps = 1000.0 / dt_ms

        # Extract phase info directly from df_video columns
        phases_data = {}
        if not df_video.empty:
            if "tempo_ratio" in df_video.columns:
                valid_tempo = df_video["tempo_ratio"].dropna()
                if not valid_tempo.empty and pd.notna(valid_tempo.iloc[0]):
                    try:
                        phases_data["tempo_ratio"] = float(valid_tempo.iloc[0])
                    except (ValueError, TypeError):
                        pass

            if "swing_event" in df_video.columns:
                event_df = df_video.dropna(subset=["swing_event"])
                event_frames = {}
                event_timestamps = {}
                for _, r in event_df.iterrows():
                    ev = str(r["swing_event"]).strip()
                    if ev:
                        event_frames[ev] = int(r["frame_idx"])
                        if "timestamp_ms" in r:
                            event_timestamps[ev] = float(r["timestamp_ms"])
                if event_frames:
                    phases_data["event_frames"] = event_frames
                    phases_data["event_timestamps_ms"] = event_timestamps

        # Fallback to swing_phases_*.json if legacy JSON exists
        if not phases_data:
            json_candidates = [
                f"swing_phases_{stem}.json",
                "swing_phases.json"
            ]
            for candidate in json_candidates:
                if os.path.exists(candidate):
                    try:
                        with open(candidate, "r", encoding="utf-8") as f:
                            phases_data = json.load(f)
                        break
                    except Exception:
                        pass

        if phases_data.get("fps"):
            fps = float(phases_data["fps"])

        # 3. Calculate each metric piece-by-piece
        tempo_val = calculate_tempo(phases_data, fps=fps, df_video=df_video)
        speed_val = calculate_club_speed(df_video, phases_data, fps=fps, user_height_m=user_height_m)
        path_val = calculate_club_path(df_video, phases_data)
        plane_val = calculate_swing_plane(df_video, phases_data)

        rows.append({
            "golfer_id": gid,
            "est_7i_speed_mph": speed_val,
            "est_tempo": tempo_val,
            "est_club_path": path_val,
            "est_swing_plane": plane_val
        })

    result_df = pd.DataFrame(rows, columns=[
        "golfer_id",
        "est_7i_speed_mph",
        "est_tempo",
        "est_club_path",
        "est_swing_plane"
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


def categorize_offset(est_club_path: float, out_to_in_threshold: float = -2.0) -> str:
    """Categorizes whether a golfer needs club head offset:
    - 'yes': if there is a lot of out-to-in (est_club_path < -2.0°).
             Offset helps square the club face to mitigate slices.
    - 'no':  otherwise (neutral or in-to-out path >= -2.0°).

    Args:
        est_club_path: Estimated club delivery path angle in degrees (negative = out-to-in).
        out_to_in_threshold: Threshold below which path is considered 'a lot of out-to-in' (default -2.0°).

    Returns:
        str: 'yes' or 'no', or None if est_club_path is missing/invalid.
    """
    if est_club_path is None or pd.isna(est_club_path):
        return None
    try:
        val = float(est_club_path)
        return "yes" if val < out_to_in_threshold else "no"
    except (ValueError, TypeError):
        return None


def predict_fitting(
    metrics_csv: str = "estimated_swing_metrics_front.csv",
    output_csv: str = "predictions_front.csv"
) -> pd.DataFrame:
    """Takes 'estimated_swing_metrics.csv' and outputs club fitting recommendations

    into 'predictions.csv', including categorized tempo, offset ('yes'/'no'),
    and placeholders for forgiveness, speed, flex, and lie_deg.

    Output Columns:
        [golfer_id, tempo, offset, forgiveness, speed, flex, lie_deg]

    Args:
        metrics_csv: Path to input metrics CSV ('estimated_swing_metrics.csv').
        output_csv: Path to output predictions CSV ('predictions.csv').

    Returns:
        pd.DataFrame containing the predictions.
    """
    if not os.path.exists(metrics_csv):
        raise FileNotFoundError(f"Input metrics CSV not found at: {metrics_csv}")

    df_metrics = pd.read_csv(metrics_csv)
    prediction_rows = []
    id_col = "golfer_id" if "golfer_id" in df_metrics.columns else "video_name"

    for _, row in df_metrics.iterrows():
        gid = row.get(id_col, "unknown")
        est_tempo_val = row.get("est_tempo")
        est_path_val = row.get("est_club_path")

        tempo_cat = categorize_tempo(est_tempo_val)
        offset_cat = categorize_offset(est_path_val)

        prediction_rows.append({
            "golfer_id": gid,
            "tempo": tempo_cat,        # 'fast', 'mid', 'low'
            "offset": offset_cat,      # 'yes' if a lot of out-to-in, 'no' if else
            "forgiveness": None,       # e.g. 'Maximum', 'Mid-High', 'Players' -> yes / no
            "speed": None,             # e.g. 'Bucket 3 (71-80 mph)'
            "flex": None,              # e.g. 'Regular', 'Stiff', 'x-stiff', 'lady', 'senior'
            "lie_deg": None            # e.g. -3.0, -2.0, -1.0, 0.0 (Standard), +1.0 (Upright), +2.0, +3.0
        })

    df_preds = pd.DataFrame(prediction_rows, columns=[
        "golfer_id",
        "tempo",
        "offset",
        "forgiveness",
        "speed",
        "flex",
        "lie_deg"
    ])

    df_preds.to_csv(output_csv, index=False)
    print(f"Saved fitting predictions to: {output_csv}")
    return df_preds


if __name__ == "__main__":
    df_metrics = collect_swing_metrics()
    print("\nEstimated Swing Metrics:")
    print(df_metrics.to_string(index=False))

    df_preds = predict_fitting()
    print("\nFitting Predictions (Placeholders):")
    print(df_preds.to_string(index=False))



from pathlib import Path
import numpy as np
import pandas as pd

ORDERED_EVENTS = [
    'Address',
    'Toe-up',
    'Mid-backswing',
    'Top',
    'Mid-downswing',
    'Impact',
    'Mid-follow-through',
    'Finish',
]


class KinematicPhaseDetector:
  """Detects the 8 standardized golf swing phases using wrist kinematics."""

  def __init__(self, pose_model_path='models/pose_landmarker_lite.task'):
    self.pose_model_path = pose_model_path

  def detect_phases_from_dataframe(self, df, fps=240.0, video_path=''):
    y_cols = [
        c
        for c in ['landmark_15_y', 'landmark_16_y', 'lw_y', 'rw_y']
        if c in df.columns
    ]
    x_cols = [
        c
        for c in ['landmark_15_x', 'landmark_16_x', 'lw_x', 'rw_x']
        if c in df.columns
    ]

    if not y_cols:
      raise ValueError(
          'DataFrame must contain wrist coordinates (landmarks 15/16).'
      )

    df = df.copy()
    df['wrist_y'] = (
        df[y_cols].mean(axis=1).interpolate(limit_direction='both')
    )
    df['wrist_x'] = (
        df[x_cols].mean(axis=1).interpolate(limit_direction='both')
        if x_cols
        else 0.0
    )

    num_frames = len(df)
    if num_frames < 10:
      raise ValueError(f'Too few frames ({num_frames}) for kinematic analysis.')

    smoothed_x = (
        df['wrist_x'].rolling(window=5, center=True, min_periods=1).mean().values
    )
    smoothed_y = (
        df['wrist_y'].rolling(window=5, center=True, min_periods=1).mean().values
    )
    timestamps_ms = (
        df['timestamp_ms'].values
        if 'timestamp_ms' in df.columns
        else (np.arange(num_frames) * (1000.0 / fps)).astype(int)
    )

    # 1. Key Anchor Frames Identification
    # 1a. Resting Setup Position: established from the early setup frames
    base_len = min(40, max(10, int(num_frames * 0.15)))
    base_x = float(np.median(smoothed_x[:base_len]))
    base_y = float(np.median(smoothed_y[:base_len]))

    # 1b. Address (Takeaway Onset): first sustained movement away from resting setup
    # Uses 2D displacement (captures both lateral takeaway in Face-On and vertical in DTL)
    dist_from_setup = np.sqrt((smoothed_x - base_x)**2 + (smoothed_y - base_y)**2)
    addr_idx = 0
    for f in range(base_len, num_frames - 50):
        if dist_from_setup[f] > 0.025 and dist_from_setup[min(num_frames - 1, f + 5)] > 0.035:
            for back_f in range(f, max(0, f - 35), -1):
                if dist_from_setup[back_f] < 0.015:
                    addr_idx = back_f
                    break
            else:
                addr_idx = f
            break

    # 1c. Top of Backswing: the FIRST peak elevation (local minimum of y) after takeaway onset
    # that is followed by the rapid downswing plunge (increase in y >= 0.07 towards ball impact).
    # This prevents finish apex from being misclassified as Top, and naturally handles long pre-shot routines.
    top_candidates = []
    for f in range(addr_idx + int(fps * 0.15), num_frames - 30):
        win_start = max(0, f - 10)
        win_end = min(num_frames, f + 11)
        if smoothed_y[f] <= np.min(smoothed_y[win_start:win_end]):
            # Verify if followed by a significant downswing plunge within 0.50s (120 frames at 240 fps)
            plunge_window = smoothed_y[f:min(num_frames, f + int(fps * 0.50))]
            if len(plunge_window) > 4:
                drop = float(np.max(plunge_window) - smoothed_y[f])
                if drop >= 0.07:
                    top_candidates.append(f)
                    break

    if top_candidates:
        top_idx = top_candidates[0]
    else:
        # Fallback if drop was shallow
        cand_start = addr_idx + int(fps * 0.20)
        cand_end = min(num_frames - 20, addr_idx + int(fps * 1.10))
        top_idx = cand_start + int(np.argmin(smoothed_y[cand_start:cand_end])) if cand_end > cand_start else int(num_frames * 0.45)

    # 1d. Impact: bottom crest of delivery arc (maximum y / ball return) after Top
    down_search_end = min(num_frames - 2, top_idx + int(fps * 0.45))
    if down_search_end > top_idx + 4:
        impact_idx = top_idx + int(np.argmax(smoothed_y[top_idx:down_search_end]))
    else:
        impact_idx = min(num_frames - 1, top_idx + int(fps * 0.25))

    # 1e. Finish: follow-through apex (minimum y after Impact)
    finish_idx = impact_idx + int(np.argmin(smoothed_y[impact_idx:]))

    # 2. Intermediate Interpolated Phases
    # Toe-up: club shaft reaches horizontal (approx 35-40% of backswing)
    # Mid-backswing: lead arm reaches horizontal (approx 65-70% of backswing)
    toe_up_idx = int(addr_idx + 0.38 * (top_idx - addr_idx))
    mid_backswing_idx = int(addr_idx + 0.68 * (top_idx - addr_idx))
    mid_downswing_idx = int(top_idx + 0.50 * (impact_idx - top_idx))
    mid_follow_idx = int(impact_idx + 0.40 * (finish_idx - impact_idx))

    event_indices = [
        addr_idx,
        toe_up_idx,
        mid_backswing_idx,
        top_idx,
        mid_downswing_idx,
        impact_idx,
        mid_follow_idx,
        finish_idx,
    ]

    # Enforce strict monotonic ordering
    for i in range(1, len(event_indices)):
      if event_indices[i] <= event_indices[i - 1]:
        event_indices[i] = event_indices[i - 1] + 1

    event_frames, event_timestamps_ms = {}, {}
    for i, ev_name in enumerate(ORDERED_EVENTS):
      f = int(min(event_indices[i], num_frames - 1))
      event_frames[ev_name] = f
      event_timestamps_ms[ev_name] = int(timestamps_ms[f])

    # 3. Continuous Phase Mapping
    # Each phase interval [E_i, E_i+1) maps to the corresponding active swing phase
    frame_to_phase = {}
    for f in range(num_frames):
      if f < event_frames['Toe-up']:
        frame_to_phase[f] = 'Address'
      elif f < event_frames['Mid-backswing']:
        frame_to_phase[f] = 'Toe-up'
      elif f < event_frames['Top']:
        frame_to_phase[f] = 'Mid-backswing'
      elif f < event_frames['Mid-downswing']:
        frame_to_phase[f] = 'Top'
      elif f < event_frames['Impact']:
        frame_to_phase[f] = 'Mid-downswing'
      elif f < event_frames['Mid-follow-through']:
        frame_to_phase[f] = 'Impact'
      elif f < event_frames['Finish']:
        frame_to_phase[f] = 'Mid-follow-through'
      else:
        frame_to_phase[f] = 'Finish'

    # 4. Tempo Metrics Calculation
    backswing_s, downswing_s, tempo_ratio = None, None, None
    t_top = event_timestamps_ms.get('Top', 0) / 1000.0
    t_address = event_timestamps_ms.get('Address', 0) / 1000.0
    t_impact = event_timestamps_ms.get('Impact', 0) / 1000.0

    if t_top > t_address and t_impact > t_top:
      backswing_s = round(t_top - t_address, 3)
      downswing_s = round(t_impact - t_top, 3)
      tempo_ratio = round(backswing_s / downswing_s, 2)

    return {
        'video_path': str(video_path),
        'num_frames': num_frames,
        'fps': fps,
        'event_frames': event_frames,
        'event_timestamps_ms': event_timestamps_ms,
        'frame_to_phase': frame_to_phase,
        'backswing_s': backswing_s,
        'downswing_s': downswing_s,
        'tempo_ratio': tempo_ratio,
    }

  def detect_phases(self, wrist_df, fps=240.0, video_path=''):
    return self.detect_phases_from_dataframe(wrist_df, fps=fps, video_path=video_path)


# Backwards compatibility alias
GolfPhaseDetector = KinematicPhaseDetector

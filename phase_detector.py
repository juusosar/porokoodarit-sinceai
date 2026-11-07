import os
import json
import cv2
import numpy as np
import pandas as pd
from pathlib import Path
import mediapipe as mp

EVENT_NAMES = {
    0: 'Address',
    1: 'Toe-up',
    2: 'Mid-backswing',
    3: 'Top',
    4: 'Mid-downswing',
    5: 'Impact',
    6: 'Mid-follow-through',
    7: 'Finish'
}

ORDERED_EVENTS = [
    'Address',
    'Toe-up',
    'Mid-backswing',
    'Top',
    'Mid-downswing',
    'Impact',
    'Mid-follow-through',
    'Finish'
]


class KinematicPhaseDetector:
    """Detects the 8 standardized golf swing phases using biomechanical kinematics

    derived from wrist and body pose trajectories (MediaPipe Pose).
    Uses Impact-anchored velocity analysis to accurately identify backswing,
    downswing, and finish regardless of video duration or pre-shot routine length.
    """

    def __init__(self, pose_model_path="models/pose_landmarker_lite.task"):
        self.pose_model_path = pose_model_path

    def _extract_wrist_trajectory_from_video(self, video_path):
        """Extracts frame indices, timestamps, and normalized wrist/shoulder coordinates

        directly from video using MediaPipe Pose.
        """
        BaseOptions = mp.tasks.BaseOptions
        PoseLandmarker = mp.tasks.vision.PoseLandmarker
        PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
        VisionRunningMode = mp.tasks.vision.RunningMode

        options = PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=self.pose_model_path),
            running_mode=VisionRunningMode.VIDEO,
            num_poses=1,
        )

        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

        records = []
        frame_idx = 0

        with PoseLandmarker.create_from_options(options) as landmarker:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                # Ensure monotonically increasing timestamp in milliseconds
                t_ms = int(frame_idx * (1000.0 / fps))
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

                detection = landmarker.detect_for_video(mp_image, t_ms)

                lw_x, lw_y = None, None
                rw_x, rw_y = None, None
                ls_x, ls_y = None, None

                if detection.pose_landmarks and len(detection.pose_landmarks) > 0:
                    lms = detection.pose_landmarks[0]
                    # Landmark 11: left shoulder, 15: left wrist, 16: right wrist
                    ls = lms[11]
                    lw = lms[15]
                    rw = lms[16]

                    if lw.visibility > 0.2:
                        lw_x, lw_y = lw.x, lw.y
                    if rw.visibility > 0.2:
                        rw_x, rw_y = rw.x, rw.y
                    if ls.visibility > 0.2:
                        ls_x, ls_y = ls.x, ls.y

                records.append({
                    'frame_idx': frame_idx,
                    'timestamp_ms': t_ms,
                    'lw_x': lw_x,
                    'lw_y': lw_y,
                    'rw_x': rw_x,
                    'rw_y': rw_y,
                    'ls_x': ls_x,
                    'ls_y': ls_y
                })
                frame_idx += 1

        cap.release()

        df = pd.DataFrame(records)
        return df, fps

    def detect_phases_from_dataframe(self, df, fps=30.0, video_path=""):
        """Computes the 8 swing phases using Impact-anchored kinetic analysis."""
        y_cols = [c for c in ['landmark_15_y', 'landmark_16_y', 'lw_y', 'rw_y'] if c in df.columns]
        x_cols = [c for c in ['landmark_15_x', 'landmark_16_x', 'lw_x', 'rw_x'] if c in df.columns]

        if not y_cols:
            raise ValueError("DataFrame must contain wrist coordinates (landmarks 15/16).")

        df = df.copy()
        df['wrist_y'] = df[y_cols].mean(axis=1).interpolate(limit_direction='both')
        df['wrist_x'] = df[x_cols].mean(axis=1).interpolate(limit_direction='both') if x_cols else 0.0

        num_frames = len(df)
        if num_frames < 10:
            raise ValueError(f"Too few frames ({num_frames}) for kinematic analysis.")

        # Smooth vertical elevation (y: 0 is top of image, 1 is bottom)
        smoothed_y = df['wrist_y'].rolling(window=5, center=True, min_periods=1).mean().values
        smoothed_x = df['wrist_x'].rolling(window=5, center=True, min_periods=1).mean().values
        timestamps_ms = (
            df['timestamp_ms'].values
            if 'timestamp_ms' in df.columns
            else (np.arange(num_frames) * (1000.0 / fps)).astype(int)
        )

        # 2D velocity of wrists: v = sqrt(dx^2 + dy^2) * fps
        dx = np.gradient(smoothed_x)
        dy = np.gradient(smoothed_y)
        speed = np.sqrt(dx**2 + dy**2) * fps

        # -------------------------------------------------------------------------
        # 1. IMPACT DETECTION (Anchor of the entire swing)
        # The downswing delivery through impact is the primary velocity peak
        # in the entire video.
        # -------------------------------------------------------------------------
        impact_idx = int(np.argmax(speed))

        # -------------------------------------------------------------------------
        # 2. TOP OF BACKSWING
        # Hands reach their highest elevation (local minimum of y in image space)
        # in the window directly preceding Impact (within ~0.5s - 3.5s before Impact).
        # -------------------------------------------------------------------------
        pre_impact_start = max(0, impact_idx - int(fps * 3.5))
        if impact_idx > pre_impact_start + 3:
            top_search_window = smoothed_y[pre_impact_start:impact_idx]
            top_idx = pre_impact_start + int(np.argmin(top_search_window))
        else:
            top_idx = max(0, impact_idx - int(fps * 0.35))

        # -------------------------------------------------------------------------
        # 3. ADDRESS (Takeaway onset)
        # Scan backward from Top to find where hands were resting down at setup
        # (maximum y, hands lowest near the hips/thighs before takeaway begins).
        # -------------------------------------------------------------------------
        addr_search_start = max(0, top_idx - int(fps * 4.0))
        if top_idx > addr_search_start + 3:
            pre_top_y = smoothed_y[addr_search_start:top_idx]
            addr_idx = addr_search_start + int(np.argmax(pre_top_y))
        else:
            addr_idx = max(0, top_idx - int(fps * 1.0))

        # -------------------------------------------------------------------------
        # 4. FINISH
        # After Impact, hands rise up past the shoulder into the balanced finish apex.
        # -------------------------------------------------------------------------
        post_impact_end = min(num_frames - 1, impact_idx + int(fps * 2.5))
        if post_impact_end > impact_idx + 2:
            finish_search_window = smoothed_y[impact_idx:post_impact_end + 1]
            finish_idx = impact_idx + int(np.argmin(finish_search_window))
        else:
            finish_idx = min(num_frames - 1, impact_idx + int(fps * 0.8))

        # -------------------------------------------------------------------------
        # 5. INTERMEDIATE PHASES (Interpolated along the kinematic trajectory)
        # -------------------------------------------------------------------------
        toe_up_idx = int(addr_idx + 0.35 * (top_idx - addr_idx))
        mid_backswing_idx = int(addr_idx + 0.65 * (top_idx - addr_idx))
        mid_downswing_idx = int(top_idx + 0.50 * (impact_idx - top_idx))
        mid_follow_idx = int(impact_idx + 0.40 * (finish_idx - impact_idx))

        # Enforce strict monotonic ordering
        event_indices = [
            addr_idx,
            toe_up_idx,
            mid_backswing_idx,
            top_idx,
            mid_downswing_idx,
            impact_idx,
            mid_follow_idx,
            finish_idx
        ]

        for i in range(1, len(event_indices)):
            if event_indices[i] <= event_indices[i - 1]:
                event_indices[i] = event_indices[i - 1] + 1

        event_frames = {}
        event_timestamps_ms = {}
        frame_to_phase = {}

        for i, ev_name in enumerate(ORDERED_EVENTS):
            f = int(min(event_indices[i], num_frames - 1))
            event_frames[ev_name] = f
            event_timestamps_ms[ev_name] = int(timestamps_ms[f])

        # Continuous phase assignment: every frame maps to the active swing phase
        # From frame 0 up to Toe-up, the player is in 'Address'
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

        backswing_s = None
        downswing_s = None
        tempo_ratio = None

        t_top = event_timestamps_ms.get('Top', 0) / 1000.0
        t_address = event_timestamps_ms.get('Address', 0) / 1000.0
        t_impact = event_timestamps_ms.get('Impact', 0) / 1000.0

        if t_top > t_address and t_impact > t_top:
            backswing_s = round(t_top - t_address, 3)
            downswing_s = round(t_impact - t_top, 3)
            tempo_ratio = round(backswing_s / downswing_s, 2)

        result = {
            'video_path': str(video_path),
            'num_frames': num_frames,
            'fps': fps,
            'event_frames': event_frames,
            'event_timestamps_ms': event_timestamps_ms,
            'frame_to_phase': frame_to_phase,
            'backswing_s': backswing_s,
            'downswing_s': downswing_s,
            'tempo_ratio': tempo_ratio
        }

        return result

    def detect_phases_from_video(self, video_path):
        """Extracts pose kinematics from video and detects all 8 swing phases."""
        df_wrists, fps = self._extract_wrist_trajectory_from_video(video_path)
        return self.detect_phases_from_dataframe(df_wrists, fps=fps, video_path=video_path)

    def detect_phases(self, video_path):
        """Alias for detect_phases_from_video."""
        return self.detect_phases_from_video(video_path)

    def save_phases_json(self, result, output_path="swing_phases.json"):
        """Saves detected phases and calculated golf tempo metrics to JSON."""
        summary = {
            'video_path': result['video_path'],
            'num_frames': result['num_frames'],
            'fps': result['fps'],
            'event_frames': result['event_frames'],
            'event_timestamps_ms': result['event_timestamps_ms'],
            'tempo_ratio': None,
            'backswing_s': None,
            'downswing_s': None
        }

        t_top = result['event_timestamps_ms'].get('Top', 0) / 1000.0
        t_address = result['event_timestamps_ms'].get('Address', 0) / 1000.0
        t_impact = result['event_timestamps_ms'].get('Impact', 0) / 1000.0

        if t_top > t_address and t_impact > t_top:
            summary['backswing_s'] = round(t_top - t_address, 3)
            summary['downswing_s'] = round(t_impact - t_top, 3)
            summary['tempo_ratio'] = round(summary['backswing_s'] / summary['downswing_s'], 2)

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2)

        return summary


# Backwards compatibility alias
GolfPhaseDetector = KinematicPhaseDetector

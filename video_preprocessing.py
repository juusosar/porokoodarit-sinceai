import os
import re
import cv2
import csv
import json
import pandas as pd
import numpy as np
from pathlib import Path
import mediapipe as mp
from ultralytics import YOLO
from phase_detector import GolfPhaseDetector

def natural_sort_key(path):
    """Sorts strings with embedded numbers naturally (e.g. 1, 2, ..., 9, 10)."""
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', Path(path).name)]

def find_recordings(root):
    recordings = []
    supported_extensions = {".mp4", ".mov"}
    for video_path in sorted(root.rglob("*")):
        if video_path.is_file() and video_path.suffix.lower() in supported_extensions:
            # Skip previously generated annotated output files
            if video_path.name.startswith("annotated_"):
                continue
            print(f"Found video: {video_path}")
            recordings.append(video_path)
    return recordings

def get_video_fps(cap, default_fps=240.0):
    """Extracts FPS from video metadata if high-speed (>100 fps), otherwise defaults to 240.0."""
    raw_fps = cap.get(cv2.CAP_PROP_FPS)
    if raw_fps and raw_fps > 100.0:
        return float(raw_fps)
    return float(default_fps)

def open_video(video_path, default_fps=240.0):
    # Open the video file
    cap = cv2.VideoCapture(str(video_path))
    #original_fps = cap.get(cv2.CAP_PROP_FPS) or 240.0
    physical_fps = get_video_fps(cap, default_fps=default_fps)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    frame_idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            print("End of video or failed to grab frame.")
            break  # End of video
            
        # OpenCV reads BGR, but MediaPipe needs RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Wrap into MP image object
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        # Monotonically increasing timestamp in ms (physical time at capture rate)
        timestamp_ms = int(frame_idx * (1000.0 / physical_fps))

        yield frame, mp_image, timestamp_ms, physical_fps
        frame_idx += 1
    
    cap.release()

def init_csv(output_csv):
    """Initializes a telemetry CSV file with the standard header."""
    with open(output_csv, mode="w", newline="") as csv_file:
        writer = csv.writer(csv_file)
        header = ["golfer_id", "frame_idx", "timestamp_ms"]
        for i in range(33):
            header.extend([f"landmark_{i}_x", f"landmark_{i}_y", f"landmark_{i}_z", f"landmark_{i}_vis"])
        header.extend(["club_head_x", "club_head_y", "club_head_detected", "shaft_len_px", "shoulder_width_px",
                       "swing_phase", "swing_event", "backswing_s", "downswing_s", "tempo_ratio"])
        writer.writerow(header)

def get_landmarks(records, output_csv="all_pose_landmarks_dtl.csv", view="dtl", append=False):
    BaseOptions = mp.tasks.BaseOptions
    PoseLandmarker = mp.tasks.vision.PoseLandmarker
    PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
    VisionRunningMode = mp.tasks.vision.RunningMode

    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path="models/pose_landmarker_lite.task"),
        running_mode=VisionRunningMode.VIDEO,
        num_poses=1,
    )

    club_model = YOLO("models/swingtrace-yolo11m.pt")
    phase_detector = GolfPhaseDetector()

    if not append:
        init_csv(output_csv)

    with open(output_csv, mode="a", newline="") as csv_file:
        writer = csv.writer(csv_file)

        for video in records:
            print(f"Processing file: {video}")
            video_path = Path(video)

            # 1. Extract ALL 33 landmarks across the video (MediaPipe runs ONCE)
            frames_cache = []
            landmarks_cache = []
            wrist_records = []
            capture_fps = 240.0

            with PoseLandmarker.create_from_options(options) as landmarker:
                frame_idx = 0
                for frame, mp_image, timestamp_ms, video_fps in open_video(video, default_fps=240.0):
                    capture_fps = video_fps
                    result = landmarker.detect_for_video(mp_image, timestamp_ms)
                    lms = result.pose_landmarks[0] if (result.pose_landmarks and len(result.pose_landmarks) > 0) else None

                    frames_cache.append(frame)
                    landmarks_cache.append(lms)

                    # Only wrist coordinates are extracted for the phase detector
                    lw_x = lms[15].x if (lms and lms[15].visibility > 0.2) else None
                    lw_y = lms[15].y if (lms and lms[15].visibility > 0.2) else None
                    rw_x = lms[16].x if (lms and lms[16].visibility > 0.2) else None
                    rw_y = lms[16].y if (lms and lms[16].visibility > 0.2) else None

                    wrist_records.append({
                        'frame_idx': frame_idx,
                        'timestamp_ms': timestamp_ms,
                        'lw_x': lw_x, 'lw_y': lw_y,
                        'rw_x': rw_x, 'rw_y': rw_y,
                    })
                    frame_idx += 1

            # 2. Pass ONLY wrist coordinates to phase detector
            print(f"Detecting swing phases at {capture_fps:.1f} FPS...")
            wrist_df = pd.DataFrame(wrist_records)
            phase_result = phase_detector.detect_phases(wrist_df, fps=capture_fps, video_path=str(video_path))
            frame_to_phase = phase_result.get("frame_to_phase", {})
            event_frames = phase_result.get("event_frames", {})
            frame_to_event = {f_idx: ev_name for ev_name, f_idx in event_frames.items()}
            top_idx = event_frames.get("Top", len(frames_cache) // 2)
            print(f"Detected phases: {event_frames}")
            print(f"Tempo: {phase_result.get('tempo_ratio')} (Backswing: {phase_result.get('backswing_s')}s, Downswing: {phase_result.get('downswing_s')}s)")

            # 3. Detect club head with YOLO from Address up to Top (strictly for DTL view)
            club_head_data = {}
            calibrated_shaft_len = None
            static_shaft_measurements = []
            height, width = frames_cache[0].shape[:2] if frames_cache else (1080, 1920)

            if view.lower() == "dtl" and club_model is not None:
                addr_onset = event_frames.get("Address", 30)
                # Calibrate shaft length strictly near the start of video before any takeaway movement begins
                static_cutoff = min(addr_onset, 40)
                print(f"Detecting club head with YOLO from frame 0 up to frame {top_idx} (Top)...")
                for f_idx in range(min(top_idx + 1, len(frames_cache))):
                    f = frames_cache[f_idx]
                    results = club_model(f, conf=0.20, verbose=False)
                    res = results[0] if results else None
                    detected = False
                    ch_x, ch_y = None, None
                    box_coords = None

                    if res and res.boxes is not None and len(res.boxes) > 0:
                        boxes = res.boxes.xyxy.cpu().numpy()
                        classes = res.boxes.cls.cpu().numpy()
                        confs = res.boxes.conf.cpu().numpy()

                        # Class 1: Club Head, Class 0: Club Shaft
                        head_indices = [i for i, c in enumerate(classes) if int(c) == 1]
                        if len(head_indices) > 0:
                            best_i = head_indices[confs[head_indices].argmax()]
                        else:
                            best_i = confs.argmax()

                        box = boxes[best_i]
                        ch_x = float((box[0] + box[2]) / 2.0)
                        ch_y = float((box[1] + box[3]) / 2.0)
                        detected = True
                        box_coords = box

                    club_head_data[f_idx] = {
                        "x": ch_x,
                        "y": ch_y,
                        "detected": detected,
                        "box": box_coords
                    }

                    # Measure shaft length strictly during stationary resting setup before movement
                    if f_idx < static_cutoff and detected and ch_x is not None:
                        lms = landmarks_cache[f_idx]
                        if lms is not None:
                            wx = (lms[15].x + lms[16].x) / 2.0 * width
                            wy = (lms[15].y + lms[16].y) / 2.0 * height
                            dist = float(np.hypot(ch_x - wx, ch_y - wy))
                            if 0.05 * height < dist < 0.6 * height:
                                static_shaft_measurements.append(dist)

                if static_shaft_measurements:
                    calibrated_shaft_len = float(np.median(static_shaft_measurements))
                    print(f"Calibrated shaft length (Static Address, DTL): {calibrated_shaft_len:.1f} px (sampled {len(static_shaft_measurements)} early frames)")

            # 4. Calculate shoulder width
            # Furthest (maximum) distance between the two shoulder coordinates across the swing
            calibrated_shoulder_width = None
            shoulder_dists_all = []

            for f_idx, lms in enumerate(landmarks_cache):
                if lms is not None:
                    ls = lms[11]  # Left shoulder
                    rs = lms[12]  # Right shoulder
                    if ls.visibility > 0.25 and rs.visibility > 0.25:
                        ls_x, ls_y = ls.x * width, ls.y * height
                        rs_x, rs_y = rs.x * width, rs.y * height
                        dist_s = float(np.sqrt((rs_x - ls_x)**2 + (rs_y - ls_y)**2))
                        if 0.05 * width < dist_s < 0.60 * width:
                            shoulder_dists_all.append(dist_s)

            if shoulder_dists_all:
                calibrated_shoulder_width = float(np.max(shoulder_dists_all))

            if calibrated_shoulder_width is not None:
                print(f"Calibrated shoulder width (Max, {view.upper()}): {calibrated_shoulder_width:.1f} px")

            # 5. Write ALL landmarks to CSV and produce annotated output video
            output_video_path = f"annotated_videos/annotated_{view}_{video_path.stem}.mp4"
            os.makedirs(Path(output_video_path).parent, exist_ok=True)

            if frames_cache:
                fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                out = cv2.VideoWriter(output_video_path, fourcc, 30.0, (width, height))

                for frame_idx, (frame, lms) in enumerate(zip(frames_cache, landmarks_cache)):
                    timestamp_ms = wrist_records[frame_idx]['timestamp_ms']
                    row = [video_path.stem, frame_idx, timestamp_ms]

                    if lms is not None:
                        # Write ALL 33 landmarks to CSV
                        for lm in lms:
                            row.extend([lm.x, lm.y, lm.z, lm.visibility])

                        # Draw landmarks on video
                        for lm in lms:
                            cx, cy = int(lm.x * width), int(lm.y * height)
                            cv2.circle(frame, (cx, cy), 4, (0, 255, 0), -1)
                    else:
                        # Fallback for frames with no detected person
                        for _ in range(33):
                            row.extend([None, None, None, None])

                    # Club head info for current frame
                    club_info = club_head_data.get(frame_idx, {"x": None, "y": None, "detected": False})
                    ch_x = club_info["x"]
                    ch_y = club_info["y"]
                    ch_det = club_info["detected"]
                    shaft_val = round(calibrated_shaft_len, 1) if (frame_idx == 0 and calibrated_shaft_len is not None) else ""
                    shoulder_val = round(calibrated_shoulder_width, 1) if (frame_idx == 0 and calibrated_shoulder_width is not None) else ""

                    # Swing Phase lookup for current frame idx (continuous mapping)
                    current_phase = frame_to_phase.get(frame_idx, "Address")
                    swing_event = frame_to_event.get(frame_idx, "")

                    # Video-level summary metrics: written only on the first row (frame_idx == 0)
                    if frame_idx == 0:
                        b_s = phase_result.get("backswing_s", "")
                        d_s = phase_result.get("downswing_s", "")
                        t_r = phase_result.get("tempo_ratio", "")
                    else:
                        b_s, d_s, t_r = "", "", ""

                    # Append Club head info, Swing Phase, Event marker, and summary metrics to CSV row
                    row.extend([ch_x, ch_y, ch_det, shaft_val, shoulder_val, current_phase, swing_event, b_s, d_s, t_r])
                    writer.writerow(row)

                    # Draw Club Head & Shaft Visuals ONLY up to Top
                    if frame_idx <= top_idx:
                        if club_info["detected"] and club_info["x"] is not None and club_info["y"] is not None:
                            hx, hy = int(club_info["x"]), int(club_info["y"])
                            cv2.circle(frame, (hx, hy), 6, (0, 165, 255), -1)

                            if club_info.get("box") is not None:
                                bx1, by1, bx2, by2 = map(int, club_info["box"][:4])
                                cv2.rectangle(frame, (bx1, by1), (bx2, by2), (0, 165, 255), 2)
                                cv2.putText(frame, "Club Head", (bx1, max(by1 - 8, 15)),
                                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 165, 255), 2)

                            # Draw connecting shaft line from hands/wrists to club head
                            if lms is not None:
                                wx = int((lms[15].x + lms[16].x) / 2.0 * width)
                                wy = int((lms[15].y + lms[16].y) / 2.0 * height)
                                cv2.line(frame, (wx, wy), (hx, hy), (0, 255, 255), 2)

                        # Overlay calibrated shaft length during Address to Top
                        if calibrated_shaft_len is not None:
                            cv2.putText(frame, f"Shaft: {calibrated_shaft_len:.0f}px", (30, 85),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2, cv2.LINE_AA)

                    # Overlay calibrated shoulder width
                    if calibrated_shoulder_width is not None:
                        cv2.putText(frame, f"Shoulders: {calibrated_shoulder_width:.0f}px", (30, 115),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 200, 0), 2, cv2.LINE_AA)

                    # Overlay active swing phase continuously in top-left
                    cv2.putText(frame, f"Phase: {current_phase}", (30, 50),
                                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2, cv2.LINE_AA)

                    out.write(frame)

                out.release()
                frames_cache.clear()
                landmarks_cache.clear()
                print(f"Finished & saved: {output_video_path}\n")
    print("All videos processed successfully!")     

def process_interleaved(front_records, dtl_records):
    """Processes videos in alternating pairs: front1 then dtl1, front2 then dtl2, etc.
    Progressively appends rows to both CSV files for immediate incremental testing.
    """
    dtl_csv = "all_pose_landmarks_dtl.csv"
    front_csv = "all_pose_landmarks_front.csv"

    init_csv(dtl_csv)
    init_csv(front_csv)

    max_pairs = max(len(front_records), len(dtl_records))
    for i in range(max_pairs):
        pair_num = i + 1
        print(f"\n{'='*25} Swing Pair #{pair_num} {'='*25}")

        # 1. Face-On video first (front_i)
        if i < len(front_records):
            front_vid = front_records[i]
            print(f"\n[Pair #{pair_num} - Step 1/2] Face-On: {front_vid.name}")
            get_landmarks([front_vid], output_csv=front_csv, view="front", append=True)

        # 2. DTL video next (dtl_i)
        if i < len(dtl_records):
            dtl_vid = dtl_records[i]
            print(f"\n[Pair #{pair_num} - Step 2/2] Down-The-Line: {dtl_vid.name}")
            get_landmarks([dtl_vid], output_csv=dtl_csv, view="dtl", append=True)

        print(f"{'='*25} Finished Swing Pair #{pair_num} {'='*25}\n")

if __name__ == "__main__":
    dtl_path = Path("C:/Users/katar/OneDrive/Documents/Takomo_video_photo/dtl_juuso")
    front_path = Path("C:/Users/katar/OneDrive/Documents/Takomo_video_photo/front_juuso")

    dtl_records = sorted(find_recordings(dtl_path), key=natural_sort_key) if dtl_path.exists() else []
    front_records = sorted(find_recordings(front_path), key=natural_sort_key) if front_path.exists() else []

    print(f"Discovered: {len(front_records)} Face-On videos, {len(dtl_records)} DTL videos.")

    # Process in alternating order: front1 then dtl1, front2 then dtl2, etc.
    if front_records and dtl_records:
        process_interleaved(front_records, dtl_records)
    elif front_records:
        get_landmarks(front_records, output_csv="all_pose_landmarks_front.csv", view="front")
    elif dtl_records:
        get_landmarks(dtl_records, output_csv="all_pose_landmarks_dtl.csv", view="dtl")
    else:
        print("No videos found to process.")
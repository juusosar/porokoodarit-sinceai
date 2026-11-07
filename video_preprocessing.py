import os
import cv2
import csv
import json
import pandas as pd
import numpy as np
from pathlib import Path
import mediapipe as mp
# from ultralytics import YOLO
from phase_detector import GolfPhaseDetector

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

def open_video(video_path):
    # Open the video file
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
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

        # Monotonically increasing timestamp in ms (MediaPipe requirement)
        timestamp_ms = int(frame_idx * (1000.0 / fps))

        yield frame, mp_image, timestamp_ms
        frame_idx += 1
    
    cap.release()

# def extract_and_interpolate_club_data(yolo_results):
#   """Runs YOLO tracking results through pandas using PCHIP interpolation
#
#   to preserve natural curved trajectories rather than straight linear jumps.
#   """
#   raw_data = []
#
#   # 1. Parse raw YOLO stream into a list of dicts
#   for frame_idx, res in enumerate(yolo_results):
#     detected = False
#     cx, cy = None, None
#     box_coords = None
#
#     if res.boxes is not None and len(res.boxes) > 0:
#       boxes = res.boxes.xyxy.cpu().numpy()
#       classes = res.boxes.cls.cpu().numpy()
#       confs = res.boxes.conf.cpu().numpy()
#
#       # Filter for Club Shaft specifically (Class ID 0)
#       shaft_indices = [i for i, cls_id in enumerate(classes) if int(cls_id) == 0]
#       if len(shaft_indices) > 0:
#         best_idx = shaft_indices[confs[shaft_indices].argmax()]
#         box = boxes[best_idx]
#         x1, y1, x2, y2 = map(int, box[:4])
#
#         cx = float((x1 + x2) / 2.0)
#         cy = float((y1 + y2) / 2.0)
#         detected = True
#         box_coords = (x1, y1, x2, y2)
#
#     raw_data.append({
#         "frame_idx": frame_idx,
#         "x": cx,
#         "y": cy,
#         "detected": detected,
#         "raw_detected": detected,
#         "box": box_coords,
#     })
#
#   # 2. Load into Pandas DataFrame for interpolation
#   df = pd.DataFrame(raw_data)
#
#   # Fill missing coordinates using PCHIP (Piecewise Cubic Hermite Interpolating Polynomial)
#   # for smooth curved arcs without runaway cubic overshoots
#   if df["x"].count() >= 4:
#     df["x"] = df["x"].interpolate(method="pchip", limit_direction="both", limit=20)
#     df["y"] = df["y"].interpolate(method="pchip", limit_direction="both", limit=20)
#   else:
#     df["x"] = df["x"].interpolate(method="linear", limit_direction="both", limit=20)
#     df["y"] = df["y"].interpolate(method="linear", limit_direction="both", limit=20)
#
#   # Optional: Smooth minor tracking jitter with a small rolling window
#   window_size = 3
#   df["x"] = df["x"].rolling(window=window_size, center=True, min_periods=1).mean()
#   df["y"] = df["y"].rolling(window=window_size, center=True, min_periods=1).mean()
#
#   df["detected_smoothed"] = df["x"].notnull() & df["y"].notnull()
#
#   # 3. Convert back to a frame-indexed dictionary for O(1) lookups
#   smoothed_club_data = {}
#   for _, row in df.iterrows():
#     f_idx = int(row["frame_idx"])
#     is_valid = bool(row["detected_smoothed"])
#     smoothed_club_data[f_idx] = {
#         "x": row["x"] if is_valid else None,
#         "y": row["y"] if is_valid else None,
#         "detected": is_valid,
#         "raw_detected": bool(row["raw_detected"]),
#         "box": row["box"] if row["box"] is not None else None,
#     }
#
#   return smoothed_club_data

def get_landmarks(records):
    BaseOptions = mp.tasks.BaseOptions
    PoseLandmarker = mp.tasks.vision.PoseLandmarker
    PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
    VisionRunningMode = mp.tasks.vision.RunningMode

    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path="models/pose_landmarker_lite.task"),
        running_mode=VisionRunningMode.VIDEO,
        num_poses=1,
    )

    # club_model = YOLO("models/swingtrace-yolo11m.pt")
    phase_detector = GolfPhaseDetector()

    with open("all_pose_landmarks_front.csv", mode="w", newline="") as csv_file:
        writer = csv.writer(csv_file)

        # Write CSV header
        header = ["golfer_id", "frame_idx", "timestamp_ms"]
        for i in range(33):
            header.extend([f"landmark_{i}_x", f"landmark_{i}_y", f"landmark_{i}_z", f"landmark_{i}_vis"])
        # header.extend(["club_shaft_x", "club_shaft_y", "club_shaft_detected", "swing_phase"])
        header.extend(["swing_phase", "swing_event", "backswing_s", "downswing_s", "tempo_ratio"])
        writer.writerow(header)

        for video in records:
            print(f"Processing file: {video}")
            video_path = Path(video)

            # Phase Detection
            print("Detecting swing phases...")
            phase_result = phase_detector.detect_phases_from_video(video_path)
            frame_to_phase = phase_result.get("frame_to_phase", {})
            event_frames = phase_result.get("event_frames", {})
            frame_to_event = {f_idx: ev_name for ev_name, f_idx in event_frames.items()}
            # phase_detector.save_phases_json(phase_result, f"swing_phases_{video_path.stem}.json")
            print(f"Detected phases: {event_frames}")
            print(f"Tempo: {phase_result.get('tempo_ratio')} (Backswing: {phase_result.get('backswing_s')}s, Downswing: {phase_result.get('downswing_s')}s)")

            # SwingTrace / YOLO Club Tracking (Commented out)
            # print("Running Club Tracking...")
            # result = club_model.track(source=str(video_path), conf=0.25, stream=True, persist=True, tracker="bytetrack.yaml")

            # Pre-process and smooth coordinates using extract_and_interpolate_club_data
            # club_data_by_frame = extract_and_interpolate_club_data(result)

            cap = cv2.VideoCapture(str(video_path))
            fps = cap.get(cv2.CAP_PROP_FPS)
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

            output_video_path = f"annotated_videos/annotated_{video_path.stem}.mp4"
            os.makedirs(Path(output_video_path).parent, exist_ok=True)
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(output_video_path, fourcc, fps, (width, height))

            with PoseLandmarker.create_from_options(options) as landmarker:
                frame_idx = 0
                # calibrated_shaft_len = None

                for frame, mp_image, timestamp_ms in open_video(video):
                    result = landmarker.detect_for_video(mp_image, timestamp_ms)

                    row = [video_path.stem, frame_idx, timestamp_ms]
                    has_landmarks = False
                    # wx, wy, sx, sy = None, None, None, None

                    if result.pose_landmarks and len(result.pose_landmarks) > 0:
                        landmarks = result.pose_landmarks[0] # First person detected
                        has_landmarks = True

                        # Write row to CSV
                        for lm in landmarks:
                            row.extend([lm.x, lm.y, lm.z, lm.visibility])

                        # Draw landmarks on video
                        for lm in landmarks:
                            cx, cy = int(lm.x * width), int(lm.y * height)
                            cv2.circle(frame, (cx, cy), 4, (0, 255, 0), -1)

                        # Hands and shoulder in screen pixels
                        # wx = (landmarks[15].x + landmarks[16].x) / 2.0 * width
                        # wy = (landmarks[15].y + landmarks[16].y) / 2.0 * height
                        # sx = landmarks[11].x * width
                        # sy = landmarks[11].y * height
                    else:
                        # Fallback for frames with no detected person to maintain column alignment
                        for _ in range(33):
                            row.extend([None, None, None, None])

                    # Club data lookup for current frame idx
                    # club_info = club_data_by_frame.get(frame_idx, {"x": None, "y": None, "detected": False, "raw_detected": False, "box": None})

                    # Calibrate shaft length at Address when YOLO detects the club shaft
                    # if has_landmarks and wx is not None:
                    #     if calibrated_shaft_len is None and club_info.get("raw_detected") and club_info["x"] is not None:
                    #         dist = np.sqrt((club_info["x"] - wx)**2 + (club_info["y"] - wy)**2)
                    #         if 0.05 * height < dist < 0.6 * height:
                    #             calibrated_shaft_len = dist

                    #     # Kinematic Arm Anchor Fallback if YOLO misses club shaft
                    #     if (club_info["x"] is None or not club_info["detected"]) and calibrated_shaft_len is not None:
                    #         arm_dx = wx - sx
                    #         arm_dy = wy - sy
                    #         arm_norm = np.sqrt(arm_dx**2 + arm_dy**2)
                    #         if arm_norm > 1e-3:
                    #             anchor_x = wx + (arm_dx / arm_norm) * calibrated_shaft_len
                    #             anchor_y = wy + (arm_dy / arm_norm) * calibrated_shaft_len
                    #             club_info["x"] = anchor_x
                    #             club_info["y"] = anchor_y
                    #             club_info["detected"] = True

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

                    # Append Swing Phase, Event marker, and summary metrics to CSV row
                    # row.extend([club_info["x"], club_info["y"], club_info["detected"], current_phase])
                    row.extend([current_phase, swing_event, b_s, d_s, t_r])

                    writer.writerow(row)

                    # Overlay active swing phase continuously in top-left
                    cv2.putText(frame, f"Phase: {current_phase}", (30, 50),
                                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2, cv2.LINE_AA)

                    # Draw Club Shaft Tracking Visuals on frame
                    # if club_info["detected"] and club_info.get("x") is not None and club_info.get("y") is not None:
                    #     cx, cy = int(club_info["x"]), int(club_info["y"])

                    #     # Draw box around club shaft
                    #     if club_info.get("box") is not None and club_info.get("raw_detected"):
                    #         x1, y1, x2, y2 = club_info["box"]
                    #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
                    #         cv2.putText(frame, "Club Shaft", (x1, max(y1 - 10, 15)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)
                    #     else:
                    #         # Kinematic anchor / smoothed box
                    #         cv2.rectangle(frame, (cx - 18, cy - 18), (cx + 18, cy + 18), (0, 200, 255), 2)
                    #         cv2.putText(frame, "Club Shaft", (cx - 18, max(cy - 22, 15)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 255), 2)

                    #     # Draw center dot on the club shaft
                    #     cv2.circle(frame, (cx, cy), 5, (0, 255, 255), -1)

                    out.write(frame)
                    frame_idx += 1
            cap.release()
            out.release()
            print(f"Finished & saved: {output_video_path}\n")
    print("All videos processed successfully!")     

if __name__ == "__main__":
    path = "C:/Users/katar/OneDrive/Documents/Takomo_video_photo/dtl_juuso"
    root = Path(path)
    records = find_recordings(root)
    print(f"{len(records)} videos were found in the root path: '{root}'")
    get_landmarks(records)
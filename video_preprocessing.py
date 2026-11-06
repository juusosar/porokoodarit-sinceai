import os
import cv2
import csv
import json
import pandas as pd
from pathlib import Path
import mediapipe as mp

def find_recordings(root):
    recordings = []
    for video_path in sorted(root.rglob("swing*.mp4")):
        print(f"Found video: {video_path}")
        recordings.append(video_path)
    return recordings

def open_video(video_path):
    # Open the video file
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    #frame_idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            print("End of video or failed to grab frame.")
            break  # End of video
            
        # OpenCV reads BGR, but MediaPipe needs RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Wrap into MP image object
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        # Get timestamp in ms
        timestamp_ms = int(cap.get(cv2.CAP_PROP_POS_MSEC))

        yield frame, mp_image, timestamp_ms
    
    cap.release()

def get_landmarks(records):
    BaseOptions = mp.tasks.BaseOptions
    PoseLandmarker = mp.tasks.vision.PoseLandmarker
    PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
    VisionRunningMode = mp.tasks.vision.RunningMode
    
    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path="pose_landmarker_lite.task"),
        running_mode=VisionRunningMode.VIDEO,
        num_poses=1,
    )
    
    with open("all_pose_landmarks.csv", mode="w", newline="") as csv_file:
        writer = csv.writer(csv_file)
        
        # Write CSV header
        header = ["video_name", "frame_idx", "timestamp_ms"]
        for i in range(33):
            header.extend([f"landmark_{i}_x", f"landmark_{i}_y", f"landmark_{i}_z", f"landmark_{i}_vis"])
        writer.writerow(header)
    
    
        for video in records:
            print(f"Processing file: {video}")
            video_path = Path(video)
            cap = cv2.VideoCapture(str(video_path))
            fps = cap.get(cv2.CAP_PROP_FPS)
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
            output_video_path = f"annotated_{video_path.name}"
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(output_video_path, fourcc, fps, (width, height))
            
            with PoseLandmarker.create_from_options(options) as landmarker:
                frame_idx = 0 
                for frame, mp_image, timestamp_ms in open_video(video):
                    result = landmarker.detect_for_video(mp_image, timestamp_ms)
                    
                    if result.pose_landmarks:
                        landmarks = result.pose_landmarks[0] # First person detected
                        
                        # Write row to CSV
                        row = [video_path.name, frame_idx, timestamp_ms]
                        for lm in landmarks:
                            row.extend([lm.x, lm.y, lm.z, lm.visibility])
                        writer.writerow(row)
        
                        # Draw landmarks on video
                        for lm in landmarks:
                            cx, cy = int(lm.x * width), int(lm.y * height)
                            cv2.circle(frame, (cx, cy), 4, (0, 255, 0), -1)
                    
                    out.write(frame)
                    frame_idx += 1
            cap.release()
            out.release()
            print(f"Finished & saved: {output_video_path}\n")
    print("All videos processed successfully!")     

if __name__ == "__main__":
    root = Path(r"own_data")
    records = find_recordings(root)
    print(f"{len(records)} videos were found in the root path: '{root}'")
    get_landmarks(records)
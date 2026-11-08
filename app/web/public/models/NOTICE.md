`pose_landmarker_lite.task`: MediaPipe Pose Landmarker (lite), Copyright Google LLC,
licensed under the Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0).
Model card: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf
MediaPipe Tasks WASM (copied at build time from @mediapipe/tasks-vision) is also Apache-2.0.

`swingtrace-yolo11m-fp16.onnx`: the team's SwingTrace YOLO11m club detector (`app/vision/research/models/swingtrace-yolo11m.pt`),
exported to ONNX and converted to FP16 by `app/vision/export_onnx.py`. Classes: 0 = club shaft, 1, 2 (see repo root
`video_preprocessing.py`). Ultralytics YOLO11 is AGPL-3.0. ONNX Runtime Web (copied at build time) is MIT.

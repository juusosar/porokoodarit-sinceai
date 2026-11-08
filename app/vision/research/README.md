# research: Katariina's swing processing code (originally on `main`, moved into `app/` 8 Nov)

Desktop batch pipeline the product's swing analysis comes from. See "Changing the algorithm" below. App-side fixes go in `app/api/takomo_api/swing/measure.py`.

| main path | here | used by the app |
|---|---|---|
| `phase_detector.py` | `app/api/takomo_api/swing/upstream/phase_detector.py` | yes: swing phases + tempo (API) |
| `swing_analytics.py` | `app/api/takomo_api/swing/upstream/swing_analytics.py` | yes: club speed (API); its `categorize_*` / `predict_fitting` rules are not used, the engine decides |
| `video_preprocessing.py`, `.ipynb` | `app/vision/research/` | no: desktop batch (cv2 + MediaPipe + YOLO, annotated videos). The device does this part in the browser |
| `models/pose_landmarker_lite.task`, `models/swingtrace-yolo11m.pt` | `app/vision/research/models/` | export source for the web models |
| `all_pose_landmarks.csv`, `out/` | `app/vision/research/` | sample output; 3 swings are a test fixture (`app/api/tests/fixtures`) |
| `ball_line_imgs/` | `app/vision/research/ball_line_imgs/` | ball-line test photos (7 Nov session), reference only |

## Flow in the app
device: face-on video -> MediaPipe pose (browser) -> 9 keypoints per frame (numbers)
(optional) down-the-line video -> pose + YOLO club head on ~8 still frames before takeaway (box centres only)
-> API `POST /v1/swing/analyze` -> `upstream/phase_detector` (phases, tempo) + `upstream/swing_analytics.calculate_club_speed`
(+ down-the-line: wrist -> club head px at address, widest shoulders -> upstream `calculate_shaft_length_m` -> shaft used in speed)
-> measurements (`backswing_s`, `downswing_s`, `video_speed_7i_mph`, `shaft_length_m`, each with an SD) -> device -> `/v1/fit` (engine decides).
The swing result shows who read it (server / device and why) and what's missing.
API off / unreachable / no read -> on-device tempo (`app/web/src/lib/pose/tempo.ts`) as before. `VITE_SWING_SERVER=off` skips the API.

## Changing the algorithm
Until 8 Nov these files lived at the root of `main` and were copied here (source SHA in `upstream/UPSTREAM`).
Since the dev -> main migration, the copies in this repo layout are the only ones:
- Algorithm changes: edit `app/api/takomo_api/swing/upstream/*.py` (API) and `app/vision/research/` (desktop).
- App-only adapters (fps, aspect ratio, gaps, down-the-line): `app/api/takomo_api/swing/measure.py`.
- Check: `cd app/api && pytest -q tests/test_swing.py`.
- Ball-line test photos from the 7 Nov session: `ball_line_imgs/`.

## Run the desktop pipeline
```bash
cd app/vision/research
PYTHONPATH=../../api/takomo_api/swing/upstream python video_preprocessing.py   # needs opencv, mediapipe, ultralytics
```

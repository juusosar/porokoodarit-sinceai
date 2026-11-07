# vision (POR-10): opt-in club tracking on Modal GPU

`modal_app.py` runs YOLO11m club-head tracking (`swingtrace-yolo11m.pt`) on a T4.

- Default path needs none of this: pose + tempo run in the browser (`app/web/src/lib/pose`).
- Only after explicit consent the phone sends the ~1.5 s swing window it already cut out
  (`SwingAnalysis.window`). The clip is written to a temp file and deleted after the request.
- Output: club-head centre per frame + detection share. Numbers only.

Status: stub, not deployed (deploys are not pre-approved). Web flag `VITE_CLUB_TRACKING=true` shows the opt-in.
Copy `swingtrace-yolo11m.pt` from the repo root next to `modal_app.py` before `modal deploy`.
Next: ONNX/TensorRT FP16 export, API proxy endpoint, club path -> lie/face features.

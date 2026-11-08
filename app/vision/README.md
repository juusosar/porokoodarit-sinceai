# vision (POR-10): club tracking model

**Decided 7 Nov: club tracking runs on the device** (`app/web/src/lib/club`, onnxruntime-web + WebGPU). The video never leaves the phone.
`export_onnx.py` makes `app/web/public/models/swingtrace-yolo11m-fp16.onnx` from `research/models/swingtrace-yolo11m.pt`. Benchmark: open `/bench/club` on the phone.

The Modal stub below is kept as an unused server fallback.

`modal_app.py` runs YOLO11m club-head tracking (`swingtrace-yolo11m.pt`) on a T4.

- Default path needs none of this: pose + tempo run in the browser (`app/web/src/lib/pose`).
- Only after explicit consent the phone sends the ~1.5 s swing window it already cut out
  (`SwingAnalysis.window`). The clip is written to a temp file and deleted after the request.
- Output: club-head centre per frame + detection share. Numbers only.

Status: stub, not deployed (deploys are not pre-approved). Web flag `VITE_CLUB_TRACKING=true` shows the opt-in.
The model is read from `research/models/`.
Next: ONNX/TensorRT FP16 export, API proxy endpoint, club path -> lie/face features.

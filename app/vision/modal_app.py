"""Opt-in club-head tracking on a Modal GPU (POR-10). Stub: deploy + wire in later.

Privacy contract (see app/docs/DATA_PRIVACY.md):
- Receives only the ~1.5 s swing window the phone cut out (640 px), and only after explicit consent.
- Clip lives in a temp file for the duration of the request, then is deleted. Nothing is stored.
- Returns numbers only (club-head path per frame + summary), never images.

Deploy:  modal deploy app/vision/modal_app.py   (needs a Modal account; not done yet, no deploys pre-approved)
"""

from __future__ import annotations

import os
import tempfile

import modal

app = modal.App("takomo-club-tracking")
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install("ultralytics>=8.3", "opencv-python-headless>=4.10", "fastapi[standard]>=0.115")
    .add_local_file("swingtrace-yolo11m.pt", "/models/swingtrace-yolo11m.pt")
)

MAX_BYTES = 8 * 1024 * 1024  # ~1.5 s at 640 px is well under this


@app.cls(image=image, gpu="T4", scaledown_window=300, timeout=60)
class ClubTracker:
    @modal.enter()
    def load(self) -> None:
        from ultralytics import YOLO

        self.model = YOLO("/models/swingtrace-yolo11m.pt")

    @modal.method()
    def track(self, clip: bytes) -> dict:
        if len(clip) > MAX_BYTES:
            raise ValueError("clip too large")
        fd, path = tempfile.mkstemp(suffix=".mp4")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(clip)
            return self._track_file(path)
        finally:
            os.remove(path)  # delete right after processing

    def _track_file(self, path: str) -> dict:
        frames = []
        for i, r in enumerate(self.model.predict(path, stream=True, imgsz=640, verbose=False)):
            boxes = r.boxes
            if boxes is None or len(boxes) == 0:
                frames.append({"frame": i, "x": None, "y": None, "conf": 0.0})
                continue
            best = int(boxes.conf.argmax())
            x1, y1, x2, y2 = boxes.xyxyn[best].tolist()
            frames.append({"frame": i, "x": (x1 + x2) / 2, "y": (y1 + y2) / 2, "conf": float(boxes.conf[best])})
        detected = sum(1 for f in frames if f["x"] is not None)
        return {"frames": frames, "detected_share": detected / max(len(frames), 1)}

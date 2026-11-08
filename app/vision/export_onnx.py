"""Export the club detector for in-browser use (onnxruntime-web, WebGPU).

    pip install ultralytics onnx onnxslim onnxconverter-common onnxruntime
    python app/vision/export_onnx.py app/vision/research/models/swingtrace-yolo11m.pt app/web/public/models/swingtrace-yolo11m-fp16.onnx

640x640 static input, opset 17, FP16 weights with float32 input/output (keep_io_types). Checks the FP16 model against
FP32 on a random input. value_info is cleared around the FP16 pass: stale shape info breaks the Resize casts.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from onnxconverter_common import float16
from ultralytics import YOLO


def main(src: str, dst: str) -> None:
    fp32 = Path(YOLO(src).export(format="onnx", imgsz=640, opset=17, simplify=True, dynamic=False))
    model = onnx.load(fp32)
    del model.graph.value_info[:]
    model16 = float16.convert_float_to_float16(model, keep_io_types=True)
    del model16.graph.value_info[:]
    onnx.save(model16, dst)

    x = np.random.default_rng(0).random((1, 3, 640, 640), dtype=np.float32)
    a = ort.InferenceSession(str(fp32)).run(None, {"images": x})[0]
    b = ort.InferenceSession(dst).run(None, {"images": x})[0]
    print(f"{dst}: output {b.shape}, max box diff {np.abs(a[0, :4] - b[0, :4]).max():.2f} px")


if __name__ == "__main__":
    main(*sys.argv[1:3])

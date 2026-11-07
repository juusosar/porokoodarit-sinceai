import { DrawingUtils, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";

/** Draw the skeleton for one frame over the video (canvas sized to the video's display box). */
export function drawSkeleton(canvas: HTMLCanvasElement, landmarks: NormalizedLandmark[] | null) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks) return;
  const du = new DrawingUtils(ctx);
  du.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: "#FF6E01", lineWidth: 3 });
  du.drawLandmarks(landmarks, { color: "#FFFFFF", radius: 2 });
}

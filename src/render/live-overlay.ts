import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import type { FrameResult } from "../form-checker/form-checker";
import type { ExerciseDefinition } from "../exercise-library/types";

// MediaPipe's standard pose connection pairs (subset relevant to squat: legs + torso).
const CONNECTIONS: [number, number][] = [
  [11, 23], [23, 25], [25, 27], // left shoulder-hip-knee-ankle
  [12, 24], [24, 26], [26, 28], // right shoulder-hip-knee-ankle
  [11, 12], [23, 24] // shoulders, hips
];

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  poseResult: PoseLandmarkerResult,
  exercise: ExerciseDefinition,
  frameResult: FrameResult | null
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height);

  const landmarks = poseResult.landmarks[0];
  if (!landmarks) {
    ctx.fillStyle = "white";
    ctx.font = "20px sans-serif";
    ctx.fillText("Can't see you clearly — step back into frame", 20, 40);
    return;
  }

  ctx.strokeStyle = "#00FF00";
  ctx.lineWidth = 3;
  for (const [aIdx, bIdx] of CONNECTIONS) {
    const a = landmarks[aIdx];
    const b = landmarks[bIdx];
    ctx.beginPath();
    ctx.moveTo(a.x * ctx.canvas.width, a.y * ctx.canvas.height);
    ctx.lineTo(b.x * ctx.canvas.width, b.y * ctx.canvas.height);
    ctx.stroke();
  }

  if (!frameResult) return;

  exercise.rules.forEach((rule, i) => {
    const result = frameResult.ruleResults[i];
    const vertexIdx = rule.joints[1];
    const vertex = landmarks[vertexIdx];
    ctx.fillStyle = !result.evaluated ? "gray" : result.passed ? "#00FF00" : "#FF0000";
    ctx.beginPath();
    ctx.arc(vertex.x * ctx.canvas.width, vertex.y * ctx.canvas.height, 8, 0, 2 * Math.PI);
    ctx.fill();
  });
}

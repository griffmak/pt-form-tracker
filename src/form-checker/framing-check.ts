import type { ExerciseDefinition } from "../exercise-library/types";
import { VISIBILITY_THRESHOLD, type PoseWorldLandmark } from "./form-checker";

/** MediaPipe Pose landmark indices, for naming joints in user-facing guidance. */
const LANDMARK_NAMES: Record<number, string> = {
  0: "nose",
  11: "left shoulder",
  12: "right shoulder",
  13: "left elbow",
  14: "right elbow",
  15: "left wrist",
  16: "right wrist",
  23: "left hip",
  24: "right hip",
  25: "left knee",
  26: "right knee",
  27: "left ankle",
  28: "right ankle",
  29: "left heel",
  30: "right heel",
  31: "left foot",
  32: "right foot"
};

/** Below the shoulders — if these are cut off, the fix is almost always "stand further back". */
const LOWER_BODY_INDICES = new Set([23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);

export interface FramingAssessment {
  /** True when every joint this exercise measures is visible enough to grade. */
  ready: boolean;
  missingJointNames: string[];
  /** 0-1 of the joints this exercise measures that are currently visible. */
  visibleFraction: number;
  message: string;
}

/**
 * Checks, before recording starts, whether the camera can actually see the joints
 * this exercise grades on.
 *
 * The real 2026-07-26 session skipped ~86% of its rule checks for low landmark
 * visibility, and the user had no way to know until the session was already over.
 * This turns that into live feedback at the point it can still be acted on.
 */
export function assessFraming(
  exercise: ExerciseDefinition,
  landmarks: PoseWorldLandmark[]
): FramingAssessment {
  const requiredIndices = [...new Set(exercise.rules.flatMap((rule) => rule.joints))].sort(
    (a, b) => a - b
  );

  const missingIndices = requiredIndices.filter(
    (i) => (landmarks[i]?.visibility ?? 0) < VISIBILITY_THRESHOLD
  );
  const missingJointNames = missingIndices.map((i) => LANDMARK_NAMES[i] ?? `landmark ${i}`);
  const visibleFraction =
    requiredIndices.length === 0
      ? 1
      : (requiredIndices.length - missingIndices.length) / requiredIndices.length;

  if (landmarks.length === 0) {
    return {
      ready: false,
      missingJointNames,
      visibleFraction: 0,
      message: "No pose detected — step into frame, side-on to the camera."
    };
  }

  if (missingIndices.length === 0) {
    return {
      ready: true,
      missingJointNames: [],
      visibleFraction,
      message: "Framing looks good — every joint this exercise measures is visible."
    };
  }

  const advice = missingIndices.some((i) => LOWER_BODY_INDICES.has(i))
    ? "Move further back so your whole body is in frame."
    : "Adjust your position so your whole body is in frame.";

  return {
    ready: false,
    missingJointNames,
    visibleFraction,
    message: `Can't see your ${formatList(missingJointNames)}. ${advice}`
  };
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

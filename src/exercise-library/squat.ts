import type { ExerciseDefinition } from "./types";

// MediaPipe Pose landmark indices used here:
// 23 = left hip, 25 = left knee, 27 = left ankle
// 11 = left shoulder, 23 = left hip, 25 = left knee
export const squat: ExerciseDefinition = {
  id: "squat",
  displayName: "Squat",
  referenceDescription:
    "Stand with feet shoulder-width apart, lower hips back and down, keep chest up.",
  requiredFraming: "side-view",
  rules: [
    {
      name: "Knee bend depth",
      joints: [23, 25, 27],
      defaultMinDegrees: 80,
      defaultMaxDegrees: 100
    },
    {
      name: "Torso lean",
      joints: [11, 23, 25],
      defaultMinDegrees: 45,
      defaultMaxDegrees: 90
    }
  ]
};

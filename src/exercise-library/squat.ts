import type { ExerciseDefinition } from "./types";

// MediaPipe Pose landmark indices used here:
// 23 = left hip, 25 = left knee, 27 = left ankle
// 11 = left shoulder, 23 = left hip, 25 = left knee
//
// Reference ranges (interior joint angle, 180deg = fully extended):
// - Knee bend depth: general/PT squat depth targets near-parallel to parallel
//   thigh position, which the clinical literature places at ~70-100deg knee
//   flexion angle (vs. 110-140deg for a shallow quarter squat, or <45deg for
//   a deep/ATG squat). Peak knee shear force is reported right around 90deg,
//   reinforcing parallel as the depth target rather than "as low as possible."
// - Torso lean: forward trunk lean beyond ~45deg from vertical is the
//   commonly cited threshold for "excessive" lean; staying above that keeps
//   the shin and torso roughly parallel, the usual PT form cue.
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
      defaultMinDegrees: 70,
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

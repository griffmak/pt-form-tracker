import type { ExerciseDefinition } from "./types";

// MediaPipe Pose landmark indices used here:
// 23 = left hip, 25 = left knee, 27 = left ankle
//
// Reference ranges (interior joint angle, 180deg = fully extended):
// - Knee bend depth: general/PT squat depth targets near-parallel to parallel
//   thigh position, which the clinical literature places at ~70-100deg knee
//   flexion angle (vs. 110-140deg for a shallow quarter squat, or <45deg for
//   a deep/ATG squat). Peak knee shear force is reported right around 90deg,
//   reinforcing parallel as the depth target rather than "as low as possible."
//
// The trunk-lean rule that used to live here was removed on 2026-07-28. It
// documented a 45-90deg band "from vertical" but computed the interior hip
// angle over shoulder->hip->knee, where upright standing is ~170-180deg. It
// therefore passed on 3 of 922 frames of the user standing still — and all
// three were pose-tracker glitch frames. It is replaced in the measurement
// rebuild by a planar trunk measure on shoulder and hip landmarks only, which
// track above 99% where the knee tracks at 59%.
export const squat: ExerciseDefinition = {
  id: "squat",
  displayName: "Squat",
  referenceDescription:
    "Stand with feet shoulder-width apart, lower hips back and down, keep chest up.",
  requiredFraming: "side-view",
  repSignalRuleName: "Knee bend depth",
  rules: [
    {
      name: "Knee bend depth",
      joints: [23, 25, 27],
      defaultMinDegrees: 70,
      defaultMaxDegrees: 100
    }
  ]
};

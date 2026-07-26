export type CameraFraming = "side-view" | "front-view";

export interface JointAngleRule {
  /** Human-readable name shown in feedback, e.g. "Knee bend depth" */
  name: string;
  /** MediaPipe pose landmark indices forming the angle: vertex is joints[1] */
  joints: [number, number, number];
  /** Default acceptable angle range in degrees, sourced from public PT guidance */
  defaultMinDegrees: number;
  defaultMaxDegrees: number;
}

export interface ExerciseDefinition {
  id: string;
  displayName: string;
  referenceDescription: string;
  /** Which camera angle this exercise's rules require to be measurable */
  requiredFraming: CameraFraming;
  rules: JointAngleRule[];
}

/** User-adjusted range for a specific rule, persisted per exercise+rule. */
export interface RuleOverride {
  exerciseId: string;
  ruleName: string;
  minDegrees: number;
  maxDegrees: number;
}

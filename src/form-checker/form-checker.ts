import { angleBetweenPoints, type Point3D } from "../pose/angle-math";
import type { ExerciseDefinition, RuleOverride } from "../exercise-library/types";

export interface PoseWorldLandmark extends Point3D {
  visibility: number;
}

export interface RuleResult {
  ruleName: string;
  /** false if a required joint's visibility was below threshold this frame */
  evaluated: boolean;
  /** only meaningful when evaluated is true */
  passed: boolean;
  angleDegrees: number | null;
}

export interface FrameResult {
  ruleResults: RuleResult[];
}

const VISIBILITY_THRESHOLD = 0.5;

export function checkFrame(
  exercise: ExerciseDefinition,
  landmarks: PoseWorldLandmark[],
  overrides: RuleOverride[]
): FrameResult {
  const ruleResults: RuleResult[] = exercise.rules.map((rule) => {
    const [aIdx, vertexIdx, bIdx] = rule.joints;
    const a = landmarks[aIdx];
    const vertex = landmarks[vertexIdx];
    const b = landmarks[bIdx];

    const lowVisibility =
      a.visibility < VISIBILITY_THRESHOLD ||
      vertex.visibility < VISIBILITY_THRESHOLD ||
      b.visibility < VISIBILITY_THRESHOLD;

    if (lowVisibility) {
      return { ruleName: rule.name, evaluated: false, passed: false, angleDegrees: null };
    }

    const angle = angleBetweenPoints(a, vertex, b);

    const override = overrides.find(
      (o) => o.exerciseId === exercise.id && o.ruleName === rule.name
    );
    const min = override?.minDegrees ?? rule.defaultMinDegrees;
    const max = override?.maxDegrees ?? rule.defaultMaxDegrees;

    return {
      ruleName: rule.name,
      evaluated: true,
      passed: angle >= min && angle <= max,
      angleDegrees: angle
    };
  });

  return { ruleResults };
}

/** Rule coverage for a whole session: how many rule-evaluations actually happened vs. were skipped. */
export function summarizeCoverage(frames: FrameResult[]): { evaluatedCount: number; totalCount: number } {
  let evaluatedCount = 0;
  let totalCount = 0;
  for (const frame of frames) {
    for (const rule of frame.ruleResults) {
      totalCount += 1;
      if (rule.evaluated) evaluatedCount += 1;
    }
  }
  return { evaluatedCount, totalCount };
}

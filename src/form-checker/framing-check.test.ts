import { describe, test, expect } from "vitest";
import { assessFraming } from "./framing-check";
import { squat } from "../exercise-library/squat";
import type { PoseWorldLandmark } from "./form-checker";

/**
 * Squat's rules span landmarks 11 (left shoulder), 23 (left hip),
 * 25 (left knee) and 27 (left ankle).
 */
function landmarks(overrides: Record<number, number> = {}): PoseWorldLandmark[] {
  return Array.from({ length: 33 }, (_, i) => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: overrides[i] ?? 0.9
  }));
}

describe("assessFraming", () => {
  test("is ready when every joint the exercise measures is visible", () => {
    const assessment = assessFraming(squat, landmarks());

    expect(assessment.ready).toBe(true);
    expect(assessment.missingJointNames).toEqual([]);
    expect(assessment.visibleFraction).toBe(1);
  });

  test("is not ready when no pose is detected at all", () => {
    const assessment = assessFraming(squat, []);

    expect(assessment.ready).toBe(false);
    expect(assessment.visibleFraction).toBe(0);
    expect(assessment.message.toLowerCase()).toContain("step into frame");
  });

  test("names the specific joint that is out of frame", () => {
    const assessment = assessFraming(squat, landmarks({ 27: 0.1 }));

    expect(assessment.ready).toBe(false);
    expect(assessment.missingJointNames).toEqual(["left ankle"]);
    expect(assessment.message).toContain("left ankle");
  });

  test("tells the user to move back when a lower-body joint is cut off", () => {
    const assessment = assessFraming(squat, landmarks({ 27: 0.1 }));

    expect(assessment.message.toLowerCase()).toContain("further back");
  });

  test("reports the fraction of measured joints that are visible", () => {
    // 2 of squat's 3 measured joints below threshold. Squat measured 4 joints
    // until the torso rule was removed on 2026-07-28; it now measures hip,
    // knee and ankle only.
    const assessment = assessFraming(squat, landmarks({ 25: 0.2, 27: 0.1 }));

    expect(assessment.visibleFraction).toBeCloseTo(1 / 3);
    expect(assessment.missingJointNames).toEqual(["left knee", "left ankle"]);
  });

  test("uses the same visibility threshold the form checker grades with", () => {
    // Just under 0.5 fails, just over passes — matching checkFrame, so the
    // readout can't say "ready" while every rule gets skipped as unevaluated.
    expect(assessFraming(squat, landmarks({ 27: 0.49 })).ready).toBe(false);
    expect(assessFraming(squat, landmarks({ 27: 0.51 })).ready).toBe(true);
  });
});

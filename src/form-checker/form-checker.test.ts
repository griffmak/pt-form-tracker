import { describe, it, expect } from "vitest";
import { checkFrame, type PoseWorldLandmark } from "./form-checker";
import { squat } from "../exercise-library/squat";

function landmark(x: number, y: number, z: number, visibility = 1): PoseWorldLandmark {
  return { x, y, z, visibility };
}

describe("checkFrame", () => {
  it("passes the knee-bend rule when the angle is inside the default range", () => {
    // Right-angle-ish knee bend (~90deg), inside the 80-100 default range.
    const landmarks: PoseWorldLandmark[] = new Array(33).fill(landmark(0, 0, 0));
    landmarks[23] = landmark(0, 1, 0); // hip
    landmarks[25] = landmark(0, 0, 0); // knee (vertex)
    landmarks[27] = landmark(1, 0, 0); // ankle
    landmarks[11] = landmark(0, 2, 0); // shoulder
    // Torso lean rule uses 11-23-25: shoulder(0,2,0) hip(0,1,0) knee(0,0,0) -> 180deg, outside 45-90 range on purpose.

    const result = checkFrame(squat, landmarks, []);

    const kneeResult = result.ruleResults.find((r) => r.ruleName === "Knee bend depth");
    expect(kneeResult?.evaluated).toBe(true);
    expect(kneeResult?.passed).toBe(true);
  });

  it("marks a rule as not evaluated when a required joint's visibility is below threshold", () => {
    const landmarks: PoseWorldLandmark[] = new Array(33).fill(landmark(0, 0, 0, 1));
    landmarks[23] = landmark(0, 1, 0, 1);
    landmarks[25] = landmark(0, 0, 0, 0.1); // low visibility on the vertex joint
    landmarks[27] = landmark(1, 0, 0, 1);

    const result = checkFrame(squat, landmarks, []);

    const kneeResult = result.ruleResults.find((r) => r.ruleName === "Knee bend depth");
    expect(kneeResult?.evaluated).toBe(false);
    expect(kneeResult?.passed).toBe(false);
  });

  it("uses a user override range instead of the default when one is provided", () => {
    const landmarks: PoseWorldLandmark[] = new Array(33).fill(landmark(0, 0, 0));
    landmarks[23] = landmark(0, 1, 0);
    landmarks[25] = landmark(0, 0, 0);
    landmarks[27] = landmark(1, 0, 0); // ~90 degree knee angle

    // Override narrows the acceptable range to 95-100, so a 90deg angle should now fail.
    const overrides = [{ exerciseId: "squat", ruleName: "Knee bend depth", minDegrees: 95, maxDegrees: 100 }];
    const result = checkFrame(squat, landmarks, overrides);

    const kneeResult = result.ruleResults.find((r) => r.ruleName === "Knee bend depth");
    expect(kneeResult?.evaluated).toBe(true);
    expect(kneeResult?.passed).toBe(false);
  });
});

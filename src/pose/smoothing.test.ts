import { describe, test, expect } from "vitest";
import { PositionSmoother } from "./smoothing";

describe("PositionSmoother", () => {
  test("returns the single sample fed so far, unchanged, until the window fills", () => {
    const smoother = new PositionSmoother(5);
    expect(smoother.push([1, 2])).toEqual([1, 2]);
  });

  test("returns the trailing median once enough samples have been seen", () => {
    const smoother = new PositionSmoother(5);
    smoother.push([0, 0]);
    smoother.push([1, 1]);
    smoother.push([2, 2]);
    smoother.push([3, 3]);
    const result = smoother.push([4, 4]);
    // Median of [0,1,2,3,4] per coordinate is 2.
    expect(result).toEqual([2, 2]);
  });

  test("a single-frame spike does not reach the output", () => {
    const smoother = new PositionSmoother(5);
    smoother.push([0.5, 0.5]);
    smoother.push([0.51, 0.51]);
    smoother.push([0.49, 0.49]);
    smoother.push([0.5, 0.5]);
    const result = smoother.push([5.0, 5.0]); // physically impossible one-frame jump
    // Median of [0.49, 0.5, 0.5, 0.51, 5.0] is 0.5, not anywhere near 5.0.
    expect(result[0]).toBeCloseTo(0.5, 2);
    expect(result[1]).toBeCloseTo(0.5, 2);
  });

  test("tracks multiple independently-keyed points without cross-contaminating them", () => {
    const shoulder = new PositionSmoother(3);
    const hip = new PositionSmoother(3);
    shoulder.push([0, 0]);
    hip.push([1, 1]);
    const shoulderResult = shoulder.push([0.1, 0.1]);
    const hipResult = hip.push([1.1, 1.1]);
    expect(shoulderResult).not.toEqual(hipResult);
  });
});

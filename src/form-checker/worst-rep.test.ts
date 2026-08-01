import { describe, test, expect } from "vitest";
import { worstRepIndex } from "./worst-rep";

describe("worstRepIndex", () => {
  test("returns null for no reps", () => {
    expect(worstRepIndex([])).toBeNull();
  });

  test("returns null when nothing is flagged, even if depths differ slightly", () => {
    const reps = [
      { unusual: false, deviationFraction: 0.1 },
      { unusual: false, deviationFraction: -0.05 }
    ];
    expect(worstRepIndex(reps)).toBeNull();
  });

  test("returns the index of the single flagged rep", () => {
    const reps = [
      { unusual: false, deviationFraction: 0.02 },
      { unusual: true, deviationFraction: -0.55 },
      { unusual: false, deviationFraction: 0.01 }
    ];
    expect(worstRepIndex(reps)).toBe(1);
  });

  test("picks the larger magnitude among multiple flagged reps, regardless of sign", () => {
    const reps = [
      { unusual: true, deviationFraction: 0.4 },
      { unusual: true, deviationFraction: -0.7 },
      { unusual: false, deviationFraction: 0.02 }
    ];
    expect(worstRepIndex(reps)).toBe(1);
  });
});

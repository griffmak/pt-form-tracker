import { describe, test, expect } from "vitest";
import { assessCalibration, depthRatio, leanDelta, type Baseline } from "./calibration";
import type { TrunkSample } from "../pose/planar-measures";

function still(count: number, overrides: Partial<TrunkSample> = {}): TrunkSample[] {
  return Array.from({ length: count }, () => ({
    leanDegrees: 2,
    hipY: 0.5,
    trunkLength: 0.3,
    minVisibility: 0.99,
    ...overrides
  }));
}

const baseline: Baseline = { hipY: 0.5, trunkLength: 0.3, leanDegrees: 2, frameCount: 90 };

function sample(overrides: Partial<TrunkSample> = {}): TrunkSample {
  return { leanDegrees: 2, hipY: 0.5, trunkLength: 0.3, minVisibility: 0.99, ...overrides };
}

describe("assessCalibration", () => {
  test("is not ready before the window is full", () => {
    const state = assessCalibration(still(30));

    expect(state.ready).toBe(false);
    expect(state.baseline).toBeNull();
  });

  test("produces a baseline from a full window of stillness", () => {
    const state = assessCalibration(still(90));

    expect(state.ready).toBe(true);
    expect(state.baseline).toEqual({
      hipY: 0.5,
      trunkLength: 0.3,
      leanDegrees: 2,
      frameCount: 90
    });
  });

  test("refuses when the hips are still moving", () => {
    // 0.002/frame over 90 frames is a 0.18 hip excursion — a squat, not sway.
    const moving = still(90).map((s, i) => ({ ...s, hipY: 0.5 + i * 0.002 }));

    expect(assessCalibration(moving).ready).toBe(false);
  });

  test("refuses when a frame in the window had no pose", () => {
    const gappy: (TrunkSample | null)[] = still(90);
    gappy[45] = null;

    expect(assessCalibration(gappy).ready).toBe(false);
  });

  test("refuses when trunk landmarks are poorly tracked", () => {
    expect(assessCalibration(still(90, { minVisibility: 0.3 })).ready).toBe(false);
  });

  test("explains what is wrong rather than just refusing", () => {
    const state = assessCalibration(still(90, { minVisibility: 0.3 }));

    expect(state.message.length).toBeGreaterThan(0);
    expect(state.message).not.toMatch(/\d+(\.\d+)?\s*(deg|°)/);
  });

  test("assesses only the trailing window, so a full buffer still calibrates", () => {
    // This is what a live session looks like: the tracker's unusable warm-up
    // frames sit at the front of the buffer and must not veto a stable present.
    // corpus-01-standing's first 90 frames have hip-Y sd of 0.0146, ~6x the
    // threshold, while frames 270+ have sd 0.0003.
    const warmUp = Array.from({ length: 90 }, (_, i) => sample({ hipY: 0.5 + i * 0.01 }));
    const state = assessCalibration([...warmUp, ...still(90)]);

    expect(state.ready).toBe(true);
    expect(state.baseline!.hipY).toBe(0.5);
  });

  test("tolerates the worst genuine stillness the corpus recorded", () => {
    // Worst converged 90-frame window in corpus-01-standing: hip-Y sd 0.00083,
    // trunk-length sd/median 0.00739. The gate must not reject that.
    const jitter = (i: number) => (i % 2 === 0 ? 1 : -1) * 0.00083;
    const realStillness = Array.from({ length: 90 }, (_, i) =>
      sample({ hipY: 0.5 + jitter(i), trunkLength: 0.3 * (1 + jitter(i) * 8.9) })
    );

    expect(assessCalibration(realStillness).ready).toBe(true);
  });

  test("uses the median so one bad frame cannot move the baseline", () => {
    const window = still(90);
    window[10] = { ...window[10], hipY: 0.9 };
    const state = assessCalibration(window);

    // Still refuses (that frame breaks the stability check), but if the
    // stability check is ever relaxed the median must hold the line.
    const relaxed = assessCalibration(
      still(90).map((s, i) => (i === 10 ? { ...s, hipY: 0.502 } : s))
    );
    expect(relaxed.baseline!.hipY).toBe(0.5);
    expect(state.ready).toBe(false);
  });
});

describe("depthRatio", () => {
  test("is zero at the baseline", () => {
    expect(depthRatio(sample(), baseline)).toBe(0);
  });

  test("grows positive as the hips drop, scaled by the user's own trunk", () => {
    expect(depthRatio(sample({ hipY: 0.65 }), baseline)).toBeCloseTo(0.5, 6);
  });

  test("is negative if the hips rise above the baseline", () => {
    expect(depthRatio(sample({ hipY: 0.44 }), baseline)).toBeLessThan(0);
  });

  test("reads the same depth for the same squat at two distances from the camera", () => {
    // The point of dividing by trunk length. A body imaged at 2/3 the scale
    // drops 2/3 as far in normalized coords for the same real-world descent.
    const near = depthRatio(sample({ hipY: 0.65 }), baseline);
    const far = depthRatio(
      { leanDegrees: 2, hipY: 0.6, trunkLength: 0.2, minVisibility: 0.99 },
      { hipY: 0.5, trunkLength: 0.2, leanDegrees: 2, frameCount: 90 }
    );

    expect(far).toBeCloseTo(near, 6);
  });
});

describe("leanDelta", () => {
  test("is zero at the baseline posture, whatever the absolute angle was", () => {
    expect(leanDelta(sample(), baseline)).toBe(0);
  });

  test("reports the change from the user's own standing posture", () => {
    expect(leanDelta(sample({ leanDegrees: 14 }), baseline)).toBe(12);
  });

  test("cancels a camera roll that biases every absolute reading alike", () => {
    // The reason baseline subtraction exists: a tilted laptop lid adds a
    // constant to every leanDegrees, and must not change the reported delta.
    const roll = 7.5;
    const tilted: Baseline = { ...baseline, leanDegrees: baseline.leanDegrees + roll };

    expect(leanDelta(sample({ leanDegrees: 14 + roll }), tilted)).toBeCloseTo(12, 6);
  });
});

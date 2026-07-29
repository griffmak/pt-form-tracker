import { describe, test, expect } from "vitest";
import { rollingDepthSeries, repDeviations } from "./rep-deviation";
import type { TrunkSample } from "../pose/planar-measures";
import type { Baseline } from "./calibration";
import type { DepthRep } from "./rep-segmentation";

const baseline: Baseline = { hipY: 0.5, trunkLength: 0.3, leanDegrees: 2, frameCount: 90 };

function sample(hipY: number, trunkLength = 0.3): TrunkSample {
  return { leanDegrees: 2, hipY, trunkLength, minVisibility: 0.99 };
}

/** 240 frames of standing, then a 60-frame descent to `depth` and back. */
function set(depth: number, trunkLength = 0.3): (TrunkSample | null)[] {
  const stand = Array.from({ length: 240 }, () => sample(0.5, trunkLength));
  const down = Array.from({ length: 30 }, (_, i) =>
    sample(0.5 + (depth * trunkLength * (i + 1)) / 30, trunkLength)
  );
  return [...stand, ...down, ...[...down].reverse()];
}

describe("rollingDepthSeries", () => {
  test("reads zero while standing", () => {
    const rolling = rollingDepthSeries(set(0.6), baseline, 90);

    expect(rolling[200]).toBeCloseTo(0, 4);
  });

  test("reads the same depth for the same movement at a different distance", () => {
    // The whole point. corpus-06-drift performs identical reps before and after
    // stepping toward the camera; a session-global baseline reports the later
    // ones as 39.4% deeper. See the manifest's "Drift finding".
    const near = rollingDepthSeries(set(0.6, 0.3), baseline, 90);
    const far = rollingDepthSeries(set(0.6, 0.42), baseline, 90);

    expect(Math.max(...far.map((v) => v ?? 0))).toBeCloseTo(
      Math.max(...near.map((v) => v ?? 0)),
      3
    );
  });

  test("leaves pre-calibration frames unevaluated", () => {
    const rolling = rollingDepthSeries(set(0.6), baseline, 90);

    expect(rolling.slice(0, 90).every((v) => v === null)).toBe(true);
  });

  test("leaves frames outside the calibrated scale unevaluated", () => {
    const samples = set(0.6);
    samples[300] = sample(0.5, 0.3 * 2.635);
    const rolling = rollingDepthSeries(samples, baseline, 90);

    expect(rolling[300]).toBeNull();
  });

  test("is the same length as its input", () => {
    const samples = set(0.6);

    expect(rollingDepthSeries(samples, baseline, 90)).toHaveLength(samples.length);
  });
});

describe("repDeviations", () => {
  const rep = (bottomIndex: number): DepthRep => ({
    startIndex: bottomIndex - 20,
    endIndex: bottomIndex + 20,
    bottomIndex,
    bottomDepthRatio: 0
  });

  test("reports every rep as usual when the set is consistent", () => {
    const rolling = new Array(500).fill(0.6);
    const deviations = repDeviations([rep(100), rep(200), rep(300)], rolling);

    expect(deviations.every((d) => !d.unusual)).toBe(true);
    expect(deviations.every((d) => Math.abs(d.deviationFraction) < 1e-9)).toBe(true);
  });

  test("flags a rep far shallower than the set median", () => {
    const rolling: (number | null)[] = new Array(500).fill(0.6);
    // The whole span 280-320 inclusive, since a rep's depth is the maximum over
    // its span — one frame left at full depth would be the peak.
    for (let i = 280; i <= 320; i++) rolling[i] = 0.25;
    const deviations = repDeviations([rep(100), rep(200), rep(300)], rolling);

    expect(deviations[2].deviationFraction).toBeLessThan(-0.5);
    expect(deviations[2].unusual).toBe(true);
    expect(deviations[0].unusual).toBe(false);
  });

  test("does not flag the ordinary spread of a consistent set", () => {
    // corpus-03-five-normal's reps spread to 17.1% either side of its median and
    // every one of them is a good rep. Flagging those would make the feature
    // noise.
    const rolling: (number | null)[] = new Array(500).fill(0.45);
    for (let i = 80; i <= 120; i++) rolling[i] = 0.45 * 0.829;
    for (let i = 280; i <= 320; i++) rolling[i] = 0.45 * 1.171;
    const deviations = repDeviations([rep(100), rep(200), rep(300)], rolling);

    expect(deviations.every((d) => !d.unusual)).toBe(true);
  });

  test("measures a rep from its own span, not the whole series", () => {
    const rolling: (number | null)[] = new Array(500).fill(0);
    for (let i = 90; i < 110; i++) rolling[i] = 0.6;
    for (let i = 190; i < 210; i++) rolling[i] = 0.6;
    for (let i = 290; i < 310; i++) rolling[i] = 0.6;
    const deviations = repDeviations([rep(100), rep(200), rep(300)], rolling);

    expect(deviations.map((d) => d.bottomDepthRatio)).toEqual([0.6, 0.6, 0.6]);
  });

  test("returns nothing for no reps rather than dividing by zero", () => {
    expect(repDeviations([], new Array(100).fill(0.5))).toEqual([]);
  });

  test("does not flag anything in a set of one rep", () => {
    // One rep is its own median. There is nothing to be unlike.
    const deviations = repDeviations([rep(100)], new Array(500).fill(0.6));

    expect(deviations).toHaveLength(1);
    expect(deviations[0].unusual).toBe(false);
  });
});

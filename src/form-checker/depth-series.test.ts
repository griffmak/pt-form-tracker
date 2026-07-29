import { describe, test, expect } from "vitest";
import { findBaseline, buildDepthSeries } from "./depth-series";
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

describe("findBaseline", () => {
  test("returns null when the tracker never settles", () => {
    // Hips sliding 0.01/frame for the whole take: no 90-frame window is still.
    const drifting = Array.from({ length: 300 }, (_, i) => ({
      leanDegrees: 2,
      hipY: 0.2 + i * 0.01,
      trunkLength: 0.3,
      minVisibility: 0.99
    }));

    expect(findBaseline(drifting)).toBeNull();
  });

  test("reports the first window that settles, not the first window at all", () => {
    // The live-gate property. 120 unusable warm-up frames, then stillness.
    const warmUp = Array.from({ length: 120 }, (_, i) => ({
      leanDegrees: 2,
      hipY: 0.5 + i * 0.01,
      trunkLength: 0.3,
      minVisibility: 0.99
    }));
    const found = findBaseline([...warmUp, ...still(90)]);

    expect(found).not.toBeNull();
    expect(found!.readyAt).toBe(210);
    expect(found!.baseline.hipY).toBe(0.5);
  });
});

describe("buildDepthSeries", () => {
  test("returns null when no baseline can be found", () => {
    expect(buildDepthSeries(still(30))).toBeNull();
  });

  test("keeps the series the same length as the input", () => {
    const series = buildDepthSeries([...still(90), ...still(10)]);

    expect(series!.values).toHaveLength(100);
  });

  test("leaves every pre-calibration frame unevaluated", () => {
    const series = buildDepthSeries([...still(90), ...still(10)]);

    expect(series!.values.slice(0, 90).every((v) => v === null)).toBe(true);
  });

  test("measures depth against the discovered baseline after calibration", () => {
    const descending = still(5, { hipY: 0.65 });
    const series = buildDepthSeries([...still(90), ...descending]);

    // 0.15 below a 0.3 trunk length.
    expect(series!.values[92]).toBeCloseTo(0.5, 6);
  });

  test("does not evaluate frames with no pose", () => {
    const samples: (TrunkSample | null)[] = [...still(90), null, ...still(3)];
    const series = buildDepthSeries(samples);

    expect(series!.values[90]).toBeNull();
    expect(series!.values[91]).not.toBeNull();
  });

  test("does not evaluate frames where the body has left its calibrated scale", () => {
    // The walk-back-to-the-laptop tail: same hips, body imaged 2.6x larger.
    const approaching = still(5, { hipY: 0.5, trunkLength: 0.3 * 2.635 });
    const series = buildDepthSeries([...still(90), ...approaching]);

    expect(series!.values.slice(90).every((v) => v === null)).toBe(true);
  });
});

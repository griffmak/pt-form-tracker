import { describe, test, expect } from "vitest";
import { midpoint, trunkSample, type TrunkSample } from "./planar-measures";

/**
 * Narrows away the bounds-guard null for the tests that are about geometry
 * rather than about the guard. Fails loudly rather than silently coercing, so a
 * guard that starts rejecting valid frames surfaces here instead of hiding
 * behind a `!`.
 */
function measured(sample: TrunkSample | null): TrunkSample {
  expect(sample).not.toBeNull();
  return sample as TrunkSample;
}

/**
 * Builds a corpus-shaped frame. Positions are normalized image coords; y grows
 * downward. Only the four trunk landmarks matter to these functions, but the
 * array shape matches the corpus so tests and real data exercise one code path.
 */
function frame(
  shoulder: { x: number; y: number },
  hip: { x: number; y: number },
  visibility = 0.99
): number[][] {
  const p = (x: number, y: number) => [x, y, 0, visibility];
  return [
    p(shoulder.x, shoulder.y), // 11 left shoulder
    p(shoulder.x, shoulder.y), // 12 right shoulder
    p(hip.x, hip.y), // 23 left hip
    p(hip.x, hip.y), // 24 right hip
    p(0, 0),
    p(0, 0),
    p(0, 0),
    p(0, 0) // knees, ankles — unused here
  ];
}

describe("midpoint", () => {
  test("averages both coordinates", () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 1, y: 3 })).toEqual({ x: 0.5, y: 1.5 });
  });
});

describe("trunkSample", () => {
  test("reads zero lean for a perfectly vertical trunk", () => {
    const s = measured(trunkSample(frame({ x: 0.5, y: 0.3 }, { x: 0.5, y: 0.6 }), 16 / 9));

    expect(s.leanDegrees).toBeCloseTo(0, 6);
  });

  test("applies aspect correction to the horizontal component", () => {
    // dx = 0.1 normalized-width, dy = 0.1 normalized-height. On a square feed
    // that is 45deg. On 16:9 the same dx spans 16/9 as much real distance, so
    // the true angle is atan(0.1 * 16/9 / 0.1) = 60.64deg.
    const square = measured(trunkSample(frame({ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 }), 1));
    const wide = measured(trunkSample(frame({ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 }), 16 / 9));

    expect(square.leanDegrees).toBeCloseTo(45, 4);
    expect(wide.leanDegrees).toBeCloseTo(60.6423, 3);
  });

  test("applies aspect correction at the corpus 4:3 ratio too", () => {
    // The corpus was captured at 640x480, not 16:9. atan(0.1 * 4/3 / 0.1).
    const corpusRatio = measured(trunkSample(frame({ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 }), 4 / 3));

    expect(corpusRatio.leanDegrees).toBeCloseTo(53.1301, 3);
  });

  test("signs lean by the direction the hip sits relative to the shoulder", () => {
    const positive = measured(trunkSample(frame({ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 }), 1));
    const negative = measured(trunkSample(frame({ x: 0.6, y: 0.4 }, { x: 0.5, y: 0.5 }), 1));

    expect(positive.leanDegrees).toBeGreaterThan(0);
    expect(negative.leanDegrees).toBeCloseTo(-positive.leanDegrees, 6);
  });

  test("reports hip height as raw normalized y, growing downward", () => {
    const high = measured(trunkSample(frame({ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.5 }), 1));
    const low = measured(trunkSample(frame({ x: 0.5, y: 0.4 }, { x: 0.5, y: 0.7 }), 1));

    expect(high.hipY).toBe(0.5);
    expect(low.hipY).toBeGreaterThan(high.hipY);
  });

  test("measures trunk length in aspect-corrected space", () => {
    // Purely vertical trunk: aspect correction touches x only, so length is dy.
    const s = measured(trunkSample(frame({ x: 0.5, y: 0.3 }, { x: 0.5, y: 0.6 }), 16 / 9));

    expect(s.trunkLength).toBeCloseTo(0.3, 6);
  });

  test("reports the weakest of the four trunk landmarks", () => {
    const lm = frame({ x: 0.5, y: 0.3 }, { x: 0.5, y: 0.6 }, 0.99);
    lm[3] = [0.5, 0.6, 0, 0.42]; // right hip only

    expect(measured(trunkSample(lm, 1)).minVisibility).toBe(0.42);
  });

  test("averages left and right rather than trusting one side", () => {
    const lm = frame({ x: 0.5, y: 0.3 }, { x: 0.5, y: 0.6 });
    lm[0] = [0.4, 0.3, 0, 0.99]; // left shoulder jitters away
    lm[1] = [0.6, 0.3, 0, 0.99]; // right shoulder jitters the other way

    // The midpoint is unchanged, so lean stays vertical despite the jitter.
    expect(measured(trunkSample(lm, 1)).leanDegrees).toBeCloseTo(0, 6);
  });
});

/**
 * The Phase 1 corpus showed hip-Y values of 1.177 and 1.488 in takes 4 and 6 —
 * physically impossible positions reported with visibility >= 0.5. A visibility
 * threshold of any value cannot catch these; only a bounds check can.
 */
describe("trunkSample bounds guard", () => {
  test("rejects a frame whose landmarks leave the normalized image range", () => {
    // Reproduces corpus-06-drift's worst observed hip-Y.
    expect(trunkSample(frame({ x: 0.5, y: 0.3 }, { x: 0.5, y: 1.488 }), 4 / 3)).toBeNull();
  });

  test("rejects negative coordinates just as readily as above-one ones", () => {
    expect(trunkSample(frame({ x: 0.5, y: -0.02 }, { x: 0.5, y: 0.6 }), 4 / 3)).toBeNull();
  });

  test("accepts the exact boundary values", () => {
    expect(trunkSample(frame({ x: 0.5, y: 0 }, { x: 0.5, y: 1 }), 4 / 3)).not.toBeNull();
  });

  test("only bounds-checks the four trunk landmarks it actually uses", () => {
    // Knee and ankle tracking is the weak link this design routes around; a
    // wild knee must not discard an otherwise good trunk measurement.
    const lm = frame({ x: 0.5, y: 0.3 }, { x: 0.5, y: 0.6 });
    lm[4] = [0.5, 2.4, 0, 0.99];

    expect(trunkSample(lm, 1)).not.toBeNull();
  });
});

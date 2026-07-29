import { describe, test, expect } from "vitest";
import { rejectImplausibleDepthJumps, detectDepthReps } from "./rep-segmentation";

describe("rejectImplausibleDepthJumps", () => {
  test("leaves a plausible descent untouched", () => {
    const series = [0, 0.02, 0.04, 0.06, 0.08];

    expect(rejectImplausibleDepthJumps(series)).toEqual(series);
  });

  test("rejects a single frame that jumps further than a body can move", () => {
    const series = [0, 0.02, 0.9, 0.04, 0.06];

    expect(rejectImplausibleDepthJumps(series)).toEqual([0, 0.02, null, 0.04, 0.06]);
  });

  test("rejects a whole glitch burst rather than walking along with it", () => {
    // The corpus-04-shallow frames 1086-1104 shape: consecutive wild samples.
    // Comparing against the last ACCEPTED value is what stops the filter from
    // being dragged onto the glitch and then rejecting the recovery instead.
    const series = [0, -0.21, -0.33, -0.26, 0.01];
    const cleaned = rejectImplausibleDepthJumps(series);

    expect(cleaned[1]).toBeNull();
    expect(cleaned[2]).toBeNull();
    expect(cleaned[4]).toBe(0.01);
  });

  test("scales the budget with the gap so a brief dropout is bridged", () => {
    // Five frames of nothing, then a 0.3 change: 0.06/frame, plausible.
    const series = [0, null, null, null, null, 0.3];

    expect(rejectImplausibleDepthJumps(series)[5]).toBe(0.3);
  });

  test("re-seeds after a long dropout instead of rejecting forever", () => {
    const series: (number | null)[] = [0, ...Array(40).fill(null), 0.7];

    expect(rejectImplausibleDepthJumps(series)[41]).toBe(0.7);
  });

  test("passes the fastest genuine frame-to-frame change in the corpus", () => {
    // corpus-06-drift frame 1111: 0.0625 depth-ratio in one frame, a real
    // descent. A filter that rejects this rejects real reps.
    const series = [0.1, 0.1625];

    expect(rejectImplausibleDepthJumps(series)).toEqual(series);
  });
});

/** One synthetic rep: down over `ramp`, hold at `depth`, back up. */
function rep(depth: number, ramp = 15, hold = 20): number[] {
  const down = Array.from({ length: ramp }, (_, i) => (depth * (i + 1)) / ramp);
  const bottom = Array.from({ length: hold }, () => depth);
  const up = [...down].reverse();
  return [...down, ...bottom, ...up];
}

const standing = (count: number) => Array.from({ length: count }, () => 0);

describe("detectDepthReps", () => {
  test("finds nothing in an empty series", () => {
    expect(detectDepthReps([])).toEqual([]);
  });

  test("finds nothing in a series that is all unevaluated", () => {
    expect(detectDepthReps([null, null, null])).toEqual([]);
  });

  test("finds nothing when the whole session barely moved", () => {
    // corpus-01-standing's entire p05-p95 range is 0.0151. A measure that
    // reports reps here is the same defect class as the bug this rebuild exists
    // to fix.
    const swaying = Array.from({ length: 600 }, (_, i) => 0.007 * Math.sin(i / 30));

    expect(detectDepthReps(swaying)).toEqual([]);
  });

  test("finds one rep in one descent", () => {
    const reps = detectDepthReps([...standing(60), ...rep(0.6), ...standing(60)]);

    expect(reps).toHaveLength(1);
  });

  test("reports the deepest point as the maximum, not the minimum", () => {
    const reps = detectDepthReps([...standing(60), ...rep(0.6), ...standing(60)]);

    expect(reps[0].bottomDepthRatio).toBeCloseTo(0.6, 6);
    // The descent's last frame is index 74 and already at full depth; the hold
    // that follows never exceeds it, so the first frame at the bottom wins.
    expect(reps[0].bottomIndex).toBe(74);
  });

  test("counts three reps as three, not one", () => {
    const series = [
      ...standing(60),
      ...rep(0.6),
      ...standing(30),
      ...rep(0.6),
      ...standing(30),
      ...rep(0.6),
      ...standing(60)
    ];

    expect(detectDepthReps(series)).toHaveLength(3);
  });

  test("does not split one rep into several when the bottom is noisy", () => {
    // The reason hysteresis exists: jitter at the bottom must not re-trigger.
    const jittery = [
      ...standing(60),
      ...Array.from({ length: 15 }, (_, i) => (0.6 * (i + 1)) / 15),
      ...Array.from({ length: 30 }, (_, i) => 0.6 + (i % 2 === 0 ? 0.04 : -0.04)),
      ...Array.from({ length: 15 }, (_, i) => 0.6 - (0.6 * (i + 1)) / 15),
      ...standing(60)
    ];

    expect(detectDepthReps(jittery)).toHaveLength(1);
  });

  test("ignores an excursion too brief to be a rep", () => {
    const twitch = [...standing(60), ...rep(0.6, 2, 2), ...standing(60), ...rep(0.6)];

    expect(detectDepthReps(twitch)).toHaveLength(1);
  });

  test("counts a rep still underway when the recording stopped", () => {
    const reps = detectDepthReps([...standing(60), ...rep(0.6).slice(0, 30)]);

    expect(reps).toHaveLength(1);
  });

  test("does not end a rep because the tracker blinked at the bottom", () => {
    // null means "not evaluated". Reading it as a return to standing would
    // close the rep early and, worse, could open a second one on the way up.
    const blinking: (number | null)[] = [...standing(60), ...rep(0.6), ...standing(60)];
    for (let i = 76; i < 86; i++) blinking[i] = null;

    expect(detectDepthReps(blinking)).toHaveLength(1);
  });

  test("counts a shallower rep in the same set as the deep ones", () => {
    // corpus-05-degrading in miniature, and the reason the enter threshold has
    // an absolute cap. Deep reps then reps at ~0.24: a purely relative
    // threshold sits at 0.6 of the session range and drops the shallow ones.
    const series = [
      ...standing(60),
      ...rep(0.7),
      ...standing(30),
      ...rep(0.7),
      ...standing(30),
      ...rep(0.24),
      ...standing(30),
      ...rep(0.24),
      ...standing(60)
    ];

    expect(detectDepthReps(series)).toHaveLength(4);
  });

  test("counts reps in a set shallower than the absolute enter threshold", () => {
    // The other half of the min(): the relative term. This whole set peaks at
    // 0.16, below MAX_ENTER_OFFSET, so a flat absolute threshold never triggers
    // and a real — if very shallow — set reports zero reps. range * 0.6 = 0.096
    // finds all three. Nothing in the corpus exercises this branch: every take
    // that reaches segmentation has a range above ~0.32, so the cap is the lower
    // term on all of them. This is the test that keeps the branch honest.
    const series = [
      ...standing(60),
      ...rep(0.16),
      ...standing(30),
      ...rep(0.16),
      ...standing(30),
      ...rep(0.16),
      ...standing(60)
    ];

    expect(detectDepthReps(series)).toHaveLength(3);
  });

});

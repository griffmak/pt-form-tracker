import { describe, test, expect } from "vitest";
import { detectReps, percentile, rejectImplausibleJumps } from "./rep-detection";

/**
 * Synthetic knee-angle series. 180deg = fully extended (standing), smaller =
 * deeper bend, matching the interior-joint-angle convention used by angle-math
 * and the squat rule definitions.
 *
 * Frame counts here are 60fps-realistic on purpose. The original fixtures
 * ramped 170->90 in 6 frames — 16deg/frame, or 960deg/s, which no human joint
 * does and which the plausibility filter correctly rejects. A 40-frame descent
 * is ~0.67s and ~2.7deg/frame, which is what the real captures show.
 */
function ramp(from: number, to: number, steps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < steps; i++) {
    out.push(from + ((to - from) * i) / (steps - 1));
  }
  return out;
}

/** One squat: stand -> descend -> bottom -> ascend -> stand, at 60fps. */
function squatCycle(standing = 170, bottom = 90, halfFrames = 40): number[] {
  return [
    ...ramp(standing, bottom, halfFrames),
    ...ramp(bottom, standing, halfFrames).slice(1)
  ];
}

describe("percentile", () => {
  test("returns null for an empty series", () => {
    expect(percentile([], 0.5)).toBeNull();
  });

  test("returns the single value for a one-element series", () => {
    expect(percentile([42], 0.05)).toBe(42);
  });

  test("interpolates between neighbouring samples", () => {
    // 11 samples, so p=0.05 lands at index 0.5 — halfway between 0 and 10.
    expect(percentile([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.05)).toBe(5);
  });

  test("returns the extremes at p=0 and p=1", () => {
    expect(percentile([1, 2, 3], 0)).toBe(1);
    expect(percentile([1, 2, 3], 1)).toBe(3);
  });
});

describe("detectReps calibration", () => {
  test("ignores a single glitch frame when setting the session scale", () => {
    // 200 frames of standing still at 170deg, with one frame reading 60deg.
    // Raw min/max sees a 110deg range and invents a rep. Percentiles see ~0.
    const standingWithGlitch: number[] = new Array(200).fill(170);
    standingWithGlitch[100] = 60;

    expect(detectReps(standingWithGlitch)).toEqual([]);
  });
});

describe("rejectImplausibleJumps", () => {
  test("keeps a physiologically normal descent untouched", () => {
    // ~2.7deg per frame at 60fps — a controlled squat.
    const descent = [170, 167.3, 164.6, 161.9, 159.2, 156.5];

    expect(rejectImplausibleJumps(descent)).toEqual(descent);
  });

  test("nulls a single-frame jump no joint can make", () => {
    // The real 2026-07-28 glitch: 141.6 -> 66.6 in 1/60s, roughly 4500 deg/s.
    const withGlitch = [145.0, 143.0, 141.6, 66.6, 142.0, 141.0];

    expect(rejectImplausibleJumps(withGlitch)).toEqual([
      145.0, 143.0, 141.6, null, 142.0, 141.0
    ]);
  });

  test("nulls a multi-frame glitch burst, not just its first frame", () => {
    // Frames 43-45 of the standing capture were all garbage, not just 43.
    const burst = [141.6, 66.6, 79.8, 73.1, 140.9, 141.2];

    expect(rejectImplausibleJumps(burst)).toEqual([
      141.6, null, null, null, 140.9, 141.2
    ]);
  });

  test("allows a larger change across a longer gap", () => {
    // 5 frames apart is 5x the per-frame budget, so 40deg is plausible.
    const sparse: (number | null)[] = [170, null, null, null, null, 130];

    expect(rejectImplausibleJumps(sparse)).toEqual(sparse);
  });

  test("re-seeds rather than rejecting after a long blind gap", () => {
    // After 40 frames of no measurement the body genuinely could be anywhere.
    // Rejecting here would mean one dropout poisons the rest of the session.
    const longGap: (number | null)[] = [170, ...new Array(40).fill(null), 85];

    expect(rejectImplausibleJumps(longGap)).toEqual(longGap);
  });

  test("does not mutate its input", () => {
    const input = [141.6, 66.6, 142.0];
    rejectImplausibleJumps(input);

    expect(input).toEqual([141.6, 66.6, 142.0]);
  });
});

describe("detectReps", () => {
  test("finds no reps in an empty series", () => {
    expect(detectReps([])).toEqual([]);
  });

  test("finds no reps when every frame is unevaluated", () => {
    expect(detectReps([null, null, null, null])).toEqual([]);
  });

  test("finds no reps when the subject never bends", () => {
    expect(detectReps(new Array(50).fill(172))).toEqual([]);
  });

  test("finds no reps in a shallow bob that never reaches rep depth", () => {
    // 10deg of movement — below the minimum range that counts as a rep.
    const bob = [...squatCycle(170, 160), ...squatCycle(170, 160)];

    expect(detectReps(bob)).toEqual([]);
  });

  test("finds no reps in the real session that exposed the per-frame scoring bug", () => {
    // Captured 2026-07-26: knee angle only ever observed between 139.8 and
    // 161.4deg because the deep part of every squat was cropped out of frame.
    // That is 21.6deg of wobble, not reps.
    const observed = [
      161.4, 158.2, 150.1, 144.6, 139.8, 143.2, 152.7, 160.9, 161.1, 141.0, 139.9, 155.3
    ];

    expect(detectReps(observed)).toEqual([]);
  });

  test("finds one rep and reports its deepest point", () => {
    const angles = [...new Array(20).fill(172), ...squatCycle(170, 90), ...new Array(20).fill(172)];

    const reps = detectReps(angles);

    expect(reps).toHaveLength(1);
    expect(reps[0].bottomAngleDegrees).toBe(90);
    expect(angles[reps[0].bottomIndex]).toBe(90);
  });

  test("finds one rep per cycle across several reps", () => {
    const angles = [
      ...squatCycle(170, 95),
      ...squatCycle(170, 88),
      ...squatCycle(170, 92)
    ];

    const reps = detectReps(angles);

    expect(reps).toHaveLength(3);
    expect(reps.map((r) => r.bottomAngleDegrees)).toEqual([95, 88, 92]);
  });

  test("treats noise at the bottom as one rep, not several", () => {
    // Wobble around the bottom would produce three local minima naively.
    const angles = [...ramp(170, 95, 40), 99, 93, 97, 91, ...ramp(95, 170, 40)];

    const reps = detectReps(angles);

    expect(reps).toHaveLength(1);
    expect(reps[0].bottomAngleDegrees).toBe(91);
  });

  test("counts a rep still at the bottom when the session ends", () => {
    // User squats down and ends the session before standing back up. At 60fps
    // a descent that reaches parallel takes about a second, hence 60 frames.
    const angles = ramp(170, 90, 60);

    const reps = detectReps(angles);

    expect(reps).toHaveLength(1);
    expect(reps[0].bottomAngleDegrees).toBe(90);
    expect(reps[0].bottomIndex).toBe(angles.length - 1);
  });

  test("skips unevaluated frames without breaking rep tracking", () => {
    // null = the rule wasn't evaluated that frame (landmark visibility too low).
    const clean = [...new Array(20).fill(172), ...squatCycle(170, 90), ...new Array(20).fill(172)];
    const withGaps: (number | null)[] = clean.map((a, i) => (i % 3 === 1 ? null : a));

    const reps = detectReps(withGaps);

    expect(reps).toHaveLength(1);
    expect(reps[0].bottomAngleDegrees).toBe(90);
  });

  test("discards a dip too brief to be a rep", () => {
    // A fast but physiologically POSSIBLE dip: 8deg/frame, inside the
    // plausibility filter's 10deg/frame budget, so this fixture reaches the
    // duration floor instead of being nulled upstream. It spends ~11 frames
    // below the entry threshold — under 0.2s. A real rep spends longer than
    // that down there; a stumble or a shift does not.
    //
    // The fixture must stay plausible on purpose. An impossible dip (e.g.
    // 170 -> 100 in one frame) is rejected by rejectImplausibleJumps and would
    // make this test pass even with the duration floor deleted.
    const angles = [
      ...new Array(40).fill(170),
      ...ramp(170, 106, 9),
      ...ramp(106, 170, 9).slice(1),
      ...new Array(40).fill(170)
    ];

    expect(detectReps(angles)).toEqual([]);
  });
});

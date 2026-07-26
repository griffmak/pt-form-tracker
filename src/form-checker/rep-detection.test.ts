import { describe, test, expect } from "vitest";
import { detectReps } from "./rep-detection";

/**
 * Synthetic knee-angle series. 180deg = fully extended (standing),
 * smaller = deeper bend, matching the interior-joint-angle convention
 * used by angle-math and the squat rule definitions.
 */
function ramp(from: number, to: number, steps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < steps; i++) {
    out.push(from + ((to - from) * i) / (steps - 1));
  }
  return out;
}

/** One squat: stand -> descend -> bottom -> ascend -> stand. */
function squatCycle(standing = 170, bottom = 90): number[] {
  return [...ramp(standing, bottom, 6), ...ramp(bottom, standing, 6).slice(1)];
}

describe("detectReps", () => {
  test("finds no reps in an empty series", () => {
    expect(detectReps([])).toEqual([]);
  });

  test("finds no reps when the subject never bends", () => {
    const standingStill = new Array(50).fill(172);

    expect(detectReps(standingStill)).toEqual([]);
  });

  test("finds no reps in a shallow bob that never reaches rep depth", () => {
    // 10deg of movement — below the minimum range that counts as a rep.
    const bob = [...squatCycle(170, 160), ...squatCycle(170, 160)];

    expect(detectReps(bob)).toEqual([]);
  });

  test("finds no reps in the real session that exposed the per-frame scoring bug", () => {
    // Captured 2026-07-26: 1303 frames, knee angle only ever observed between
    // 139.8 and 161.4deg because the deep part of every squat was cropped out of
    // frame. That is 21.6deg of wobble, not reps. Reporting reps here would swap
    // one misleading metric for another — the honest output is "nothing measured."
    const observed = [161.4, 158.2, 150.1, 144.6, 139.8, 143.2, 152.7, 160.9, 161.1, 141.0, 139.9, 155.3];

    expect(detectReps(observed)).toEqual([]);
  });

  test("finds one rep and reports its deepest point", () => {
    const angles = [172, 172, ...squatCycle(170, 90), 172, 172];

    const reps = detectReps(angles);

    expect(reps).toHaveLength(1);
    expect(angles[reps[0].bottomIndex]).toBe(90);
    expect(reps[0].bottomAngleDegrees).toBe(90);
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
    const angles = [170, 150, 130, 110, 92, 96, 90, 97, 91, 110, 130, 150, 170];

    const reps = detectReps(angles);

    expect(reps).toHaveLength(1);
    expect(reps[0].bottomAngleDegrees).toBe(90);
    expect(reps[0].bottomIndex).toBe(6);
  });

  test("counts a rep still at the bottom when the session ends", () => {
    // User squats down and ends the session before standing back up.
    const angles = [...ramp(170, 90, 6)];

    const reps = detectReps(angles);

    expect(reps).toHaveLength(1);
    expect(reps[0].bottomAngleDegrees).toBe(90);
    expect(reps[0].bottomIndex).toBe(angles.length - 1);
  });

  test("skips unevaluated frames without breaking rep tracking", () => {
    // null = the rule wasn't evaluated that frame (landmark visibility too low).
    const clean = [172, ...squatCycle(170, 90), 172];
    const withGaps: (number | null)[] = clean.map((a, i) => (i % 3 === 1 ? null : a));

    const reps = detectReps(withGaps);

    expect(reps).toHaveLength(1);
    expect(reps[0].bottomAngleDegrees).toBe(90);
    expect(withGaps[reps[0].bottomIndex]).toBe(90);
  });

  test("finds no reps when every frame is unevaluated", () => {
    expect(detectReps([null, null, null, null])).toEqual([]);
  });
});

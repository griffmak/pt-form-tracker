import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { detectReps } from "./knee-rep-baseline";

/**
 * Replays real captured sessions through rep detection.
 *
 * A metric fix that passes synthetic tests can still be wrong. The version of
 * detectReps these captures were recorded under passed nine synthetic tests and
 * reported 2 reps and a 50% form score from 25.9 seconds of the user standing
 * perfectly still. These four files are the only evidence that the replacement
 * both kills that fabrication and preserves the one session with real squats.
 */
function loadSignal(file: string): (number | null)[] {
  const raw = JSON.parse(readFileSync(`.claude-test-artifacts/${file}`, "utf8"));
  // Captures archived before 2026-07-28 store only the rep signal; later ones
  // store every rule's series keyed by rule name.
  return raw.signalAngles ?? raw.angleSeries["Knee bend depth"];
}

describe("detectReps against real captures", () => {
  test("reports no reps for 25.9s of standing perfectly still", () => {
    // The capture that exposed the fabrication. Reported repCount 2, passRate
    // 0.5. Frame 42 read 141.6deg, frame 43 read 66.6 — ~4500deg/s — and raw
    // min/max calibration let that one frame define the session's scale.
    expect(detectReps(loadSignal("session-2026-07-28-standing-test.json"))).toEqual([]);
  });

  test("still finds both reps in the one session that contained real squats", () => {
    // 2026-07-27, 835 frames, 60.8% rule coverage. This is the guard against
    // over-correcting: a filter strict enough to kill real reps is no better
    // than one loose enough to invent them.
    const reps = detectReps(loadSignal("session-2026-07-27-835frames.json"));

    expect(reps).toHaveLength(2);
    expect(reps.every((r) => r.bottomAngleDegrees < 60)).toBe(true);
  });

  test("reports no reps for the demo-video capture, where no squat was measured", () => {
    // Knee angle never went below 153.6deg — the tool never saw a squat, and
    // saying so plainly is the correct output.
    expect(detectReps(loadSignal("session-2026-07-28-demo-video-967frames.json"))).toEqual([]);
  });

  test("reports no reps for the redo2 capture, where no squat was measured", () => {
    expect(detectReps(loadSignal("session-2026-07-28-redo2-1028frames.json"))).toEqual([]);
  });
});

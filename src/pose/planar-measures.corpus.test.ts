import { describe, test, expect } from "vitest";
import { loadCorpus, CORPUS_TAKES } from "../../tests/corpus";
import { trunkSample, type TrunkSample } from "./planar-measures";
import {
  assessCalibration,
  depthRatio,
  withinCalibratedScale,
  type Baseline
} from "../form-checker/calibration";

function samplesFor(name: string): (TrunkSample | null)[] {
  const corpus = loadCorpus(name);
  return corpus.frames.map((f) => (f.lm ? trunkSample(f.lm, corpus.aspectRatio) : null));
}

/**
 * Runs the calibration gate the way a live session does: called every frame with
 * a growing buffer, not-ready until it sees a stable trailing window.
 *
 * Deliberately NOT `assessCalibration(samples.slice(0, 120))`. Phase 2 measured
 * that the opening window is the WORST window in every take — MediaPipe's
 * tracker needs ~4.5s to settle, during which trunk length moves 36% on a
 * confirmed-motionless body. Calibrating from the first 2 seconds calibrates on
 * garbage. See corpus-manifest.md, "The finding that reframes take 1".
 */
function calibrate(samples: (TrunkSample | null)[]): { baseline: Baseline; readyAt: number } {
  for (let end = 90; end <= samples.length; end++) {
    const state = assessCalibration(samples.slice(0, end));
    if (state.ready) return { baseline: state.baseline!, readyAt: end };
  }
  throw new Error("never calibrated");
}

/**
 * The frames a live session would actually grade: after calibration completes,
 * with a detected pose, in-bounds landmarks, and the body still at the scale it
 * calibrated at.
 */
function measurableDepths(name: string): number[] {
  const samples = samplesFor(name);
  const { baseline, readyAt } = calibrate(samples);
  return samples
    .slice(readyAt)
    .filter((s): s is TrunkSample => s !== null && withinCalibratedScale(s, baseline))
    .map((s) => depthRatio(s, baseline));
}

const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)];
};

describe("planar measures against the real corpus", () => {
  test.each(CORPUS_TAKES)("$name yields trunk samples on nearly every frame", ({ name }) => {
    const samples = samplesFor(name);
    const measured = samples.filter((s) => s !== null).length;

    // The whole design rests on shoulder and hip tracking where the legs do not.
    // If this fails, the leg-free premise does not hold and Phase 3 must not
    // proceed on it.
    //
    // 0.92 rather than the plan's 0.95: corpus-06-drift measures 92.75%. That is
    // reported honestly rather than accommodated silently -- its rejected frames
    // are one contiguous run in the last 2.0s of a 24.6s take, and all five of
    // its reps complete by frame ~1250. Shoulder and hip track at 100% for the
    // first 22.6s. See corpus-manifest.md, "Bounds-guard rejections".
    expect(measured / samples.length).toBeGreaterThan(0.92);
  });

  test("every take measures 100% of frames from calibration to its last rep", () => {
    // The criterion above, restated so it is not weakened by either unusable
    // end. Both ends are excluded for reasons already established: the warm-up
    // is before calibration completes (take 4's 52 out-of-bounds frames are
    // frames 0-51, and it calibrates at 289), and the tail is the user walking
    // to the laptop. In between, every take measures every single frame.
    const lastRepFrame: Record<string, number> = {
      "corpus-01-standing": 1300, // no reps; a late frame still inside the still period
      "corpus-02-five-slow": 1100,
      "corpus-03-five-normal": 1000,
      "corpus-04-shallow": 1000,
      "corpus-05-degrading": 1400,
      "corpus-06-drift": 1250
    };

    for (const { name } of CORPUS_TAKES) {
      const all = samplesFor(name);
      const { readyAt } = calibrate(all);
      const region = all.slice(readyAt, lastRepFrame[name]);
      const measured = region.filter((s) => s !== null).length;

      expect(measured / region.length, `${name} lost frames before its last rep`).toBe(1);
    }
  });

  test("every take calibrates, and none of them from its opening window", () => {
    for (const { name } of CORPUS_TAKES) {
      const { readyAt } = calibrate(samplesFor(name));

      // 4.6-6.5s across the corpus. If a take ever calibrated at frame 90 it
      // would mean the stability gate had stopped rejecting the tracker warm-up,
      // which is the one thing it exists to do.
      expect(readyAt, `${name} calibrated suspiciously early`).toBeGreaterThan(180);
      expect(readyAt, `${name} took too long to calibrate`).toBeLessThan(420);
    }
  });

  test("standing still produces a depth signal that never leaves the noise floor", () => {
    const depths = measurableDepths("corpus-01-standing");

    // The negative control. A measure that reports descent here is the same
    // class of defect as the rep count that fabricated 2 reps from this pose.
    //
    // Without the scale guard this reads 1.0960 -- more apparent descent than
    // any real squat in the corpus, from 30s of confirmed stillness, produced
    // entirely by the last 1.4s in which the user walks to the laptop.
    expect(Math.max(...depths)).toBeLessThan(0.1);
  });

  test("squatting takes produce a depth signal well clear of the standing floor", () => {
    for (const name of ["corpus-02-five-slow", "corpus-03-five-normal", "corpus-05-degrading"]) {
      const depths = measurableDepths(name);

      expect(Math.max(...depths), `${name} showed no descent`).toBeGreaterThan(0.3);
    }
  });

  test("shallow squats sit between standing and full depth", () => {
    const shallow = measurableDepths("corpus-04-shallow");
    const full = measurableDepths("corpus-02-five-slow");

    expect(Math.max(...shallow)).toBeGreaterThan(0.1);
    expect(Math.max(...shallow)).toBeLessThan(Math.max(...full));
  });

  test("the shallow take and the standing take do not overlap", () => {
    // Phase 3's precondition for MIN_REP_DEPTH_RATIO. The plan is explicit that
    // if these two overlap, the measure cannot tell a shallow rep from standing
    // and that is a finding rather than a threshold to tune. They do not
    // overlap: standing peaks at 0.038, the shallow take at 0.345, ~9x apart.
    const standingCeiling = Math.max(...measurableDepths("corpus-01-standing"));
    const shallowFloor = percentile(measurableDepths("corpus-04-shallow"), 0.95);

    expect(shallowFloor).toBeGreaterThan(standingCeiling * 4);
  });

  test("the scale guard costs almost nothing inside the measurable region", () => {
    // A guard that discarded real reps would be no better than one that invented
    // them. Measured over frames before each take's terminal approach run.
    for (const { name } of CORPUS_TAKES) {
      const samples = samplesFor(name);
      const { baseline, readyAt } = calibrate(samples);
      const posed = samples.slice(readyAt, 1000).filter((s): s is TrunkSample => s !== null);
      const kept = posed.filter((s) => withinCalibratedScale(s, baseline)).length;

      expect(kept / posed.length, `${name} lost too much to the scale guard`).toBeGreaterThan(0.99);
    }
  });
});

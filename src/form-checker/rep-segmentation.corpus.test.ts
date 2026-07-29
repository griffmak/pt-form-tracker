import { describe, test, expect } from "vitest";
import { loadCorpus, CORPUS_TAKES } from "../../tests/corpus";
import { trunkSample, type TrunkSample } from "../pose/planar-measures";
import { buildDepthSeries } from "./depth-series";
import { detectDepthReps, type DepthRep } from "./rep-segmentation";
import { detectReps } from "./rep-detection";

function trunkSamplesFor(name: string): (TrunkSample | null)[] {
  const corpus = loadCorpus(name);
  return corpus.frames.map((f) => (f.lm ? trunkSample(f.lm, corpus.aspectRatio) : null));
}

function depthRepsFor(name: string): DepthRep[] {
  const series = buildDepthSeries(trunkSamplesFor(name));
  expect(series, `${name} never calibrated`).not.toBeNull();
  return detectDepthReps(series!.values);
}

describe("depth-signal rep segmentation against the real corpus", () => {
  test.each(CORPUS_TAKES)(
    "$name segments to its ground-truth $groundTruthReps reps",
    ({ name, groundTruthReps }) => {
      // The only evidence that matters. A filter strict enough to kill real reps
      // is no better than one loose enough to invent them, so all six takes are
      // asserted with the same code and the same constants.
      expect(depthRepsFor(name)).toHaveLength(groundTruthReps);
    }
  );

  test("the standing take yields zero reps, not one short one", () => {
    // The negative control, called out separately because it is the failure the
    // whole rebuild started from: the knee-angle path reported 2 reps from a
    // motionless body.
    expect(depthRepsFor("corpus-01-standing")).toHaveLength(0);
  });

  test("the degraded reps are found, not dropped for being shallow", () => {
    const reps = depthRepsFor("corpus-05-degrading");
    const peaks = reps.map((r) => r.bottomDepthRatio);

    expect(reps).toHaveLength(8);
    // First five deep, last three deliberately shallow. If MAX_ENTER_OFFSET is
    // ever removed, the last three vanish and this take reports 5.
    expect(Math.min(...peaks.slice(0, 5))).toBeGreaterThan(0.6);
    expect(Math.max(...peaks.slice(5))).toBeLessThan(0.4);
  });

  test("reps arrive in order and do not overlap", () => {
    for (const { name, groundTruthReps } of CORPUS_TAKES) {
      if (groundTruthReps === 0) continue;
      const reps = depthRepsFor(name);

      for (let i = 0; i < reps.length; i++) {
        expect(
          reps[i].bottomIndex,
          `${name} rep ${i + 1} bottom outside its span`
        ).toBeGreaterThanOrEqual(reps[i].startIndex);
        expect(reps[i].bottomIndex).toBeLessThanOrEqual(reps[i].endIndex);
        if (i > 0) {
          expect(
            reps[i].startIndex,
            `${name} rep ${i + 1} overlaps rep ${i}`
          ).toBeGreaterThan(reps[i - 1].endIndex);
        }
      }
    }
  });

  test("the depth signal beats the knee-angle signal on the same takes", () => {
    // The reason for the whole rebuild, measured rather than asserted. Both
    // paths are run over the same corpus; keep the knee path alive until this
    // comparison stops being informative (Phase 5).
    const kneeErrors: string[] = [];
    const depthErrors: string[] = [];

    for (const { name, groundTruthReps } of CORPUS_TAKES) {
      const corpus = loadCorpus(name);
      // Knee angle from the raw landmarks: hip-knee-ankle interior angle.
      const kneeAngles = corpus.frames.map((f) => {
        if (!f.lm) return null;
        const hip = f.lm[2];
        const knee = f.lm[4];
        const ankle = f.lm[6];
        if (Math.min(hip[3], knee[3], ankle[3]) < 0.5) return null;
        const a = Math.hypot(hip[0] - knee[0], hip[1] - knee[1]);
        const b = Math.hypot(ankle[0] - knee[0], ankle[1] - knee[1]);
        const c = Math.hypot(hip[0] - ankle[0], hip[1] - ankle[1]);
        const cos = (a * a + b * b - c * c) / (2 * a * b);
        return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
      });

      if (detectReps(kneeAngles).length !== groundTruthReps) kneeErrors.push(name);
      if (depthRepsFor(name).length !== groundTruthReps) depthErrors.push(name);
    }

    expect(depthErrors).toEqual([]);
    // Measured: the knee signal gets three of the six wrong — 0 reps on
    // corpus-03-five-normal and corpus-04-shallow, where the legs were tracked
    // too poorly to produce a range at all, and 6 of 8 on corpus-05-degrading.
    // Swapping the signal was not a lateral move.
    expect(kneeErrors).toEqual([
      "corpus-03-five-normal",
      "corpus-04-shallow",
      "corpus-05-degrading"
    ]);
  });
});

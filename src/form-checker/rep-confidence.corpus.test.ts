import { describe, test, expect } from "vitest";
import { loadCorpus } from "../../tests/corpus";
import { trunkSample } from "../pose/planar-measures";
import { withinCalibratedScale, depthRatio } from "./calibration";
import { findBaseline } from "./depth-series";
import { detectDepthReps, type DepthRep } from "./rep-segmentation";
import { assessRepConfidence, BOTTOM_WINDOW_HALF_FRAMES } from "./rep-confidence";
import type { TrunkSample } from "../pose/planar-measures";

const GRADED_TAKES = ["corpus-02-five-slow", "corpus-03-five-normal", "corpus-05-degrading"];

/** Loads a corpus take's trunk samples and segments its reps, exactly as summarizeSession does. */
function repsFor(name: string): { samples: (TrunkSample | null)[]; reps: DepthRep[] } {
  const corpus = loadCorpus(name);
  const samples = corpus.frames.map((f) => (f.lm ? trunkSample(f.lm, corpus.aspectRatio) : null));
  const found = findBaseline(samples)!;
  const depthSeries = samples.map((s, i) =>
    i < found.readyAt || s === null || !withinCalibratedScale(s, found.baseline)
      ? null
      : depthRatio(s, found.baseline)
  );
  return { samples, reps: detectDepthReps(depthSeries) };
}

describe("assessRepConfidence against the real corpus", () => {
  for (const name of GRADED_TAKES) {
    test(`every rep in ${name} is graded — real trunk visibility never drops`, () => {
      const { samples, reps } = repsFor(name);

      expect(reps.length).toBeGreaterThan(0);
      for (const rep of reps) {
        expect(assessRepConfidence(rep, samples)).toBe("graded");
      }
    });
  }

  test("a synthetically degraded bottom window on a real rep is withheld", () => {
    // corpus-05-degrading's first rep is a real, cleanly-tracked rep (per the test
    // above). This test does not invent a rep — it takes that real rep's real
    // segmentation and asks what the gate does if the bottom window's tracking had
    // been bad, which the corpus itself never exercises (see this plan's
    // measurement note). Degrading the FULL ±BOTTOM_WINDOW_HALF_FRAMES window (not
    // a narrower slice) is deliberate: a partial degradation could still leave the
    // window's median above threshold and this test would pass for the wrong
    // reason. Importing the constant rather than hardcoding ±12 keeps this test
    // from silently drifting out of sync with rep-confidence.ts if that value ever
    // changes.
    const { samples, reps } = repsFor("corpus-05-degrading");
    const firstRep = reps[0];
    expect(assessRepConfidence(firstRep, samples)).toBe("graded"); // sanity check first

    const degraded = samples.map((s, i) =>
      i >= firstRep.bottomIndex - BOTTOM_WINDOW_HALF_FRAMES &&
      i <= firstRep.bottomIndex + BOTTOM_WINDOW_HALF_FRAMES &&
      s
        ? { ...s, minVisibility: 0.1 }
        : s
    );

    expect(assessRepConfidence(firstRep, degraded)).toBe("seen-not-graded");
  });
});

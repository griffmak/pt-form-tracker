import { describe, test, expect } from "vitest";
import { assessRepConfidence } from "./rep-confidence";
import type { DepthRep } from "./rep-segmentation";
import type { TrunkSample } from "../pose/planar-measures";

function repAt(startIndex: number, bottomIndex: number, endIndex: number): DepthRep {
  return { startIndex, endIndex, bottomIndex, bottomDepthRatio: 0.6 };
}

function sampleAt(visibility: number): TrunkSample {
  return { leanDegrees: 0, hipY: 0.6, trunkLength: 0.3, minVisibility: visibility };
}

describe("assessRepConfidence", () => {
  test("grades a rep whose bottom window has uniformly high visibility", () => {
    const rep = repAt(50, 75, 100);
    const samples = Array.from({ length: 150 }, () => sampleAt(0.99));

    const verdict = assessRepConfidence(rep, samples);

    expect(verdict).toBe("graded");
  });

  test("withholds a verdict when the bottom window's median visibility is degraded", () => {
    const rep = repAt(50, 75, 100);
    const samples = Array.from({ length: 150 }, (_, i) =>
      i >= 63 && i <= 87 ? sampleAt(0.1) : sampleAt(0.99)
    );

    const verdict = assessRepConfidence(rep, samples);

    expect(verdict).toBe("seen-not-graded");
  });

  test("one bad frame inside an otherwise clean bottom window does not withhold the verdict", () => {
    const rep = repAt(50, 75, 100);
    const samples = Array.from({ length: 150 }, (_, i) => (i === 75 ? sampleAt(0.01) : sampleAt(0.99)));

    const verdict = assessRepConfidence(rep, samples);

    expect(verdict).toBe("graded");
  });

  test("a null sample inside the bottom window is excluded, not treated as zero visibility", () => {
    const rep = repAt(50, 75, 100);
    const samples: (TrunkSample | null)[] = Array.from({ length: 150 }, (_, i) =>
      i === 75 ? null : sampleAt(0.99)
    );

    const verdict = assessRepConfidence(rep, samples);

    expect(verdict).toBe("graded");
  });

  test("clamps the bottom window to the rep's own start/end bounds on a short rep", () => {
    // A 20-frame rep is shorter than the 25-frame window; the window must not
    // reach into a neighbouring rep's frames.
    const rep = repAt(70, 80, 90);
    const samples = Array.from({ length: 150 }, (_, i) =>
      i < 70 || i > 90 ? sampleAt(0.01) : sampleAt(0.99)
    );

    const verdict = assessRepConfidence(rep, samples);

    expect(verdict).toBe("graded");
  });
});

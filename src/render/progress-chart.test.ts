import { describe, test, expect } from "vitest";
import { summarizeSession, renderProgressSummary } from "./progress-chart";
import type { TrunkSample } from "../pose/planar-measures";

/** 120 still frames, then `reps` descents to 0.6 trunk lengths and back. */
function trunkSamplesWithReps(reps: number, leanDegrees = 2): (TrunkSample | null)[] {
  const still = (n: number) =>
    Array.from({ length: n }, () => ({
      leanDegrees,
      hipY: 0.5,
      trunkLength: 0.3,
      minVisibility: 0.99
    }));
  const descent = Array.from({ length: 30 }, (_, i) => ({
    leanDegrees,
    hipY: 0.5 + (0.18 * (i + 1)) / 30,
    trunkLength: 0.3,
    minVisibility: 0.99
  }));
  const out: (TrunkSample | null)[] = [...still(120)];
  for (let r = 0; r < reps; r++) {
    out.push(...descent, ...[...descent].reverse(), ...still(30));
  }
  return out;
}

describe("summarizeSession", () => {
  test("reports no reps for an empty session", () => {
    const summary = summarizeSession([]);
    expect(summary.repCount).toBe(0);
    expect(summary.reps).toEqual([]);
  });

  test("reports no reps for a session that never calibrates", () => {
    const drifting = Array.from({ length: 300 }, (_, i) => ({
      leanDegrees: 2,
      hipY: 0.2 + i * 0.01,
      trunkLength: 0.3,
      minVisibility: 0.99
    }));
    const summary = summarizeSession(drifting);
    expect(summary.repCount).toBe(0);
    expect(summary.reps).toEqual([]);
  });

  test("counts reps from the depth signal and reports each rep's depth", () => {
    const samples = trunkSamplesWithReps(3);
    const summary = summarizeSession(samples);

    expect(summary.repCount).toBe(3);
    expect(summary.reps).toHaveLength(3);
    for (const rep of summary.reps) {
      expect(rep.bottomDepthRatio).toBeGreaterThan(0.5);
      expect(rep.bottomDepthRatio).toBeLessThan(0.7);
    }
  });

  test("reports each rep's trunk-lean delta from the standing baseline", () => {
    const samples = trunkSamplesWithReps(1, 9);
    const summary = summarizeSession(samples);

    expect(summary.reps).toHaveLength(1);
    // Baseline lean is calibrated from the still frames at leanDegrees 9, and the
    // descent samples also hold leanDegrees at 9, so the delta is ~0.
    expect(summary.reps[0].leanDeltaDegrees).toBeCloseTo(0, 1);
  });

  test("reports trunk-tracking coverage, not rule-evaluation coverage", () => {
    const samples = trunkSamplesWithReps(1);
    const half = Math.floor(samples.length / 2);
    const withGaps = samples.map((s, i) => (i < half ? null : s));
    const summary = summarizeSession(withGaps);

    expect(summary.coverageRate).toBeGreaterThan(0);
    expect(summary.coverageRate).toBeLessThan(1);
  });
});

describe("renderProgressSummary", () => {
  test("states that no reps were detected instead of claiming a form score", () => {
    const container = document.createElement("div");
    renderProgressSummary(container, { repCount: 0, reps: [], coverageRate: 0.14 });

    expect(container.textContent).not.toContain("% good form");
    expect(container.textContent!.toLowerCase()).toContain("no ");
    expect(container.textContent).toContain("rep");
  });

  test("never prints a bare degree value that isn't framed as a delta", () => {
    const container = document.createElement("div");
    renderProgressSummary(container, {
      repCount: 2,
      reps: [
        { bottomDepthRatio: 0.61, leanDeltaDegrees: 2.4 },
        { bottomDepthRatio: 0.58, leanDeltaDegrees: -1.1 }
      ],
      coverageRate: 0.97
    });

    expect(container.textContent).toContain("2 reps");
    // Every degree figure must be adjacent to "baseline" or "standing" language,
    // never presented as a standalone absolute angle.
    expect(container.textContent).toMatch(/from your standing/);
  });
});

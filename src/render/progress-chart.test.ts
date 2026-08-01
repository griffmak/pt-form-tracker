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

/** Same shape as trunkSamplesWithReps, but each rep gets its own depth. */
function trunkSamplesWithVariedDepths(depths: number[], leanDegrees = 2): (TrunkSample | null)[] {
  const still = (n: number) =>
    Array.from({ length: n }, () => ({
      leanDegrees,
      hipY: 0.5,
      trunkLength: 0.3,
      minVisibility: 0.99
    }));
  const descent = (depth: number) =>
    Array.from({ length: 30 }, (_, i) => ({
      leanDegrees,
      hipY: 0.5 + (depth * (i + 1)) / 30,
      trunkLength: 0.3,
      minVisibility: 0.99
    }));
  const out: (TrunkSample | null)[] = [...still(120)];
  for (const depth of depths) {
    const down = descent(depth);
    out.push(...down, ...[...down].reverse(), ...still(30));
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

  test("marks a rep with a degraded bottom window as seen-not-graded, not failed", () => {
    const samples = trunkSamplesWithReps(2);
    // trunkSamplesWithReps(2)'s first rep segments to startIndex 129, bottomIndex
    // 149, endIndex 176 (still(120) then a 30-frame descent from index 120, so the
    // hip-Y maximum lands at index 149 — verify this against detectDepthReps
    // directly if the fixture above ever changes). assessRepConfidence's window is
    // therefore [137, 161] (bottomIndex ± BOTTOM_WINDOW_HALF_FRAMES, 12). Degrading
    // [130, 170] covers that full window with margin — a narrower degradation
    // (e.g. only ±5 frames) leaves most of the 25-frame window at 0.99 and the
    // median stays above threshold, which is a real bug this test must not
    // reproduce: it would assert "seen-not-graded" while actually testing nothing.
    const degraded = samples.map((s, i) => (i >= 130 && i <= 170 && s ? { ...s, minVisibility: 0.1 } : s));

    const summary = summarizeSession(degraded);

    expect(summary.repCount).toBe(2);
    expect(summary.reps.filter((r) => r.graded)).toHaveLength(1);
    expect(summary.reps.filter((r) => !r.graded)).toHaveLength(1);
  });

  test("flags a rep whose depth is far from the set median as unusual", () => {
    // 0.18 matches trunkSamplesWithReps's own depth (see its descent() above) —
    // three ordinary reps. 0.08 is verified (via detectDepthReps) to still cross
    // rep-segmentation.ts's entry threshold, so it segments as a rep rather than
    // vanishing entirely (0.05 does not clear that threshold and is never
    // detected as a rep at all). Its deviation from the set median is (0.267 -
    // 0.6) / 0.6 = -56%, well past the 30% UNUSUAL_REP_FRACTION threshold
    // rep-deviation.ts documents.
    const samples = trunkSamplesWithVariedDepths([0.18, 0.18, 0.18, 0.08]);
    const summary = summarizeSession(samples);

    expect(summary.repCount).toBe(4);
    expect(summary.reps[3].unusual).toBe(true);
    expect(summary.reps[3].deviationFraction).toBeLessThan(-0.5);
    expect(summary.reps[0].unusual).toBe(false);
    expect(summary.reps[0].deviationFraction).toBeCloseTo(0, 1);
  });

  test("reports each rep's frame range for later replay lookup", () => {
    const samples = trunkSamplesWithReps(2);
    const summary = summarizeSession(samples);

    expect(summary.reps).toHaveLength(2);
    for (const rep of summary.reps) {
      expect(rep.endIndex).toBeGreaterThan(rep.startIndex);
    }
    expect(summary.reps[1].startIndex).toBeGreaterThan(summary.reps[0].endIndex);
  });

  test("reports a streak and worst-rep index when a rep is flagged", () => {
    const samples = trunkSamplesWithVariedDepths([0.18, 0.18, 0.18, 0.08]);
    const summary = summarizeSession(samples);

    expect(summary.streak).toBe(3);
    expect(summary.worstRepIndex).toBe(3);
  });

  test("reports a full streak and no worst rep when nothing is flagged", () => {
    const samples = trunkSamplesWithReps(3);
    const summary = summarizeSession(samples);

    expect(summary.streak).toBe(3);
    expect(summary.worstRepIndex).toBeNull();
  });
});

describe("renderProgressSummary", () => {
  test("states that no reps were detected instead of claiming a form score", () => {
    const container = document.createElement("div");
    renderProgressSummary(container, {
      repCount: 0,
      reps: [],
      coverageRate: 0.14,
      streak: 0,
      worstRepIndex: null
    });

    expect(container.textContent).not.toContain("% good form");
    expect(container.textContent!.toLowerCase()).toContain("no ");
    expect(container.textContent).toContain("rep");
  });

  test("never prints a bare degree value that isn't framed as a delta", () => {
    const container = document.createElement("div");
    renderProgressSummary(container, {
      repCount: 2,
      reps: [
        { bottomDepthRatio: 0.61, leanDeltaDegrees: 2.4, graded: true, unusual: false, deviationFraction: 0, startIndex: 0, endIndex: 1 },
        { bottomDepthRatio: 0.58, leanDeltaDegrees: -1.1, graded: true, unusual: false, deviationFraction: 0, startIndex: 2, endIndex: 3 }
      ],
      coverageRate: 0.97,
      streak: 0,
      worstRepIndex: null
    });

    expect(container.textContent).toContain("2 reps");
    // Every degree figure must be adjacent to "baseline" or "standing" language,
    // never presented as a standalone absolute angle.
    expect(container.textContent).toMatch(/from your standing/);
  });

  test("does not present an ungraded rep's numbers as a verdict", () => {
    const container = document.createElement("div");
    renderProgressSummary(container, {
      repCount: 2,
      reps: [
        { bottomDepthRatio: 0.61, leanDeltaDegrees: 2.4, graded: true, unusual: false, deviationFraction: 0, startIndex: 0, endIndex: 1 },
        { bottomDepthRatio: 0.2, leanDeltaDegrees: 9.9, graded: false, unusual: false, deviationFraction: 0, startIndex: 2, endIndex: 3 }
      ],
      coverageRate: 0.8,
      streak: 0,
      worstRepIndex: null
    });

    expect(container.textContent).toContain("1 of 2 reps");
    expect(container.textContent!.toLowerCase()).toContain("couldn't see");
  });

  test("does not claim it couldn't see reps that were all graded", () => {
    const container = document.createElement("div");
    renderProgressSummary(container, {
      repCount: 2,
      reps: [
        { bottomDepthRatio: 0.61, leanDeltaDegrees: 2.4, graded: true, unusual: false, deviationFraction: 0, startIndex: 0, endIndex: 1 },
        { bottomDepthRatio: 0.58, leanDeltaDegrees: -1.1, graded: true, unusual: false, deviationFraction: 0, startIndex: 2, endIndex: 3 }
      ],
      coverageRate: 0.97,
      streak: 0,
      worstRepIndex: null
    });

    expect(container.textContent).toContain("2 reps");
    expect(container.textContent!.toLowerCase()).not.toContain("couldn't see");
  });
});

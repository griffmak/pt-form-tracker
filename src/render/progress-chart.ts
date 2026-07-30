import type { TrunkSample } from "../pose/planar-measures";
import { buildDepthSeries } from "../form-checker/depth-series";
import { detectDepthReps, type DepthRep } from "../form-checker/rep-segmentation";
import { leanDelta } from "../form-checker/calibration";
import { assessRepConfidence } from "../form-checker/rep-confidence";

/** One rep's depth and lean, both already expressed as deltas from the user's own baseline. */
export interface RepSummary {
  /** Hip descent at this rep's deepest point, in units of the user's own trunk length. ~0 = standing. */
  bottomDepthRatio: number;
  /** Trunk-lean change from standing posture at this rep's deepest point, in degrees. */
  leanDeltaDegrees: number;
  /**
   * Whether this rep's bottom window had adequate tracking confidence to support a
   * claim. false means "seen but not graded" — the rep still counts toward
   * repCount, but its numbers must not be presented as a verdict.
   */
  graded: boolean;
}

export interface SessionSummary {
  /** Number of complete reps detected in the session. */
  repCount: number;
  /** One entry per detected rep, in order. Empty when repCount is 0. */
  reps: RepSummary[];
  /**
   * 0-1, fraction of the session with a usable trunk measurement (shoulders and
   * hips in frame and in a plausible position). Low means the camera rarely had a
   * clear enough view to measure — a framing problem, not a form problem.
   */
  coverageRate: number;
}

/**
 * Grades a session entirely from the depth signal (Phase 2-3). The knee-angle path
 * (relocated to tests/knee-rep-baseline.ts in Task 3) is retired from production: it got
 * three of six corpus ground-truth rep counts wrong where this signal gets all six right
 * (corpus-manifest.md), and its "% good form" score was computed from an absolute-degree
 * rule the design forbids presenting as a claim (see the forbidden-claims checklist in
 * the measurement rebuild spec). Every number this function returns is a delta from the
 * user's own standing baseline, never an absolute angle.
 */
export function summarizeSession(trunkSamples: (TrunkSample | null)[]): SessionSummary {
  const measured = trunkSamples.filter((s): s is TrunkSample => s !== null).length;
  const coverageRate = trunkSamples.length === 0 ? 0 : measured / trunkSamples.length;

  const series = buildDepthSeries(trunkSamples);
  if (series === null) {
    return { repCount: 0, reps: [], coverageRate };
  }

  const depthReps = detectDepthReps(series.values);
  const reps: RepSummary[] = depthReps.map((rep) => repSummary(rep, trunkSamples, series.baseline));

  return { repCount: reps.length, reps, coverageRate };
}

function repSummary(
  rep: DepthRep,
  trunkSamples: (TrunkSample | null)[],
  baseline: Parameters<typeof leanDelta>[1]
): RepSummary {
  const bottomSample = trunkSamples[rep.bottomIndex];
  return {
    bottomDepthRatio: rep.bottomDepthRatio,
    leanDeltaDegrees: bottomSample ? leanDelta(bottomSample, baseline) : 0,
    graded: assessRepConfidence(rep, trunkSamples) === "graded"
  };
}

/** Renders honest, baseline-relative session text into a container. */
export function renderProgressSummary(container: HTMLElement, summary: SessionSummary): void {
  const coveragePercent = Math.round(summary.coverageRate * 100);

  if (summary.repCount === 0) {
    container.textContent =
      `No complete reps detected this session. ` +
      `${coveragePercent}% of the session had a clear enough view of your hips and ` +
      `shoulders to measure depth — if that's low, move further back so your whole ` +
      `body is in frame and try again.`;
    return;
  }

  const gradedReps = summary.reps.filter((r) => r.graded);
  const repLabel = summary.repCount === 1 ? "1 rep" : `${summary.repCount} reps`;

  if (gradedReps.length === 0) {
    container.textContent =
      `${repLabel} this session, but tracking wasn't clear enough at any of their ` +
      `bottoms to judge depth or lean — I couldn't see you well enough to grade them. ` +
      `${coveragePercent}% of the session had a clear view overall.`;
    return;
  }

  const avgDepth = average(gradedReps.map((r) => r.bottomDepthRatio));
  const avgLean = average(gradedReps.map((r) => r.leanDeltaDegrees));
  const allGraded = gradedReps.length === summary.repCount;
  const gradedLabel = allGraded ? repLabel : `${gradedReps.length} of ${summary.repCount} reps`;
  // Only claim there's a "rest" the tool couldn't see when there actually is one —
  // per this plan's own measurement, real tracking essentially never degrades
  // enough to trigger seen-not-graded, so allGraded is the overwhelmingly common
  // path, and a summary whose subject is honesty must not default to a false
  // statement on its own most common outcome.
  const ungradedClause = allGraded ? "" : " I couldn't see the rest well enough to judge.";

  container.textContent =
    `${gradedLabel} graded this session.${ungradedClause} ` +
    `Hips dropped an average of ${avgDepth.toFixed(2)}x your standing trunk length at ` +
    `each graded rep's deepest point, with trunk lean averaging ` +
    `${formatSigned(avgLean)}° from your standing posture ` +
    `(${coveragePercent}% of the session had a clear view).`;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function formatSigned(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}

import type { TrunkSample } from "../pose/planar-measures";
import { buildDepthSeries } from "../form-checker/depth-series";
import { detectDepthReps, type DepthRep } from "../form-checker/rep-segmentation";
import { leanDelta } from "../form-checker/calibration";

/** One rep's depth and lean, both already expressed as deltas from the user's own baseline. */
export interface RepSummary {
  /** Hip descent at this rep's deepest point, in units of the user's own trunk length. ~0 = standing. */
  bottomDepthRatio: number;
  /** Trunk-lean change from standing posture at this rep's deepest point, in degrees. */
  leanDeltaDegrees: number;
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
    leanDeltaDegrees: bottomSample ? leanDelta(bottomSample, baseline) : 0
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

  const repLabel = summary.repCount === 1 ? "1 rep" : `${summary.repCount} reps`;
  const avgDepth = average(summary.reps.map((r) => r.bottomDepthRatio));
  const avgLean = average(summary.reps.map((r) => r.leanDeltaDegrees));

  container.textContent =
    `${repLabel} this session. Hips dropped an average of ${avgDepth.toFixed(2)}x your ` +
    `standing trunk length at each rep's deepest point, with trunk lean averaging ` +
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

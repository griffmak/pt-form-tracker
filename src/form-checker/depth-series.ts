import type { TrunkSample } from "../pose/planar-measures";
import {
  assessCalibration,
  depthRatio,
  withinCalibratedScale,
  type Baseline
} from "./calibration";

/**
 * A per-frame hip-depth signal, in units of the user's own trunk length,
 * measured against the standing baseline this run established for itself.
 *
 * `values` is index-aligned with the samples it was built from and is `null` on
 * every frame that must not be graded. Null means "not evaluated" — never zero
 * depth, and never a reason to end an in-progress rep.
 */
export interface DepthSeries {
  values: (number | null)[];
  baseline: Baseline;
  /** Index one past the calibrating window. Everything before it is null. */
  readyAt: number;
}

/**
 * Number of frames `assessCalibration` inspects. Kept in sync with that module's
 * own window; passing exactly this many samples makes the scan O(n * window)
 * instead of O(n^2) over growing slices.
 */
const CALIBRATION_WINDOW_FRAMES = 90;

/**
 * Scans forward for the first window that qualifies as standing still, exactly
 * as a live session's per-frame gate would.
 *
 * Deliberately not "assess the opening window". Phase 2 measured that the
 * opening window is the WORST window in every take in the corpus: MediaPipe's
 * tracker takes ~4.5s to converge, during which trunk length moves 36% on a
 * confirmed-motionless body. Across the corpus this returns a readyAt of
 * 4.6-6.5s in. Returns null if a run never settles, which is a refusal to
 * measure rather than a fallback to a bad baseline.
 */
export function findBaseline(
  samples: (TrunkSample | null)[]
): { baseline: Baseline; readyAt: number } | null {
  for (let end = CALIBRATION_WINDOW_FRAMES; end <= samples.length; end++) {
    const state = assessCalibration(samples.slice(end - CALIBRATION_WINDOW_FRAMES, end));
    if (state.ready && state.baseline !== null) {
      return { baseline: state.baseline, readyAt: end };
    }
  }
  return null;
}

/**
 * Builds the depth signal a session can be segmented from.
 *
 * Three separate reasons a frame is left unevaluated, all of them Phase 2
 * findings rather than tuning: it is before calibration completed; the pose
 * detector produced nothing usable for the trunk (`trunkSample` already returns
 * null when a trunk landmark leaves the image); or the imaged body scale has
 * drifted outside the range in which baseline subtraction still means anything.
 */
export function buildDepthSeries(samples: (TrunkSample | null)[]): DepthSeries | null {
  const found = findBaseline(samples);
  if (found === null) return null;

  const { baseline, readyAt } = found;
  const values = samples.map((sample, index) => {
    if (index < readyAt) return null;
    if (sample === null) return null;
    if (!withinCalibratedScale(sample, baseline)) return null;
    return depthRatio(sample, baseline);
  });

  return { values, baseline, readyAt };
}

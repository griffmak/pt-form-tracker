import type { TrunkSample } from "../pose/planar-measures";
import { withinCalibratedScale, type Baseline } from "./calibration";
import { percentile } from "../pose/percentile";
import type { DepthRep } from "./rep-segmentation";

/**
 * Trailing window for the rolling reference, in frames. 3s at 60fps.
 *
 * Settled in Phase 2 and NOT to be re-litigated here — see corpus-manifest.md,
 * "Drift finding". Measured on corpus-06-drift, where the user stepped toward
 * the camera mid-set and performed identical reps at both distances:
 *
 *   session-global baseline            39.4% inflation
 *   hip-Y p10 @10s, fixed trunk        34.4%
 *   hip-Y p10 + trunk p90 @10s         69.0%   (a 10s window straddles the step)
 *   hip-Y p10 + trunk p90 @5s           9.2%
 *   hip-Y p10 + trunk p90 @3s          -0.5%
 *
 * The window must be short enough not to straddle a change of distance and long
 * enough to contain a standing moment within a rep cycle. 3s satisfies both.
 */
const ROLLING_BASELINE_FRAMES = 180;

/**
 * Percentile direction is easy to invert and inverting it silently produces
 * garbage, so state it: hip Y grows DOWNWARD in image space, so the 10th
 * percentile of hip Y over the window is the HIGHEST hip position — standing.
 * Trunk length is LONGEST when standing upright, so the 90th percentile is the
 * standing body scale.
 */
const HIP_REFERENCE_PERCENTILE = 0.1;
const TRUNK_REFERENCE_PERCENTILE = 0.9;

/** A window with fewer measured frames than this cannot supply a reference. */
const MIN_WINDOW_SAMPLES = ROLLING_BASELINE_FRAMES / 2;

/**
 * How far a rep's depth may sit from the set median before it is reported as
 * unlike the user's other reps, as a fraction of that median.
 *
 * Measured working window 0.175-0.499. Below it: corpus-03-five-normal's reps,
 * all of them good, spread to 17.4% either side of its median and start being
 * flagged. Above it: corpus-05-degrading's least-degraded bad rep sits at -50.0%
 * and stops being flagged. 0.30 sits 1.7x above the widest consistent-set spread
 * and 1.7x below the weakest true positive. Full per-rep numbers are in
 * corpus-manifest.md, "Deviation signal".
 */
const UNUSUAL_REP_FRACTION = 0.3;

/**
 * Depth measured against a short trailing reference rather than the set's
 * opening baseline, so reps can be compared to each other.
 *
 * The session-global baseline is correct for COUNTING reps and wrong for
 * comparing them: on corpus-06-drift it reports reps 3-5 as 39% deeper than
 * reps 1-2 when the movement was the same and only the distance to the camera
 * changed. That is exactly the class of confident wrong number this rebuild
 * exists to eliminate, so any within-set comparison uses this series instead.
 *
 * `baseline` and `readyAt` still come from the session's calibration: the
 * baseline supplies the scale guard's reference, and readyAt marks where the
 * tracker had converged. Neither is used as the depth reference.
 */
export function rollingDepthSeries(
  samples: (TrunkSample | null)[],
  baseline: Baseline,
  readyAt: number
): (number | null)[] {
  const out: (number | null)[] = new Array(samples.length).fill(null);

  for (let i = readyAt; i < samples.length; i++) {
    const sample = samples[i];
    if (sample === null || !withinCalibratedScale(sample, baseline)) continue;

    const hipYs: number[] = [];
    const trunkLengths: number[] = [];
    for (let j = Math.max(0, i - ROLLING_BASELINE_FRAMES + 1); j <= i; j++) {
      const windowSample = samples[j];
      if (windowSample === null || !withinCalibratedScale(windowSample, baseline)) continue;
      hipYs.push(windowSample.hipY);
      trunkLengths.push(windowSample.trunkLength);
    }
    if (hipYs.length < MIN_WINDOW_SAMPLES) continue;

    hipYs.sort((a, b) => a - b);
    trunkLengths.sort((a, b) => a - b);
    const hipReference = percentile(hipYs, HIP_REFERENCE_PERCENTILE)!;
    const trunkReference = percentile(trunkLengths, TRUNK_REFERENCE_PERCENTILE)!;

    out[i] = (sample.hipY - hipReference) / trunkReference;
  }

  return out;
}

/** One rep re-measured against the set it belongs to. */
export interface RepDeviation {
  /** Deepest point of the rep on the rolling series. */
  bottomDepthRatio: number;
  /** Signed fraction: negative is shallower than the set median. */
  deviationFraction: number;
  /**
   * Whether this rep is unlike the user's others in this set. Never a statement
   * about the spine, injury risk, or whether the rep was "wrong" — only that it
   * differs from what this user did in the rest of this set.
   */
  unusual: boolean;
}

/**
 * Re-measures each rep on the rolling series and compares it to the median of
 * the set. Median rather than mean, for the same reason Phase 2's baseline uses
 * one: on a set that degrades, the mean drags toward the bad reps and hides
 * them.
 *
 * A rep with no measured frames on the rolling series is reported at depth 0 and
 * never flagged — "not evaluated" must not become "flagged as unusual".
 */
export function repDeviations(reps: DepthRep[], rolling: (number | null)[]): RepDeviation[] {
  if (reps.length === 0) return [];

  const depths = reps.map((rep) => {
    let deepest: number | null = null;
    for (let i = rep.startIndex; i <= rep.endIndex && i < rolling.length; i++) {
      const value = rolling[i];
      if (value === null) continue;
      if (deepest === null || value > deepest) deepest = value;
    }
    return deepest;
  });

  const measured = depths.filter((d): d is number => d !== null).sort((a, b) => a - b);
  const median = measured.length === 0 ? null : percentile(measured, 0.5)!;

  return depths.map((depth) => {
    if (depth === null || median === null || median === 0) {
      return { bottomDepthRatio: depth ?? 0, deviationFraction: 0, unusual: false };
    }
    const deviationFraction = (depth - median) / median;
    return {
      bottomDepthRatio: depth,
      deviationFraction,
      unusual: Math.abs(deviationFraction) > UNUSUAL_REP_FRACTION
    };
  });
}

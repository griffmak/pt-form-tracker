export interface Rep {
  /** Index into the input series of this rep's deepest point. */
  bottomIndex: number;
  bottomAngleDegrees: number;
}

/**
 * Total movement (in degrees) the signal joint must cover before the session is
 * treated as containing reps at all. Below this the subject was standing,
 * shifting, or bobbing — grading that as a failed rep is what produced the
 * "0% good form" bug.
 *
 * Set from the anatomy rather than picked round: standing is ~170-175deg of knee
 * extension and even a shallow quarter squat reaches ~120deg, so any genuine rep
 * covers 50deg or more. 40 leaves headroom for a partial rep while still
 * rejecting the 21.6deg of wobble seen in the real 2026-07-26 session, where the
 * deep part of every squat was cropped out of frame. Inventing reps from that
 * would trade one misleading metric for another.
 */
const MIN_REP_RANGE_DEGREES = 40;

/**
 * Hysteresis band, as fractions of the observed range below the standing angle.
 * A rep opens only once the joint bends past ENTER and closes only once it comes
 * back up past EXIT. The gap between the two is what stops noise at the bottom of
 * a squat from being read as several separate reps.
 */
const ENTER_FRACTION = 0.6;
const EXIT_FRACTION = 0.3;

/**
 * Calibration percentiles, replacing the raw max/min this function used to
 * take over the whole series.
 *
 * The 2026-07-28 standing-still capture reported 2 reps from 767 frames of
 * a stationary body, because frame 43 read 66.6deg where frame 42 read 141.6.
 * Raw min/max let that one frame define both ends of the scale, and
 * MIN_REP_RANGE_DEGREES could not catch it because the glitch frame is what
 * created the range. Percentiles make the calibration robust to a small
 * number of arbitrarily wrong frames, which is exactly the failure mode
 * MediaPipe produces while its tracker converges.
 */
const CALIBRATION_LOW_PERCENTILE = 0.05;
const CALIBRATION_HIGH_PERCENTILE = 0.95;

/**
 * Linear-interpolated percentile over an ascending-sorted series.
 * Exported so replay tooling and later phases can calibrate the same way.
 */
export function percentile(sortedAscending: number[], p: number): number | null {
  if (sortedAscending.length === 0) return null;
  const position = (sortedAscending.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedAscending[lower];
  return (
    sortedAscending[lower] +
    (sortedAscending[upper] - sortedAscending[lower]) * (position - lower)
  );
}

/**
 * Segments a per-frame joint-angle series into reps and reports each rep's
 * deepest point.
 *
 * Angles follow the interior-joint-angle convention (180deg = fully extended),
 * so a rep's deepest point is its *minimum*. Entries are null for frames where
 * the rule wasn't evaluated (landmark visibility too low); those frames are
 * skipped without interrupting an in-progress rep.
 *
 * Deliberately pure, deterministic geometry — no model, no network. See the
 * design note in the roadmap: sending pose data off-device would falsify the
 * privacy claim the README and the on-screen note both make.
 */
export function detectReps(angles: (number | null)[]): Rep[] {
  const sorted = angles.filter((a): a is number => a !== null).sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const standingAngle = percentile(sorted, CALIBRATION_HIGH_PERCENTILE)!;
  const deepestAngle = percentile(sorted, CALIBRATION_LOW_PERCENTILE)!;

  const range = standingAngle - deepestAngle;
  if (range < MIN_REP_RANGE_DEGREES) return [];

  const enterThreshold = standingAngle - range * ENTER_FRACTION;
  const exitThreshold = standingAngle - range * EXIT_FRACTION;

  const reps: Rep[] = [];
  let inRep = false;
  let bottomIndex = -1;
  let bottomAngle = Infinity;

  for (let i = 0; i < angles.length; i++) {
    const angle = angles[i];
    if (angle === null) continue;

    if (!inRep) {
      if (angle < enterThreshold) {
        inRep = true;
        bottomAngle = angle;
        bottomIndex = i;
      }
      continue;
    }

    if (angle < bottomAngle) {
      bottomAngle = angle;
      bottomIndex = i;
    }

    if (angle > exitThreshold) {
      reps.push({ bottomIndex, bottomAngleDegrees: bottomAngle });
      inRep = false;
      bottomAngle = Infinity;
      bottomIndex = -1;
    }
  }

  // A rep still underway when the session ended still reached a bottom.
  if (inRep) reps.push({ bottomIndex, bottomAngleDegrees: bottomAngle });

  return reps;
}

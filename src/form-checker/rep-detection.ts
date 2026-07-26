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
  let standingAngle = -Infinity;
  let deepestAngle = Infinity;
  for (const angle of angles) {
    if (angle === null) continue;
    if (angle > standingAngle) standingAngle = angle;
    if (angle < deepestAngle) deepestAngle = angle;
  }

  if (standingAngle === -Infinity) return [];

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

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
 * Maximum plausible change in the signal joint between consecutive frames.
 *
 * At 60fps, 10deg/frame is 600deg/s. A controlled rehab squat stays well under
 * 300-500deg/s, so this leaves headroom for a fast rep while still rejecting
 * the ~4500deg/s glitch observed in the 2026-07-28 standing capture.
 *
 * This is deliberately NOT another visibility threshold. MediaPipe's
 * `visibility` predicts non-occlusion, not positional correctness — the glitch
 * frames that fabricated two reps out of a stationary body all had high
 * visibility. Only a kinematic check catches them.
 */
const MAX_DEGREES_PER_FRAME = 10;

/**
 * Longest measurement gap the filter will reason across. Beyond this the body
 * genuinely could have moved anywhere, so the filter re-seeds from the new
 * sample instead of rejecting it. Without this, one long dropout would poison
 * every remaining frame of the session.
 */
const MAX_BRIDGED_GAP_FRAMES = 30;

/**
 * Minimum frames a rep must spend below the entry threshold. ~0.3s at 60fps.
 * Shorter excursions are stumbles, shifts, or tracking wobble. Measured in
 * index span rather than sample count, so unevaluated frames still count as
 * elapsed time — a rep does not become "too short" because the tracker blinked.
 */
const MIN_REP_FRAMES = 18;

/**
 * Replaces physiologically impossible samples with null, leaving the series
 * length and every plausible sample unchanged. Comparison is always against
 * the last *accepted* sample, so a multi-frame glitch burst is rejected in
 * full rather than the filter walking along with it.
 */
export function rejectImplausibleJumps(angles: (number | null)[]): (number | null)[] {
  const out = angles.slice();
  let lastValue: number | null = null;
  let lastIndex = -1;

  for (let i = 0; i < angles.length; i++) {
    const value = angles[i];
    if (value === null) continue;

    const gap = i - lastIndex;
    if (lastValue === null || gap > MAX_BRIDGED_GAP_FRAMES) {
      lastValue = value;
      lastIndex = i;
      continue;
    }

    if (Math.abs(value - lastValue) > gap * MAX_DEGREES_PER_FRAME) {
      out[i] = null;
      continue;
    }

    lastValue = value;
    lastIndex = i;
  }

  return out;
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
  const cleaned = rejectImplausibleJumps(angles);

  const sorted = cleaned.filter((a): a is number => a !== null).sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const standingAngle = percentile(sorted, CALIBRATION_HIGH_PERCENTILE)!;
  const deepestAngle = percentile(sorted, CALIBRATION_LOW_PERCENTILE)!;

  const range = standingAngle - deepestAngle;
  if (range < MIN_REP_RANGE_DEGREES) return [];

  const enterThreshold = standingAngle - range * ENTER_FRACTION;
  const exitThreshold = standingAngle - range * EXIT_FRACTION;

  const reps: Rep[] = [];
  let inRep = false;
  let openIndex = -1;
  let bottomIndex = -1;
  let bottomAngle = Infinity;

  for (let i = 0; i < cleaned.length; i++) {
    const angle = cleaned[i];
    if (angle === null) continue;

    if (!inRep) {
      if (angle < enterThreshold) {
        inRep = true;
        openIndex = i;
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
      if (i - openIndex >= MIN_REP_FRAMES) {
        reps.push({ bottomIndex, bottomAngleDegrees: bottomAngle });
      }
      inRep = false;
      openIndex = -1;
      bottomAngle = Infinity;
      bottomIndex = -1;
    }
  }

  // A rep still underway when the session ended still reached a bottom, as long
  // as it lasted long enough to be a rep at all.
  if (inRep && cleaned.length - 1 - openIndex >= MIN_REP_FRAMES) {
    reps.push({ bottomIndex, bottomAngleDegrees: bottomAngle });
  }

  return reps;
}

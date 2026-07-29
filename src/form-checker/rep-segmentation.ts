import { percentile } from "./rep-detection";

/**
 * Maximum plausible change in depth ratio between consecutive frames.
 *
 * Measured, with headroom: the fastest genuine consecutive-frame change anywhere
 * in the corpus is 0.0625, in corpus-06-drift at frame 1111. At 0.08 the filter
 * rejects 7 frames across all six takes, every one of them inside
 * corpus-04-shallow's frames 1086-1104, where the hips read 0.21-0.33 trunk
 * lengths ABOVE the standing baseline on a subject who was upright.
 *
 * Recorded honestly: this filter is NOT what makes this phase work. With Phase
 * 2's bounds guard and scale guard applied, an infinite budget still reproduces
 * all six ground-truth rep counts. It is also explicitly NOT a substitute for
 * withinCalibratedScale — the capture-protocol tail advances at 0.007-0.010 per
 * frame, slower than genuine reps, so no kinematic budget can separate them.
 * This guards a different failure mode: high-visibility nonsense samples in the
 * middle of an otherwise good take.
 */
const MAX_DEPTH_CHANGE_PER_FRAME = 0.08;

/**
 * Longest measurement gap the filter will reason across. Beyond this the body
 * genuinely could have moved anywhere, so it re-seeds from the new sample
 * instead of rejecting it. Without this, one long dropout poisons the rest of
 * the session. Carried unchanged from Phase 0.
 */
const MAX_BRIDGED_GAP_FRAMES = 30;

/**
 * Replaces physiologically impossible depth samples with null, leaving the
 * series length and every plausible sample unchanged. Comparison is always
 * against the last *accepted* sample, so a multi-frame glitch burst is rejected
 * in full rather than the filter walking along with it.
 */
export function rejectImplausibleDepthJumps(series: (number | null)[]): (number | null)[] {
  const out = series.slice();
  let lastValue: number | null = null;
  let lastIndex = -1;

  for (let i = 0; i < series.length; i++) {
    const value = series[i];
    if (value === null) continue;

    const gap = i - lastIndex;
    if (lastValue === null || gap > MAX_BRIDGED_GAP_FRAMES) {
      lastValue = value;
      lastIndex = i;
      continue;
    }

    if (Math.abs(value - lastValue) > gap * MAX_DEPTH_CHANGE_PER_FRAME) {
      out[i] = null;
      continue;
    }

    lastValue = value;
    lastIndex = i;
  }

  return out;
}

/**
 * Total depth travel the session must cover before it is treated as containing
 * reps at all. Below this the subject was standing, shifting or swaying, and
 * grading that as a failed rep is the bug this rebuild exists to remove.
 *
 * Measured: corpus-01-standing's entire p05-p95 range, over 30s of confirmed
 * stillness, is 0.0151 — this gate is 6.6x above it. The shallowest genuine set,
 * corpus-04-shallow, has a range of 0.3411 — this gate is 3.4x below it. The
 * working window is (0.0151, 0.3411]; at 0.35 all five of that take's real reps
 * disappear.
 */
const MIN_REP_DEPTH_RATIO = 0.1;

/**
 * Hysteresis band, as fractions of the observed range above the standing depth.
 * A rep opens once the hips pass ENTER and closes once they come back up past
 * EXIT. The gap between them is what stops jitter at the bottom of a squat from
 * reading as several reps. Carried unchanged from Phase 0.
 */
const ENTER_FRACTION = 0.6;
const EXIT_FRACTION = 0.3;

/**
 * Absolute ceiling on the enter threshold's distance above standing, in depth
 * ratio. This is the one new mechanism in Phase 3 and it fixes a real, measured
 * failure of the purely relative threshold Phase 0 used.
 *
 * corpus-05-degrading contains eight genuine reps: five at 0.65-0.74 and then
 * three deliberately degraded ones at 0.2367, 0.2938 and 0.3431. A threshold at
 * 0.6 of that session's range sits at 0.412, so all three degraded reps are
 * silently dropped and the take reports 5. A purely relative threshold means the
 * better your first reps are, the more of your worse reps vanish.
 *
 * Taking the LOWER of the two thresholds keeps both behaviours: the relative
 * term binds on shallow sets (session range below ~0.32), keeping the threshold
 * proportional to what the user actually did, and this cap binds on deeper sets
 * so a rep is an excursion past a minimum real depth rather than past 60% of the
 * user's best rep.
 *
 * 0.19 is the exact midpoint of the measured working window 0.155-0.225. Below
 * 0.155 the exit threshold falls with it and two of corpus-04-shallow's reps
 * merge; above 0.225 corpus-05-degrading's shallowest genuine rep (0.2367) is
 * missed.
 */
const MAX_ENTER_OFFSET = 0.19;

/**
 * Calibration percentiles rather than raw max/min. Phase 0 established that one
 * glitch frame must never set the session's scale: the 2026-07-28 standing
 * capture reported 2 reps from a stationary body because a single frame defined
 * both ends of the range.
 */
const CALIBRATION_LOW_PERCENTILE = 0.05;
const CALIBRATION_HIGH_PERCENTILE = 0.95;

/**
 * Minimum index span a rep must hold past the entry threshold. ~0.3s at 60fps.
 * Measured in index span rather than sample count, so unevaluated frames still
 * count as elapsed time — a rep does not become "too short" because the tracker
 * blinked. The shortest genuine rep in the corpus spans 35 frames
 * (corpus-05-degrading, rep 6), so this leaves roughly 2x margin.
 */
const MIN_REP_FRAMES = 18;

/** One segmented rep, indexed into the depth series it was found in. */
export interface DepthRep {
  /** First frame past the entry threshold. */
  startIndex: number;
  /** Frame at which the hips came back up past the exit threshold. */
  endIndex: number;
  /** Frame of greatest depth — the MAXIMUM, on this inverted signal. */
  bottomIndex: number;
  bottomDepthRatio: number;
}

/**
 * Segments a per-frame hip-depth series into reps and reports each rep's
 * deepest point.
 *
 * THE SIGN CONVENTION IS INVERTED FROM rep-detection.ts. Knee angle shrinks as
 * you descend and a rep's bottom is its minimum; depth ratio grows as you
 * descend and a rep's bottom is its maximum. Every comparison below flips
 * accordingly, and getting one of them backwards produces a confident wrong
 * number rather than a crash.
 *
 * Entries are null for frames that were not evaluated — before calibration, no
 * pose, a trunk landmark out of the image, or a body scale too far from the one
 * that calibrated. Those frames are skipped without interrupting an in-progress
 * rep and are never read as a return to standing.
 *
 * Deliberately pure, deterministic geometry: no model, no network. Sending pose
 * data off-device would falsify the privacy claim the README makes.
 */
export function detectDepthReps(series: (number | null)[]): DepthRep[] {
  const cleaned = rejectImplausibleDepthJumps(series);

  const sorted = cleaned.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const standingDepth = percentile(sorted, CALIBRATION_LOW_PERCENTILE)!;
  const deepestDepth = percentile(sorted, CALIBRATION_HIGH_PERCENTILE)!;

  const range = deepestDepth - standingDepth;
  if (range < MIN_REP_DEPTH_RATIO) return [];

  const enterOffset = Math.min(range * ENTER_FRACTION, MAX_ENTER_OFFSET);
  const exitOffset = enterOffset * (EXIT_FRACTION / ENTER_FRACTION);
  const enterThreshold = standingDepth + enterOffset;
  const exitThreshold = standingDepth + exitOffset;

  const reps: DepthRep[] = [];
  let inRep = false;
  let startIndex = -1;
  let bottomIndex = -1;
  let bottomDepth = -Infinity;

  for (let i = 0; i < cleaned.length; i++) {
    const depth = cleaned[i];
    if (depth === null) continue;

    if (!inRep) {
      if (depth > enterThreshold) {
        inRep = true;
        startIndex = i;
        bottomDepth = depth;
        bottomIndex = i;
      }
      continue;
    }

    if (depth > bottomDepth) {
      bottomDepth = depth;
      bottomIndex = i;
    }

    if (depth < exitThreshold) {
      if (i - startIndex >= MIN_REP_FRAMES) {
        reps.push({ startIndex, endIndex: i, bottomIndex, bottomDepthRatio: bottomDepth });
      }
      inRep = false;
      startIndex = -1;
      bottomIndex = -1;
      bottomDepth = -Infinity;
    }
  }

  // A rep still underway when the recording stopped still reached a bottom, as
  // long as it lasted long enough to be a rep at all.
  if (inRep && cleaned.length - 1 - startIndex >= MIN_REP_FRAMES) {
    reps.push({
      startIndex,
      endIndex: cleaned.length - 1,
      bottomIndex,
      bottomDepthRatio: bottomDepth
    });
  }

  return reps;
}

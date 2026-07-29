import type { TrunkSample } from "../pose/planar-measures";

/**
 * The user's own standing reference, established immediately before a set.
 *
 * Baseline subtraction is what makes the planar measures trustworthy: it
 * cancels camera roll, camera tilt, lid angle, individual postural set, and
 * constant foreshortening from being off pure profile. It is also the
 * "unusual for you" model the product committed to. Without one there are no
 * honest numbers, so the tool refuses to record rather than produce dishonest
 * ones.
 */
export interface Baseline {
  hipY: number;
  trunkLength: number;
  leanDegrees: number;
  frameCount: number;
}

export interface CalibrationState {
  ready: boolean;
  baseline: Baseline | null;
  /** User-facing. Says what to change, never an absolute angle. */
  message: string;
}

/**
 * 1.5s at 60fps.
 *
 * Also load-bearing for a reason that is not about settling time: it is longer
 * than the ~1s pause corpus-02-five-slow holds at the bottom of each rep. A
 * window short enough to fit inside that pause could calibrate the baseline to
 * squat depth and silently zero the entire depth signal. Verified against that
 * take — its stable window lands in the standing stretch before rep 1.
 */
const CALIBRATION_WINDOW_FRAMES = 90;

/**
 * Maximum hip-Y standard deviation across the window for it to count as
 * standing still.
 *
 * 3x the worst converged 90-frame window in corpus-01-standing (0.00083).
 * Measured across all 901 overlapping windows of that take's converged region
 * (frames 270-1260); median window was 0.00024. Separation is wide in both
 * directions: the take's own unusable warm-up window reads 5.8x this threshold
 * and a mid-squat window in corpus-02-five-slow reads 22.9x.
 */
const MAX_HIP_Y_STDDEV = 0.0025;

/**
 * Maximum trunk-length standard deviation as a fraction of median trunk length.
 *
 * 3x the worst converged window in corpus-01-standing (0.00739). This is the
 * check that actually rejects MediaPipe's warm-up: over the first ~4.5s of that
 * take the shoulder-to-hip distance falls 0.340 -> 0.218, a 36% change, while
 * the subject is confirmed motionless. A body does not change size, so an
 * unstable trunk length means the tracker has not settled and no measurement
 * taken against it can be trusted.
 */
const MAX_TRUNK_LENGTH_STDDEV_FRACTION = 0.022;

/**
 * Minimum trunk-landmark visibility during calibration. Higher than the 0.5
 * used for per-frame grading: a baseline is measured once and everything else
 * is relative to it, so a bad baseline poisons the whole set. Does not block
 * any take in the corpus — the weakest opening-window trunk visibility observed
 * was 0.712, in corpus-04-shallow.
 */
const MIN_CALIBRATION_VISIBILITY = 0.6;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdDev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

/**
 * Decides whether the trailing window of trunk samples is a usable standing
 * baseline, and produces one if it is.
 *
 * Assesses only the LAST CALIBRATION_WINDOW_FRAMES of whatever buffer it is
 * given, which is what makes it usable as a live gate: it is called every frame
 * with a growing buffer, stays not-ready while the tracker is still converging,
 * and becomes ready the moment it sees a genuinely stable window. Across the
 * corpus that happens 4.6-6.5s into a take.
 *
 * This is deliberately not "calibrate from the opening window." The opening
 * window is the worst window in every take in the corpus.
 */
export function assessCalibration(window: (TrunkSample | null)[]): CalibrationState {
  if (window.length < CALIBRATION_WINDOW_FRAMES) {
    return {
      ready: false,
      baseline: null,
      message: "Hold still — measuring your standing position."
    };
  }

  const recent = window.slice(-CALIBRATION_WINDOW_FRAMES);
  if (recent.some((s) => s === null)) {
    return {
      ready: false,
      baseline: null,
      message: "Step fully into frame, side-on to the camera."
    };
  }

  const samples = recent as TrunkSample[];

  if (samples.some((s) => s.minVisibility < MIN_CALIBRATION_VISIBILITY)) {
    return {
      ready: false,
      baseline: null,
      message:
        "Can't see your shoulders and hips clearly enough. Move so your whole torso is in frame."
    };
  }

  const hipYs = samples.map((s) => s.hipY);
  const trunkLengths = samples.map((s) => s.trunkLength);

  if (stdDev(hipYs) > MAX_HIP_Y_STDDEV) {
    return {
      ready: false,
      baseline: null,
      message: "Still moving — stand up straight and hold still."
    };
  }

  if (stdDev(trunkLengths) / median(trunkLengths) > MAX_TRUNK_LENGTH_STDDEV_FRACTION) {
    return {
      ready: false,
      baseline: null,
      message: "Tracking is still settling — hold still a moment longer."
    };
  }

  // Median rather than mean throughout: one bad frame inside an otherwise
  // stable window must not shift the reference everything else is measured
  // against.
  return {
    ready: true,
    baseline: {
      hipY: median(hipYs),
      trunkLength: median(trunkLengths),
      leanDegrees: median(samples.map((s) => s.leanDegrees)),
      frameCount: CALIBRATION_WINDOW_FRAMES
    },
    message: "Calibrated. Press space to start your set."
  };
}

/**
 * How far the hips have dropped below the standing baseline, in units of the
 * user's own trunk length. ~0 standing, growing positive with descent.
 *
 * Unitless by construction, so it is comparable across sessions and across
 * distances from the camera without ever being an absolute measurement of
 * anything. It is a PROXY for squat depth, not a depth measurement, and not any
 * kind of statement about the spine.
 */
export function depthRatio(sample: TrunkSample, baseline: Baseline): number {
  return (sample.hipY - baseline.hipY) / baseline.trunkLength;
}

/** Change in trunk angle from the user's own standing posture, in degrees. */
export function leanDelta(sample: TrunkSample, baseline: Baseline): number {
  return sample.leanDegrees - baseline.leanDegrees;
}

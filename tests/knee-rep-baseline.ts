/**
 * The knee-angle rep-counting path, retired from production (see
 * corpus-manifest.md: it gets three of six corpus ground-truth rep counts wrong
 * where the depth signal gets all six right) and kept here only as the measured
 * baseline rep-segmentation.corpus.test.ts compares the depth signal against, so
 * that comparison stays measured rather than assumed (HANDOFF.md). Moved
 * verbatim from src/form-checker/rep-detection.ts except for percentile, which
 * now lives in src/pose/percentile.ts and is imported rather than duplicated.
 */
import { percentile } from "../src/pose/percentile";

export interface Rep {
  /** Index into the input series of this rep's deepest point. */
  bottomIndex: number;
  bottomAngleDegrees: number;
}

const MIN_REP_RANGE_DEGREES = 40;
const ENTER_FRACTION = 0.6;
const EXIT_FRACTION = 0.3;
const CALIBRATION_LOW_PERCENTILE = 0.05;
const CALIBRATION_HIGH_PERCENTILE = 0.95;
const MAX_DEGREES_PER_FRAME = 10;
const MAX_BRIDGED_GAP_FRAMES = 30;
const MIN_REP_FRAMES = 18;

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

  if (inRep && cleaned.length - 1 - openIndex >= MIN_REP_FRAMES) {
    reps.push({ bottomIndex, bottomAngleDegrees: bottomAngle });
  }

  return reps;
}

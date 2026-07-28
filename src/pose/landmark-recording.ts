/**
 * Compact on-disk form for raw normalized landmarks, dumped during dev sessions
 * so measurement changes can be replayed against real capture.
 *
 * Only the trunk and leg landmarks are stored, at 4 decimal places. Normalized
 * coordinates sit in roughly [0,1], so 4dp is finer than a pixel on a 2938px
 * capture, while storing all 33 landmarks at full precision would push a
 * 1500-frame take past 10MB and make the corpus impractical to track in git.
 */

export interface NormalizedLandmarkLike {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

/** [x, y, z, visibility] per landmark, in RECORDED_LANDMARK_INDICES order. */
export interface RecordedFrame {
  t: number;
  lm: number[][] | null;
}

/**
 * Shoulders and hips carry the new trunk and depth measures. Knees and ankles
 * are recorded too, not because the design uses them, but so the "does the
 * leg-free design need a leg after all" question can be answered from this
 * corpus instead of another on-camera session.
 */
export const RECORDED_LANDMARK_INDICES = [11, 12, 23, 24, 25, 26, 27, 28];

const DECIMALS = 4;
const SCALE = 10 ** DECIMALS;

function round(value: number): number {
  return Math.round(value * SCALE) / SCALE;
}

export function serializeLandmarks(
  landmarks: NormalizedLandmarkLike[] | undefined,
  t: number
): RecordedFrame {
  if (!landmarks) return { t, lm: null };

  const lm: number[][] = [];
  for (const index of RECORDED_LANDMARK_INDICES) {
    const point = landmarks[index];
    // A truncated result must not kill the recording loop mid-set.
    if (!point) return { t, lm: null };
    lm.push([round(point.x), round(point.y), round(point.z), round(point.visibility)]);
  }
  return { t, lm };
}

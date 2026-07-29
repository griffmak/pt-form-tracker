import { LM_INDEX } from "./landmark-recording";

export interface Point2D {
  x: number;
  y: number;
}

/**
 * One frame's trunk geometry, computed from shoulders and hips only.
 *
 * These four landmarks were chosen from measured tracking reliability, not
 * convenience: across every capture to date, shoulder and hip clear a 0.5
 * visibility threshold on ~99-100% of frames, while the knee managed 59% in one
 * session and the ankle 24% in another. No capture has tracked both legs well.
 *
 * This is a TRUNK measure, not a spine measure. MediaPipe has no landmark
 * between shoulder and hip — no thoracolumbar junction, no sacrum, no L5/S1 —
 * so the shoulder->hip chord spans the whole spine plus the hip joint and is
 * dominated by hip flexion. The lumbar spine can flex fully with this chord
 * unchanged. Nothing computed here may be described as saying anything about
 * the back, the spine, or injury risk.
 */
export interface TrunkSample {
  /**
   * Angle of the shoulder->hip vector from image vertical, aspect-corrected.
   * 0 = vertical in the image. Sign indicates which side the hip sits on,
   * which depends on the direction the user faces — always report a delta from
   * baseline, never this value directly.
   */
  leanDegrees: number;
  /** Hip midpoint y in normalized image coords. Grows DOWNWARD: larger = deeper. */
  hipY: number;
  /** Shoulder->hip distance in aspect-corrected normalized units. The body scale. */
  trunkLength: number;
  /** Weakest visibility among the four trunk landmarks this frame. */
  minVisibility: number;
}

export function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Landmarks used by the trunk measure. Kept as a list so the bounds check and
 * the visibility check walk exactly the landmarks the geometry reads, and no
 * others — a wildly-placed knee must not discard a good trunk measurement.
 */
const TRUNK_LANDMARKS = [
  LM_INDEX.leftShoulder,
  LM_INDEX.rightShoulder,
  LM_INDEX.leftHip,
  LM_INDEX.rightHip
] as const;

/**
 * Normalized image coordinates are defined on [0,1] by construction; anything
 * outside it is the tracker reporting a position that does not exist.
 *
 * This is not redundant with a visibility threshold, and no visibility
 * threshold can replace it. The Phase 1 corpus recorded hip-Y at 1.177
 * (corpus-04-shallow) and 1.488 (corpus-06-drift) while the hip landmark
 * reported visibility >= 0.5 at that same instant — MediaPipe was confident in
 * a physically impossible position. `visibility` predicts non-occlusion, not
 * positional correctness, which is the same reason Phase 0 needed a kinematic
 * guard on knee angle rather than a stricter confidence cutoff.
 */
function withinImage(point: number[]): boolean {
  return point[0] >= 0 && point[0] <= 1 && point[1] >= 0 && point[1] <= 1;
}

/**
 * Trunk geometry for one frame, or null if the frame's trunk landmarks are not
 * physically possible.
 *
 * null means "not evaluated this frame" — the same convention the knee-angle
 * series already uses. Callers skip these frames; they must never be read as
 * zero, and must never end an in-progress rep.
 */
export function trunkSample(lm: number[][], aspectRatio: number): TrunkSample | null {
  for (const index of TRUNK_LANDMARKS) {
    if (!withinImage(lm[index])) return null;
  }

  const point = (i: number): Point2D => ({ x: lm[i][0], y: lm[i][1] });

  const shoulder = midpoint(point(LM_INDEX.leftShoulder), point(LM_INDEX.rightShoulder));
  const hip = midpoint(point(LM_INDEX.leftHip), point(LM_INDEX.rightHip));

  // Normalized x and y are normalized by width and height SEPARATELY, so a dx
  // of 0.1 spans aspectRatio times as much real distance as a dy of 0.1.
  // Without this correction lean is overstated — 1.33x on the corpus's 640x480
  // feed, 1.78x on a 16:9 one. It produces entirely reasonable-looking numbers,
  // which is what makes it the most dangerous omission in this module.
  const dx = (hip.x - shoulder.x) * aspectRatio;
  const dy = hip.y - shoulder.y;

  return {
    leanDegrees: (Math.atan2(dx, dy) * 180) / Math.PI,
    hipY: hip.y,
    trunkLength: Math.sqrt(dx * dx + dy * dy),
    minVisibility: Math.min(...TRUNK_LANDMARKS.map((i) => lm[i][3]))
  };
}

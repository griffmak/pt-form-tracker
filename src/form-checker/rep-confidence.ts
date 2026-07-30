import type { DepthRep } from "./rep-segmentation";
import type { TrunkSample } from "../pose/planar-measures";
import { percentile } from "../pose/percentile";
import { VISIBILITY_THRESHOLD } from "./form-checker";

/**
 * Frames on each side of a rep's bottom the confidence check assesses. 12 (a
 * 25-frame window) is the largest half-window that fits inside every rep in the
 * corpus without reaching a neighbouring rep's frames: the tightest bottom-to-
 * boundary distance measured across all 18 reps in corpus-02/03/05 is 14 frames
 * (corpus-05-degrading, rep bottomIndex 1059, startIndex 1045). See this plan's
 * "What was measured before writing this plan" section.
 *
 * Exported so rep-confidence.corpus.test.ts's synthetic degradation window can't
 * silently drift out of sync with the value actually used here.
 */
export const BOTTOM_WINDOW_HALF_FRAMES = 12;

/**
 * Minimum median trunk-landmark visibility across a rep's bottom window for the
 * rep to earn a verdict.
 *
 * NOT corpus-derived on the reject side: across all 18 reps in corpus-02, -03 and
 * -05, the lowest median visibility found in any bottom window is 0.9979, and the
 * lowest single-frame visibility anywhere inside any rep's full span is also
 * 0.9979 — this corpus contains no example of a genuinely low-confidence rep,
 * consistent with Phase 2's finding that shoulder and hip track near-perfectly
 * everywhere. Set to VISIBILITY_THRESHOLD (form-checker.ts) rather than inventing
 * a new number for a threshold the corpus cannot validate on the reject side.
 * Covered by a synthetic test only (rep-confidence.test.ts), the same honesty
 * precedent as Phase 3's MAX_ENTER_OFFSET relative term.
 */
const MIN_REP_MEDIAN_VISIBILITY = VISIBILITY_THRESHOLD;

export type RepConfidenceVerdict = "graded" | "seen-not-graded";

/**
 * Decides whether a depth-segmented rep's tracking was good enough at its bottom
 * to earn a verdict, or whether it should count toward the rep total while
 * withholding any claim about its form.
 *
 * seen-not-graded is a first-class outcome, not a failure — it preserves the rep
 * count and the streak (Phase 5b) while admitting the tool could not see well
 * enough to judge that particular rep. Frame-level dropout must never end a rep
 * (enforced upstream, in detectDepthReps) and must never silently become "zero
 * confidence" here: null samples inside the window are excluded from the median,
 * not counted as zero visibility.
 */
export function assessRepConfidence(
  rep: DepthRep,
  trunkSamples: (TrunkSample | null)[]
): RepConfidenceVerdict {
  const lo = Math.max(rep.startIndex, rep.bottomIndex - BOTTOM_WINDOW_HALF_FRAMES);
  const hi = Math.min(rep.endIndex, rep.bottomIndex + BOTTOM_WINDOW_HALF_FRAMES);

  const visibilities: number[] = [];
  for (let i = lo; i <= hi; i++) {
    const sample = trunkSamples[i];
    if (sample === null || sample === undefined) continue;
    visibilities.push(sample.minVisibility);
  }

  if (visibilities.length === 0) return "seen-not-graded";

  visibilities.sort((a, b) => a - b);
  const medianVisibility = percentile(visibilities, 0.5)!;

  return medianVisibility >= MIN_REP_MEDIAN_VISIBILITY ? "graded" : "seen-not-graded";
}

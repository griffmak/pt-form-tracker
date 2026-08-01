/**
 * Index of the rep with the largest deviation magnitude from the set median,
 * among reps flagged `unusual` — null if none are flagged, so a clean set
 * never has a "worst" rep to highlight.
 */
export function worstRepIndex(reps: { unusual: boolean; deviationFraction: number }[]): number | null {
  let worst: number | null = null;
  let worstMagnitude = -Infinity;

  reps.forEach((rep, i) => {
    if (!rep.unusual) return;
    const magnitude = Math.abs(rep.deviationFraction);
    if (magnitude > worstMagnitude) {
      worstMagnitude = magnitude;
      worst = i;
    }
  });

  return worst;
}

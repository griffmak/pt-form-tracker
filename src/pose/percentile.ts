/**
 * Linear-interpolated percentile over an ascending-sorted series.
 *
 * Moved here from rep-detection.ts (deleted with the knee-angle rep path) because
 * rep-segmentation.ts and rep-deviation.ts both depend on it and neither is
 * knee-specific — this is a general statistics helper, not exercise geometry.
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

/**
 * Trailing median filter over a 2D point, one instance per landmark.
 *
 * Smooths the INPUT position before angle/depth computation, not the output
 * measurement — a single-frame position glitch (MediaPipe reporting a physically
 * impossible position with high visibility, corpus-manifest.md's "hip visibility
 * >= 0.5 is not sufficient to trust position") should not reach trunkSample at all,
 * rather than being caught after the fact by the bounds/scale/jump guards downstream.
 * Median rather than mean for the same reason every other calibration in this
 * codebase uses median: one bad frame inside the window must not shift the result
 * toward it.
 */
export class PositionSmoother {
  private xs: number[] = [];
  private ys: number[] = [];

  constructor(private readonly windowSize: number) {}

  /** Pushes one new sample and returns the current trailing median. */
  push(point: [number, number]): [number, number] {
    this.xs.push(point[0]);
    this.ys.push(point[1]);
    if (this.xs.length > this.windowSize) {
      this.xs.shift();
      this.ys.shift();
    }
    return [median(this.xs), median(this.ys)];
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

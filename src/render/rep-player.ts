/**
 * Slices a frame-index-aligned history (see main.ts's worldLandmarksHistory,
 * which stores null for frames with no detected pose at every index a
 * trunkSample also exists for) to one rep's range, dropping the nulls — the
 * replay only ever needs frames it can actually draw.
 */
export function framesForRep<T>(history: (T | null)[], rep: { startIndex: number; endIndex: number }): T[] {
  const frames: T[] = [];
  for (let i = rep.startIndex; i <= rep.endIndex && i < history.length; i++) {
    const frame = history[i];
    if (frame !== null) frames.push(frame);
  }
  return frames;
}

/**
 * One step of a frame-index cursor. `done` is true once index has passed the
 * last playable frame — the caller stops advancing (e.g. clears its
 * setInterval) rather than reading out of bounds.
 */
export function nextPlaybackFrame(index: number, frameCount: number): { index: number; done: boolean } {
  if (index >= frameCount) return { index, done: true };
  const next = index + 1;
  return { index: next, done: next >= frameCount };
}

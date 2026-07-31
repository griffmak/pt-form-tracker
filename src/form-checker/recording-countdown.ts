/**
 * The 5-second delay between pressing space and recording actually starting.
 *
 * Recording used to begin the instant space was pressed, but reaching a
 * laptop's own spacebar means standing close to it — which is never "ready"
 * framing (full body in frame, several feet back). So space arms a countdown
 * regardless of current framing, and the countdown itself ignores framing
 * while it ticks. Once the 5s elapses, it waits (extends indefinitely) until
 * framing/calibration is `ready`, then starts recording — giving the user
 * time to walk back into position after pressing the key.
 */
export const COUNTDOWN_DURATION_MS = 5000;

/**
 * Decides whether a space press arms a countdown.
 *
 * A no-op (returns `startedAt` unchanged) if already recording or already
 * counting down/waiting — space never restarts or extends an in-progress
 * countdown. Not gated on framing/calibration readiness: the user is
 * expected to not be in frame yet when they press it.
 */
export function handleSpacePress(startedAt: number | null, recording: boolean, now: number): number | null {
  if (recording || startedAt !== null) return startedAt;
  return now;
}

export interface CountdownTick {
  /** New countdown start time: unchanged, cleared, or (never) set by a tick. */
  startedAt: number | null;
  /** True exactly once, the tick recording actually starts. */
  startRecording: boolean;
  /** True once the 5s timer has elapsed and it's only waiting on `ready`. */
  waitingForReady: boolean;
}

/**
 * Advances the countdown by one render-loop frame.
 *
 * Called every frame regardless of whether a countdown is active. Framing
 * readiness is ignored until the 5s duration elapses; from then on it waits
 * (extends) until `ready` is true before signaling `startRecording`. It never
 * cancels on its own — only a completed recording start clears `startedAt`.
 */
export function tickCountdown(
  startedAt: number | null,
  ready: boolean,
  now: number,
  durationMs: number = COUNTDOWN_DURATION_MS
): CountdownTick {
  if (startedAt === null) return { startedAt: null, startRecording: false, waitingForReady: false };
  const elapsed = now - startedAt >= durationMs;
  if (!elapsed) return { startedAt, startRecording: false, waitingForReady: false };
  if (!ready) return { startedAt, startRecording: false, waitingForReady: true };
  return { startedAt: null, startRecording: true, waitingForReady: false };
}

/** Whole seconds left to show the user, floored at 0 once the duration has elapsed. */
export function secondsRemaining(
  startedAt: number,
  now: number,
  durationMs: number = COUNTDOWN_DURATION_MS
): number {
  return Math.max(0, Math.ceil((durationMs - (now - startedAt)) / 1000));
}

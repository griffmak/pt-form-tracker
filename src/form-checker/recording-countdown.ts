/**
 * The 5-second delay between pressing space and recording actually starting.
 *
 * Recording used to begin the instant space was pressed, but reaching a
 * laptop's own spacebar pulls the user toward the screen and out of frame —
 * every take started on a frame where they were still mid-step back into
 * position. This gives them time to step back after pressing space, while
 * still refusing to record on a not-ready frame: if framing/calibration drops
 * out of `ready` at any point during the countdown, it cancels outright and
 * the user must press space again once `ready` returns.
 */
export const COUNTDOWN_DURATION_MS = 5000;

/**
 * Decides whether a space press starts a countdown.
 *
 * A no-op (returns `startedAt` unchanged) if already recording, already
 * counting down, or framing/calibration isn't `ready` yet — space never
 * restarts or extends an in-progress countdown.
 */
export function handleSpacePress(
  startedAt: number | null,
  recording: boolean,
  ready: boolean,
  now: number
): number | null {
  if (recording || startedAt !== null || !ready) return startedAt;
  return now;
}

export interface CountdownTick {
  /** New countdown start time: unchanged, cleared, or (never) set by a tick. */
  startedAt: number | null;
  /** True exactly once, the tick the countdown completes with framing still ready. */
  startRecording: boolean;
}

/**
 * Advances the countdown by one render-loop frame.
 *
 * Called every frame regardless of whether a countdown is active. If `ready`
 * drops at any point during a countdown, this cancels it entirely (returns
 * `startedAt: null`) rather than pausing or resuming it — the user must press
 * space again once framing is ready again, per the approved fix.
 */
export function tickCountdown(
  startedAt: number | null,
  ready: boolean,
  now: number,
  durationMs: number = COUNTDOWN_DURATION_MS
): CountdownTick {
  if (startedAt === null) return { startedAt: null, startRecording: false };
  if (!ready) return { startedAt: null, startRecording: false };
  if (now - startedAt >= durationMs) return { startedAt: null, startRecording: true };
  return { startedAt, startRecording: false };
}

/** Whole seconds left to show the user, floored at 1 so it never reads "0". */
export function secondsRemaining(
  startedAt: number,
  now: number,
  durationMs: number = COUNTDOWN_DURATION_MS
): number {
  return Math.max(1, Math.ceil((durationMs - (now - startedAt)) / 1000));
}

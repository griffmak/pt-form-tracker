import { describe, test, expect } from "vitest";
import { handleSpacePress, tickCountdown, secondsRemaining, COUNTDOWN_DURATION_MS } from "./recording-countdown";

describe("handleSpacePress", () => {
  test("starts a countdown when ready and idle", () => {
    expect(handleSpacePress(null, false, true, 1000)).toBe(1000);
  });

  test("is a no-op while already recording", () => {
    expect(handleSpacePress(null, true, true, 1000)).toBeNull();
  });

  test("is a no-op while framing/calibration isn't ready", () => {
    expect(handleSpacePress(null, false, false, 1000)).toBeNull();
  });

  test("does not restart or extend an in-progress countdown", () => {
    expect(handleSpacePress(500, false, true, 1000)).toBe(500);
  });
});

describe("tickCountdown", () => {
  test("does nothing when no countdown is active", () => {
    expect(tickCountdown(null, true, 1000)).toEqual({ startedAt: null, startRecording: false });
  });

  test("keeps counting down while ready and time remains", () => {
    const result = tickCountdown(0, true, 2000);
    expect(result).toEqual({ startedAt: 0, startRecording: false });
  });

  test("signals startRecording once the duration elapses while still ready", () => {
    const result = tickCountdown(0, true, COUNTDOWN_DURATION_MS);
    expect(result).toEqual({ startedAt: null, startRecording: true });
  });

  test("signals startRecording past the exact duration too", () => {
    const result = tickCountdown(0, true, COUNTDOWN_DURATION_MS + 250);
    expect(result).toEqual({ startedAt: null, startRecording: true });
  });

  test("cancels outright, not pauses, if readiness drops mid-countdown", () => {
    const result = tickCountdown(0, false, 2000);
    expect(result).toEqual({ startedAt: null, startRecording: false });
  });

  test("cancels even on the very last frame if readiness drops right before completion", () => {
    const result = tickCountdown(0, false, COUNTDOWN_DURATION_MS);
    expect(result).toEqual({ startedAt: null, startRecording: false });
  });
});

describe("secondsRemaining", () => {
  test("reports the full duration at the start", () => {
    expect(secondsRemaining(0, 0)).toBe(5);
  });

  test("counts down as time passes", () => {
    expect(secondsRemaining(0, 2500)).toBe(3);
  });

  test("never reports below 1, even right at completion", () => {
    expect(secondsRemaining(0, COUNTDOWN_DURATION_MS)).toBe(1);
  });
});

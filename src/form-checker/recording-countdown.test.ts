import { describe, test, expect } from "vitest";
import { handleSpacePress, tickCountdown, secondsRemaining, COUNTDOWN_DURATION_MS } from "./recording-countdown";

describe("handleSpacePress", () => {
  test("starts a countdown while idle, regardless of framing readiness", () => {
    expect(handleSpacePress(null, false, 1000)).toBe(1000);
  });

  test("is a no-op while already recording", () => {
    expect(handleSpacePress(null, true, 1000)).toBeNull();
  });

  test("does not restart or extend an in-progress countdown", () => {
    expect(handleSpacePress(500, false, 1000)).toBe(500);
  });
});

describe("tickCountdown", () => {
  test("does nothing when no countdown is active", () => {
    expect(tickCountdown(null, true, 1000)).toEqual({ startedAt: null, startRecording: false, waitingForReady: false });
  });

  test("keeps counting down regardless of readiness while time remains", () => {
    expect(tickCountdown(0, false, 2000)).toEqual({ startedAt: 0, startRecording: false, waitingForReady: false });
    expect(tickCountdown(0, true, 2000)).toEqual({ startedAt: 0, startRecording: false, waitingForReady: false });
  });

  test("signals startRecording once the duration elapses while ready", () => {
    expect(tickCountdown(0, true, COUNTDOWN_DURATION_MS)).toEqual({
      startedAt: null,
      startRecording: true,
      waitingForReady: false
    });
  });

  test("signals startRecording past the exact duration too, once ready", () => {
    expect(tickCountdown(0, true, COUNTDOWN_DURATION_MS + 250)).toEqual({
      startedAt: null,
      startRecording: true,
      waitingForReady: false
    });
  });

  test("extends (waits for ready) once the duration elapses but framing isn't ready yet", () => {
    expect(tickCountdown(0, false, COUNTDOWN_DURATION_MS)).toEqual({
      startedAt: 0,
      startRecording: false,
      waitingForReady: true
    });
  });

  test("starts recording as soon as ready becomes true after an extension", () => {
    const waiting = tickCountdown(0, false, COUNTDOWN_DURATION_MS + 3000);
    expect(waiting.waitingForReady).toBe(true);
    const nextFrame = tickCountdown(waiting.startedAt, true, COUNTDOWN_DURATION_MS + 3100);
    expect(nextFrame).toEqual({ startedAt: null, startRecording: true, waitingForReady: false });
  });
});

describe("secondsRemaining", () => {
  test("reports the full duration at the start", () => {
    expect(secondsRemaining(0, 0)).toBe(5);
  });

  test("counts down as time passes", () => {
    expect(secondsRemaining(0, 2500)).toBe(3);
  });

  test("reaches 0 once the duration has fully elapsed", () => {
    expect(secondsRemaining(0, COUNTDOWN_DURATION_MS)).toBe(0);
  });

  test("stays at 0, not negative, well past the duration", () => {
    expect(secondsRemaining(0, COUNTDOWN_DURATION_MS + 5000)).toBe(0);
  });
});

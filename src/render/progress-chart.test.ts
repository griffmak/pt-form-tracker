import { describe, test, expect } from "vitest";
import { summarizeSession, renderProgressSummary } from "./progress-chart";
import { squat } from "../exercise-library/squat";
import type { SessionFrameRecord } from "../storage/session-store";
import type { RuleResult } from "../form-checker/form-checker";

const KNEE = "Knee bend depth";

function ruleResult(name: string, angle: number | null): RuleResult {
  const rule = squat.rules.find((r) => r.name === name)!;
  if (angle === null) {
    return { ruleName: name, evaluated: false, passed: false, angleDegrees: null };
  }
  return {
    ruleName: name,
    evaluated: true,
    passed: angle >= rule.defaultMinDegrees && angle <= rule.defaultMaxDegrees,
    angleDegrees: angle
  };
}

// Squat carried a second "Torso lean" rule until 2026-07-28, when it was
// removed for computing an interior hip angle while documenting a band in
// degrees from vertical. These fixtures therefore describe one rule per frame,
// and the pass rates below are out of one check per rep rather than two.
function frame(knee: number | null): SessionFrameRecord {
  return {
    sessionId: "s1",
    timestamp: 0,
    ruleResults: [ruleResult(KNEE, knee)]
  };
}

const STANDING_KNEE = 170;

/** Half a rep, in frames. 40 frames at 60fps is ~0.67s — a controlled descent. */
const REP_HALF_FRAMES = 40;

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Stand -> descend -> bottom -> ascend -> stand, at a given bottom depth.
 * Movement frames are interpolated from the bottom so a shallow rep's descent
 * never dips deeper than the rep's own bottom.
 *
 * Frame counts are 60fps-realistic on purpose. This fixture used to describe a
 * rep in five frames — 40deg of knee travel per frame, or 2400deg/s — which no
 * joint does, and which rep detection's plausibility filter correctly rejects.
 * The fixture was wrong, not the guard.
 */
function repFrames(bottomKnee: number): SessionFrameRecord[] {
  const frames: SessionFrameRecord[] = [];
  for (let i = 0; i < REP_HALF_FRAMES; i++) {
    const t = i / (REP_HALF_FRAMES - 1);
    frames.push(frame(lerp(STANDING_KNEE, bottomKnee, t)));
  }
  for (let i = 1; i < REP_HALF_FRAMES; i++) {
    const t = i / (REP_HALF_FRAMES - 1);
    frames.push(frame(lerp(bottomKnee, STANDING_KNEE, t)));
  }
  return frames;
}

describe("summarizeSession", () => {
  test("reports no reps and no pass rate for an empty session", () => {
    const summary = summarizeSession([], squat);

    expect(summary.repCount).toBe(0);
    expect(summary.passRate).toBeNull();
  });

  test("does not report a form score for a session with no reps", () => {
    // The bug this fixes: standing frames were graded against "are you at the
    // bottom of a squat right now", so a session with no reps scored 0% good
    // form rather than reporting that nothing was measured.
    const standingOnly = new Array(40).fill(null).map(() => frame(172));

    const summary = summarizeSession(standingOnly, squat);

    expect(summary.repCount).toBe(0);
    expect(summary.passRate).toBeNull();
  });

  test("scores a good rep at its deepest point, not every frame", () => {
    // Every non-bottom frame is out of range; only the bottom is in range.
    const summary = summarizeSession(repFrames(90), squat);

    expect(summary.repCount).toBe(1);
    expect(summary.passRate).toBe(1);
  });

  test("scores a rep that bottoms out short of the target range as failing", () => {
    // Knee only reaches 115deg — above the 70-100 target, a quarter squat.
    const summary = summarizeSession(repFrames(115), squat);

    expect(summary.repCount).toBe(1);
    expect(summary.passRate).toBe(0);
  });

  test("averages form across several reps", () => {
    const summary = summarizeSession(
      [...repFrames(90), ...repFrames(90), ...repFrames(115)],
      squat
    );

    expect(summary.repCount).toBe(3);
    // 3 reps x 1 rule = 3 checks; only the third rep's knee fails.
    expect(summary.passRate).toBeCloseTo(2 / 3);
  });

  test("reports whole-session visibility coverage, not just coverage at rep bottoms", () => {
    // Half the frames had no usable landmarks at all.
    const rep = repFrames(90);
    const frames = [...rep, ...rep.map(() => frame(null))];

    const summary = summarizeSession(frames, squat);

    expect(summary.coverageRate).toBeCloseTo(0.5);
  });
});

describe("renderProgressSummary", () => {
  test("states that no reps were detected instead of claiming 0% good form", () => {
    const container = document.createElement("div");

    renderProgressSummary(container, { repCount: 0, passRate: null, coverageRate: 0.14 });

    expect(container.textContent).not.toContain("0% good form");
    expect(container.textContent!.toLowerCase()).toContain("no ");
    expect(container.textContent).toContain("rep");
  });

  test("reports rep count and form score when reps were detected", () => {
    const container = document.createElement("div");

    renderProgressSummary(container, { repCount: 3, passRate: 5 / 6, coverageRate: 0.9 });

    expect(container.textContent).toContain("3 reps");
    expect(container.textContent).toContain("83%");
  });
});

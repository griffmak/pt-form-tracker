import { describe, test, expect } from "vitest";
import { summarizeSession, renderProgressSummary } from "./progress-chart";
import { squat } from "../exercise-library/squat";
import type { SessionFrameRecord } from "../storage/session-store";
import type { RuleResult } from "../form-checker/form-checker";

const KNEE = "Knee bend depth";
const TORSO = "Torso lean";

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

function frame(knee: number | null, torso: number | null): SessionFrameRecord {
  return {
    sessionId: "s1",
    timestamp: 0,
    ruleResults: [ruleResult(KNEE, knee), ruleResult(TORSO, torso)]
  };
}

const STANDING_KNEE = 170;
const STANDING_TORSO = 175;

/**
 * Stand -> descend -> bottom -> ascend -> stand, at a given bottom depth.
 * Mid-movement frames are interpolated from the bottom so a shallow rep's
 * descent never dips deeper than the rep's own bottom.
 */
function repFrames(bottomKnee: number, bottomTorso: number): SessionFrameRecord[] {
  const midKnee = (STANDING_KNEE + bottomKnee) / 2;
  const midTorso = (STANDING_TORSO + bottomTorso) / 2;
  return [
    frame(STANDING_KNEE, STANDING_TORSO),
    frame(midKnee, midTorso),
    frame(bottomKnee, bottomTorso),
    frame(midKnee, midTorso),
    frame(STANDING_KNEE, STANDING_TORSO)
  ];
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
    const standingOnly = new Array(40).fill(null).map(() => frame(172, 175));

    const summary = summarizeSession(standingOnly, squat);

    expect(summary.repCount).toBe(0);
    expect(summary.passRate).toBeNull();
  });

  test("scores a good rep at its deepest point, not every frame", () => {
    // Every non-bottom frame is out of range; only the bottom is in range.
    const summary = summarizeSession(repFrames(90, 60), squat);

    expect(summary.repCount).toBe(1);
    expect(summary.passRate).toBe(1);
  });

  test("scores a rep that bottoms out short of the target range as failing", () => {
    // Knee only reaches 115deg — above the 70-100 target, a quarter squat.
    const summary = summarizeSession(repFrames(115, 60), squat);

    expect(summary.repCount).toBe(1);
    expect(summary.passRate).toBe(0.5); // torso passes, knee doesn't
  });

  test("averages form across several reps", () => {
    const summary = summarizeSession(
      [...repFrames(90, 60), ...repFrames(90, 60), ...repFrames(115, 60)],
      squat
    );

    expect(summary.repCount).toBe(3);
    // 3 reps x 2 rules = 6 checks; only the third rep's knee fails.
    expect(summary.passRate).toBeCloseTo(5 / 6);
  });

  test("reports whole-session visibility coverage, not just coverage at rep bottoms", () => {
    // Half the frames had no usable landmarks at all.
    const frames = [...repFrames(90, 60), ...new Array(5).fill(null).map(() => frame(null, null))];

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

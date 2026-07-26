import type { SessionFrameRecord } from "../storage/session-store";
import { summarizeCoverage, type FrameResult } from "../form-checker/form-checker";
import { detectReps } from "../form-checker/rep-detection";
import type { ExerciseDefinition } from "../exercise-library/types";

export interface SessionSummary {
  /** Number of complete reps detected in the session. */
  repCount: number;
  /**
   * 0-1, among rules evaluated at rep bottoms only. Null when no reps were
   * detected — there is no form score to report, which is distinct from a
   * score of zero.
   */
  passRate: number | null;
  /**
   * 0-1, rule-checks evaluated / attempted across the whole session. A low
   * value means landmarks were rarely visible enough to measure — a framing
   * problem, not a form problem.
   */
  coverageRate: number;
}

/**
 * Grades a session at each rep's deepest point rather than on every frame.
 *
 * Per-frame grading asks "are you at the bottom of a squat right now" of every
 * frame in the session, so standing, descending and ascending all count as
 * failures and a set of clean reps still scores near zero. Reps are segmented
 * from the exercise's rep-signal joint and only those bottom frames are graded.
 */
export function summarizeSession(
  frames: SessionFrameRecord[],
  exercise: ExerciseDefinition
): SessionSummary {
  const frameResults: FrameResult[] = frames.map((f) => ({ ruleResults: f.ruleResults }));
  const { evaluatedCount, totalCount } = summarizeCoverage(frameResults);
  const coverageRate = totalCount === 0 ? 0 : evaluatedCount / totalCount;

  const signalAngles = frames.map((f) => {
    const signal = f.ruleResults.find((r) => r.ruleName === exercise.repSignalRuleName);
    return signal?.evaluated ? signal.angleDegrees : null;
  });

  const reps = detectReps(signalAngles);
  if (reps.length === 0) {
    return { repCount: 0, passRate: null, coverageRate };
  }

  let passedAtBottoms = 0;
  let evaluatedAtBottoms = 0;
  for (const rep of reps) {
    for (const rule of frames[rep.bottomIndex].ruleResults) {
      if (!rule.evaluated) continue;
      evaluatedAtBottoms += 1;
      if (rule.passed) passedAtBottoms += 1;
    }
  }

  return {
    repCount: reps.length,
    passRate: evaluatedAtBottoms === 0 ? null : passedAtBottoms / evaluatedAtBottoms,
    coverageRate
  };
}

/** Renders "3 reps - 83% good form" style text into a container. */
export function renderProgressSummary(container: HTMLElement, summary: SessionSummary): void {
  const coveragePercent = Math.round(summary.coverageRate * 100);

  if (summary.repCount === 0 || summary.passRate === null) {
    container.textContent =
      `No complete reps detected, so there's no form score for this session. ` +
      `${coveragePercent}% of form checks had a clear enough view of your body — ` +
      `if that's low, move further back so your whole body is in frame and try again.`;
    return;
  }

  const passPercent = Math.round(summary.passRate * 100);
  const repLabel = summary.repCount === 1 ? "1 rep" : `${summary.repCount} reps`;
  container.textContent =
    `${repLabel} — ${passPercent}% good form at the bottom of each rep ` +
    `(${coveragePercent}% of form checks had a clear view this session).`;
}

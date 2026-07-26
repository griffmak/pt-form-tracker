import type { SessionFrameRecord } from "../storage/session-store";
import { summarizeCoverage, type FrameResult } from "../form-checker/form-checker";

export interface SessionSummary {
  passRate: number; // 0-1, among evaluated rules only
  coverageRate: number; // 0-1, evaluated / total rule-checks
}

export function summarizeSession(frames: SessionFrameRecord[]): SessionSummary {
  const frameResults: FrameResult[] = frames.map((f) => ({ ruleResults: f.ruleResults }));
  const { evaluatedCount, totalCount } = summarizeCoverage(frameResults);

  const passedCount = frameResults
    .flatMap((f) => f.ruleResults)
    .filter((r) => r.evaluated && r.passed).length;

  return {
    passRate: evaluatedCount === 0 ? 0 : passedCount / evaluatedCount,
    coverageRate: totalCount === 0 ? 0 : evaluatedCount / totalCount
  };
}

/** Renders "82% good form, 3 of 3 rules evaluated" style text into a container. */
export function renderProgressSummary(container: HTMLElement, summary: SessionSummary): void {
  const passPercent = Math.round(summary.passRate * 100);
  const coveragePercent = Math.round(summary.coverageRate * 100);
  container.textContent = `${passPercent}% good form (${coveragePercent}% of rules evaluated this session)`;
}

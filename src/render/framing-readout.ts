import type { FramingAssessment } from "../form-checker/framing-check";

/**
 * Live pre-session framing feedback. Rendered on every frame during setup, so it
 * fully replaces its own contents rather than appending to them.
 */
export function renderFramingReadout(
  container: HTMLElement,
  assessment: FramingAssessment
): void {
  const visiblePercent = Math.round(assessment.visibleFraction * 100);

  container.classList.toggle("ready", assessment.ready);
  container.classList.toggle("not-ready", !assessment.ready);

  container.textContent = `${assessment.message} (${visiblePercent}% of measured joints visible)`;

  const hint = document.createElement("span");
  hint.className = "readout-hint";
  hint.textContent = assessment.ready
    ? "Press space to start recording."
    : "Press space to record anyway — form checks are skipped while joints are out of frame.";
  container.appendChild(hint);
}

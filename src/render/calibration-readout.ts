import type { CalibrationState } from "../form-checker/calibration";

/**
 * Live pre-recording calibration feedback, separate from the framing readout.
 * Framing asks "is your body in frame this instant"; calibration asks "have you
 * held still long enough for the tracker to converge" (corpus-manifest.md: this
 * takes 4.6-6.5s in every corpus take). Rendered every frame during setup.
 */
export function renderCalibrationReadout(container: HTMLElement, state: CalibrationState): void {
  container.classList.toggle("ready", state.ready);
  container.classList.toggle("not-ready", !state.ready);
  container.textContent = state.message;
}

import { describe, test, expect } from "vitest";
import { renderCalibrationReadout } from "./calibration-readout";
import type { CalibrationState } from "../form-checker/calibration";

describe("renderCalibrationReadout", () => {
  test("shows the hold-still message and is not marked ready", () => {
    const container = document.createElement("div");
    const state: CalibrationState = {
      ready: false,
      baseline: null,
      message: "Hold still — measuring your standing position."
    };

    renderCalibrationReadout(container, state);

    expect(container.textContent).toContain("Hold still");
    expect(container.classList.contains("ready")).toBe(false);
    expect(container.classList.contains("not-ready")).toBe(true);
  });

  test("shows the ready message and is marked ready", () => {
    const container = document.createElement("div");
    const state: CalibrationState = {
      ready: true,
      baseline: { hipY: 0.5, trunkLength: 0.3, leanDegrees: 0, frameCount: 90 },
      message: "Calibrated. Press space to start your set."
    };

    renderCalibrationReadout(container, state);

    expect(container.textContent).toContain("Calibrated");
    expect(container.classList.contains("ready")).toBe(true);
    expect(container.classList.contains("not-ready")).toBe(false);
  });
});

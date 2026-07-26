import { describe, test, expect } from "vitest";
import { renderFramingReadout } from "./framing-readout";

describe("renderFramingReadout", () => {
  test("shows the go-ahead and marks itself ready when framing is good", () => {
    const container = document.createElement("div");

    renderFramingReadout(container, {
      ready: true,
      missingJointNames: [],
      visibleFraction: 1,
      message: "Framing looks good — every joint this exercise measures is visible."
    });

    expect(container.classList.contains("ready")).toBe(true);
    expect(container.classList.contains("not-ready")).toBe(false);
    expect(container.textContent).toContain("Framing looks good");
    expect(container.textContent!.toLowerCase()).toContain("space");
  });

  test("shows what is out of frame and how to fix it when framing is bad", () => {
    const container = document.createElement("div");

    renderFramingReadout(container, {
      ready: false,
      missingJointNames: ["left ankle"],
      visibleFraction: 0.75,
      message: "Can't see your left ankle. Move further back so your whole body is in frame."
    });

    expect(container.classList.contains("not-ready")).toBe(true);
    expect(container.classList.contains("ready")).toBe(false);
    expect(container.textContent).toContain("left ankle");
    expect(container.textContent).toContain("Move further back");
    expect(container.textContent).toContain("75%");
  });

  test("replaces the previous state instead of stacking readouts", () => {
    const container = document.createElement("div");
    const bad = {
      ready: false,
      missingJointNames: ["left ankle"],
      visibleFraction: 0.75,
      message: "Can't see your left ankle. Move further back so your whole body is in frame."
    };
    const good = {
      ready: true,
      missingJointNames: [],
      visibleFraction: 1,
      message: "Framing looks good — every joint this exercise measures is visible."
    };

    renderFramingReadout(container, bad);
    renderFramingReadout(container, good);

    expect(container.textContent).not.toContain("left ankle");
    expect(container.classList.contains("not-ready")).toBe(false);
    expect(container.classList.contains("ready")).toBe(true);
  });
});

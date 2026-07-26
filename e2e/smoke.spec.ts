import { test, expect } from "@playwright/test";

// Chrome's fake camera device (--use-fake-device-for-media-stream) feeds a
// synthetic rolling pattern, not a real person, so MediaPipe won't detect a
// pose. This test can't validate pose *accuracy* — only that the whole
// pipeline runs end-to-end without errors and that every view actually
// renders (the exact class of bug that shipped: an invisible 0-height
// replay canvas that produced zero console errors).
test("camera session runs end-to-end without console errors and every view renders", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.goto("/");

  await page.waitForSelector("#overlay-canvas");

  // The trust signal and the range-adjustment controls must both be present
  // before the session starts — a stranger decides whether to grant camera
  // access at this moment, and the defaults are only defensible if visibly
  // adjustable. Both are rendered pre-getUserMedia deliberately.
  await expect(page.locator("#privacy-note")).toContainText("Nothing leaves your browser");
  const ruleRows = page.locator("#rule-settings .rule-row");
  await expect(ruleRows).toHaveCount(2);
  await expect(ruleRows.first()).toContainText("Knee bend depth");
  await expect(page.locator("#rule-settings")).toContainText("default (70-100°)");
  await page.screenshot({ path: "test-results/setup-view.png", fullPage: true });
  // MediaPipe WASM + model download, plus a few inference frames.
  await page.waitForTimeout(5000);

  // The fake device feeds a synthetic pattern, so no pose is ever detected and
  // the framing readout must say so rather than reporting a ready state.
  const readout = page.locator("#framing-readout");
  await expect(readout).toHaveClass(/not-ready/);
  await expect(readout).toContainText("No pose detected");

  // Nothing is recorded until space is pressed; "e" before that is a no-op.
  await page.keyboard.press("e");
  await expect(page.locator("#progress-container")).toBeEmpty();

  await page.keyboard.press("Space");
  await expect(readout).toContainText("Recording");
  await page.waitForTimeout(2000);

  await page.keyboard.press("e");
  await page.waitForTimeout(1000);

  const replayCanvas = page.locator("#replay-container canvas");
  await expect(replayCanvas).toHaveCount(1);
  const box = await replayCanvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);

  // No pose was ever detected, so there are no reps and therefore no form score.
  // Asserting a "% good form" figure here would be asserting on a number the
  // harness cannot actually produce — the honest end state is "nothing measured".
  const summaryText = await page.locator("#progress-container").textContent();
  expect(summaryText).toContain("No complete reps detected");
  expect(summaryText).not.toMatch(/\d+% good form/);

  expect(consoleErrors, `Console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
});

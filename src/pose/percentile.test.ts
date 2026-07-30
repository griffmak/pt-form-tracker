import { describe, test, expect } from "vitest";
import { percentile } from "./percentile";

describe("percentile", () => {
  test("returns null for an empty series", () => {
    expect(percentile([], 0.5)).toBeNull();
  });

  test("returns the single value for a one-element series", () => {
    expect(percentile([42], 0.05)).toBe(42);
  });

  test("interpolates between neighbouring samples", () => {
    expect(percentile([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.05)).toBe(5);
  });

  test("returns the extremes at p=0 and p=1", () => {
    expect(percentile([1, 2, 3], 0)).toBe(1);
    expect(percentile([1, 2, 3], 1)).toBe(3);
  });
});

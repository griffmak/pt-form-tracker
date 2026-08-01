import { describe, test, expect } from "vitest";
import { longestCleanStreak } from "./rep-streak";

describe("longestCleanStreak", () => {
  test("returns 0 for no reps", () => {
    expect(longestCleanStreak([])).toBe(0);
  });

  test("returns the full count when nothing is flagged", () => {
    const reps = [{ unusual: false }, { unusual: false }, { unusual: false }];
    expect(longestCleanStreak(reps)).toBe(3);
  });

  test("returns 0 when every rep is flagged", () => {
    const reps = [{ unusual: true }, { unusual: true }];
    expect(longestCleanStreak(reps)).toBe(0);
  });

  test("finds the longest clean run, not the first or last", () => {
    // clean, clean, FLAG, clean, clean, clean, FLAG, clean
    const reps = [
      { unusual: false },
      { unusual: false },
      { unusual: true },
      { unusual: false },
      { unusual: false },
      { unusual: false },
      { unusual: true },
      { unusual: false }
    ];
    expect(longestCleanStreak(reps)).toBe(3);
  });
});

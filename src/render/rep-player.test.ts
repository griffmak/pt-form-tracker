import { describe, test, expect } from "vitest";
import { framesForRep, nextPlaybackFrame } from "./rep-player";

describe("framesForRep", () => {
  test("slices the history to the rep's range and drops null (no-pose) frames", () => {
    const history = [null, "a", "b", null, "c", "d", null];
    const frames = framesForRep(history, { startIndex: 1, endIndex: 5 });

    expect(frames).toEqual(["a", "b", "c", "d"]);
  });

  test("returns an empty array when the rep's whole range has no detected pose", () => {
    const history = [null, null, null];
    const frames = framesForRep(history, { startIndex: 0, endIndex: 2 });

    expect(frames).toEqual([]);
  });
});

describe("nextPlaybackFrame", () => {
  test("advances by one and signals not done", () => {
    expect(nextPlaybackFrame(0, 5)).toEqual({ index: 1, done: false });
  });

  test("signals done once past the last frame", () => {
    expect(nextPlaybackFrame(4, 5)).toEqual({ index: 5, done: true });
  });

  test("treats an empty frame list as immediately done", () => {
    expect(nextPlaybackFrame(0, 0)).toEqual({ index: 0, done: true });
  });
});

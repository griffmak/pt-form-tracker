import { describe, test, expect } from "vitest";
import {
  RECORDED_LANDMARK_INDICES,
  serializeLandmarks,
  type NormalizedLandmarkLike
} from "./landmark-recording";

function fakeLandmarks(count = 33): NormalizedLandmarkLike[] {
  return Array.from({ length: count }, (_, i) => ({
    x: i / 100,
    y: i / 200,
    z: i / 400,
    visibility: 0.9
  }));
}

describe("RECORDED_LANDMARK_INDICES", () => {
  test("covers both shoulders, both hips, both knees, both ankles", () => {
    expect(RECORDED_LANDMARK_INDICES).toEqual([11, 12, 23, 24, 25, 26, 27, 28]);
  });
});

describe("serializeLandmarks", () => {
  test("emits one [x, y, z, visibility] tuple per recorded landmark", () => {
    const frame = serializeLandmarks(fakeLandmarks(), 1000);

    expect(frame.t).toBe(1000);
    expect(frame.lm).toHaveLength(RECORDED_LANDMARK_INDICES.length);
    expect(frame.lm![0]).toEqual([0.11, 0.055, 0.0275, 0.9]);
  });

  test("rounds to 4 decimal places", () => {
    const landmarks = fakeLandmarks();
    landmarks[11] = { x: 0.123456789, y: 0.987654321, z: -0.5555555, visibility: 0.777777 };

    expect(serializeLandmarks(landmarks, 0).lm![0]).toEqual([0.1235, 0.9877, -0.5556, 0.7778]);
  });

  test("records a null frame when no pose was detected", () => {
    const frame = serializeLandmarks(undefined, 500);

    expect(frame).toEqual({ t: 500, lm: null });
  });

  test("records a null frame rather than throwing on a truncated landmark array", () => {
    // Defensive: a malformed result must not kill the recording loop mid-set.
    expect(serializeLandmarks(fakeLandmarks(12), 500)).toEqual({ t: 500, lm: null });
  });
});

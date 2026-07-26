import { describe, it, expect } from "vitest";
import { angleBetweenPoints, type Point3D } from "./angle-math";

describe("angleBetweenPoints", () => {
  it("returns 180 degrees for three collinear points (straight leg)", () => {
    const hip: Point3D = { x: 0, y: 0, z: 0 };
    const knee: Point3D = { x: 0, y: 1, z: 0 };
    const ankle: Point3D = { x: 0, y: 2, z: 0 };
    expect(angleBetweenPoints(hip, knee, ankle)).toBeCloseTo(180, 5);
  });

  it("returns 90 degrees for a right-angle bend at the vertex", () => {
    const hip: Point3D = { x: 0, y: 1, z: 0 };
    const knee: Point3D = { x: 0, y: 0, z: 0 };
    const ankle: Point3D = { x: 1, y: 0, z: 0 };
    expect(angleBetweenPoints(hip, knee, ankle)).toBeCloseTo(90, 5);
  });

  it("returns 0 degrees when the two segments fully overlap", () => {
    const hip: Point3D = { x: 0, y: 1, z: 0 };
    const knee: Point3D = { x: 0, y: 0, z: 0 };
    const ankle: Point3D = { x: 0, y: 1, z: 0 };
    expect(angleBetweenPoints(hip, knee, ankle)).toBeCloseTo(0, 5);
  });
});

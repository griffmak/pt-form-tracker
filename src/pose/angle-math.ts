export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Angle in degrees at `vertex`, formed by the two segments vertex->a and
 * vertex->b. Operates on worldLandmarks (metric 3D), not normalized
 * image-space landmarks — see spec for why.
 */
export function angleBetweenPoints(a: Point3D, vertex: Point3D, b: Point3D): number {
  const v1 = { x: a.x - vertex.x, y: a.y - vertex.y, z: a.z - vertex.z };
  const v2 = { x: b.x - vertex.x, y: b.y - vertex.y, z: b.z - vertex.z };

  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2);
  const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2 + v2.z ** 2);

  if (mag1 === 0 || mag2 === 0) {
    return 0;
  }

  const cosine = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

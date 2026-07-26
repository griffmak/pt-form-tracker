import * as THREE from "three";
import type { PoseWorldLandmark } from "../form-checker/form-checker";

const CONNECTIONS: [number, number][] = [
  [11, 23], [23, 25], [25, 27],
  [12, 24], [24, 26], [26, 28],
  [11, 12], [23, 24]
];

/**
 * Renders a 3D stick-figure skeleton replay (raw joint positions connected
 * by lines) from stored worldLandmarks — not a rigged/skinned avatar.
 */
export class ReplayView {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  private renderer: THREE.WebGLRenderer;
  private lines: THREE.Line[] = [];

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 0, 2);

    for (const _ of CONNECTIONS) {
      const geometry = new THREE.BufferGeometry();
      const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
      const line = new THREE.Line(geometry, material);
      this.scene.add(line);
      this.lines.push(line);
    }
  }

  /** worldLandmarksPerFrame comes from the Pose Engine's raw output, stored alongside session frames. */
  showFrame(worldLandmarks: PoseWorldLandmark[]): void {
    CONNECTIONS.forEach(([aIdx, bIdx], i) => {
      const a = worldLandmarks[aIdx];
      const b = worldLandmarks[bIdx];
      const points = [new THREE.Vector3(a.x, -a.y, -a.z), new THREE.Vector3(b.x, -b.y, -b.z)];
      this.lines[i].geometry.setFromPoints(points);
    });
    this.renderer.render(this.scene, this.camera);
  }
}

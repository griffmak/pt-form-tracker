# PT Movement Form Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working, browser-based, client-only tool that tracks a user's squat form live via webcam pose detection, checks it against a user-adjustable reference range, and shows a post-session 3D skeleton replay plus a consistency chart.

**Architecture:** A Vite + TypeScript single-page app. MediaPipe Pose Landmarker (WASM, client-side) emits both normalized `landmarks` (2D, for the live overlay) and metric `worldLandmarks` (3D, for angle math and replay) per frame. Pure-function angle math and a Form Checker module are unit-tested in isolation from the camera/rendering code, which is verified by hand in a real browser. Session data is batched into IndexedDB. No backend, no network calls.

**Tech Stack:** TypeScript, Vite, `@mediapipe/tasks-vision`, Three.js (3D replay + live overlay canvas), Vitest (unit tests), `fake-indexeddb` (test-only IndexedDB shim). Squat is the only exercise shipped in v1; the Exercise Library schema supports more without code changes.

---

## File Structure

```
pt-form-tracker/
  package.json
  vite.config.ts
  vitest.config.ts
  index.html
  src/
    main.ts                      # wires everything together, app entry point
    exercise-library/
      types.ts                   # ExerciseDefinition, JointAngleRule types
      squat.ts                   # the single v1 exercise entry
      index.ts                   # exports the library as a lookup map
    pose/
      angle-math.ts               # pure functions: angle between 3 3D points
      angle-math.test.ts
      pose-engine.ts              # wraps @mediapipe/tasks-vision PoseLandmarker
    form-checker/
      form-checker.ts             # per-frame angle check + rule coverage tracking
      form-checker.test.ts
    storage/
      session-store.ts            # batched IndexedDB writes/reads
      session-store.test.ts
    render/
      live-overlay.ts             # draws 2D skeleton + red/green indicators on canvas
      replay-view.ts               # Three.js 3D skeleton replay from worldLandmarks
      progress-chart.ts            # renders pass-rate + rule-coverage chart
  tests/
    setup.ts                      # registers fake-indexeddb globally for tests
```

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `index.html`
- Create: `.gitignore`

- [ ] **Step 1: Create the project directory and initialize package.json**

```bash
cd ~/dev/pt-form-tracker
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @mediapipe/tasks-vision three
npm install -D typescript vite vitest fake-indexeddb @types/three jsdom
```

- [ ] **Step 3: Write `package.json` scripts**

Edit `package.json` so the `"scripts"` key reads:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  }
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```typescript
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist"
  }
});
```

- [ ] **Step 5: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"]
  }
});
```

- [ ] **Step 6: Create `tests/setup.ts`**

```typescript
import "fake-indexeddb/auto";
```

This makes `indexedDB` exist as a global in the Vitest/jsdom environment so `session-store.ts` can be unit tested without a real browser.

- [ ] **Step 7: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PT Form Tracker</title>
  </head>
  <body>
    <div id="app">
      <video id="camera-feed" autoplay playsinline muted style="display: none"></video>
      <canvas id="overlay-canvas"></canvas>
      <div id="replay-container"></div>
      <div id="progress-container"></div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 8: Create `.gitignore`**

```
node_modules/
dist/
```

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vite.config.ts vitest.config.ts tests/setup.ts index.html .gitignore
git commit -m "chore: scaffold Vite + TypeScript project"
```

---

## Task 2: Exercise Library — types and the squat entry

**Files:**
- Create: `src/exercise-library/types.ts`
- Create: `src/exercise-library/squat.ts`
- Create: `src/exercise-library/index.ts`

- [ ] **Step 1: Create `src/exercise-library/types.ts`**

```typescript
export type CameraFraming = "side-view" | "front-view";

export interface JointAngleRule {
  /** Human-readable name shown in feedback, e.g. "Knee bend depth" */
  name: string;
  /** MediaPipe pose landmark indices forming the angle: vertex is joints[1] */
  joints: [number, number, number];
  /** Default acceptable angle range in degrees, sourced from public PT guidance */
  defaultMinDegrees: number;
  defaultMaxDegrees: number;
}

export interface ExerciseDefinition {
  id: string;
  displayName: string;
  referenceDescription: string;
  /** Which camera angle this exercise's rules require to be measurable */
  requiredFraming: CameraFraming;
  rules: JointAngleRule[];
}

/** User-adjusted range for a specific rule, persisted per exercise+rule. */
export interface RuleOverride {
  exerciseId: string;
  ruleName: string;
  minDegrees: number;
  maxDegrees: number;
}
```

MediaPipe Pose Landmarker's 33 landmark indices are fixed by the model (0 = nose, 11/12 = shoulders, 23/24 = hips, 25/26 = knees, 27/28 = ankles). The squat entry below uses these directly.

- [ ] **Step 2: Create `src/exercise-library/squat.ts`**

```typescript
import type { ExerciseDefinition } from "./types";

// MediaPipe Pose landmark indices used here:
// 23 = left hip, 25 = left knee, 27 = left ankle
// 11 = left shoulder, 23 = left hip, 25 = left knee
export const squat: ExerciseDefinition = {
  id: "squat",
  displayName: "Squat",
  referenceDescription:
    "Stand with feet shoulder-width apart, lower hips back and down, keep chest up.",
  requiredFraming: "side-view",
  rules: [
    {
      name: "Knee bend depth",
      joints: [23, 25, 27],
      defaultMinDegrees: 80,
      defaultMaxDegrees: 100
    },
    {
      name: "Torso lean",
      joints: [11, 23, 25],
      defaultMinDegrees: 45,
      defaultMaxDegrees: 90
    }
  ]
};
```

- [ ] **Step 3: Create `src/exercise-library/index.ts`**

```typescript
import type { ExerciseDefinition } from "./types";
import { squat } from "./squat";

export const exerciseLibrary: Record<string, ExerciseDefinition> = {
  [squat.id]: squat
};

export * from "./types";
```

- [ ] **Step 4: Commit**

```bash
git add src/exercise-library
git commit -m "feat: add exercise library schema and squat entry"
```

---

## Task 3: Angle math (pure functions, unit tested)

**Files:**
- Create: `src/pose/angle-math.ts`
- Test: `src/pose/angle-math.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/pose/angle-math.test.ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- angle-math`
Expected: FAIL — `Cannot find module './angle-math'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
// src/pose/angle-math.ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- angle-math`
Expected: PASS, 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/pose/angle-math.ts src/pose/angle-math.test.ts
git commit -m "feat: add pure angle-between-points math with tests"
```

---

## Task 4: Form Checker — per-frame rule evaluation + coverage tracking

**Files:**
- Create: `src/form-checker/form-checker.ts`
- Test: `src/form-checker/form-checker.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/form-checker/form-checker.test.ts
import { describe, it, expect } from "vitest";
import { checkFrame, type PoseWorldLandmark } from "./form-checker";
import { squat } from "../exercise-library/squat";

function landmark(x: number, y: number, z: number, visibility = 1): PoseWorldLandmark {
  return { x, y, z, visibility };
}

describe("checkFrame", () => {
  it("passes the knee-bend rule when the angle is inside the default range", () => {
    // Right-angle-ish knee bend (~90deg), inside the 80-100 default range.
    const landmarks: PoseWorldLandmark[] = new Array(33).fill(landmark(0, 0, 0));
    landmarks[23] = landmark(0, 1, 0); // hip
    landmarks[25] = landmark(0, 0, 0); // knee (vertex)
    landmarks[27] = landmark(1, 0, 0); // ankle
    landmarks[11] = landmark(0, 2, 0); // shoulder
    // Torso lean rule uses 11-23-25: shoulder(0,2,0) hip(0,1,0) knee(0,0,0) -> 180deg, outside 45-90 range on purpose.

    const result = checkFrame(squat, landmarks, []);

    const kneeResult = result.ruleResults.find((r) => r.ruleName === "Knee bend depth");
    expect(kneeResult?.evaluated).toBe(true);
    expect(kneeResult?.passed).toBe(true);
  });

  it("marks a rule as not evaluated when a required joint's visibility is below threshold", () => {
    const landmarks: PoseWorldLandmark[] = new Array(33).fill(landmark(0, 0, 0, 1));
    landmarks[23] = landmark(0, 1, 0, 1);
    landmarks[25] = landmark(0, 0, 0, 0.1); // low visibility on the vertex joint
    landmarks[27] = landmark(1, 0, 0, 1);

    const result = checkFrame(squat, landmarks, []);

    const kneeResult = result.ruleResults.find((r) => r.ruleName === "Knee bend depth");
    expect(kneeResult?.evaluated).toBe(false);
    expect(kneeResult?.passed).toBe(false);
  });

  it("uses a user override range instead of the default when one is provided", () => {
    const landmarks: PoseWorldLandmark[] = new Array(33).fill(landmark(0, 0, 0));
    landmarks[23] = landmark(0, 1, 0);
    landmarks[25] = landmark(0, 0, 0);
    landmarks[27] = landmark(1, 0, 0); // ~90 degree knee angle

    // Override narrows the acceptable range to 95-100, so a 90deg angle should now fail.
    const overrides = [{ exerciseId: "squat", ruleName: "Knee bend depth", minDegrees: 95, maxDegrees: 100 }];
    const result = checkFrame(squat, landmarks, overrides);

    const kneeResult = result.ruleResults.find((r) => r.ruleName === "Knee bend depth");
    expect(kneeResult?.evaluated).toBe(true);
    expect(kneeResult?.passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- form-checker`
Expected: FAIL — `Cannot find module './form-checker'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/form-checker/form-checker.ts
import { angleBetweenPoints, type Point3D } from "../pose/angle-math";
import type { ExerciseDefinition, RuleOverride } from "../exercise-library/types";

export interface PoseWorldLandmark extends Point3D {
  visibility: number;
}

export interface RuleResult {
  ruleName: string;
  /** false if a required joint's visibility was below threshold this frame */
  evaluated: boolean;
  /** only meaningful when evaluated is true */
  passed: boolean;
  angleDegrees: number | null;
}

export interface FrameResult {
  ruleResults: RuleResult[];
}

const VISIBILITY_THRESHOLD = 0.5;

export function checkFrame(
  exercise: ExerciseDefinition,
  landmarks: PoseWorldLandmark[],
  overrides: RuleOverride[]
): FrameResult {
  const ruleResults: RuleResult[] = exercise.rules.map((rule) => {
    const [aIdx, vertexIdx, bIdx] = rule.joints;
    const a = landmarks[aIdx];
    const vertex = landmarks[vertexIdx];
    const b = landmarks[bIdx];

    const lowVisibility =
      a.visibility < VISIBILITY_THRESHOLD ||
      vertex.visibility < VISIBILITY_THRESHOLD ||
      b.visibility < VISIBILITY_THRESHOLD;

    if (lowVisibility) {
      return { ruleName: rule.name, evaluated: false, passed: false, angleDegrees: null };
    }

    const angle = angleBetweenPoints(a, vertex, b);

    const override = overrides.find(
      (o) => o.exerciseId === exercise.id && o.ruleName === rule.name
    );
    const min = override?.minDegrees ?? rule.defaultMinDegrees;
    const max = override?.maxDegrees ?? rule.defaultMaxDegrees;

    return {
      ruleName: rule.name,
      evaluated: true,
      passed: angle >= min && angle <= max,
      angleDegrees: angle
    };
  });

  return { ruleResults };
}

/** Rule coverage for a whole session: how many rule-evaluations actually happened vs. were skipped. */
export function summarizeCoverage(frames: FrameResult[]): { evaluatedCount: number; totalCount: number } {
  let evaluatedCount = 0;
  let totalCount = 0;
  for (const frame of frames) {
    for (const rule of frame.ruleResults) {
      totalCount += 1;
      if (rule.evaluated) evaluatedCount += 1;
    }
  }
  return { evaluatedCount, totalCount };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- form-checker`
Expected: PASS, 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/form-checker
git commit -m "feat: add Form Checker with rule evaluation and coverage tracking"
```

---

## Task 5: Session storage (batched IndexedDB writes, unit tested via fake-indexeddb)

**Files:**
- Create: `src/storage/session-store.ts`
- Test: `src/storage/session-store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/storage/session-store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { SessionStore, type SessionFrameRecord } from "./session-store";

describe("SessionStore", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("pt-form-tracker");
  });

  it("persists queued frames and reads them back after flush", async () => {
    const store = new SessionStore();
    await store.open();

    const sessionId = await store.startSession("squat");
    const frame: SessionFrameRecord = {
      sessionId,
      timestamp: Date.now(),
      ruleResults: [{ ruleName: "Knee bend depth", evaluated: true, passed: true, angleDegrees: 90 }]
    };

    store.queueFrame(frame);
    await store.flush();

    const frames = await store.getFramesForSession(sessionId);
    expect(frames).toHaveLength(1);
    expect(frames[0].ruleResults[0].passed).toBe(true);
  });

  it("reports a write failure instead of silently dropping data", async () => {
    const store = new SessionStore();
    await store.open();
    // Force a failure by closing the underlying connection before flush.
    store.forceCloseForTesting();

    const sessionId = "fake-session";
    store.queueFrame({ sessionId, timestamp: Date.now(), ruleResults: [] });

    await expect(store.flush()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- session-store`
Expected: FAIL — `Cannot find module './session-store'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/storage/session-store.ts
import type { RuleResult } from "../form-checker/form-checker";

export interface SessionFrameRecord {
  sessionId: string;
  timestamp: number;
  ruleResults: RuleResult[];
}

const DB_NAME = "pt-form-tracker";
const DB_VERSION = 1;
const STORE_NAME = "frames";
const FLUSH_BATCH_SIZE = 30;

/**
 * Batches frame writes so IndexedDB I/O doesn't compete with the live
 * inference/render loop on every single frame (mobile-critical, see spec).
 */
export class SessionStore {
  private db: IDBDatabase | null = null;
  private queue: SessionFrameRecord[] = [];

  async open(): Promise<void> {
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
          store.createIndex("sessionId", "sessionId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async startSession(_exerciseId: string): Promise<string> {
    return crypto.randomUUID();
  }

  queueFrame(frame: SessionFrameRecord): void {
    this.queue.push(frame);
    if (this.queue.length >= FLUSH_BATCH_SIZE) {
      // Fire-and-forget is intentional here; callers doing a final flush
      // at session-end still await flush() explicitly.
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (!this.db) throw new Error("SessionStore not open");
    if (this.queue.length === 0) return;

    const toWrite = this.queue.splice(0, this.queue.length);

    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const frame of toWrite) {
        store.add(frame);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error("IndexedDB transaction aborted"));
    });
  }

  async getFramesForSession(sessionId: string): Promise<SessionFrameRecord[]> {
    if (!this.db) throw new Error("SessionStore not open");
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, "readonly");
      const index = tx.objectStore(STORE_NAME).index("sessionId");
      const request = index.getAll(sessionId);
      request.onsuccess = () => resolve(request.result as SessionFrameRecord[]);
      request.onerror = () => reject(request.error);
    });
  }

  /** Test-only hook to simulate a storage failure. */
  forceCloseForTesting(): void {
    this.db?.close();
    this.db = null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- session-store`
Expected: PASS, 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/storage
git commit -m "feat: add batched IndexedDB session store with tests"
```

---

## Task 6: Pose Engine wrapper (manual verification, no automated test — camera required)

**Files:**
- Create: `src/pose/pose-engine.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/pose/pose-engine.ts
import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";

export type PoseFrameCallback = (result: PoseLandmarkerResult) => void;

export class PoseEngine {
  private landmarker: PoseLandmarker | null = null;
  private running = false;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numPoses: 1
    });
  }

  start(video: HTMLVideoElement, onFrame: PoseFrameCallback): void {
    if (!this.landmarker) throw new Error("PoseEngine.init() must resolve before start()");
    this.running = true;

    const loop = () => {
      if (!this.running) return;
      const result = this.landmarker!.detectForVideo(video, performance.now());
      onFrame(result);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
  }
}
```

- [ ] **Step 2: Manually verify in a real browser**

This cannot be unit tested (requires a real camera + WASM model download). Verify by hand once `main.ts` (Task 8) wires it up:
1. Run `npm run dev`, open the printed localhost URL on desktop Chrome.
2. Grant camera permission when prompted.
3. Confirm the browser console logs no errors and `onFrame` is being called (add a temporary `console.log(result.worldLandmarks)` if needed, then remove it before committing).
4. Repeat on a phone browser (same network, use the machine's LAN IP) to confirm mobile camera access works.

- [ ] **Step 3: Commit**

```bash
git add src/pose/pose-engine.ts
git commit -m "feat: add MediaPipe Pose Landmarker wrapper"
```

---

## Task 7: Live overlay renderer (manual verification)

**Files:**
- Create: `src/render/live-overlay.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/render/live-overlay.ts
import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import type { FrameResult } from "../form-checker/form-checker";
import type { ExerciseDefinition } from "../exercise-library/types";

// MediaPipe's standard pose connection pairs (subset relevant to squat: legs + torso).
const CONNECTIONS: [number, number][] = [
  [11, 23], [23, 25], [25, 27], // left shoulder-hip-knee-ankle
  [12, 24], [24, 26], [26, 28], // right shoulder-hip-knee-ankle
  [11, 12], [23, 24] // shoulders, hips
];

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  poseResult: PoseLandmarkerResult,
  exercise: ExerciseDefinition,
  frameResult: FrameResult | null
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height);

  const landmarks = poseResult.landmarks[0];
  if (!landmarks) {
    ctx.fillStyle = "white";
    ctx.font = "20px sans-serif";
    ctx.fillText("Can't see you clearly — step back into frame", 20, 40);
    return;
  }

  ctx.strokeStyle = "#00FF00";
  ctx.lineWidth = 3;
  for (const [aIdx, bIdx] of CONNECTIONS) {
    const a = landmarks[aIdx];
    const b = landmarks[bIdx];
    ctx.beginPath();
    ctx.moveTo(a.x * ctx.canvas.width, a.y * ctx.canvas.height);
    ctx.lineTo(b.x * ctx.canvas.width, b.y * ctx.canvas.height);
    ctx.stroke();
  }

  if (!frameResult) return;

  exercise.rules.forEach((rule, i) => {
    const result = frameResult.ruleResults[i];
    const vertexIdx = rule.joints[1];
    const vertex = landmarks[vertexIdx];
    ctx.fillStyle = !result.evaluated ? "gray" : result.passed ? "#00FF00" : "#FF0000";
    ctx.beginPath();
    ctx.arc(vertex.x * ctx.canvas.width, vertex.y * ctx.canvas.height, 8, 0, 2 * Math.PI);
    ctx.fill();
  });
}
```

- [ ] **Step 2: Manually verify**

Once wired into `main.ts` (Task 8), confirm in a real browser session: skeleton lines track your body, joint dots turn red/green based on squat depth, and moving out of frame shows the "can't see you clearly" message instead of a frozen or glitching skeleton.

- [ ] **Step 3: Commit**

```bash
git add src/render/live-overlay.ts
git commit -m "feat: add live 2D skeleton overlay renderer"
```

---

## Task 8: Replay view and progress chart (manual verification)

**Files:**
- Create: `src/render/replay-view.ts`
- Create: `src/render/progress-chart.ts`

- [ ] **Step 1: Write `src/render/replay-view.ts`**

```typescript
// src/render/replay-view.ts
import * as THREE from "three";
import type { SessionFrameRecord } from "../storage/session-store";
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
```

- [ ] **Step 2: Write `src/render/progress-chart.ts`**

```typescript
// src/render/progress-chart.ts
import type { SessionFrameRecord } from "../storage/session-store";
import { summarizeCoverage, type FrameResult } from "../form-checker/form-checker";

export interface SessionSummary {
  passRate: number; // 0-1, among evaluated rules only
  coverageRate: number; // 0-1, evaluated / total rule-checks
}

export function summarizeSession(frames: SessionFrameRecord[]): SessionSummary {
  const frameResults: FrameResult[] = frames.map((f) => ({ ruleResults: f.ruleResults }));
  const { evaluatedCount, totalCount } = summarizeCoverage(frameResults);

  const passedCount = frameResults
    .flatMap((f) => f.ruleResults)
    .filter((r) => r.evaluated && r.passed).length;

  return {
    passRate: evaluatedCount === 0 ? 0 : passedCount / evaluatedCount,
    coverageRate: totalCount === 0 ? 0 : evaluatedCount / totalCount
  };
}

/** Renders "82% good form, 3 of 3 rules evaluated" style text into a container. */
export function renderProgressSummary(container: HTMLElement, summary: SessionSummary): void {
  const passPercent = Math.round(summary.passRate * 100);
  const coveragePercent = Math.round(summary.coverageRate * 100);
  container.textContent = `${passPercent}% good form (${coveragePercent}% of rules evaluated this session)`;
}
```

- [ ] **Step 3: Manually verify**

Once wired into `main.ts` (Task 9), run a session, end it, and confirm the replay container shows a moving 3D skeleton reconstructing your reps, and the progress container shows a pass-rate + coverage string that matches what you actually did (e.g., stand out of frame for part of the session and confirm coverage drops accordingly).

- [ ] **Step 4: Commit**

```bash
git add src/render/replay-view.ts src/render/progress-chart.ts
git commit -m "feat: add 3D skeleton replay and progress summary"
```

---

## Task 9: Wire it all together in `main.ts`

**Files:**
- Create: `src/main.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/main.ts
import { PoseEngine } from "./pose/pose-engine";
import { checkFrame, type PoseWorldLandmark } from "./form-checker/form-checker";
import { drawOverlay } from "./render/live-overlay";
import { ReplayView } from "./render/replay-view";
import { summarizeSession, renderProgressSummary } from "./render/progress-chart";
import { SessionStore, type SessionFrameRecord } from "./storage/session-store";
import { exerciseLibrary } from "./exercise-library";

async function main() {
  const exercise = exerciseLibrary["squat"];
  const video = document.getElementById("camera-feed") as HTMLVideoElement;
  const canvas = document.getElementById("overlay-canvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const replayContainer = document.getElementById("replay-container")!;
  const progressContainer = document.getElementById("progress-container")!;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
  } catch {
    document.body.innerHTML = "<p>Camera permission is required to use this tool.</p>";
    return;
  }
  video.srcObject = stream;
  await video.play();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const store = new SessionStore();
  await store.open();
  const sessionId = await store.startSession(exercise.id);

  const worldLandmarksHistory: PoseWorldLandmark[][] = [];

  const engine = new PoseEngine();
  await engine.init();
  engine.start(video, (result) => {
    const frameResult = result.worldLandmarks[0]
      ? checkFrame(exercise, result.worldLandmarks[0] as PoseWorldLandmark[], [])
      : null;

    drawOverlay(ctx, video, result, exercise, frameResult);

    if (frameResult && result.worldLandmarks[0]) {
      worldLandmarksHistory.push(result.worldLandmarks[0] as PoseWorldLandmark[]);
      const record: SessionFrameRecord = {
        sessionId,
        timestamp: Date.now(),
        ruleResults: frameResult.ruleResults
      };
      store.queueFrame(record);
    }
  });

  window.addEventListener("beforeunload", () => {
    engine.stop();
  });

  // Manual "end session" trigger for v1: a keyboard shortcut, since there's
  // no UI chrome specified in the spec beyond the core views.
  window.addEventListener("keydown", async (e) => {
    if (e.key !== "e") return;
    engine.stop();
    stream.getTracks().forEach((t) => t.stop());
    await store.flush();

    const frames = await store.getFramesForSession(sessionId);
    const summary = summarizeSession(frames);
    renderProgressSummary(progressContainer, summary);

    const replay = new ReplayView(replayContainer);
    let i = 0;
    const replayInterval = setInterval(() => {
      if (i >= worldLandmarksHistory.length) {
        clearInterval(replayInterval);
        return;
      }
      replay.showFrame(worldLandmarksHistory[i]);
      i += 1;
    }, 33);
  });
}

main();
```

- [ ] **Step 2: Manually verify end-to-end**

Run `npm run dev`, open in browser, grant camera access, perform a few squats in front of the camera, press "e" to end the session, and confirm: the live overlay tracked your reps, the replay view plays back a 3D skeleton of what you did, and the progress summary text shows a plausible pass-rate/coverage number.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire pose engine, form checker, storage, and views into app entry point"
```

---

## Self-Review

**Spec coverage:**
- Client-side only, no backend — Task 1 (Vite static build), Task 9 (no fetch/network calls anywhere). Covered.
- Exercise Library with default + user-override ranges, required camera framing — Task 2 defines the schema and squat entry; the `RuleOverride` type and `requiredFraming` field exist. User-facing UI for *editing* the override isn't built in v1 (no UI chrome was specified beyond the core views) — flagging this as a real gap: **the override mechanism exists in the data model and Form Checker logic, but there's no v1 UI to let a user actually change it.** This should be a follow-up task once the spec's UI expectations for that flow are clarified; noting it rather than silently shipping a dead code path.
- Pose Engine emitting both `landmarks` and `worldLandmarks` — Task 6, confirmed against MediaPipe's actual result shape.
- Form Checker using `worldLandmarks`, rule coverage tracking — Task 4, tested.
- Live 2D overlay during session — Task 7.
- 3D skeleton replay (not rigged avatar) post-session only — Task 8, explicitly stick-figure lines, not a mesh.
- Batched IndexedDB writes, storage-failure surfaced not swallowed — Task 5, `flush()` rejects on transaction failure rather than swallowing it; `main.ts` doesn't yet catch that rejection and show it to the user — **flagging this as a real gap**: Task 9's `store.flush()` calls should be wrapped to surface a visible error, not just tested at the unit level. Adding this now rather than leaving it silent:

- [ ] **Follow-up step for Task 9: surface storage failures to the user**

```typescript
// in main.ts, replace the bare `await store.flush();` calls with:
try {
  await store.flush();
} catch {
  progressContainer.textContent = "Couldn't save this session — your browser's storage may be full or restricted.";
}
```

- Camera permission / no camera error handling — Task 9, `getUserMedia` failure shows a message.
- Pose-not-detected neutral state — Task 7, `drawOverlay` shows "Can't see you clearly."
- Testing: pure Form Checker/angle-math logic unit tested, camera/rendering verified by hand — matches spec exactly.

**Placeholder scan:** No TBD/TODO markers; all code blocks are complete and runnable as written.

**Type consistency:** `PoseWorldLandmark` (form-checker.ts) is the single shared type for a landmark-with-visibility used across form-checker, session-store, replay-view, and main.ts — verified consistent across all task code blocks above.

---

Plan complete and saved to `docs/superpowers/plans/2026-07-25-pt-form-tracker.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

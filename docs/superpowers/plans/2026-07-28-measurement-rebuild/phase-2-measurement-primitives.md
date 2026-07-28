# Phase 2 — Planar Measurement Primitives and Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two measures the rebuilt tool grades on — trunk lean and hip
depth, both relative to the user's own standing baseline — and the calibration
step that establishes that baseline before every set.

**Architecture:** A pure geometry module over normalized 2D landmarks, plus a
calibration module that watches for a stable standing window and refuses to
produce a baseline until it sees one. Both are validated by replaying the Phase 1
corpus, not by synthetic fixtures alone.

**Tech Stack:** TypeScript, vitest. No new dependencies; this is trigonometry
over arrays.

**Model:** Opus. Every error class here produces a plausible number that is
quietly wrong — an aspect-ratio slip overstates lean by 78%, a sign flip inverts
depth, and neither shows up as a crash.

**On camera:** No. Everything validates against the corpus recorded in Phase 1.

---

## Context you need — this document is self-contained

**The tool.** `pt-form-tracker` is a browser-only squat form checker. Webcam →
MediaPipe Pose Landmarker running in-page → deterministic geometry → on-screen
feedback. Vite + TypeScript. `npm test` runs vitest, `npm run dev` starts the
dev server.

**Who it's for.** One user, rehabbing a **spinal disc injury**. The tool is a
spotter, not a judge: it watches the current set, flags a rep unlike the others,
keeps a streak. It is not a clinical instrument.

**HARD CONSTRAINT — no runtime AI, ever.** No Claude SDK, no API call, no LLM,
no remote inference at runtime. Deterministic geometry only. The product rests
on "nothing leaves your browser," stated in the README and on screen.

**Branch:** `measurement-rebuild`.
**Design spec:** `docs/superpowers/specs/2026-07-28-measurement-rebuild-design.md`.

### Prerequisite

**Phase 1 must be complete.** This phase reads
`.claude-test-artifacts/corpus-*.json`, six labelled takes containing raw
normalized 2D landmarks. If those files do not exist, stop — nothing here can be
validated without them, and building measurement math against synthetic fixtures
alone is precisely how the defects this rebuild exists to fix got in.

Each corpus file contains:

```jsonc
{
  "raw": {
    "landmarkIndices": [11, 12, 23, 24, 25, 26, 27, 28],
    "tupleOrder": ["x", "y", "z", "visibility"],
    "videoWidth": 2938,
    "videoHeight": 1726,
    "frames": [ { "t": 1785261752235, "lm": [[0.51, 0.32, -0.1, 0.99], ...] } ]
  }
}
```

`lm` is `null` on frames with no detected pose. Tuple index within a frame
follows `landmarkIndices` order: index 0 = landmark 11 (left shoulder), 1 = 12
(right shoulder), 2 = 23 (left hip), 3 = 24 (right hip), 4–7 = knees and ankles.

Ground-truth rep counts are in
`docs/superpowers/plans/2026-07-28-measurement-rebuild/corpus-manifest.md`.

### Why these two measures, and why in image space

**The data.** From the 2026-07-28 standing diagnostic, fraction of frames with
visibility ≥ 0.5: shoulder 100%, hip 99%, ankle 86%, **knee 59%**. On 2026-07-27
the ankle was the weak joint at ~24% while the knee was ≥98%. **No capture has
ever tracked both legs well; every capture has tracked shoulder and hip
near-perfectly.** The measures are therefore built on landmarks 11, 12, 23 and
24 only.

**Image space, not worldLandmarks.** A stored lesson says angle math should
always use `worldLandmarks`. That lesson is **narrowed, not overturned** —
worldLandmarks remain correct for viewpoint-robust interior joint angles. These
two measures need image space because:

- No gravity reference exists in a desktop browser, so neither space gives a
  true vertical. "Vertical" is camera-vertical either way, and baseline
  subtraction cancels camera roll and tilt.
- worldLandmark axis orientation is undocumented; the upstream question
  (mediapipe#3370) has been open since 2022. Image space has a documented
  convention.
- worldLandmarks are a separately-regressed 3D lift and a side-on view is its
  worst case. In side view the sagittal plane approximately *is* the image
  plane, so lean is directly imaged in 2D; an inferred z can only add noise.
- **Structural trap:** worldLandmark origin *is* the hip midpoint, so hip
  vertical travel is identically zero there. Depth cannot be measured in that
  space at all.

### The two traps in this phase

**1. Aspect ratio.** Normalized `x` and `y` are normalized by width and height
**separately**. Before any `atan2`, `dx` must be multiplied by
`videoWidth / videoHeight`. Skipping this overstates lean by ~1.78× on a 16:9
feed. This is the single most likely silent bug in this phase — it produces
numbers that look entirely reasonable.

**2. Left/right, not left-only.** Use the midpoint of (11, 12) and of (23, 24),
never the left landmark alone. In side view the two nearly superimpose, and
averaging suppresses the left/right assignment jitter MediaPipe produces when
one limb occludes the other.

### What the tool must never claim

MediaPipe has 33 landmarks and **none between shoulder and hip** — no
thoracolumbar junction, no sacrum, no L5/S1. The shoulder→hip chord spans the
whole spine *plus* the hip joint and is dominated by hip flexion: the user can
hold it constant while fully flexing the lumbar spine, which is the exact event
a disc injury cares about. Posterior pelvic tilt ("butt wink") is a rotation
about the axis through the hip joint centres, which landmarks 23 and 24 *are* —
undetectable with this sensor at any price.

So: trunk lean is a **trunk** measure, never a spine or back-safety measure. Name
it accordingly in code and comments. Depth beyond personal baseline is the best
available **proxy** for the butt-wink risk window and must be called a proxy.
Copy enforcement is Phase 5; naming discipline starts here.

---

## Global Constraints

- **No runtime AI, API, LLM, or remote inference.** Deterministic geometry only.
- **No new dependencies.**
- All measurement functions are **pure and synchronous** — they run inside the
  per-frame render loop.
- **Absolute degrees must not reach user-facing output.** Every user-visible
  number is a delta from the user's own baseline. This module may return absolute
  values; Phase 5 enforces that nothing renders them raw.
- Thresholds must be **derived from the corpus**, not picked round. Any constant
  in this phase carries a comment naming the take it came from.
- Calibration is **required before every set** — a locked product decision. The
  tool must not record until it has a clean standing baseline.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/pose/planar-measures.ts` | Create | Pure geometry over normalized 2D landmarks: midpoints, aspect correction, trunk lean, trunk length, hip height. |
| `src/pose/planar-measures.test.ts` | Create | Synthetic unit tests with hand-computable expectations. |
| `src/form-checker/calibration.ts` | Create | Baseline type, stability assessment, baseline computation. |
| `src/form-checker/calibration.test.ts` | Create | Synthetic unit tests. |
| `tests/corpus.ts` | Create | Shared loader for `corpus-*.json`. Used by this phase and Phases 3 and 4. |
| `src/pose/planar-measures.corpus.test.ts` | Create | Replays the corpus. The test that actually decides whether this works. |

---

### Task 1: Corpus loader

A shared helper so Phases 2, 3 and 4 all read the corpus the same way.

**Files:**
- Create: `tests/corpus.ts`

**Interfaces:**
- Produces:
  - `export interface CorpusFrame { t: number; lm: number[][] | null }`
  - `export interface Corpus { name: string; videoWidth: number; videoHeight: number; aspectRatio: number; frames: CorpusFrame[] }`
  - `export function loadCorpus(name: string): Corpus`
  - `export const CORPUS_TAKES: { name: string; groundTruthReps: number }[]`

  Phase 3 and Phase 4 both import `loadCorpus` and `CORPUS_TAKES`.

- [ ] **Step 1: Write the loader**

Create `tests/corpus.ts`:

```typescript
import { readFileSync } from "node:fs";

export interface CorpusFrame {
  t: number;
  /** [x, y, z, visibility] per landmark, in landmarkIndices order. null = no pose. */
  lm: number[][] | null;
}

export interface Corpus {
  name: string;
  videoWidth: number;
  videoHeight: number;
  /** videoWidth / videoHeight. Required before any atan2 over normalized coords. */
  aspectRatio: number;
  frames: CorpusFrame[];
}

/**
 * Index into a frame's `lm` array. NOT the MediaPipe landmark index — the
 * corpus stores a subset, so landmark 23 lives at position 2.
 */
export const LM = {
  leftShoulder: 0,
  rightShoulder: 1,
  leftHip: 2,
  rightHip: 3,
  leftKnee: 4,
  rightKnee: 5,
  leftAnkle: 6,
  rightAnkle: 7
} as const;

/** Ground truth from corpus-manifest.md. Update both together if a take is re-recorded. */
export const CORPUS_TAKES = [
  { name: "corpus-01-standing", groundTruthReps: 0 },
  { name: "corpus-02-five-slow", groundTruthReps: 5 },
  { name: "corpus-03-five-normal", groundTruthReps: 5 },
  { name: "corpus-04-shallow", groundTruthReps: 5 },
  { name: "corpus-05-degrading", groundTruthReps: 8 },
  { name: "corpus-06-drift", groundTruthReps: 5 }
];

export function loadCorpus(name: string): Corpus {
  const raw = JSON.parse(readFileSync(`.claude-test-artifacts/${name}.json`, "utf8")).raw;
  return {
    name,
    videoWidth: raw.videoWidth,
    videoHeight: raw.videoHeight,
    aspectRatio: raw.videoWidth / raw.videoHeight,
    frames: raw.frames
  };
}
```

- [ ] **Step 2: Verify every take loads**

```bash
node -e '
const { readFileSync } = require("node:fs");
for (const n of ["corpus-01-standing","corpus-02-five-slow","corpus-03-five-normal","corpus-04-shallow","corpus-05-degrading","corpus-06-drift"]) {
  const r = JSON.parse(readFileSync(".claude-test-artifacts/"+n+".json","utf8")).raw;
  console.log(n, r.frames.length, r.videoWidth+"x"+r.videoHeight, (r.videoWidth/r.videoHeight).toFixed(4));
}'
```

Expected: six lines, all with the same dimensions and aspect ratio. A differing
aspect ratio between takes means the camera or window changed mid-corpus — note
it in the manifest, because it affects every lean number computed from that take.

- [ ] **Step 3: Commit**

```bash
git add tests/corpus.ts
git commit -m "test(corpus): add shared loader for the capture corpus"
```

---

### Task 2: Planar geometry primitives

**Files:**
- Create: `src/pose/planar-measures.ts`
- Test: `src/pose/planar-measures.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export interface Point2D { x: number; y: number }`
  - `export interface TrunkSample { leanDegrees: number; hipY: number; trunkLength: number; minVisibility: number }`
  - `export function midpoint(a: Point2D, b: Point2D): Point2D`
  - `export function trunkSample(lm: number[][], aspectRatio: number): TrunkSample`

  Phase 3 consumes `TrunkSample`. Phase 4 reads `minVisibility` off it.

**Sign conventions, stated once and relied on everywhere downstream:**

- Image `y` increases **downward**. A standing person's hip is *below* their
  shoulder, so `hipY - shoulderY > 0`.
- `leanDegrees` is `atan2(dx, dy)` over the aspect-corrected shoulder→hip
  vector: **0 = trunk vertical in the image**, positive = hip displaced in +x
  relative to shoulder. Whether positive means "leaning forward" depends on
  which way the user faces the camera — this is why every user-facing number is
  a delta from baseline rather than an absolute.
- `hipY` is raw normalized `y` of the hip midpoint. Larger = lower in frame =
  deeper. **Depth increases with y.** This is the opposite sign convention from
  knee angle, where deeper meant smaller. Getting this backwards inverts the
  whole depth signal.

- [ ] **Step 1: Write the failing test**

Create `src/pose/planar-measures.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { midpoint, trunkSample } from "./planar-measures";

/**
 * Builds a corpus-shaped frame. Positions are normalized image coords; y grows
 * downward. Only the four trunk landmarks matter to these functions, but the
 * array shape matches the corpus so tests and real data exercise one code path.
 */
function frame(
  shoulder: { x: number; y: number },
  hip: { x: number; y: number },
  visibility = 0.99
): number[][] {
  const p = (x: number, y: number) => [x, y, 0, visibility];
  return [
    p(shoulder.x, shoulder.y), // 11 left shoulder
    p(shoulder.x, shoulder.y), // 12 right shoulder
    p(hip.x, hip.y),           // 23 left hip
    p(hip.x, hip.y),           // 24 right hip
    p(0, 0), p(0, 0), p(0, 0), p(0, 0) // knees, ankles — unused here
  ];
}

describe("midpoint", () => {
  test("averages both coordinates", () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 1, y: 3 })).toEqual({ x: 0.5, y: 1.5 });
  });
});

describe("trunkSample", () => {
  test("reads zero lean for a perfectly vertical trunk", () => {
    const s = trunkSample(frame({ x: 0.5, y: 0.3 }, { x: 0.5, y: 0.6 }), 16 / 9);

    expect(s.leanDegrees).toBeCloseTo(0, 6);
  });

  test("applies aspect correction to the horizontal component", () => {
    // dx = 0.1 normalized-width, dy = 0.1 normalized-height. On a square feed
    // that is 45deg. On 16:9 the same dx spans 16/9 as much real distance, so
    // the true angle is atan(0.1 * 16/9 / 0.1) = 60.64deg.
    const square = trunkSample(frame({ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 }), 1);
    const wide = trunkSample(frame({ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 }), 16 / 9);

    expect(square.leanDegrees).toBeCloseTo(45, 4);
    expect(wide.leanDegrees).toBeCloseTo(60.6423, 3);
  });

  test("signs lean by the direction the hip sits relative to the shoulder", () => {
    const positive = trunkSample(frame({ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 }), 1);
    const negative = trunkSample(frame({ x: 0.6, y: 0.4 }, { x: 0.5, y: 0.5 }), 1);

    expect(positive.leanDegrees).toBeGreaterThan(0);
    expect(negative.leanDegrees).toBeCloseTo(-positive.leanDegrees, 6);
  });

  test("reports hip height as raw normalized y, growing downward", () => {
    const high = trunkSample(frame({ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.5 }), 1);
    const low = trunkSample(frame({ x: 0.5, y: 0.4 }, { x: 0.5, y: 0.7 }), 1);

    expect(high.hipY).toBe(0.5);
    expect(low.hipY).toBeGreaterThan(high.hipY);
  });

  test("measures trunk length in aspect-corrected space", () => {
    // Purely vertical trunk: aspect correction touches x only, so length is dy.
    const s = trunkSample(frame({ x: 0.5, y: 0.3 }, { x: 0.5, y: 0.6 }), 16 / 9);

    expect(s.trunkLength).toBeCloseTo(0.3, 6);
  });

  test("reports the weakest of the four trunk landmarks", () => {
    const lm = frame({ x: 0.5, y: 0.3 }, { x: 0.5, y: 0.6 }, 0.99);
    lm[3] = [0.5, 0.6, 0, 0.42]; // right hip only

    expect(trunkSample(lm, 1).minVisibility).toBe(0.42);
  });

  test("averages left and right rather than trusting one side", () => {
    const lm = frame({ x: 0.5, y: 0.3 }, { x: 0.5, y: 0.6 });
    lm[0] = [0.4, 0.3, 0, 0.99]; // left shoulder jitters away
    lm[1] = [0.6, 0.3, 0, 0.99]; // right shoulder jitters the other way

    // The midpoint is unchanged, so lean stays vertical despite the jitter.
    expect(trunkSample(lm, 1).leanDegrees).toBeCloseTo(0, 6);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -- planar-measures
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

Create `src/pose/planar-measures.ts`:

```typescript
import { LM_INDEX } from "./landmark-recording";

export interface Point2D {
  x: number;
  y: number;
}

/**
 * One frame's trunk geometry, computed from shoulders and hips only.
 *
 * These four landmarks were chosen from measured tracking reliability, not
 * convenience: across every capture to date, shoulder and hip clear a 0.5
 * visibility threshold on ~99-100% of frames, while the knee managed 59% in one
 * session and the ankle 24% in another. No capture has tracked both legs well.
 *
 * This is a TRUNK measure, not a spine measure. MediaPipe has no landmark
 * between shoulder and hip — no thoracolumbar junction, no sacrum, no L5/S1 —
 * so the shoulder->hip chord spans the whole spine plus the hip joint and is
 * dominated by hip flexion. The lumbar spine can flex fully with this chord
 * unchanged. Nothing computed here may be described as saying anything about
 * the back, the spine, or injury risk.
 */
export interface TrunkSample {
  /**
   * Angle of the shoulder->hip vector from image vertical, aspect-corrected.
   * 0 = vertical in the image. Sign indicates which side the hip sits on,
   * which depends on the direction the user faces — always report a delta from
   * baseline, never this value directly.
   */
  leanDegrees: number;
  /** Hip midpoint y in normalized image coords. Grows DOWNWARD: larger = deeper. */
  hipY: number;
  /** Shoulder->hip distance in aspect-corrected normalized units. The body scale. */
  trunkLength: number;
  /** Weakest visibility among the four trunk landmarks this frame. */
  minVisibility: number;
}

export function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function trunkSample(lm: number[][], aspectRatio: number): TrunkSample {
  const point = (i: number): Point2D => ({ x: lm[i][0], y: lm[i][1] });

  const shoulder = midpoint(point(LM_INDEX.leftShoulder), point(LM_INDEX.rightShoulder));
  const hip = midpoint(point(LM_INDEX.leftHip), point(LM_INDEX.rightHip));

  // Normalized x and y are normalized by width and height SEPARATELY, so a dx
  // of 0.1 spans aspectRatio times as much real distance as a dy of 0.1.
  // Without this correction lean is overstated by ~1.78x on a 16:9 feed.
  const dx = (hip.x - shoulder.x) * aspectRatio;
  const dy = hip.y - shoulder.y;

  return {
    leanDegrees: (Math.atan2(dx, dy) * 180) / Math.PI,
    hipY: hip.y,
    trunkLength: Math.sqrt(dx * dx + dy * dy),
    minVisibility: Math.min(
      lm[LM_INDEX.leftShoulder][3],
      lm[LM_INDEX.rightShoulder][3],
      lm[LM_INDEX.leftHip][3],
      lm[LM_INDEX.rightHip][3]
    )
  };
}
```

Add the index map to `src/pose/landmark-recording.ts` so the browser and the
test loader agree on tuple positions:

```typescript
/**
 * Position within a recorded frame's `lm` array. NOT the MediaPipe landmark
 * index — the recording stores a subset, so landmark 23 lives at position 2.
 */
export const LM_INDEX = {
  leftShoulder: 0,
  rightShoulder: 1,
  leftHip: 2,
  rightHip: 3,
  leftKnee: 4,
  rightKnee: 5,
  leftAnkle: 6,
  rightAnkle: 7
} as const;
```

Then delete the duplicate `LM` constant from `tests/corpus.ts` and re-export
`LM_INDEX` from there instead, so there is exactly one definition. Two copies of
an index map that must agree is a defect waiting to happen.

- [ ] **Step 4: Run it to verify it passes**

```bash
npm test -- planar-measures
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pose/planar-measures.ts src/pose/planar-measures.test.ts src/pose/landmark-recording.ts tests/corpus.ts
git commit -m "feat(measure): add planar trunk lean, hip height and body-scale primitives"
```

---

### Task 3: Derive calibration thresholds from the corpus

Before writing the calibration gate, measure what "standing still" actually
looks like in this user's data. **Do not guess these numbers.**

**Files:**
- Create: `src/pose/planar-measures.corpus.test.ts` (first half)

- [ ] **Step 1: Measure take 1**

```bash
node --experimental-strip-types -e '
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync(".claude-test-artifacts/corpus-01-standing.json","utf8")).raw;
const ar = raw.videoWidth / raw.videoHeight;
const samples = raw.frames.filter(f => f.lm).map(f => {
  const mid = (a,b) => ({ x: (a[0]+b[0])/2, y: (a[1]+b[1])/2 });
  const s = mid(f.lm[0], f.lm[1]), h = mid(f.lm[2], f.lm[3]);
  const dx = (h.x - s.x) * ar, dy = h.y - s.y;
  return { lean: Math.atan2(dx,dy)*180/Math.PI, hipY: h.y, len: Math.hypot(dx,dy) };
});
const stats = (xs) => {
  const m = xs.reduce((a,b)=>a+b,0)/xs.length;
  const sd = Math.sqrt(xs.reduce((a,b)=>a+(b-m)**2,0)/xs.length);
  const s = [...xs].sort((a,b)=>a-b);
  return { mean:+m.toFixed(5), sd:+sd.toFixed(5), min:+s[0].toFixed(5), max:+s[s.length-1].toFixed(5) };
};
console.log("n", samples.length);
console.log("lean     ", stats(samples.map(s=>s.lean)));
console.log("hipY     ", stats(samples.map(s=>s.hipY)));
console.log("trunkLen ", stats(samples.map(s=>s.len)));
' 2>/dev/null || echo "If --experimental-strip-types is unavailable, save the script to the scratchpad as a .mjs file and run it with plain node."
```

- [ ] **Step 2: Write the thresholds down**

Record the printed standard deviations in
`docs/superpowers/plans/2026-07-28-measurement-rebuild/corpus-manifest.md` under
a new "Calibration thresholds" heading, along with the values you derive:

- `MAX_HIP_Y_STDDEV` — set to roughly **3×** the standing hip-Y standard
  deviation. Tight enough to reject a set starting mid-motion, loose enough that
  ordinary sway does not block recording forever.
- `MAX_TRUNK_LENGTH_STDDEV_FRACTION` — 3× the standing trunk-length standard
  deviation, expressed as a fraction of the mean.
- `CALIBRATION_WINDOW_FRAMES` — **90** (1.5s at 60fps) unless the take shows
  the user needs longer to settle.

If standing hip-Y standard deviation comes back above ~0.01, stop. That means
the tool cannot distinguish standing from moving in this setup, and the depth
measure has no floor to sit on. Report it rather than choosing a threshold that
papers over it.

- [ ] **Step 3: Commit the manifest update**

```bash
git add docs/superpowers/plans/2026-07-28-measurement-rebuild/corpus-manifest.md
git commit -m "docs(corpus): record measured calibration thresholds from take 1"
```

---

### Task 4: Calibration

**Files:**
- Create: `src/form-checker/calibration.ts`
- Test: `src/form-checker/calibration.test.ts`

**Interfaces:**
- Consumes: `TrunkSample` (Task 2).
- Produces:
  - `export interface Baseline { hipY: number; trunkLength: number; leanDegrees: number; frameCount: number }`
  - `export interface CalibrationState { ready: boolean; baseline: Baseline | null; message: string }`
  - `export function assessCalibration(window: (TrunkSample | null)[]): CalibrationState`
  - `export function depthRatio(sample: TrunkSample, baseline: Baseline): number`
  - `export function leanDelta(sample: TrunkSample, baseline: Baseline): number`

  Phase 3 consumes `depthRatio`. Phase 4 consumes `Baseline` and
  `CalibrationState`.

**Why calibration is required before every set** — a locked product decision.
Baseline subtraction is what makes these measures robust: it cancels camera
roll, camera tilt, laptop lid angle, individual postural set, and constant
foreshortening from being slightly off pure profile. It is also exactly the
"unusual for you" model the product already committed to. Without a baseline
there are no honest numbers, so the tool must refuse to record rather than
produce dishonest ones.

- [ ] **Step 1: Write the failing test**

Create `src/form-checker/calibration.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { assessCalibration, depthRatio, leanDelta } from "./calibration";
import type { TrunkSample } from "../pose/planar-measures";

function still(count: number, overrides: Partial<TrunkSample> = {}): TrunkSample[] {
  return Array.from({ length: count }, () => ({
    leanDegrees: 2,
    hipY: 0.5,
    trunkLength: 0.3,
    minVisibility: 0.99,
    ...overrides
  }));
}

describe("assessCalibration", () => {
  test("is not ready before the window is full", () => {
    const state = assessCalibration(still(30));

    expect(state.ready).toBe(false);
    expect(state.baseline).toBeNull();
  });

  test("produces a baseline from a full window of stillness", () => {
    const state = assessCalibration(still(90));

    expect(state.ready).toBe(true);
    expect(state.baseline).toEqual({
      hipY: 0.5,
      trunkLength: 0.3,
      leanDegrees: 2,
      frameCount: 90
    });
  });

  test("refuses when the hips are still moving", () => {
    const moving = still(90).map((s, i) => ({ ...s, hipY: 0.5 + i * 0.002 }));

    expect(assessCalibration(moving).ready).toBe(false);
  });

  test("refuses when a frame in the window had no pose", () => {
    const gappy: (TrunkSample | null)[] = still(90);
    gappy[45] = null;

    expect(assessCalibration(gappy).ready).toBe(false);
  });

  test("refuses when trunk landmarks are poorly tracked", () => {
    expect(assessCalibration(still(90, { minVisibility: 0.3 })).ready).toBe(false);
  });

  test("explains what is wrong rather than just refusing", () => {
    const state = assessCalibration(still(90, { minVisibility: 0.3 }));

    expect(state.message.length).toBeGreaterThan(0);
    expect(state.message).not.toMatch(/\d+(\.\d+)?\s*(deg|°)/);
  });

  test("uses the median so one bad frame cannot move the baseline", () => {
    const window = still(90);
    window[10] = { ...window[10], hipY: 0.9 };
    const state = assessCalibration(window);

    // Still refuses (that frame breaks the stability check), but if the
    // stability check is ever relaxed the median must hold the line.
    const relaxed = assessCalibration(still(90).map((s, i) => (i === 10 ? { ...s, hipY: 0.502 } : s)));
    expect(relaxed.baseline!.hipY).toBe(0.5);
    expect(state.ready).toBe(false);
  });
});

describe("depthRatio", () => {
  const baseline = { hipY: 0.5, trunkLength: 0.3, leanDegrees: 2, frameCount: 90 };

  test("is zero at the baseline", () => {
    expect(depthRatio({ ...baseline, minVisibility: 1, leanDegrees: 2 } as TrunkSample, baseline)).toBe(0);
  });

  test("grows positive as the hips drop, scaled by the user's own trunk", () => {
    const descended = { leanDegrees: 2, hipY: 0.65, trunkLength: 0.3, minVisibility: 1 };

    expect(depthRatio(descended, baseline)).toBeCloseTo(0.5, 6);
  });

  test("is negative if the hips rise above the baseline", () => {
    const risen = { leanDegrees: 2, hipY: 0.44, trunkLength: 0.3, minVisibility: 1 };

    expect(depthRatio(risen, baseline)).toBeLessThan(0);
  });
});

describe("leanDelta", () => {
  const baseline = { hipY: 0.5, trunkLength: 0.3, leanDegrees: 2, frameCount: 90 };

  test("is zero at the baseline posture, whatever the absolute angle was", () => {
    expect(leanDelta({ leanDegrees: 2, hipY: 0.5, trunkLength: 0.3, minVisibility: 1 }, baseline)).toBe(0);
  });

  test("reports the change from the user's own standing posture", () => {
    expect(leanDelta({ leanDegrees: 14, hipY: 0.5, trunkLength: 0.3, minVisibility: 1 }, baseline)).toBe(12);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -- calibration
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

Create `src/form-checker/calibration.ts`. **Substitute the three threshold
constants with the values measured in Task 3** — the numbers below are the shape
of the code, not the values.

```typescript
import type { TrunkSample } from "../pose/planar-measures";

/**
 * The user's own standing reference, established immediately before a set.
 *
 * Baseline subtraction is what makes the planar measures trustworthy: it
 * cancels camera roll, camera tilt, lid angle, individual postural set, and
 * constant foreshortening from being off pure profile. It is also the
 * "unusual for you" model the product committed to. Without one there are no
 * honest numbers, so the tool refuses to record rather than produce dishonest
 * ones.
 */
export interface Baseline {
  hipY: number;
  trunkLength: number;
  leanDegrees: number;
  frameCount: number;
}

export interface CalibrationState {
  ready: boolean;
  baseline: Baseline | null;
  /** User-facing. Says what to change, never an absolute angle. */
  message: string;
}

/** 1.5s at 60fps. Long enough to reject a set started mid-motion. */
const CALIBRATION_WINDOW_FRAMES = 90;

// TASK 3: replace both with 3x the standing standard deviations measured from
// corpus-01-standing.json, and record the source numbers in corpus-manifest.md.
const MAX_HIP_Y_STDDEV = 0.004;
const MAX_TRUNK_LENGTH_STDDEV_FRACTION = 0.02;

/**
 * Minimum trunk-landmark visibility during calibration. Higher than the 0.5
 * used for per-frame grading: a baseline is measured once and everything else
 * is relative to it, so a bad baseline poisons the whole set.
 */
const MIN_CALIBRATION_VISIBILITY = 0.6;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdDev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

export function assessCalibration(window: (TrunkSample | null)[]): CalibrationState {
  if (window.length < CALIBRATION_WINDOW_FRAMES) {
    return { ready: false, baseline: null, message: "Hold still — measuring your standing position." };
  }

  const recent = window.slice(-CALIBRATION_WINDOW_FRAMES);
  if (recent.some((s) => s === null)) {
    return { ready: false, baseline: null, message: "Step fully into frame, side-on to the camera." };
  }

  const samples = recent as TrunkSample[];

  if (samples.some((s) => s.minVisibility < MIN_CALIBRATION_VISIBILITY)) {
    return {
      ready: false,
      baseline: null,
      message: "Can't see your shoulders and hips clearly enough. Move so your whole torso is in frame."
    };
  }

  const hipYs = samples.map((s) => s.hipY);
  const trunkLengths = samples.map((s) => s.trunkLength);

  if (stdDev(hipYs) > MAX_HIP_Y_STDDEV) {
    return { ready: false, baseline: null, message: "Still moving — stand up straight and hold still." };
  }

  if (stdDev(trunkLengths) / median(trunkLengths) > MAX_TRUNK_LENGTH_STDDEV_FRACTION) {
    return {
      ready: false,
      baseline: null,
      message: "Tracking is unsteady — check the lighting and that you're side-on to the camera."
    };
  }

  // Median rather than mean throughout: one bad frame inside an otherwise
  // stable window must not shift the reference everything else is measured
  // against.
  return {
    ready: true,
    baseline: {
      hipY: median(hipYs),
      trunkLength: median(trunkLengths),
      leanDegrees: median(samples.map((s) => s.leanDegrees)),
      frameCount: CALIBRATION_WINDOW_FRAMES
    },
    message: "Calibrated. Press space to start your set."
  };
}

/**
 * How far the hips have dropped below the standing baseline, in units of the
 * user's own trunk length. ~0 standing, growing positive with descent.
 *
 * Unitless by construction, so it is comparable across sessions and across
 * distances from the camera without ever being an absolute measurement of
 * anything. It is a PROXY for squat depth, not a depth measurement, and not any
 * kind of statement about the spine.
 */
export function depthRatio(sample: TrunkSample, baseline: Baseline): number {
  return (sample.hipY - baseline.hipY) / baseline.trunkLength;
}

/** Change in trunk angle from the user's own standing posture, in degrees. */
export function leanDelta(sample: TrunkSample, baseline: Baseline): number {
  return sample.leanDegrees - baseline.leanDegrees;
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npm test -- calibration
```

Expected: PASS. If the stability tests fail, the Task 3 thresholds are too tight
or too loose for the synthetic fixtures — adjust the **fixtures** to match the
real measured numbers, not the thresholds to match the fixtures.

- [ ] **Step 5: Commit**

```bash
git add src/form-checker/calibration.ts src/form-checker/calibration.test.ts
git commit -m "feat(measure): add per-set calibration and baseline-relative measures"
```

---

### Task 5: Validate both measures against the corpus

The test that decides whether this phase worked. Synthetic tests confirm the
arithmetic; only the corpus confirms the measures track a real body.

**Files:**
- Create: `src/pose/planar-measures.corpus.test.ts`

**Interfaces:**
- Consumes: `loadCorpus`, `CORPUS_TAKES` (Task 1), `trunkSample` (Task 2),
  `assessCalibration`, `depthRatio` (Task 4).

- [ ] **Step 1: Write the corpus test**

Create `src/pose/planar-measures.corpus.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { loadCorpus, CORPUS_TAKES } from "../../tests/corpus";
import { trunkSample, type TrunkSample } from "./planar-measures";
import { assessCalibration, depthRatio } from "../form-checker/calibration";

function samplesFor(name: string): (TrunkSample | null)[] {
  const corpus = loadCorpus(name);
  return corpus.frames.map((f) => (f.lm ? trunkSample(f.lm, corpus.aspectRatio) : null));
}

describe("planar measures against the real corpus", () => {
  test.each(CORPUS_TAKES)("$name yields trunk samples on nearly every frame", ({ name }) => {
    const samples = samplesFor(name);
    const measured = samples.filter((s) => s !== null).length;

    // The whole design rests on shoulder and hip tracking where the legs do not.
    // If this fails, the leg-free premise does not hold and Phase 3 must not
    // proceed on it.
    expect(measured / samples.length).toBeGreaterThan(0.95);
  });

  test("every take calibrates from its opening window", () => {
    for (const { name } of CORPUS_TAKES) {
      const state = assessCalibration(samplesFor(name).slice(0, 120));
      expect(state.ready, `${name} failed to calibrate: ${state.message}`).toBe(true);
    }
  });

  test("standing still produces a depth signal that never leaves the noise floor", () => {
    const samples = samplesFor("corpus-01-standing");
    const baseline = assessCalibration(samples.slice(0, 120)).baseline!;
    const depths = samples.filter((s): s is TrunkSample => s !== null).map((s) => depthRatio(s, baseline));

    // The negative control. A measure that reports descent here is the same
    // class of defect as the rep count that fabricated 2 reps from this pose.
    expect(Math.max(...depths)).toBeLessThan(0.1);
  });

  test("squatting takes produce a depth signal well clear of the standing floor", () => {
    for (const name of ["corpus-02-five-slow", "corpus-03-five-normal", "corpus-05-degrading"]) {
      const samples = samplesFor(name);
      const baseline = assessCalibration(samples.slice(0, 120)).baseline!;
      const depths = samples.filter((s): s is TrunkSample => s !== null).map((s) => depthRatio(s, baseline));

      expect(Math.max(...depths), `${name} showed no descent`).toBeGreaterThan(0.3);
    }
  });

  test("shallow squats sit between standing and full depth", () => {
    const shallow = samplesFor("corpus-04-shallow");
    const full = samplesFor("corpus-02-five-slow");
    const peak = (samples: (TrunkSample | null)[]) => {
      const baseline = assessCalibration(samples.slice(0, 120)).baseline!;
      return Math.max(...samples.filter((s): s is TrunkSample => s !== null).map((s) => depthRatio(s, baseline)));
    };

    expect(peak(shallow)).toBeGreaterThan(0.1);
    expect(peak(shallow)).toBeLessThan(peak(full));
  });
});
```

- [ ] **Step 2: Run it**

```bash
npm test -- planar-measures.corpus
```

**Read the failures carefully rather than adjusting numbers to make them
green.** The specific thresholds (0.95, 0.1, 0.3) are first estimates. If real
peak depth for a full squat comes in at 0.28 rather than 0.3, that is a fine
reason to change the constant — record the measured value in the manifest and
say so in the commit. If standing depth exceeds 0.1, that is **not** a threshold
problem; it means the measure or the baseline is wrong, and Phase 3 must not
proceed until it is understood.

- [ ] **Step 3: Answer the drift question**

```bash
npm test -- planar-measures.corpus
node -e '/* print depthRatio over corpus-06-drift, before and after the step */'
```

Take 6 is the one where the user stepped toward the camera mid-set. Compare peak
depth for reps 1–2 against reps 3–5 using a session-global baseline. If they
differ by more than about 20%, the session-global baseline is inadequate and
Phase 3 must use a **rolling baseline** instead — the 10th percentile of hip Y
(hip Y grows downward, so the 10th percentile is the *highest* hip position) over
a trailing ~10s window. Record the answer in the manifest under "Drift finding";
Phase 3 reads it.

- [ ] **Step 4: Commit**

```bash
git add src/pose/planar-measures.corpus.test.ts docs/superpowers/plans/2026-07-28-measurement-rebuild/corpus-manifest.md
git commit -m "test(measure): validate planar measures against the capture corpus"
```

---

## Done criteria

- [ ] `npm test` passes with zero failures.
- [ ] Trunk samples are produced on >95% of frames in all six takes.
- [ ] All six takes calibrate from their opening window.
- [ ] Standing depth stays under the noise floor; squatting depth clears it.
- [ ] The drift question is answered in writing in `corpus-manifest.md`.
- [ ] Every threshold constant carries a comment naming the take it came from.

## What this phase deliberately does NOT do

- Does not segment reps. Phase 3.
- Does not gate on confidence at rep level. Phase 4.
- Does not touch the UI, the copy, or the session-end summary. Phase 5.
- Does not remove the knee-angle path. It stays until Phase 3 replaces it, so
  the two can be compared on the same takes.

## Open risk carried into Phase 3

**No deviation signal.** The product flags a rep that looks unlike the user's
others. If their reps are near-identical, there is nothing to flag. This was
raised in the original design interview, is still open, and is first testable in
Phase 3 against `corpus-05-degrading` — the take where the last three reps were
deliberately worse. If the drift measure cannot separate those three from the
first five, the flagging feature does not work and the product needs rethinking
before Phase 5 builds UI on it.

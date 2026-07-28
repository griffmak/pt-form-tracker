# Phase 1 — Raw-Landmark Instrumentation and Capture Corpus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record raw normalized 2D landmarks to disk, then capture a corpus of
six labelled takes that Phases 2, 3 and 4 validate against.

**Architecture:** Extend the existing dev-only artifact bridge to dump a
per-frame raw landmark series alongside the diagnostics it already writes. Then
run six scripted takes in front of the camera, archiving each to a tracked file
with a known ground-truth rep count.

**Tech Stack:** TypeScript, Vite dev server, MediaPipe Tasks Vision, a webcam,
and about 20 minutes of standing in front of it.

**Model:** Sonnet. Every mistake in this phase is immediately visible — either
the file lands on disk with the right shape or it does not.

**On camera: YES.** This is the only phase that requires the user to physically
record. Budget 60–90 minutes total: ~30 for the instrumentation, ~30 for the
takes, ~15 for verification.

---

## Context you need — this document is self-contained

**The tool.** `pt-form-tracker` is a browser-only squat form checker. Webcam →
MediaPipe Pose Landmarker running in-page → deterministic geometry → on-screen
feedback. Vite + TypeScript. `npm test` runs vitest, `npm run dev` starts the
dev server.

**Who it's for.** One user, rehabbing a **spinal disc injury**. The tool is a
spotter, not a judge. It is not a clinical instrument and must never claim
anything about the spine, the disc, back safety, or injury risk.

**HARD CONSTRAINT — no runtime AI, ever.** No Claude SDK, no API call, no LLM,
no remote inference at runtime. The product rests on "nothing leaves your
browser," stated in the README and on screen. Agents belong at development time
only.

**Branch:** `measurement-rebuild`.
**Design spec:** `docs/superpowers/specs/2026-07-28-measurement-rebuild-design.md`.

### Why this phase exists and cannot be skipped

The measurement rebuild replaces knee-angle-based grading with two measures
computed from **normalized 2D landmarks**: trunk lean against image vertical,
and hip depth against a standing baseline. Neither can be built or validated
without raw landmark data, and the codebase has none.

Grepping `src/` for normalized-landmark use returns exactly one hit —
`src/render/live-overlay.ts:22`, which reads `poseResult.landmarks[0]` only to
draw the skeleton. Nothing measures from 2D and nothing persists it.

The four captures already in `.claude-test-artifacts/` store **computed angles
only**. They were enough to diagnose the defects — and they did, conclusively —
but they cannot validate a replacement measure, because the replacement is
computed from inputs those files do not contain.

### Why 2D and not worldLandmarks

MediaPipe exposes `landmarks` (normalized 2D, image space) and `worldLandmarks`
(metric 3D). A stored lesson from 2026-07-25 says angle math should always use
`worldLandmarks`. **That lesson is narrowed, not overturned** — worldLandmarks
stay correct for viewpoint-robust interior joint angles. The new planar
measures need image space for three specific reasons:

- There is no gravity reference in a desktop browser, so neither space gives a
  true vertical. "Vertical" means camera-vertical either way, and baseline
  subtraction cancels camera roll and tilt.
- worldLandmark axis orientation is undocumented — the upstream question
  (mediapipe#3370) has been unanswered since 2022. Image space has a documented
  convention.
- worldLandmarks are a separately-regressed 3D lift, and a side-on view is its
  worst case. In side view the sagittal plane approximately *is* the image
  plane, so lean is directly imaged in 2D. Adding an inferred z can only add
  noise.

There is also a structural trap worth knowing: **worldLandmark origin is the
hip midpoint**, so hip vertical travel is identically zero in that space. Depth
must be measured in image space.

### What the data says about which joints to trust

From `session-2026-07-28-standing-test.json` — 1554 frames, per-joint
visibility recorded. A body was detected on **1554/1554 frames with zero gaps**;
the camera never loses the subject.

Fraction of frames with visibility ≥ 0.5:

| joint | landmark | 2026-07-27 | 2026-07-28 |
|---|---|---|---|
| shoulder | 11 | ~100% | 100% |
| hip | 23 | ~100% | 99% |
| knee | 25 | ≥98% (inferred) | **59%** |
| ankle | 27 | ~24% (inferred) | 86% |

**No capture has ever tracked both legs well. Every capture has tracked
shoulder and hip near-perfectly.** Which leg joint fails varies by session for
reasons still unidentified. This is why the new design is leg-free — and why
this phase records the legs anyway, so the contingent "does the design need a
leg after all" question can be answered from data rather than re-recorded.

---

## Global Constraints

- **No runtime AI, API, LLM, or remote inference.**
- **No new dependencies.**
- The raw dump is **dev-only**. `postTestArtifact` in `src/main.ts:54` already
  early-returns unless `import.meta.env.DEV`; the new payload goes through that
  same function and inherits the guard. Verify this — a production build that
  ships raw landmark serialization would be a real regression against the
  privacy claim even though nothing is transmitted.
- The artifact bridge is a **dev-only Vite plugin** (`apply: "serve"` in
  `vite.config.ts:10`). It only writes from `npm run dev` on localhost. A
  deployed URL leaves no artifact, by design.
- `.claude-test-artifacts/latest.json` is **gitignored and overwritten by every
  session**. Only `session-*.json` files are tracked. Archive immediately after
  each take or you will lose it — one capture was already lost this way.
- Recording only starts when the user presses **space**, and ends on **`e`**.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/pose/landmark-recording.ts` | Create | Pure serialization of a landmark frame into the compact stored shape. Testable without a browser. |
| `src/pose/landmark-recording.test.ts` | Create | Unit tests for the serializer. |
| `src/main.ts` | Modify | Collect raw frames during recording; add them to the artifact payload. |
| `.claude-test-artifacts/corpus-*.json` | Create ×6 | The corpus. Tracked in git. |
| `docs/superpowers/plans/2026-07-28-measurement-rebuild/corpus-manifest.md` | Create | Ground truth for each take: rep count, conditions, what it is for. |
| `.gitignore` | Modify | Track `corpus-*.json` alongside `session-*.json`. |

---

### Task 1: The landmark serializer

A pure function that turns a MediaPipe landmark array into the compact stored
form. Split out from `main.ts` so it can be tested without a camera.

**Files:**
- Create: `src/pose/landmark-recording.ts`
- Test: `src/pose/landmark-recording.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export const RECORDED_LANDMARK_INDICES: number[]`
  - `export interface RecordedFrame { t: number; lm: number[][] | null }`
  - `export function serializeLandmarks(landmarks: NormalizedLandmarkLike[] | undefined, t: number): RecordedFrame`
  - `export interface NormalizedLandmarkLike { x: number; y: number; z: number; visibility: number }`

  Phase 2 reads these files back and must know the tuple order: `[x, y, z, visibility]`.

**Storage shape and why.** Each frame stores a flat `[x, y, z, visibility]`
tuple per landmark, rounded to 4 decimal places, for 8 landmarks rather than all
33. Normalized coordinates live in roughly `[0,1]`, so 4 decimals is finer than
a pixel on a 2938px-wide capture. Full precision across all 33 landmarks would
put a 1500-frame take well past 10MB; this keeps it near 400KB, which is
reasonable to track in git and is why the corpus can be committed at all.

- [ ] **Step 1: Write the failing test**

Create `src/pose/landmark-recording.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -- landmark-recording
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement the serializer**

Create `src/pose/landmark-recording.ts`:

```typescript
/**
 * Compact on-disk form for raw normalized landmarks, dumped during dev sessions
 * so measurement changes can be replayed against real capture.
 *
 * Only the trunk and leg landmarks are stored, at 4 decimal places. Normalized
 * coordinates sit in roughly [0,1], so 4dp is finer than a pixel on a 2938px
 * capture, while storing all 33 landmarks at full precision would push a
 * 1500-frame take past 10MB and make the corpus impractical to track in git.
 */

export interface NormalizedLandmarkLike {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

/** [x, y, z, visibility] per landmark, in RECORDED_LANDMARK_INDICES order. */
export interface RecordedFrame {
  t: number;
  lm: number[][] | null;
}

/**
 * Shoulders and hips carry the new trunk and depth measures. Knees and ankles
 * are recorded too, not because the design uses them, but so the "does the
 * leg-free design need a leg after all" question can be answered from this
 * corpus instead of another on-camera session.
 */
export const RECORDED_LANDMARK_INDICES = [11, 12, 23, 24, 25, 26, 27, 28];

const DECIMALS = 4;
const SCALE = 10 ** DECIMALS;

function round(value: number): number {
  return Math.round(value * SCALE) / SCALE;
}

export function serializeLandmarks(
  landmarks: NormalizedLandmarkLike[] | undefined,
  t: number
): RecordedFrame {
  if (!landmarks) return { t, lm: null };

  const lm: number[][] = [];
  for (const index of RECORDED_LANDMARK_INDICES) {
    const point = landmarks[index];
    // A truncated result must not kill the recording loop mid-set.
    if (!point) return { t, lm: null };
    lm.push([round(point.x), round(point.y), round(point.z), round(point.visibility)]);
  }
  return { t, lm };
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npm test -- landmark-recording
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pose/landmark-recording.ts src/pose/landmark-recording.test.ts
git commit -m "feat(capture): add compact raw-landmark serializer"
```

---

### Task 2: Wire raw recording into the session

**Files:**
- Modify: `src/main.ts` — the engine callback around line 124, and the artifact
  payload around line 200.

**Interfaces:**
- Consumes: `serializeLandmarks`, `RECORDED_LANDMARK_INDICES` (Task 1).
- Produces: a new top-level `raw` key in the artifact payload:

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

Phase 2 reads exactly this shape. `videoWidth` and `videoHeight` are
**required** — the aspect ratio is needed to compute trunk lean correctly, and
without it the measure is overstated by ~1.78× on a 16:9 feed.

**Important structural fact about `main.ts`.** Frames are currently only stored
when `frameResult && landmarks` (`src/main.ts:141`), so a frame with no
detected pose is never stored at all. The raw recording must sit **outside**
that guard, next to the existing `tracking.push` call, so that "no pose this
frame" is recorded as `lm: null` rather than vanishing from the series. A gap in
a series that silently omits frames is unreadable — that ambiguity cost a full
diagnostic round already.

- [ ] **Step 1: Add the imports and the buffer**

At the top of `src/main.ts`, add to the imports:

```typescript
import { serializeLandmarks, RECORDED_LANDMARK_INDICES } from "./pose/landmark-recording";
import type { RecordedFrame } from "./pose/landmark-recording";
```

Immediately after the `const tracking: ...` declaration (around line 113), add:

```typescript
  // Raw normalized 2D landmarks, kept so the planar trunk and depth measures
  // can be developed and validated against real capture rather than synthetic
  // fixtures. Recorded outside the "was this frame graded" guard below, so a
  // frame with no detected pose appears as lm: null instead of vanishing.
  const rawFrames: RecordedFrame[] = [];
```

- [ ] **Step 2: Record each frame**

In the `engine.start` callback, the `landmarks` variable currently holds
**world** landmarks (`result.worldLandmarks[0]`). The raw dump needs the
**normalized** ones. Add immediately after the existing `tracking.push({...})`
block:

```typescript
    rawFrames.push(serializeLandmarks(result.landmarks[0], Date.now()));
```

Note `result.landmarks`, not `result.worldLandmarks`. Getting this wrong
produces a plausible-looking file of the wrong coordinate space, and nothing
downstream would flag it — Task 4's verification exists specifically to catch
this.

- [ ] **Step 3: Add it to the artifact payload**

In the `"e"` keydown handler, extend the `postTestArtifact({...})` call with:

```typescript
      raw: {
        landmarkIndices: RECORDED_LANDMARK_INDICES,
        tupleOrder: ["x", "y", "z", "visibility"],
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        frames: rawFrames
      },
```

Leave every existing key (`timestamp`, `exerciseId`, `frameCount`, `summary`,
`ruleStats`, `angleSeries`, `tracking`, `errors`) in place. Phase 3 cross-checks
the new depth signal against the old knee series from the same take, which only
works if both are in the same file.

- [ ] **Step 4: Verify the production guard still holds**

```bash
npm run build
grep -c "landmarkIndices" dist/assets/*.js
```

Expected: the string may appear (the code is bundled), but confirm by reading
`src/main.ts:54` that `postTestArtifact` still early-returns on
`!import.meta.env.DEV`. Nothing is transmitted in production. Note this
explicitly in the commit message.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat(capture): dump raw normalized landmarks in dev sessions"
```

---

### Task 3: Track corpus files in git

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Extend the allowlist**

`.gitignore` currently reads:

```
.claude-test-artifacts/*
!.claude-test-artifacts/session-*.json
```

Add a second negation so corpus takes are tracked too:

```
!.claude-test-artifacts/corpus-*.json
```

- [ ] **Step 2: Verify latest.json is still ignored**

```bash
git check-ignore -v .claude-test-artifacts/latest.json
```

Expected: prints the matching `.gitignore` rule. If it prints nothing,
`latest.json` would get committed and overwritten on every dev session — stop
and fix the pattern before continuing.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore(artifacts): track corpus captures alongside session captures"
```

---

### Task 4: Record the corpus

This is the on-camera work. **Read the whole task before starting the dev
server** — the takes are quicker to do in one sitting than to re-set-up.

**Files:**
- Create: `.claude-test-artifacts/corpus-01-standing.json` … `corpus-06-drift.json`
- Create: `docs/superpowers/plans/2026-07-28-measurement-rebuild/corpus-manifest.md`

**Setup, held constant across all six takes.** Do not move the camera or change
the lighting between takes. Differences between takes must come from the
movement, not the setup, or the corpus cannot separate the two.

- Side-on to the camera, whole body in frame.
- Same position as the previous captures — roughly where you stood for the
  2026-07-28 demo. Do not move further back; the 2026-07-27 session tracked
  better and was closer.
- Note the room lighting and time of day in the manifest.

**The takes.**

| # | File | What to do | Ground truth | Why it exists |
|---|---|---|---|---|
| 1 | `corpus-01-standing.json` | Stand still, 30s. Do not shift weight. | **0 reps** | The negative control. Any measure that reports movement here is wrong. This is the take that caught the fabrication. |
| 2 | `corpus-02-five-slow.json` | 5 slow, controlled squats to a comfortable depth. Pause ~1s at the bottom of each. | **5 reps** | The clean positive case. Segmentation must find exactly 5. |
| 3 | `corpus-03-five-normal.json` | 5 squats at your normal tempo, no pause. | **5 reps** | Tests the duration floor and hysteresis against a realistic tempo. |
| 4 | `corpus-04-shallow.json` | 5 deliberately shallow quarter squats. | **5 reps** | Tests the minimum-depth threshold. If these read as 0 reps, the threshold is too strict; Phase 3 derives it from this take. |
| 5 | `corpus-05-degrading.json` | 8 squats where the **last three are deliberately worse** — more forward lean, shallower. | **8 reps, degradation in the last 3** | The within-set drift measure is validated against this. It is the tool's most trustworthy planned output, and this is the only take that can prove it works. |
| 6 | `corpus-06-drift.json` | 5 squats, but **take one step toward the camera** after rep 2 and stay there. | **5 reps** | The named risk: hip travel against a session baseline drifts if you move. This take decides whether Phase 2 needs a rolling baseline or a session-global one. |

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Open the printed localhost URL and grant camera access. Wait for the skeleton
overlay to appear before starting take 1.

- [ ] **Step 2: Record take 1**

Get into position. Watch the framing readout until it stops saying joints are
missing — or note what it says if it never does, because that itself is data.
Press **space** to start recording. Do the take. Press **`e`** to end.

- [ ] **Step 3: Archive take 1 immediately, before recording take 2**

```bash
cp .claude-test-artifacts/latest.json .claude-test-artifacts/corpus-01-standing.json
```

**Do not skip this.** `latest.json` is overwritten by the next session. A
capture was already lost to exactly this mistake.

- [ ] **Step 4: Repeat steps 2–3 for takes 2 through 6**

Archive after each one, to the filename in the table above. Reload the page
between takes — the session ends when you press `e` and the camera stops.

- [ ] **Step 5: Verify every file before leaving the camera**

```bash
node -e '
for (const f of ["corpus-01-standing","corpus-02-five-slow","corpus-03-five-normal","corpus-04-shallow","corpus-05-degrading","corpus-06-drift"]) {
  const j = require("./.claude-test-artifacts/" + f + ".json");
  const raw = j.raw;
  const posed = raw.frames.filter(fr => fr.lm !== null).length;
  const hipVisible = raw.frames.filter(fr => fr.lm && fr.lm[2][3] >= 0.5).length;
  const shoulderVisible = raw.frames.filter(fr => fr.lm && fr.lm[0][3] >= 0.5).length;
  const ys = raw.frames.filter(fr => fr.lm).map(fr => fr.lm[2][1]);
  console.log(
    f.padEnd(24),
    "frames=" + raw.frames.length,
    "posed=" + posed,
    "shoulder>=0.5=" + shoulderVisible,
    "hip>=0.5=" + hipVisible,
    "hipY range=" + (Math.max(...ys) - Math.min(...ys)).toFixed(3),
    "video=" + raw.videoWidth + "x" + raw.videoHeight
  );
}'
```

**What good looks like, and what to do if it is not:**

- `frames` in the high hundreds or low thousands for a 30s take at 60fps. Far
  fewer means the browser was throttling — check the tab was focused.
- `posed` close to `frames`. The previous captures detected a pose on 100% of
  frames; a large gap here means something changed in the setup.
- `shoulder>=0.5` and `hip>=0.5` both above ~95%. **These two are what the whole
  rebuild depends on.** If either is low, stop — the leg-free design's core
  assumption does not hold in this setup, and that is a finding worth reporting
  before Phase 2 is built on it.
- `hipY range` near **0** for take 1, and clearly non-zero (roughly 0.05–0.2)
  for takes 2–6. If take 1 shows real hip movement, you moved; re-record it.
  If takes 2–6 show no hip movement, the depth signal does not exist in this
  data and Phase 2 needs to know immediately.
- `video` should be identical across all six.

- [ ] **Step 6: Write the manifest**

Create `docs/superpowers/plans/2026-07-28-measurement-rebuild/corpus-manifest.md`
with a row per take: filename, ground-truth rep count, what was done, the
verification numbers printed in Step 5, plus the date, room, lighting and camera
position. Note anything that felt off during a take — a stumble, a pause, a
moment out of frame. Phases 2–4 will interpret anomalies in this data and the
manifest is the only record of whether an anomaly was real.

- [ ] **Step 7: Commit**

```bash
git add .claude-test-artifacts/corpus-*.json docs/superpowers/plans/2026-07-28-measurement-rebuild/corpus-manifest.md
git commit -m "feat(corpus): record six labelled capture takes for the measurement rebuild"
```

---

## Done criteria

- [ ] `npm test` passes.
- [ ] Six `corpus-*.json` files exist, are tracked in git, and each contains a
      `raw` key with `videoWidth`, `videoHeight` and a per-frame landmark series.
- [ ] Shoulder and hip visibility are both above ~95% in every take.
- [ ] Hip-Y range is near zero in take 1 and clearly non-zero in takes 2–6.
- [ ] `corpus-manifest.md` records ground-truth rep counts and conditions.
- [ ] `latest.json` is still gitignored.

## What this phase deliberately does NOT do

- Does not compute any new measure. Phase 2 does that. Resist the temptation to
  "just check" whether the lean math works while the camera is out — a measure
  written without tests, against data you are still recording, is how the
  current defects got in.
- Does not change grading, rep detection, or any user-facing output.
- Does not swap the pose model or move the camera. Both are contingent
  experiments, run only if Phase 2 or 3 shows the leg-free design needs a leg.

## If something goes wrong on camera

Record what happened in the manifest and keep the take. A failed take is data.
The three sessions on 2026-07-28 that recorded no squat at all are the reason
the per-joint diagnostics exist — a capture that shows the tool failing is worth
more than no capture.

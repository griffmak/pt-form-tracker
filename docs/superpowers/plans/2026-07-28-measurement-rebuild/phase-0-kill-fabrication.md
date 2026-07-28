# Phase 0 — Kill Fabricated Reps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the tool inventing reps out of pose-tracker glitches, and delete
a form rule whose pass band does not match the geometry it computes.

**Architecture:** Three independent guards added to `detectReps` — a kinematic
plausibility filter that nulls physiologically impossible frame-to-frame jumps,
percentile-based calibration so no single frame can set the session's scale, and
a minimum rep duration. Then the `Torso lean` rule is removed from the squat
definition. All changes are pure functions over existing data; nothing about the
capture pipeline or UI changes.

**Tech Stack:** TypeScript, Vite, vitest (jsdom environment), MediaPipe Tasks
Vision.

**Model:** Opus. A subtle error here produces a confident wrong rep count that
looks entirely plausible.

**On camera:** No. Everything is validated by replaying captures already on disk.

---

## Context you need — this document is self-contained

**The tool.** `pt-form-tracker` is a browser-only squat form checker. Webcam →
MediaPipe Pose Landmarker running in-page → deterministic geometry → on-screen
feedback. Vite + TypeScript. `npm test` runs vitest, `npm run dev` starts the
dev server, `npm run build` produces a static bundle.

**Who it's for.** One user, rehabbing a **spinal disc injury**. The tool is a
spotter, not a judge: it watches the current set, flags a rep that looks unlike
their others, and keeps a streak. It is not a clinical instrument and must never
claim anything about the spine, the disc, back safety, or injury risk.

**HARD CONSTRAINT — no runtime AI, ever.** No Claude SDK, no API call, no LLM,
no remote inference at runtime. The product rests on "nothing leaves your
browser," stated in the README and on screen. Rep detection and framing are
deterministic geometry. Agents belong at development time only.

**Branch:** `measurement-rebuild`.
**Design spec:** `docs/superpowers/specs/2026-07-28-measurement-rebuild-design.md`.

### The defect this phase fixes

A diagnostic capture was recorded on 2026-07-28 of the user **standing
perfectly still for 25.9 seconds**. The tool reported `repCount: 2` and
`passRate: 0.5`.

The cause is in the data. Of 767 evaluated knee-angle frames, 20 fall below
140°, clustered at indices 41–45 and 82–88 — all inside the first 1.5 seconds
while the tracker was still converging. Frame 42 reads 141.6°, frame 43 reads
66.6°. That is a 75° change in 1/60s, roughly 4500°/s. A controlled rehab squat
stays under 300–500°/s.

Two things compound:

1. `src/form-checker/rep-detection.ts` calibrates `standingAngle` and
   `deepestAngle` from the raw max and min of the whole series, so **one glitch
   frame sets the scale for the entire session**.
2. `MIN_REP_RANGE_DEGREES = 40` cannot catch this, because the glitch frame is
   what *creates* the >40° range. The guard and the bug share a cause.

The visibility gate did not catch it either — those frames had high visibility.
MediaPipe's `visibility` predicts **non-occlusion, not positional correctness**.
A high-visibility frame can carry a garbage position. This is why the fix has to
be kinematic rather than another confidence threshold.

### The second defect this phase fixes

`src/exercise-library/squat.ts:30-35` defines a `Torso lean` rule with a 45–90°
pass band, documented in the comment above it as degrees **from vertical**. But
the code computes the *interior angle* at the hip over shoulder → hip → knee,
where upright standing is ~170–180°. The band and the geometry disagree.

Observed pass counts:

| capture | torso rule passed / evaluated |
|---|---|
| standing test | 3 / 922 |
| 2026-07-27 | 68 / 815 |
| demo video | 41 / 485 |
| redo2 | 0 / 311 |

In the standing test the only three passes are the glitch frames 43, 45 and 46.
**The tool has been reporting the user's back position as wrong on essentially
every correctly-measured frame, and correct only during tracking artifacts.**
Given the injury is a spinal disc, this is the single most harmful output the
tool produces. It gets deleted rather than retuned — Phase 2 builds a
replacement trunk measure on landmarks that actually track.

There is a third, related defect that this phase does **not** fix: both rules
include landmark 25 (the knee), so knee confidence caps coverage for both,
including the rule meant to say something about the trunk. Deleting the torso
rule removes the coupling as a side effect. The real replacement lands in
Phase 2.

### What has already been verified

The exact algorithm in this plan was prototyped and replayed against all four
captures on disk before this plan was written. These are measured results, not
predictions:

| capture | reps reported today | reps after this phase | correct? |
|---|---|---|---|
| `session-2026-07-28-standing-test.json` | 2 | **0** | yes — the user was standing still |
| `session-2026-07-27-835frames.json` | 2 | **2** | yes — this session had two real squats |
| `session-2026-07-28-demo-video-967frames.json` | 0 | 0 | yes |
| `session-2026-07-28-redo2-1028frames.json` | 0 | 0 | yes |

The fix kills the fabrication **without** killing the one session that contained
real reps. That combination is what makes it trustworthy, and it is why Task 4
pins all four captures rather than just the broken one.

Percentile ranges behind those results, for reference:

| capture | raw min–max range | 5th–95th percentile range |
|---|---|---|
| standing test | 112.5° | **26.4°** (below the 40° floor → no reps) |
| 2026-07-27 | 139.0° | **115.6°** (well above the floor → reps kept) |
| demo video | 22.5° | 14.0° |
| redo2 | 17.0° | 13.8° |

---

## Global Constraints

- **No runtime AI, API, LLM, or remote inference.** Deterministic geometry only.
- **No new dependencies.** Everything here is arithmetic over arrays.
- `detectReps` must stay **pure and synchronous** — it is called from
  `summarizeSession` which runs on the session-end path.
- Angles follow the **interior-joint-angle convention**: 180° = fully extended,
  smaller = deeper bend. A rep's deepest point is its **minimum**.
- `null` in an angle series means "the rule was not evaluated on that frame"
  (landmark visibility too low). Nulls must never end an in-progress rep.
- Absolute joint angles must not be presented to the user as clinical standards.
  That copy work is Phase 5; do not add any new user-facing degree values here.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/form-checker/rep-detection.ts` | Modify | Segment an angle series into reps. Gains percentile calibration, a plausibility filter, and a duration floor. |
| `src/form-checker/rep-detection.test.ts` | Rewrite | Unit tests. Synthetic fixtures must be rewritten to realistic frame rates (see Task 3). |
| `src/form-checker/rep-detection.capture.test.ts` | Create | Regression test that replays all four real captures. |
| `src/exercise-library/squat.ts` | Modify | Delete the `Torso lean` rule. |
| `README.md` | Modify | Remove the torso row from the ranges table. |

---

### Task 1: Percentile calibration

Replace raw min/max calibration with 5th/95th percentiles, so a single glitch
frame can no longer set the scale for the whole session.

**Files:**
- Modify: `src/form-checker/rep-detection.ts:44-56`
- Test: `src/form-checker/rep-detection.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export function percentile(sortedAscending: number[], p: number): number | null`
  — used by Task 4's capture test and referenced in Phase 3.

- [ ] **Step 1: Write the failing test**

Add to `src/form-checker/rep-detection.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { detectReps, percentile } from "./rep-detection";

describe("percentile", () => {
  test("returns null for an empty series", () => {
    expect(percentile([], 0.5)).toBeNull();
  });

  test("returns the single value for a one-element series", () => {
    expect(percentile([42], 0.05)).toBe(42);
  });

  test("interpolates between neighbouring samples", () => {
    // 11 samples, so p=0.05 lands at index 0.5 — halfway between 0 and 10.
    expect(percentile([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.05)).toBe(5);
  });

  test("returns the extremes at p=0 and p=1", () => {
    expect(percentile([1, 2, 3], 0)).toBe(1);
    expect(percentile([1, 2, 3], 1)).toBe(3);
  });
});

describe("detectReps calibration", () => {
  test("ignores a single glitch frame when setting the session scale", () => {
    // 200 frames of standing still at 170deg, with one frame reading 60deg.
    // Raw min/max sees a 110deg range and invents a rep. Percentiles see ~0.
    const standingWithGlitch: number[] = new Array(200).fill(170);
    standingWithGlitch[100] = 60;

    expect(detectReps(standingWithGlitch)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- rep-detection
```

Expected: FAIL. `percentile` is not exported (`SyntaxError` or "does not provide
an export named 'percentile'"), and the glitch test reports 1 rep.

- [ ] **Step 3: Implement percentile calibration**

In `src/form-checker/rep-detection.ts`, add the constants below the existing
`EXIT_FRACTION` declaration:

```typescript
/**
 * Calibration percentiles, replacing the raw max/min this function used to
 * take over the whole series.
 *
 * The 2026-07-28 standing-still capture reported 2 reps from 767 frames of
 * a stationary body, because frame 43 read 66.6deg where frame 42 read 141.6.
 * Raw min/max let that one frame define both ends of the scale, and
 * MIN_REP_RANGE_DEGREES could not catch it because the glitch frame is what
 * created the range. Percentiles make the calibration robust to a small
 * number of arbitrarily wrong frames, which is exactly the failure mode
 * MediaPipe produces while its tracker converges.
 */
const CALIBRATION_LOW_PERCENTILE = 0.05;
const CALIBRATION_HIGH_PERCENTILE = 0.95;

/**
 * Linear-interpolated percentile over an ascending-sorted series.
 * Exported so replay tooling and later phases can calibrate the same way.
 */
export function percentile(sortedAscending: number[], p: number): number | null {
  if (sortedAscending.length === 0) return null;
  const position = (sortedAscending.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedAscending[lower];
  return (
    sortedAscending[lower] +
    (sortedAscending[upper] - sortedAscending[lower]) * (position - lower)
  );
}
```

Then replace the calibration block at the top of `detectReps` (the loop that
computes `standingAngle` and `deepestAngle`, plus the `-Infinity` guard) with:

```typescript
  const sorted = angles.filter((a): a is number => a !== null).sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const standingAngle = percentile(sorted, CALIBRATION_HIGH_PERCENTILE)!;
  const deepestAngle = percentile(sorted, CALIBRATION_LOW_PERCENTILE)!;
```

Leave the `range`, `MIN_REP_RANGE_DEGREES` check, and both threshold
computations exactly as they are.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- rep-detection
```

Expected: the `percentile` and calibration tests PASS. Some pre-existing tests
may still pass at this point; do not fix any that fail until Task 3, which
rewrites the fixtures deliberately.

- [ ] **Step 5: Commit**

```bash
git add src/form-checker/rep-detection.ts src/form-checker/rep-detection.test.ts
git commit -m "fix(reps): calibrate from percentiles so one glitch frame can't set the scale"
```

---

### Task 2: Kinematic plausibility filter

Null out frames whose angle changed faster than a human joint can move. This is
orthogonal to visibility filtering, and it is the only guard that would have
prevented the fabrication on its own.

**Files:**
- Modify: `src/form-checker/rep-detection.ts`
- Test: `src/form-checker/rep-detection.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export function rejectImplausibleJumps(angles: (number | null)[]): (number | null)[]`
  — returns a **new** array, same length, with implausible samples replaced by
  `null`. Phase 3 reuses this shape for the depth signal.

- [ ] **Step 1: Write the failing test**

Append to `src/form-checker/rep-detection.test.ts`:

```typescript
import { rejectImplausibleJumps } from "./rep-detection";

describe("rejectImplausibleJumps", () => {
  test("keeps a physiologically normal descent untouched", () => {
    // ~2.7deg per frame at 60fps — a controlled squat.
    const descent = [170, 167.3, 164.6, 161.9, 159.2, 156.5];

    expect(rejectImplausibleJumps(descent)).toEqual(descent);
  });

  test("nulls a single-frame jump no joint can make", () => {
    // The real 2026-07-28 glitch: 141.6 -> 66.6 in 1/60s, roughly 4500 deg/s.
    const withGlitch = [145.0, 143.0, 141.6, 66.6, 142.0, 141.0];

    expect(rejectImplausibleJumps(withGlitch)).toEqual([
      145.0, 143.0, 141.6, null, 142.0, 141.0
    ]);
  });

  test("nulls a multi-frame glitch burst, not just its first frame", () => {
    // Frames 43-45 of the standing capture were all garbage, not just 43.
    const burst = [141.6, 66.6, 79.8, 73.1, 140.9, 141.2];

    expect(rejectImplausibleJumps(burst)).toEqual([
      141.6, null, null, null, 140.9, 141.2
    ]);
  });

  test("allows a larger change across a longer gap", () => {
    // 5 frames apart is 5x the per-frame budget, so 40deg is plausible.
    const sparse: (number | null)[] = [170, null, null, null, null, 130];

    expect(rejectImplausibleJumps(sparse)).toEqual(sparse);
  });

  test("re-seeds rather than rejecting after a long blind gap", () => {
    // After 40 frames of no measurement the body genuinely could be anywhere.
    // Rejecting here would mean one dropout poisons the rest of the session.
    const longGap: (number | null)[] = [170, ...new Array(40).fill(null), 85];

    expect(rejectImplausibleJumps(longGap)).toEqual(longGap);
  });

  test("does not mutate its input", () => {
    const input = [141.6, 66.6, 142.0];
    rejectImplausibleJumps(input);

    expect(input).toEqual([141.6, 66.6, 142.0]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- rep-detection
```

Expected: FAIL — no export named `rejectImplausibleJumps`.

- [ ] **Step 3: Implement the filter**

Add to `src/form-checker/rep-detection.ts`:

```typescript
/**
 * Maximum plausible change in the signal joint between consecutive frames.
 *
 * At 60fps, 10deg/frame is 600deg/s. A controlled rehab squat stays well under
 * 300-500deg/s, so this leaves headroom for a fast rep while still rejecting
 * the ~4500deg/s glitch observed in the 2026-07-28 standing capture.
 *
 * This is deliberately NOT another visibility threshold. MediaPipe's
 * `visibility` predicts non-occlusion, not positional correctness — the glitch
 * frames that fabricated two reps out of a stationary body all had high
 * visibility. Only a kinematic check catches them.
 */
const MAX_DEGREES_PER_FRAME = 10;

/**
 * Longest measurement gap the filter will reason across. Beyond this the body
 * genuinely could have moved anywhere, so the filter re-seeds from the new
 * sample instead of rejecting it. Without this, one long dropout would poison
 * every remaining frame of the session.
 */
const MAX_BRIDGED_GAP_FRAMES = 30;

/**
 * Replaces physiologically impossible samples with null, leaving the series
 * length and every plausible sample unchanged. Comparison is always against
 * the last *accepted* sample, so a multi-frame glitch burst is rejected in
 * full rather than the filter walking along with it.
 */
export function rejectImplausibleJumps(angles: (number | null)[]): (number | null)[] {
  const out = angles.slice();
  let lastValue: number | null = null;
  let lastIndex = -1;

  for (let i = 0; i < angles.length; i++) {
    const value = angles[i];
    if (value === null) continue;

    const gap = i - lastIndex;
    if (lastValue === null || gap > MAX_BRIDGED_GAP_FRAMES) {
      lastValue = value;
      lastIndex = i;
      continue;
    }

    if (Math.abs(value - lastValue) > gap * MAX_DEGREES_PER_FRAME) {
      out[i] = null;
      continue;
    }

    lastValue = value;
    lastIndex = i;
  }

  return out;
}
```

Then wire it into `detectReps` as its very first statement, and read from the
filtered series everywhere below:

```typescript
export function detectReps(angles: (number | null)[]): Rep[] {
  const cleaned = rejectImplausibleJumps(angles);

  const sorted = cleaned.filter((a): a is number => a !== null).sort((a, b) => a - b);
  // ...calibration from Task 1, unchanged...
```

In the hysteresis loop below, change `angles.length` to `cleaned.length` and
`angles[i]` to `cleaned[i]`. **Both** must change — leaving the loop reading
`angles` would silently defeat the filter, and no synthetic test would catch it.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- rep-detection
```

Expected: all `rejectImplausibleJumps` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/form-checker/rep-detection.ts src/form-checker/rep-detection.test.ts
git commit -m "fix(reps): reject physiologically impossible frame-to-frame jumps"
```

---

### Task 3: Minimum rep duration, and realistic test fixtures

A rep must last long enough to be a rep. This task also rewrites the synthetic
fixtures, which are currently unrealistically fast.

**Read this before starting.** The existing fixtures ramp 170° → 90° in 6 steps
— 16° per frame. At 60fps that is 960°/s, which the Task 2 filter correctly
rejects as impossible, and which is far below the duration floor added here.
**The fixtures are wrong, not the guards.** They were written as toy data before
any real capture existed. This project's core lesson is that synthetic tests
which pass can still be wrong; fixtures that describe a physically impossible
squat are exactly that failure. They get rewritten to 60fps-realistic shapes.

**Files:**
- Modify: `src/form-checker/rep-detection.ts`
- Rewrite: `src/form-checker/rep-detection.test.ts`

**Interfaces:**
- Consumes: `percentile` (Task 1), `rejectImplausibleJumps` (Task 2).
- Produces: `detectReps` in final form. Signature unchanged:
  `(angles: (number | null)[]) => Rep[]`, where
  `Rep = { bottomIndex: number; bottomAngleDegrees: number }`.

- [ ] **Step 1: Replace the whole test file**

Write `src/form-checker/rep-detection.test.ts`. Keep the `percentile`,
`detectReps calibration` and `rejectImplausibleJumps` blocks added in Tasks 1
and 2 — append them below, or re-paste them from those tasks.

```typescript
import { describe, test, expect } from "vitest";
import { detectReps } from "./rep-detection";

/**
 * Synthetic knee-angle series. 180deg = fully extended (standing), smaller =
 * deeper bend, matching the interior-joint-angle convention used by angle-math
 * and the squat rule definitions.
 *
 * Frame counts here are 60fps-realistic on purpose. The original fixtures
 * ramped 170->90 in 6 frames — 16deg/frame, or 960deg/s, which no human joint
 * does and which the plausibility filter correctly rejects. A 40-frame descent
 * is ~0.67s and ~2.7deg/frame, which is what the real captures show.
 */
function ramp(from: number, to: number, steps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < steps; i++) {
    out.push(from + ((to - from) * i) / (steps - 1));
  }
  return out;
}

/** One squat: stand -> descend -> bottom -> ascend -> stand, at 60fps. */
function squatCycle(standing = 170, bottom = 90, halfFrames = 40): number[] {
  return [
    ...ramp(standing, bottom, halfFrames),
    ...ramp(bottom, standing, halfFrames).slice(1)
  ];
}

describe("detectReps", () => {
  test("finds no reps in an empty series", () => {
    expect(detectReps([])).toEqual([]);
  });

  test("finds no reps when every frame is unevaluated", () => {
    expect(detectReps([null, null, null, null])).toEqual([]);
  });

  test("finds no reps when the subject never bends", () => {
    expect(detectReps(new Array(50).fill(172))).toEqual([]);
  });

  test("finds no reps in a shallow bob that never reaches rep depth", () => {
    // 10deg of movement — below the minimum range that counts as a rep.
    const bob = [...squatCycle(170, 160), ...squatCycle(170, 160)];

    expect(detectReps(bob)).toEqual([]);
  });

  test("finds no reps in the real session that exposed the per-frame scoring bug", () => {
    // Captured 2026-07-26: knee angle only ever observed between 139.8 and
    // 161.4deg because the deep part of every squat was cropped out of frame.
    // That is 21.6deg of wobble, not reps.
    const observed = [
      161.4, 158.2, 150.1, 144.6, 139.8, 143.2, 152.7, 160.9, 161.1, 141.0, 139.9, 155.3
    ];

    expect(detectReps(observed)).toEqual([]);
  });

  test("finds one rep and reports its deepest point", () => {
    const angles = [...new Array(20).fill(172), ...squatCycle(170, 90), ...new Array(20).fill(172)];

    const reps = detectReps(angles);

    expect(reps).toHaveLength(1);
    expect(reps[0].bottomAngleDegrees).toBe(90);
    expect(angles[reps[0].bottomIndex]).toBe(90);
  });

  test("finds one rep per cycle across several reps", () => {
    const angles = [
      ...squatCycle(170, 95),
      ...squatCycle(170, 88),
      ...squatCycle(170, 92)
    ];

    const reps = detectReps(angles);

    expect(reps).toHaveLength(3);
    expect(reps.map((r) => r.bottomAngleDegrees)).toEqual([95, 88, 92]);
  });

  test("treats noise at the bottom as one rep, not several", () => {
    // Wobble around the bottom would produce three local minima naively.
    const angles = [...ramp(170, 95, 40), 99, 93, 97, 91, ...ramp(95, 170, 40)];

    const reps = detectReps(angles);

    expect(reps).toHaveLength(1);
    expect(reps[0].bottomAngleDegrees).toBe(91);
  });

  test("counts a rep still at the bottom when the session ends", () => {
    // User squats down and ends the session before standing back up. At 60fps
    // a descent that reaches parallel takes about a second, hence 60 frames.
    const angles = ramp(170, 90, 60);

    const reps = detectReps(angles);

    expect(reps).toHaveLength(1);
    expect(reps[0].bottomAngleDegrees).toBe(90);
    expect(reps[0].bottomIndex).toBe(angles.length - 1);
  });

  test("skips unevaluated frames without breaking rep tracking", () => {
    // null = the rule wasn't evaluated that frame (landmark visibility too low).
    const clean = [...new Array(20).fill(172), ...squatCycle(170, 90), ...new Array(20).fill(172)];
    const withGaps: (number | null)[] = clean.map((a, i) => (i % 3 === 1 ? null : a));

    const reps = detectReps(withGaps);

    expect(reps).toHaveLength(1);
    expect(reps[0].bottomAngleDegrees).toBe(90);
  });

  test("discards a dip too brief to be a rep", () => {
    // Four frames at depth is 1/15s. A real rep spends longer than that below
    // the entry threshold; a stumble or a tracking wobble does not.
    const angles = [...new Array(40).fill(170), 100, 95, 95, 100, ...new Array(40).fill(170)];

    expect(detectReps(angles)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to see which fail**

```bash
npm test -- rep-detection
```

Expected: `"discards a dip too brief to be a rep"` FAILS (reports 1 rep). Every
other test in the block should already PASS — the rewritten fixtures satisfy
the Task 1 and Task 2 guards.

If anything else fails, stop and read the failure before continuing. The
fixtures above were replayed against the finished implementation and all pass;
an unexpected failure means Task 1 or Task 2 was wired in differently.

- [ ] **Step 3: Implement the duration floor**

Add the constant to `src/form-checker/rep-detection.ts`:

```typescript
/**
 * Minimum frames a rep must spend below the entry threshold. ~0.3s at 60fps.
 * Shorter excursions are stumbles, shifts, or tracking wobble. Measured in
 * index span rather than sample count, so unevaluated frames still count as
 * elapsed time — a rep does not become "too short" because the tracker blinked.
 */
const MIN_REP_FRAMES = 18;
```

Track the opening index and enforce the floor on close. In the hysteresis loop,
add `openIndex` alongside `bottomIndex`:

```typescript
  const reps: Rep[] = [];
  let inRep = false;
  let openIndex = -1;
  let bottomIndex = -1;
  let bottomAngle = Infinity;

  for (let i = 0; i < cleaned.length; i++) {
    const angle = cleaned[i];
    if (angle === null) continue;

    if (!inRep) {
      if (angle < enterThreshold) {
        inRep = true;
        openIndex = i;
        bottomAngle = angle;
        bottomIndex = i;
      }
      continue;
    }

    if (angle < bottomAngle) {
      bottomAngle = angle;
      bottomIndex = i;
    }

    if (angle > exitThreshold) {
      if (i - openIndex >= MIN_REP_FRAMES) {
        reps.push({ bottomIndex, bottomAngleDegrees: bottomAngle });
      }
      inRep = false;
      openIndex = -1;
      bottomAngle = Infinity;
      bottomIndex = -1;
    }
  }

  // A rep still underway when the session ended still reached a bottom, as long
  // as it lasted long enough to be a rep at all.
  if (inRep && cleaned.length - 1 - openIndex >= MIN_REP_FRAMES) {
    reps.push({ bottomIndex, bottomAngleDegrees: bottomAngle });
  }

  return reps;
```

- [ ] **Step 4: Run the full unit suite**

```bash
npm test
```

Expected: all PASS. `progress-chart.test.ts` consumes `detectReps` indirectly —
if it fails, its fixtures have the same unrealistic-frame-rate problem and need
the same treatment. Fix them the same way rather than loosening the guards.

- [ ] **Step 5: Commit**

```bash
git add src/form-checker/rep-detection.ts src/form-checker/rep-detection.test.ts
git commit -m "fix(reps): require a minimum rep duration; make fixtures frame-rate realistic"
```

---

### Task 4: Regression test against all four real captures

Pin the behaviour to real data. This is the test that matters — a synthetic
suite passed nine tests while the tool was inventing reps out of a stationary
body.

**Files:**
- Create: `src/form-checker/rep-detection.capture.test.ts`
- Reads: `.claude-test-artifacts/session-*.json` (tracked in git)

**Interfaces:**
- Consumes: `detectReps` in final form (Task 3).
- Produces: nothing consumed by later tasks.

**Capture file schemas differ.** The two captures archived before the
diagnostics widened store the rep signal under `signalAngles`; the two after
store every rule under `angleSeries` keyed by rule name. The loader handles
both. Do not "fix" the older files.

- [ ] **Step 1: Write the test**

Create `src/form-checker/rep-detection.capture.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { detectReps } from "./rep-detection";

/**
 * Replays real captured sessions through rep detection.
 *
 * A metric fix that passes synthetic tests can still be wrong. The version of
 * detectReps these captures were recorded under passed nine synthetic tests and
 * reported 2 reps and a 50% form score from 25.9 seconds of the user standing
 * perfectly still. These four files are the only evidence that the replacement
 * both kills that fabrication and preserves the one session with real squats.
 */
function loadSignal(file: string): (number | null)[] {
  const raw = JSON.parse(readFileSync(`.claude-test-artifacts/${file}`, "utf8"));
  // Captures archived before 2026-07-28 store only the rep signal; later ones
  // store every rule's series keyed by rule name.
  return raw.signalAngles ?? raw.angleSeries["Knee bend depth"];
}

describe("detectReps against real captures", () => {
  test("reports no reps for 25.9s of standing perfectly still", () => {
    // The capture that exposed the fabrication. Reported repCount 2, passRate
    // 0.5. Frame 42 read 141.6deg, frame 43 read 66.6 — ~4500deg/s — and raw
    // min/max calibration let that one frame define the session's scale.
    expect(detectReps(loadSignal("session-2026-07-28-standing-test.json"))).toEqual([]);
  });

  test("still finds both reps in the one session that contained real squats", () => {
    // 2026-07-27, 835 frames, 60.8% rule coverage. This is the guard against
    // over-correcting: a filter strict enough to kill real reps is no better
    // than one loose enough to invent them.
    const reps = detectReps(loadSignal("session-2026-07-27-835frames.json"));

    expect(reps).toHaveLength(2);
    expect(reps.every((r) => r.bottomAngleDegrees < 60)).toBe(true);
  });

  test("reports no reps for the demo-video capture, where no squat was measured", () => {
    // Knee angle never went below 153.6deg — the tool never saw a squat, and
    // saying so plainly is the correct output.
    expect(detectReps(loadSignal("session-2026-07-28-demo-video-967frames.json"))).toEqual([]);
  });

  test("reports no reps for the redo2 capture, where no squat was measured", () => {
    expect(detectReps(loadSignal("session-2026-07-28-redo2-1028frames.json"))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

```bash
npm test -- rep-detection.capture
```

Expected: all four PASS. These exact assertions were verified against the
prototype before this plan was written.

If the standing-test assertion fails with a non-empty array, the plausibility
filter is not wired into the hysteresis loop — check that the loop reads
`cleaned[i]` and `cleaned.length`, not `angles[i]` and `angles.length`.

- [ ] **Step 3: Commit**

```bash
git add src/form-checker/rep-detection.capture.test.ts
git commit -m "test(reps): pin rep detection against all four real captures"
```

---

### Task 5: Delete the Torso lean rule

**Files:**
- Modify: `src/exercise-library/squat.ts:30-35` and the comment block above it
- Modify: `README.md` (the ranges table, ~line 112)
- Check: `src/form-checker/form-checker.test.ts`, `src/render/progress-chart.test.ts`,
  `src/exercise-library/overrides.test.ts`, `src/form-checker/framing-check.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a `squat` definition with exactly one rule. `repSignalRuleName`
  stays `"Knee bend depth"`. Phase 2 adds the replacement trunk measure.

**Why delete rather than retune.** The comment documents trunk lean as degrees
from vertical with a 45–90° pass band; the code computes the interior hip angle
where standing is ~170–180°. Retuning the band to match the interior-angle
convention would still leave the measure dominated by hip flexion and dependent
on landmark 25, which tracks at 59% in the standing capture. Phase 2 replaces it
with a shoulder/hip-only planar measure on landmarks that track above 99%.

- [ ] **Step 1: Delete the rule**

In `src/exercise-library/squat.ts`, remove the entire `Torso lean` rule object
from the `rules` array, and delete the `- Torso lean:` bullet from the comment
block above the definition. Add in its place:

```typescript
// The trunk-lean rule that used to live here was removed on 2026-07-28. It
// documented a 45-90deg band "from vertical" but computed the interior hip
// angle over shoulder->hip->knee, where upright standing is ~170-180deg. It
// therefore passed on 3 of 922 frames of the user standing still — and all
// three were pose-tracker glitch frames. It is replaced in the measurement
// rebuild by a planar trunk measure on shoulder and hip landmarks only, which
// track above 99% where the knee tracks at 59%.
```

- [ ] **Step 2: Run the full suite and fix the fallout**

```bash
npm test
```

Any test that asserts two rules, or names `"Torso lean"`, needs updating to the
single-rule reality. Update the assertions — do not re-add the rule to keep a
test green.

- [ ] **Step 3: Update the README ranges table**

In `README.md`, delete the `| Torso lean | 45–90° | ... |` row from the table
under "The angle ranges are a general guideline". Leave the surrounding prose
alone; the honest-copy rewrite is Phase 5.

- [ ] **Step 4: Verify the app still runs**

```bash
npm run dev
```

Open the printed localhost URL, grant camera access, and confirm: the framing
readout appears, the skeleton overlay draws, and the "Form ranges" panel now
shows one rule instead of two. You do not need to record a session.

Stop the dev server when done. Note that `.claude-test-artifacts/latest.json`
is overwritten by any session you do record and is gitignored — the four
`session-*.json` files are the tracked corpus and must not be touched.

- [ ] **Step 5: Commit**

```bash
git add src/exercise-library/squat.ts README.md src/
git commit -m "fix(squat): delete the torso rule whose band never matched its geometry"
```

---

## Done criteria

- [ ] `npm test` passes with zero failures.
- [ ] Replaying `session-2026-07-28-standing-test.json` reports **0 reps**.
- [ ] Replaying `session-2026-07-27-835frames.json` still reports **2 reps**.
- [ ] `squat.rules` has exactly one entry, `Knee bend depth`.
- [ ] `npm run dev` loads, camera works, one rule shows in the settings panel.
- [ ] The README ranges table no longer lists Torso lean.

## What this phase deliberately does NOT do

- Does not replace the knee angle as the rep signal. That is Phase 3, and it
  depends on the corpus Phase 1 records.
- Does not add the trunk or depth measures. That is Phase 2.
- Does not change any user-facing copy beyond the one README table row. The
  tool will still show absolute degrees and still say "0 reps" when it means
  "I could not see you". Both are Phase 5.
- Does not touch `pose-engine.ts`, the CDN loading, or the model choice.

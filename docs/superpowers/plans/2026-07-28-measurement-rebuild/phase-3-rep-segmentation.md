# Phase 3 — Rep Segmentation on the Depth Signal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

> **Read `phase-2-measurement-primitives.md` first**, specifically its "Context you
> need" section, and then `corpus-manifest.md` in full. Phases 2, 3 and 4 are
> strictly sequential. This plan replaces the structural version and every
> constant in it is now measured rather than assumed.

**Goal:** Segment a set into reps from the hip-depth signal instead of knee angle,
so rep detection no longer depends on the joint the camera tracks worst, and
reproduce all six corpus ground-truth rep counts.

**Architecture:** Three small, single-responsibility modules on top of Phase 2's
primitives. `depth-series.ts` turns a run of `TrunkSample`s into a per-frame
`depthRatio` series against a forward-scanned standing baseline, with `null` for
every frame that must not be graded. `rep-segmentation.ts` segments that series
with inverted-sign hysteresis and a kinematic plausibility filter. `rep-deviation.ts`
re-measures each detected rep against a short rolling baseline so reps can be
compared to each other, which the session-global baseline provably cannot do.

**Tech Stack:** TypeScript (strict), vitest + jsdom, vite. Typecheck gate is
`npx tsc --noEmit` — `npm run build` does **not** typecheck.

## Global Constraints

- No runtime AI, API or LLM calls. Deterministic geometry only.
- The tool must never claim anything about the spine, disc, or injury risk.
  Comments and copy say "trunk", "hips", "depth proxy" — never "spine".
- Interior-joint angle convention: 180° = extended. **The depth signal is the
  inverted convention** — larger `depthRatio` = lower in frame = deeper.
- `null` means "not evaluated". It must never be read as zero depth and must
  never end an in-progress rep.
- Corpus files (`.claude-test-artifacts/session-*.json`, `corpus-*.json`) are
  tracked and must not be modified. Read only.
- Every threshold constant carries a comment naming the take it was measured
  from and the measured window it sits inside.
- The knee-angle path (`src/form-checker/rep-detection.ts`) stays in place and
  keeps passing its tests. Removing it is Phase 5.

---

## Measured constants — the inputs this plan was blocked on

All measured on the six corpus takes with Phase 2's `assessCalibration` forward
scan, `trunkSample` bounds guard, and `withinCalibratedScale` applied. Every
value below sits inside a window where **all six** ground-truth counts are
reproduced; the window edges are what breaks.

| constant | value | measured window | what breaks outside it |
|---|---|---|---|
| `MIN_REP_DEPTH_RATIO` | **0.10** | `> 0.0151`, `≤ 0.3411` | Below: `corpus-01-standing`'s entire p05→p95 range is 0.0151, so a lower gate lets a motionless body register reps. Above 0.3411: `corpus-04-shallow`'s whole range is 0.3411 and all 5 of its reps vanish (verified: at 0.35 it reports 0). |
| `MAX_ENTER_OFFSET` | **0.19** | `0.155 – 0.225` | Below 0.155: the exit threshold falls with it and two of `corpus-04-shallow`'s reps merge (4 reported at 0.150, 2 at 0.140). Above 0.225: `corpus-05-degrading`'s shallowest genuine rep peaks at 0.2367 and is missed (7 reported at 0.230). 0.19 is the exact midpoint. |
| `MAX_DEPTH_CHANGE_PER_FRAME` | **0.08** | `> 0.0625`, and low enough to reject the glitch burst | The fastest genuine consecutive-frame change in the corpus is 0.0625 (`corpus-06-drift`, frame 1111). At 0.08 the filter rejects 7 frames, all inside `corpus-04-shallow`'s frames 1086–1104 glitch burst, and 0 frames in every other take. |
| `ENTER_FRACTION` | 0.6 | carried from Phase 0 | — |
| `EXIT_FRACTION` | 0.3 | carried from Phase 0 | — |
| `MIN_REP_FRAMES` | 18 | shortest genuine rep is 35 frames | `corpus-05-degrading` rep 6 spans 35 frames; 18 leaves ~2x margin. |
| `MAX_BRIDGED_GAP_FRAMES` | 30 | carried from Phase 0 | — |
| `ROLLING_BASELINE_FRAMES` | 180 | see manifest "Drift finding" | Settled in Phase 2. Do not re-litigate: 10s straddles a distance change and reads 69% inflation; 3s reads −0.5%. |
| `UNUSUAL_REP_FRACTION` | **0.30** | `0.18 – 0.49` | Below 0.18: `corpus-03-five-normal`'s consistent reps spread to −17.1% and get flagged. Above 0.49: `corpus-05-degrading`'s least-degraded bad rep is −49.5% and stops being flagged. |

### Why an absolute cap on the enter threshold is needed at all

This is the one genuinely new design decision in the phase, and it exists because
of a failure the structural plan did not anticipate.

Phase 0's hysteresis puts the enter threshold at a **fraction of the session's
observed range**. On `corpus-05-degrading` that fails: its first five reps peak at
0.65–0.74 and its last three — the deliberately degraded ones, which are real reps
the user performed — peak at 0.24, 0.29, 0.34. A threshold at 0.6 of the session
range sits at 0.412, so **all three degraded reps are silently dropped and the take
reports 5 instead of 8**. A purely relative threshold means the better your first
reps are, the more of your worse reps disappear, which is the opposite of what a
form tracker is for.

The fix keeps both terms and takes whichever threshold is lower:

```
enterOffset = min(range * ENTER_FRACTION, MAX_ENTER_OFFSET)
exitOffset  = enterOffset * (EXIT_FRACTION / ENTER_FRACTION)   // = half
```

The relative term binds only when the session range is below ~0.317 (a shallow
set), keeping the threshold proportional to what the user actually did. The
absolute cap binds on every deeper set, so a rep is "an excursion past a minimum
real depth", not "an excursion past 60% of your best rep".

Dropping the absolute cap gives `0 5 5 5 5 5` — the corpus proves that term.
Dropping the *relative* term and using 0.19 flat gives `0 5 5 5 8 5`, unchanged:
no take in the corpus has a range low enough for it to bind. It is kept for a
case the corpus does not contain — a set whose range clears
`MIN_REP_DEPTH_RATIO` but never reaches 0.19 would otherwise be counted as zero
reps — and is covered by a synthetic unit test rather than by the corpus. Say so
in the comment; do not claim the corpus measured it.

### `MAX_DEPTH_CHANGE_PER_FRAME` is real but not load-bearing here

Recorded honestly: with Phase 2's bounds guard and scale guard already applied, an
**infinite** jump budget still reproduces all six ground-truth counts. The filter
is not what makes this phase work. It is retained because it does catch genuine
garbage — `corpus-04-shallow` frames 1086–1104 contain a burst reading the hips
0.21–0.33 trunk-lengths *above* the standing baseline, which is the residue of the
anomaly Phase 1 mislabelled as an out-of-bounds glitch at "frame ~1087" — and
because a live session has no terminal-tail guarantee. It must not be presented as
the guard that made the counts come out right.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/form-checker/depth-series.ts` | Create | Forward-scan the standing baseline; turn `TrunkSample`s into a per-frame `depthRatio` series with `null` where not evaluable. |
| `src/form-checker/depth-series.test.ts` | Create | Unit tests for the above. |
| `src/form-checker/rep-segmentation.ts` | Create | Plausibility filter + inverted-sign hysteresis segmentation. |
| `src/form-checker/rep-segmentation.test.ts` | Create | Synthetic unit tests. |
| `src/form-checker/rep-deviation.ts` | Create | Rolling baseline + per-rep deviation from the set median. |
| `src/form-checker/rep-deviation.test.ts` | Create | Synthetic unit tests. |
| `src/form-checker/rep-segmentation.corpus.test.ts` | Create | The six ground-truth counts and the deviation-separation assertion. |
| `src/render/progress-chart.ts` | Modify | `summarizeSession` takes optional trunk samples and grades depth-segmented rep bottoms when given them. |
| `docs/.../corpus-manifest.md` | Modify | Record the deviation-signal answer with numbers. |
| `src/form-checker/rep-detection.ts` | Leave alone | Removed in Phase 5. |

`depth-series.ts` is a fourth file the structural plan did not list. It exists
because baseline discovery and series construction is a separable job with its own
failure modes (calibration never converging, a take that is all nulls) and folding
it into the segmenter would put two responsibilities in one file.

---

### Task 1: Depth series construction

**Files:**
- Create: `src/form-checker/depth-series.ts`
- Test: `src/form-checker/depth-series.test.ts`

**Interfaces:**
- Consumes: `TrunkSample` from `src/pose/planar-measures.ts` (fields
  `leanDegrees`, `hipY`, `trunkLength`, `minVisibility`); `assessCalibration`,
  `depthRatio`, `withinCalibratedScale`, `Baseline` from
  `src/form-checker/calibration.ts`.
- Produces:
  ```ts
  export interface DepthSeries {
    values: (number | null)[];
    baseline: Baseline;
    readyAt: number;
  }
  export function findBaseline(
    samples: (TrunkSample | null)[]
  ): { baseline: Baseline; readyAt: number } | null;
  export function buildDepthSeries(samples: (TrunkSample | null)[]): DepthSeries | null;
  ```
  `values` has exactly the same length as `samples`. `readyAt` is the index one
  past the last frame of the window that calibrated.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/form-checker/depth-series.test.ts
import { describe, test, expect } from "vitest";
import { findBaseline, buildDepthSeries } from "./depth-series";
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

describe("findBaseline", () => {
  test("returns null when the tracker never settles", () => {
    // Hips sliding 0.01/frame for the whole take: no 90-frame window is still.
    const drifting = Array.from({ length: 300 }, (_, i) => ({
      leanDegrees: 2,
      hipY: 0.2 + i * 0.01,
      trunkLength: 0.3,
      minVisibility: 0.99
    }));

    expect(findBaseline(drifting)).toBeNull();
  });

  test("reports the first window that settles, not the first window at all", () => {
    // The live-gate property. 120 unusable warm-up frames, then stillness.
    const warmUp = Array.from({ length: 120 }, (_, i) => ({
      leanDegrees: 2,
      hipY: 0.5 + i * 0.01,
      trunkLength: 0.3,
      minVisibility: 0.99
    }));
    const found = findBaseline([...warmUp, ...still(90)]);

    expect(found).not.toBeNull();
    expect(found!.readyAt).toBe(210);
    expect(found!.baseline.hipY).toBe(0.5);
  });
});

describe("buildDepthSeries", () => {
  test("returns null when no baseline can be found", () => {
    expect(buildDepthSeries(still(30))).toBeNull();
  });

  test("keeps the series the same length as the input", () => {
    const series = buildDepthSeries([...still(90), ...still(10)]);

    expect(series!.values).toHaveLength(100);
  });

  test("leaves every pre-calibration frame unevaluated", () => {
    const series = buildDepthSeries([...still(90), ...still(10)]);

    expect(series!.values.slice(0, 90).every((v) => v === null)).toBe(true);
  });

  test("measures depth against the discovered baseline after calibration", () => {
    const descending = still(5, { hipY: 0.65 });
    const series = buildDepthSeries([...still(90), ...descending]);

    // 0.15 below a 0.3 trunk length.
    expect(series!.values[92]).toBeCloseTo(0.5, 6);
  });

  test("does not evaluate frames with no pose", () => {
    const samples: (TrunkSample | null)[] = [...still(90), null, ...still(3)];
    const series = buildDepthSeries(samples);

    expect(series!.values[90]).toBeNull();
    expect(series!.values[91]).not.toBeNull();
  });

  test("does not evaluate frames where the body has left its calibrated scale", () => {
    // The walk-back-to-the-laptop tail: same hips, body imaged 2.6x larger.
    const approaching = still(5, { hipY: 0.5, trunkLength: 0.3 * 2.635 });
    const series = buildDepthSeries([...still(90), ...approaching]);

    expect(series!.values.slice(90).every((v) => v === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/form-checker/depth-series.test.ts`
Expected: FAIL — `Failed to resolve import "./depth-series"`.

- [ ] **Step 3: Implement `depth-series.ts`**

```typescript
// src/form-checker/depth-series.ts
import type { TrunkSample } from "../pose/planar-measures";
import {
  assessCalibration,
  depthRatio,
  withinCalibratedScale,
  type Baseline
} from "./calibration";

/**
 * A per-frame hip-depth signal, in units of the user's own trunk length,
 * measured against the standing baseline this run established for itself.
 *
 * `values` is index-aligned with the samples it was built from and is `null` on
 * every frame that must not be graded. Null means "not evaluated" — never zero
 * depth, and never a reason to end an in-progress rep.
 */
export interface DepthSeries {
  values: (number | null)[];
  baseline: Baseline;
  /** Index one past the calibrating window. Everything before it is null. */
  readyAt: number;
}

/**
 * Number of frames `assessCalibration` inspects. Kept in sync with that module's
 * own window; passing exactly this many samples makes the scan O(n * window)
 * instead of O(n^2) over growing slices.
 */
const CALIBRATION_WINDOW_FRAMES = 90;

/**
 * Scans forward for the first window that qualifies as standing still, exactly
 * as a live session's per-frame gate would.
 *
 * Deliberately not "assess the opening window". Phase 2 measured that the
 * opening window is the WORST window in every take in the corpus: MediaPipe's
 * tracker takes ~4.5s to converge, during which trunk length moves 36% on a
 * confirmed-motionless body. Across the corpus this returns a readyAt of
 * 4.6-6.5s in. Returns null if a run never settles, which is a refusal to
 * measure rather than a fallback to a bad baseline.
 */
export function findBaseline(
  samples: (TrunkSample | null)[]
): { baseline: Baseline; readyAt: number } | null {
  for (let end = CALIBRATION_WINDOW_FRAMES; end <= samples.length; end++) {
    const state = assessCalibration(samples.slice(end - CALIBRATION_WINDOW_FRAMES, end));
    if (state.ready && state.baseline !== null) {
      return { baseline: state.baseline, readyAt: end };
    }
  }
  return null;
}

/**
 * Builds the depth signal a session can be segmented from.
 *
 * Three separate reasons a frame is left unevaluated, all of them Phase 2
 * findings rather than tuning: it is before calibration completed; the pose
 * detector produced nothing usable for the trunk (`trunkSample` already returns
 * null when a trunk landmark leaves the image); or the imaged body scale has
 * drifted outside the range in which baseline subtraction still means anything.
 */
export function buildDepthSeries(samples: (TrunkSample | null)[]): DepthSeries | null {
  const found = findBaseline(samples);
  if (found === null) return null;

  const { baseline, readyAt } = found;
  const values = samples.map((sample, index) => {
    if (index < readyAt) return null;
    if (sample === null) return null;
    if (!withinCalibratedScale(sample, baseline)) return null;
    return depthRatio(sample, baseline);
  });

  return { values, baseline, readyAt };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/form-checker/depth-series.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/form-checker/depth-series.ts src/form-checker/depth-series.test.ts
git commit -m "feat(measure): build a per-frame depth series from a forward-scanned baseline"
```

---

### Task 2: Depth-jump plausibility filter

**Files:**
- Create: `src/form-checker/rep-segmentation.ts`
- Test: `src/form-checker/rep-segmentation.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 — operates on a bare `(number | null)[]`.
- Produces:
  ```ts
  export function rejectImplausibleDepthJumps(series: (number | null)[]): (number | null)[];
  ```
  Same length as the input, plausible samples unchanged, implausible ones
  replaced with `null`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/form-checker/rep-segmentation.test.ts
import { describe, test, expect } from "vitest";
import { rejectImplausibleDepthJumps } from "./rep-segmentation";

describe("rejectImplausibleDepthJumps", () => {
  test("leaves a plausible descent untouched", () => {
    const series = [0, 0.02, 0.04, 0.06, 0.08];

    expect(rejectImplausibleDepthJumps(series)).toEqual(series);
  });

  test("rejects a single frame that jumps further than a body can move", () => {
    const series = [0, 0.02, 0.9, 0.04, 0.06];

    expect(rejectImplausibleDepthJumps(series)).toEqual([0, 0.02, null, 0.04, 0.06]);
  });

  test("rejects a whole glitch burst rather than walking along with it", () => {
    // The corpus-04-shallow frames 1086-1104 shape: consecutive wild samples.
    // Comparing against the last ACCEPTED value is what stops the filter from
    // being dragged onto the glitch and then rejecting the recovery instead.
    const series = [0, -0.21, -0.33, -0.26, 0.01];
    const cleaned = rejectImplausibleDepthJumps(series);

    expect(cleaned[1]).toBeNull();
    expect(cleaned[2]).toBeNull();
    expect(cleaned[4]).toBe(0.01);
  });

  test("scales the budget with the gap so a brief dropout is bridged", () => {
    // Five frames of nothing, then a 0.3 change: 0.06/frame, plausible.
    const series = [0, null, null, null, null, 0.3];

    expect(rejectImplausibleDepthJumps(series)[5]).toBe(0.3);
  });

  test("re-seeds after a long dropout instead of rejecting forever", () => {
    const series: (number | null)[] = [0, ...Array(40).fill(null), 0.7];

    expect(rejectImplausibleDepthJumps(series)[41]).toBe(0.7);
  });

  test("passes the fastest genuine frame-to-frame change in the corpus", () => {
    // corpus-06-drift frame 1111: 0.0625 depth-ratio in one frame, a real
    // descent. A filter that rejects this rejects real reps.
    const series = [0.1, 0.1625];

    expect(rejectImplausibleDepthJumps(series)).toEqual(series);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/form-checker/rep-segmentation.test.ts`
Expected: FAIL — `Failed to resolve import "./rep-segmentation"`.

- [ ] **Step 3: Implement the filter**

```typescript
// src/form-checker/rep-segmentation.ts
/**
 * Maximum plausible change in depth ratio between consecutive frames.
 *
 * Measured, with headroom: the fastest genuine consecutive-frame change anywhere
 * in the corpus is 0.0625, in corpus-06-drift at frame 1111. At 0.08 the filter
 * rejects 7 frames across all six takes, every one of them inside
 * corpus-04-shallow's frames 1086-1104, where the hips read 0.21-0.33 trunk
 * lengths ABOVE the standing baseline on a subject who was upright.
 *
 * Recorded honestly: this filter is NOT what makes this phase work. With Phase
 * 2's bounds guard and scale guard applied, an infinite budget still reproduces
 * all six ground-truth rep counts. It is also explicitly NOT a substitute for
 * withinCalibratedScale — the capture-protocol tail advances at 0.007-0.010 per
 * frame, slower than genuine reps, so no kinematic budget can separate them.
 * This guards a different failure mode: high-visibility nonsense samples in the
 * middle of an otherwise good take.
 */
const MAX_DEPTH_CHANGE_PER_FRAME = 0.08;

/**
 * Longest measurement gap the filter will reason across. Beyond this the body
 * genuinely could have moved anywhere, so it re-seeds from the new sample
 * instead of rejecting it. Without this, one long dropout poisons the rest of
 * the session. Carried unchanged from Phase 0.
 */
const MAX_BRIDGED_GAP_FRAMES = 30;

/**
 * Replaces physiologically impossible depth samples with null, leaving the
 * series length and every plausible sample unchanged. Comparison is always
 * against the last *accepted* sample, so a multi-frame glitch burst is rejected
 * in full rather than the filter walking along with it.
 */
export function rejectImplausibleDepthJumps(series: (number | null)[]): (number | null)[] {
  const out = series.slice();
  let lastValue: number | null = null;
  let lastIndex = -1;

  for (let i = 0; i < series.length; i++) {
    const value = series[i];
    if (value === null) continue;

    const gap = i - lastIndex;
    if (lastValue === null || gap > MAX_BRIDGED_GAP_FRAMES) {
      lastValue = value;
      lastIndex = i;
      continue;
    }

    if (Math.abs(value - lastValue) > gap * MAX_DEPTH_CHANGE_PER_FRAME) {
      out[i] = null;
      continue;
    }

    lastValue = value;
    lastIndex = i;
  }

  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/form-checker/rep-segmentation.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/form-checker/rep-segmentation.ts src/form-checker/rep-segmentation.test.ts
git commit -m "feat(measure): reject implausible per-frame depth jumps"
```

---

### Task 3: Hysteresis segmentation on the inverted signal

**Files:**
- Modify: `src/form-checker/rep-segmentation.ts` (append)
- Test: `src/form-checker/rep-segmentation.test.ts` (append)

**Interfaces:**
- Consumes: `rejectImplausibleDepthJumps` from Task 2; `percentile` from
  `src/form-checker/rep-detection.ts` (signature
  `percentile(sortedAscending: number[], p: number): number | null`, linear
  interpolated).
- Produces:
  ```ts
  export interface DepthRep {
    startIndex: number;
    endIndex: number;
    bottomIndex: number;
    bottomDepthRatio: number;
  }
  export function detectDepthReps(series: (number | null)[]): DepthRep[];
  ```
  Indices are into the input series. `bottomDepthRatio` is the **maximum** depth
  reached — the inverted convention.

- [ ] **Step 1: Write the failing tests**

```typescript
// append to src/form-checker/rep-segmentation.test.ts
import { detectDepthReps } from "./rep-segmentation";

/** One synthetic rep: down over `ramp`, hold at `depth`, back up. */
function rep(depth: number, ramp = 15, hold = 20): number[] {
  const down = Array.from({ length: ramp }, (_, i) => (depth * (i + 1)) / ramp);
  const bottom = Array.from({ length: hold }, () => depth);
  const up = [...down].reverse();
  return [...down, ...bottom, ...up];
}

const standing = (count: number) => Array.from({ length: count }, () => 0);

describe("detectDepthReps", () => {
  test("finds nothing in an empty series", () => {
    expect(detectDepthReps([])).toEqual([]);
  });

  test("finds nothing in a series that is all unevaluated", () => {
    expect(detectDepthReps([null, null, null])).toEqual([]);
  });

  test("finds nothing when the whole session barely moved", () => {
    // corpus-01-standing's entire p05-p95 range is 0.0151. A measure that
    // reports reps here is the same defect class as the bug this rebuild exists
    // to fix.
    const swaying = Array.from({ length: 600 }, (_, i) => 0.007 * Math.sin(i / 30));

    expect(detectDepthReps(swaying)).toEqual([]);
  });

  test("finds one rep in one descent", () => {
    const reps = detectDepthReps([...standing(60), ...rep(0.6), ...standing(60)]);

    expect(reps).toHaveLength(1);
  });

  test("reports the deepest point as the maximum, not the minimum", () => {
    const reps = detectDepthReps([...standing(60), ...rep(0.6), ...standing(60)]);

    expect(reps[0].bottomDepthRatio).toBeCloseTo(0.6, 6);
    // The descent's last frame is index 74 and already at full depth; the hold
    // that follows never exceeds it, so the first frame at the bottom wins.
    expect(reps[0].bottomIndex).toBe(74);
  });

  test("counts three reps as three, not one", () => {
    const series = [
      ...standing(60),
      ...rep(0.6),
      ...standing(30),
      ...rep(0.6),
      ...standing(30),
      ...rep(0.6),
      ...standing(60)
    ];

    expect(detectDepthReps(series)).toHaveLength(3);
  });

  test("does not split one rep into several when the bottom is noisy", () => {
    // The reason hysteresis exists: jitter at the bottom must not re-trigger.
    const jittery = [
      ...standing(60),
      ...Array.from({ length: 15 }, (_, i) => (0.6 * (i + 1)) / 15),
      ...Array.from({ length: 30 }, (_, i) => 0.6 + (i % 2 === 0 ? 0.04 : -0.04)),
      ...Array.from({ length: 15 }, (_, i) => 0.6 - (0.6 * (i + 1)) / 15),
      ...standing(60)
    ];

    expect(detectDepthReps(jittery)).toHaveLength(1);
  });

  test("ignores an excursion too brief to be a rep", () => {
    const twitch = [...standing(60), ...rep(0.6, 2, 2), ...standing(60), ...rep(0.6)];

    expect(detectDepthReps(twitch)).toHaveLength(1);
  });

  test("counts a rep still underway when the recording stopped", () => {
    const reps = detectDepthReps([...standing(60), ...rep(0.6).slice(0, 30)]);

    expect(reps).toHaveLength(1);
  });

  test("does not end a rep because the tracker blinked at the bottom", () => {
    // null means "not evaluated". Reading it as a return to standing would
    // close the rep early and, worse, could open a second one on the way up.
    const blinking: (number | null)[] = [...standing(60), ...rep(0.6), ...standing(60)];
    for (let i = 76; i < 86; i++) blinking[i] = null;

    expect(detectDepthReps(blinking)).toHaveLength(1);
  });

  test("counts a shallower rep in the same set as the deep ones", () => {
    // corpus-05-degrading in miniature, and the reason the enter threshold has
    // an absolute cap. Five deep reps then three at ~0.24: a purely relative
    // threshold sits at 0.6 of the session range and drops all three.
    const series = [
      ...standing(60),
      ...rep(0.7),
      ...standing(30),
      ...rep(0.7),
      ...standing(30),
      ...rep(0.24),
      ...standing(30),
      ...rep(0.24),
      ...standing(60)
    ];

    expect(detectDepthReps(series)).toHaveLength(4);
  });

  test("stays proportional on a set that was shallow throughout", () => {
    // The relative term still binds here: the whole set peaks at 0.30, so a
    // flat 0.19 threshold would sit at 63% of range and merge or drop reps.
    const series = [
      ...standing(60),
      ...rep(0.3),
      ...standing(30),
      ...rep(0.3),
      ...standing(30),
      ...rep(0.3),
      ...standing(60)
    ];

    expect(detectDepthReps(series)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/form-checker/rep-segmentation.test.ts`
Expected: FAIL — `detectDepthReps is not a function` / no exported member.

- [ ] **Step 3: Implement `detectDepthReps`**

```typescript
// append to src/form-checker/rep-segmentation.ts, and add this import at the top
// of the file:
//   import { percentile } from "./rep-detection";

/**
 * Total depth travel the session must cover before it is treated as containing
 * reps at all. Below this the subject was standing, shifting or swaying, and
 * grading that as a failed rep is the bug this rebuild exists to remove.
 *
 * Measured: corpus-01-standing's entire p05-p95 range, over 30s of confirmed
 * stillness, is 0.0151 — this gate is 6.6x above it. The shallowest genuine set,
 * corpus-04-shallow, has a range of 0.3411 — this gate is 3.4x below it. The
 * working window is (0.0151, 0.3411]; at 0.35 all five of that take's real reps
 * disappear.
 */
const MIN_REP_DEPTH_RATIO = 0.1;

/**
 * Hysteresis band, as fractions of the observed range above the standing depth.
 * A rep opens once the hips pass ENTER and closes once they come back up past
 * EXIT. The gap between them is what stops jitter at the bottom of a squat from
 * reading as several reps. Carried unchanged from Phase 0.
 */
const ENTER_FRACTION = 0.6;
const EXIT_FRACTION = 0.3;

/**
 * Absolute ceiling on the enter threshold's distance above standing, in depth
 * ratio. This is the one new mechanism in Phase 3 and it fixes a real, measured
 * failure of the purely relative threshold Phase 0 used.
 *
 * corpus-05-degrading contains eight genuine reps: five at 0.65-0.74 and then
 * three deliberately degraded ones at 0.2367, 0.2938 and 0.3431. A threshold at
 * 0.6 of that session's range sits at 0.412, so all three degraded reps are
 * silently dropped and the take reports 5. A purely relative threshold means the
 * better your first reps are, the more of your worse reps vanish.
 *
 * Taking the LOWER of the two thresholds keeps both behaviours: the relative
 * term binds on shallow sets (session range below ~0.32), keeping the threshold
 * proportional to what the user actually did, and this cap binds on deeper sets
 * so a rep is an excursion past a minimum real depth rather than past 60% of the
 * user's best rep.
 *
 * 0.19 is the exact midpoint of the measured working window 0.155-0.225. Below
 * 0.155 the exit threshold falls with it and two of corpus-04-shallow's reps
 * merge; above 0.225 corpus-05-degrading's shallowest genuine rep (0.2367) is
 * missed.
 */
const MAX_ENTER_OFFSET = 0.19;

/**
 * Calibration percentiles rather than raw max/min. Phase 0 established that one
 * glitch frame must never set the session's scale: the 2026-07-28 standing
 * capture reported 2 reps from a stationary body because a single frame defined
 * both ends of the range.
 */
const CALIBRATION_LOW_PERCENTILE = 0.05;
const CALIBRATION_HIGH_PERCENTILE = 0.95;

/**
 * Minimum index span a rep must hold past the entry threshold. ~0.3s at 60fps.
 * Measured in index span rather than sample count, so unevaluated frames still
 * count as elapsed time — a rep does not become "too short" because the tracker
 * blinked. The shortest genuine rep in the corpus spans 35 frames
 * (corpus-05-degrading, rep 6), so this leaves roughly 2x margin.
 */
const MIN_REP_FRAMES = 18;

/** One segmented rep, indexed into the depth series it was found in. */
export interface DepthRep {
  /** First frame past the entry threshold. */
  startIndex: number;
  /** Frame at which the hips came back up past the exit threshold. */
  endIndex: number;
  /** Frame of greatest depth — the MAXIMUM, on this inverted signal. */
  bottomIndex: number;
  bottomDepthRatio: number;
}

/**
 * Segments a per-frame hip-depth series into reps and reports each rep's
 * deepest point.
 *
 * THE SIGN CONVENTION IS INVERTED FROM rep-detection.ts. Knee angle shrinks as
 * you descend and a rep's bottom is its minimum; depth ratio grows as you
 * descend and a rep's bottom is its maximum. Every comparison below flips
 * accordingly, and getting one of them backwards produces a confident wrong
 * number rather than a crash.
 *
 * Entries are null for frames that were not evaluated — before calibration, no
 * pose, a trunk landmark out of the image, or a body scale too far from the one
 * that calibrated. Those frames are skipped without interrupting an in-progress
 * rep and are never read as a return to standing.
 *
 * Deliberately pure, deterministic geometry: no model, no network. Sending pose
 * data off-device would falsify the privacy claim the README makes.
 */
export function detectDepthReps(series: (number | null)[]): DepthRep[] {
  const cleaned = rejectImplausibleDepthJumps(series);

  const sorted = cleaned.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const standingDepth = percentile(sorted, CALIBRATION_LOW_PERCENTILE)!;
  const deepestDepth = percentile(sorted, CALIBRATION_HIGH_PERCENTILE)!;

  const range = deepestDepth - standingDepth;
  if (range < MIN_REP_DEPTH_RATIO) return [];

  const enterOffset = Math.min(range * ENTER_FRACTION, MAX_ENTER_OFFSET);
  const exitOffset = enterOffset * (EXIT_FRACTION / ENTER_FRACTION);
  const enterThreshold = standingDepth + enterOffset;
  const exitThreshold = standingDepth + exitOffset;

  const reps: DepthRep[] = [];
  let inRep = false;
  let startIndex = -1;
  let bottomIndex = -1;
  let bottomDepth = -Infinity;

  for (let i = 0; i < cleaned.length; i++) {
    const depth = cleaned[i];
    if (depth === null) continue;

    if (!inRep) {
      if (depth > enterThreshold) {
        inRep = true;
        startIndex = i;
        bottomDepth = depth;
        bottomIndex = i;
      }
      continue;
    }

    if (depth > bottomDepth) {
      bottomDepth = depth;
      bottomIndex = i;
    }

    if (depth < exitThreshold) {
      if (i - startIndex >= MIN_REP_FRAMES) {
        reps.push({ startIndex, endIndex: i, bottomIndex, bottomDepthRatio: bottomDepth });
      }
      inRep = false;
      startIndex = -1;
      bottomIndex = -1;
      bottomDepth = -Infinity;
    }
  }

  // A rep still underway when the recording stopped still reached a bottom, as
  // long as it lasted long enough to be a rep at all.
  if (inRep && cleaned.length - 1 - startIndex >= MIN_REP_FRAMES) {
    reps.push({
      startIndex,
      endIndex: cleaned.length - 1,
      bottomIndex,
      bottomDepthRatio: bottomDepth
    });
  }

  return reps;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/form-checker/rep-segmentation.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npx tsc --noEmit && npm test`
Expected: no typecheck output; every test file passes, including
`rep-detection.test.ts` — the knee-angle path must be untouched.

- [ ] **Step 6: Commit**

```bash
git add src/form-checker/rep-segmentation.ts src/form-checker/rep-segmentation.test.ts
git commit -m "feat(measure): segment reps from the hip-depth signal"
```

---

### Task 4: The corpus ground-truth assertions

This is the task that decides whether the phase worked. Nothing before it is
evidence.

**Files:**
- Create: `src/form-checker/rep-segmentation.corpus.test.ts`

**Interfaces:**
- Consumes: `loadCorpus`, `CORPUS_TAKES` from `tests/corpus.ts` (each entry
  `{ name: string; groundTruthReps: number }`); `trunkSample` from
  `src/pose/planar-measures.ts`; `buildDepthSeries` from Task 1;
  `detectDepthReps` from Task 3.
- Produces: nothing importable.

- [ ] **Step 1: Write the failing test**

```typescript
// src/form-checker/rep-segmentation.corpus.test.ts
import { describe, test, expect } from "vitest";
import { loadCorpus, CORPUS_TAKES } from "../../tests/corpus";
import { trunkSample, type TrunkSample } from "../pose/planar-measures";
import { buildDepthSeries } from "./depth-series";
import { detectDepthReps, type DepthRep } from "./rep-segmentation";
import { detectReps } from "./rep-detection";

function depthRepsFor(name: string): DepthRep[] {
  const corpus = loadCorpus(name);
  const samples: (TrunkSample | null)[] = corpus.frames.map((f) =>
    f.lm ? trunkSample(f.lm, corpus.aspectRatio) : null
  );
  const series = buildDepthSeries(samples);
  expect(series, `${name} never calibrated`).not.toBeNull();
  return detectDepthReps(series!.values);
}

describe("depth-signal rep segmentation against the real corpus", () => {
  test.each(CORPUS_TAKES)(
    "$name segments to its ground-truth $groundTruthReps reps",
    ({ name, groundTruthReps }) => {
      // The only evidence that matters. A filter strict enough to kill real reps
      // is no better than one loose enough to invent them, so all six takes are
      // asserted with the same code and the same constants.
      expect(depthRepsFor(name)).toHaveLength(groundTruthReps);
    }
  );

  test("the standing take yields zero reps, not one short one", () => {
    // The negative control, called out separately because it is the failure the
    // whole rebuild started from: the knee-angle path reported 2 reps from a
    // motionless body.
    expect(depthRepsFor("corpus-01-standing")).toHaveLength(0);
  });

  test("the degraded reps are found, not dropped for being shallow", () => {
    const reps = depthRepsFor("corpus-05-degrading");
    const peaks = reps.map((r) => r.bottomDepthRatio);

    expect(reps).toHaveLength(8);
    // First five deep, last three deliberately shallow. If MAX_ENTER_OFFSET is
    // ever removed, the last three vanish and this take reports 5.
    expect(Math.min(...peaks.slice(0, 5))).toBeGreaterThan(0.6);
    expect(Math.max(...peaks.slice(5))).toBeLessThan(0.4);
  });

  test("reps arrive in order and do not overlap", () => {
    for (const { name, groundTruthReps } of CORPUS_TAKES) {
      if (groundTruthReps === 0) continue;
      const reps = depthRepsFor(name);

      for (let i = 0; i < reps.length; i++) {
        expect(reps[i].bottomIndex, `${name} rep ${i + 1} bottom outside its span`)
          .toBeGreaterThanOrEqual(reps[i].startIndex);
        expect(reps[i].bottomIndex).toBeLessThanOrEqual(reps[i].endIndex);
        if (i > 0) {
          expect(reps[i].startIndex, `${name} rep ${i + 1} overlaps rep ${i}`)
            .toBeGreaterThan(reps[i - 1].endIndex);
        }
      }
    }
  });

  test("the depth signal beats the knee-angle signal on the same takes", () => {
    // The reason for the whole rebuild, measured rather than asserted. Both
    // paths are run over the same corpus; keep the knee path alive until this
    // comparison stops being informative (Phase 5).
    const kneeErrors: string[] = [];
    const depthErrors: string[] = [];

    for (const { name, groundTruthReps } of CORPUS_TAKES) {
      const corpus = loadCorpus(name);
      // Knee angle from the raw landmarks: hip-knee-ankle interior angle.
      const kneeAngles = corpus.frames.map((f) => {
        if (!f.lm) return null;
        const hip = f.lm[2];
        const knee = f.lm[4];
        const ankle = f.lm[6];
        if (Math.min(hip[3], knee[3], ankle[3]) < 0.5) return null;
        const a = Math.hypot(hip[0] - knee[0], hip[1] - knee[1]);
        const b = Math.hypot(ankle[0] - knee[0], ankle[1] - knee[1]);
        const c = Math.hypot(hip[0] - ankle[0], hip[1] - ankle[1]);
        const cos = (a * a + b * b - c * c) / (2 * a * b);
        return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
      });

      if (detectReps(kneeAngles).length !== groundTruthReps) kneeErrors.push(name);
      if (depthRepsFor(name).length !== groundTruthReps) depthErrors.push(name);
    }

    expect(depthErrors).toEqual([]);
    // Not asserting a specific knee failure count — asserting that swapping the
    // signal was not a lateral move. If the knee path ever matches the depth
    // path on all six takes, this phase's premise needs revisiting.
    expect(kneeErrors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails, then passes**

Run: `npx vitest run src/form-checker/rep-segmentation.corpus.test.ts`

The ground-truth assertions should pass on the first run, because the constants
in Tasks 2–3 were measured from these exact takes. **If any take is off, do not
adjust a constant to make it pass.** Re-derive from the corpus, record what
changed and why in `corpus-manifest.md`, and note that the constant's documented
window moved.

The `beats the knee-angle signal` test may need its final expectation adjusted
once the knee failure count is known. Record the actual count in the comment
rather than leaving the inequality vague.

- [ ] **Step 3: Record the measured per-rep peaks in the manifest**

Add a table under a new `## Phase 3 — segmentation results (2026-07-29)` heading
in `docs/superpowers/plans/2026-07-28-measurement-rebuild/corpus-manifest.md`
with, for each take: the p05/p95 depth, the derived enter and exit thresholds,
which of the two enter terms bound, and every rep's `bottomDepthRatio` and frame
span. These are the numbers Phase 4 and Phase 5 will cite, and the numbers a
future regression will be diagnosed against. Also record the knee-signal counts
from the comparison test beside the depth counts.

- [ ] **Step 4: Commit**

```bash
git add src/form-checker/rep-segmentation.corpus.test.ts \
  docs/superpowers/plans/2026-07-28-measurement-rebuild/corpus-manifest.md
git commit -m "test(measure): validate depth-signal segmentation against the corpus"
```

---

### Task 5: Per-rep deviation, and the answer to the open risk

The structural plan's one unanswered product question: the tool promises to flag
a rep unlike the user's others, and until reps could be segmented there was no
way to know whether that signal exists. `corpus-05-degrading` is the only take
that can test it — its last three reps were performed deliberately worse.

**Files:**
- Create: `src/form-checker/rep-deviation.ts`
- Test: `src/form-checker/rep-deviation.test.ts`
- Modify: `src/form-checker/rep-segmentation.corpus.test.ts` (append a describe block)
- Modify: `docs/superpowers/plans/2026-07-28-measurement-rebuild/corpus-manifest.md`

**Interfaces:**
- Consumes: `TrunkSample`; `Baseline` and `withinCalibratedScale` from
  `calibration.ts`; `percentile` from `rep-detection.ts`; `DepthRep` from Task 3.
- Produces:
  ```ts
  export function rollingDepthSeries(
    samples: (TrunkSample | null)[],
    baseline: Baseline,
    readyAt: number
  ): (number | null)[];

  export interface RepDeviation {
    bottomDepthRatio: number;
    deviationFraction: number;
    unusual: boolean;
  }
  export function repDeviations(
    reps: DepthRep[],
    rolling: (number | null)[]
  ): RepDeviation[];
  ```

- [ ] **Step 1: Write the failing tests**

```typescript
// src/form-checker/rep-deviation.test.ts
import { describe, test, expect } from "vitest";
import { rollingDepthSeries, repDeviations } from "./rep-deviation";
import type { TrunkSample } from "../pose/planar-measures";
import type { Baseline } from "./calibration";
import type { DepthRep } from "./rep-segmentation";

const baseline: Baseline = { hipY: 0.5, trunkLength: 0.3, leanDegrees: 2, frameCount: 90 };

function sample(hipY: number, trunkLength = 0.3): TrunkSample {
  return { leanDegrees: 2, hipY, trunkLength, minVisibility: 0.99 };
}

/** 240 frames of standing, then a 60-frame descent to `depth` and back. */
function set(depth: number, trunkLength = 0.3): (TrunkSample | null)[] {
  const stand = Array.from({ length: 240 }, () => sample(0.5, trunkLength));
  const down = Array.from({ length: 30 }, (_, i) =>
    sample(0.5 + (depth * trunkLength * (i + 1)) / 30, trunkLength)
  );
  return [...stand, ...down, ...[...down].reverse()];
}

describe("rollingDepthSeries", () => {
  test("reads zero while standing", () => {
    const rolling = rollingDepthSeries(set(0.6), baseline, 90);

    expect(rolling[200]).toBeCloseTo(0, 4);
  });

  test("reads the same depth for the same movement at a different distance", () => {
    // The whole point. corpus-06-drift performs identical reps before and after
    // stepping toward the camera; a session-global baseline reports the later
    // ones as 39.4% deeper. See the manifest's "Drift finding".
    const near = rollingDepthSeries(set(0.6, 0.3), baseline, 90);
    const far = rollingDepthSeries(set(0.6, 0.42), baseline, 90);

    expect(Math.max(...far.map((v) => v ?? 0))).toBeCloseTo(
      Math.max(...near.map((v) => v ?? 0)),
      3
    );
  });

  test("leaves pre-calibration frames unevaluated", () => {
    const rolling = rollingDepthSeries(set(0.6), baseline, 90);

    expect(rolling.slice(0, 90).every((v) => v === null)).toBe(true);
  });

  test("leaves frames outside the calibrated scale unevaluated", () => {
    const samples = set(0.6);
    samples[300] = sample(0.5, 0.3 * 2.635);
    const rolling = rollingDepthSeries(samples, baseline, 90);

    expect(rolling[300]).toBeNull();
  });

  test("is the same length as its input", () => {
    const samples = set(0.6);

    expect(rollingDepthSeries(samples, baseline, 90)).toHaveLength(samples.length);
  });
});

describe("repDeviations", () => {
  const rep = (bottomIndex: number): DepthRep => ({
    startIndex: bottomIndex - 20,
    endIndex: bottomIndex + 20,
    bottomIndex,
    bottomDepthRatio: 0
  });

  test("reports every rep as usual when the set is consistent", () => {
    const rolling = new Array(500).fill(0.6);
    const deviations = repDeviations([rep(100), rep(200), rep(300)], rolling);

    expect(deviations.every((d) => !d.unusual)).toBe(true);
    expect(deviations.every((d) => Math.abs(d.deviationFraction) < 1e-9)).toBe(true);
  });

  test("flags a rep far shallower than the set median", () => {
    const rolling: (number | null)[] = new Array(500).fill(0.6);
    for (let i = 280; i < 320; i++) rolling[i] = 0.25;
    const deviations = repDeviations([rep(100), rep(200), rep(300)], rolling);

    expect(deviations[2].deviationFraction).toBeLessThan(-0.5);
    expect(deviations[2].unusual).toBe(true);
    expect(deviations[0].unusual).toBe(false);
  });

  test("does not flag the ordinary spread of a consistent set", () => {
    // corpus-03-five-normal's reps spread to 17.1% either side of its median and
    // every one of them is a good rep. Flagging those would make the feature
    // noise.
    const rolling: (number | null)[] = new Array(500).fill(0.45);
    for (let i = 80; i < 120; i++) rolling[i] = 0.45 * 0.829;
    for (let i = 280; i < 320; i++) rolling[i] = 0.45 * 1.171;
    const deviations = repDeviations([rep(100), rep(200), rep(300)], rolling);

    expect(deviations.every((d) => !d.unusual)).toBe(true);
  });

  test("measures a rep from its own span, not the whole series", () => {
    const rolling: (number | null)[] = new Array(500).fill(0);
    for (let i = 90; i < 110; i++) rolling[i] = 0.6;
    for (let i = 190; i < 210; i++) rolling[i] = 0.6;
    for (let i = 290; i < 310; i++) rolling[i] = 0.6;
    const deviations = repDeviations([rep(100), rep(200), rep(300)], rolling);

    expect(deviations.map((d) => d.bottomDepthRatio)).toEqual([0.6, 0.6, 0.6]);
  });

  test("returns nothing for no reps rather than dividing by zero", () => {
    expect(repDeviations([], new Array(100).fill(0.5))).toEqual([]);
  });

  test("does not flag anything in a set of one rep", () => {
    // One rep is its own median. There is nothing to be unlike.
    const deviations = repDeviations([rep(100)], new Array(500).fill(0.6));

    expect(deviations).toHaveLength(1);
    expect(deviations[0].unusual).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/form-checker/rep-deviation.test.ts`
Expected: FAIL — `Failed to resolve import "./rep-deviation"`.

- [ ] **Step 3: Implement `rep-deviation.ts`**

```typescript
// src/form-checker/rep-deviation.ts
import type { TrunkSample } from "../pose/planar-measures";
import { withinCalibratedScale, type Baseline } from "./calibration";
import { percentile } from "./rep-detection";
import type { DepthRep } from "./rep-segmentation";

/**
 * Trailing window for the rolling reference, in frames. 3s at 60fps.
 *
 * Settled in Phase 2 and NOT to be re-litigated here — see corpus-manifest.md,
 * "Drift finding". Measured on corpus-06-drift, where the user stepped toward
 * the camera mid-set and performed identical reps at both distances:
 *
 *   session-global baseline            39.4% inflation
 *   hip-Y p10 @10s, fixed trunk        34.4%
 *   hip-Y p10 + trunk p90 @10s         69.0%   (a 10s window straddles the step)
 *   hip-Y p10 + trunk p90 @5s           9.2%
 *   hip-Y p10 + trunk p90 @3s          -0.5%
 *
 * The window must be short enough not to straddle a change of distance and long
 * enough to contain a standing moment within a rep cycle. 3s satisfies both.
 */
const ROLLING_BASELINE_FRAMES = 180;

/**
 * Percentile direction is easy to invert and inverting it silently produces
 * garbage, so state it: hip Y grows DOWNWARD in image space, so the 10th
 * percentile of hip Y over the window is the HIGHEST hip position — standing.
 * Trunk length is LONGEST when standing upright, so the 90th percentile is the
 * standing body scale.
 */
const HIP_REFERENCE_PERCENTILE = 0.1;
const TRUNK_REFERENCE_PERCENTILE = 0.9;

/** A window with fewer measured frames than this cannot supply a reference. */
const MIN_WINDOW_SAMPLES = ROLLING_BASELINE_FRAMES / 2;

/**
 * How far a rep's depth may sit from the set median before it is reported as
 * unlike the user's other reps, as a fraction of that median.
 *
 * Measured window 0.18-0.49. Below 0.18: corpus-03-five-normal's reps, all of
 * them good, spread to 17.1% either side of its median and start being flagged.
 * Above 0.49: corpus-05-degrading's least-degraded bad rep sits at -49.5% and
 * stops being flagged. 0.30 sits 1.75x above the widest consistent-set spread
 * and 1.65x below the weakest true positive.
 */
const UNUSUAL_REP_FRACTION = 0.3;

/**
 * Depth measured against a short trailing reference rather than the set's
 * opening baseline, so reps can be compared to each other.
 *
 * The session-global baseline is correct for COUNTING reps and wrong for
 * comparing them: on corpus-06-drift it reports reps 3-5 as 39% deeper than
 * reps 1-2 when the movement was the same and only the distance to the camera
 * changed. That is exactly the class of confident wrong number this rebuild
 * exists to eliminate, so any within-set comparison uses this series instead.
 *
 * `baseline` and `readyAt` still come from the session's calibration: the
 * baseline supplies the scale guard's reference, and readyAt marks where the
 * tracker had converged. Neither is used as the depth reference.
 */
export function rollingDepthSeries(
  samples: (TrunkSample | null)[],
  baseline: Baseline,
  readyAt: number
): (number | null)[] {
  const out: (number | null)[] = new Array(samples.length).fill(null);

  for (let i = readyAt; i < samples.length; i++) {
    const sample = samples[i];
    if (sample === null || !withinCalibratedScale(sample, baseline)) continue;

    const hipYs: number[] = [];
    const trunkLengths: number[] = [];
    for (let j = Math.max(0, i - ROLLING_BASELINE_FRAMES + 1); j <= i; j++) {
      const windowSample = samples[j];
      if (windowSample === null || !withinCalibratedScale(windowSample, baseline)) continue;
      hipYs.push(windowSample.hipY);
      trunkLengths.push(windowSample.trunkLength);
    }
    if (hipYs.length < MIN_WINDOW_SAMPLES) continue;

    hipYs.sort((a, b) => a - b);
    trunkLengths.sort((a, b) => a - b);
    const hipReference = percentile(hipYs, HIP_REFERENCE_PERCENTILE)!;
    const trunkReference = percentile(trunkLengths, TRUNK_REFERENCE_PERCENTILE)!;

    out[i] = (sample.hipY - hipReference) / trunkReference;
  }

  return out;
}

/** One rep re-measured against the set it belongs to. */
export interface RepDeviation {
  /** Deepest point of the rep on the rolling series. */
  bottomDepthRatio: number;
  /** Signed fraction: negative is shallower than the set median. */
  deviationFraction: number;
  /**
   * Whether this rep is unlike the user's others in this set. Never a statement
   * about the spine, injury risk, or whether the rep was "wrong" — only that it
   * differs from what this user did in the rest of this set.
   */
  unusual: boolean;
}

/**
 * Re-measures each rep on the rolling series and compares it to the median of
 * the set. Median rather than mean, for the same reason Phase 2's baseline uses
 * one: on a set that degrades, the mean drags toward the bad reps and hides
 * them.
 *
 * A rep with no measured frames on the rolling series is reported at depth 0 and
 * never flagged — "not evaluated" must not become "flagged as unusual".
 */
export function repDeviations(reps: DepthRep[], rolling: (number | null)[]): RepDeviation[] {
  if (reps.length === 0) return [];

  const depths = reps.map((rep) => {
    let deepest: number | null = null;
    for (let i = rep.startIndex; i <= rep.endIndex && i < rolling.length; i++) {
      const value = rolling[i];
      if (value === null) continue;
      if (deepest === null || value > deepest) deepest = value;
    }
    return deepest;
  });

  const measured = depths.filter((d): d is number => d !== null).sort((a, b) => a - b);
  const median = measured.length === 0 ? null : percentile(measured, 0.5)!;

  return depths.map((depth) => {
    if (depth === null || median === null || median === 0) {
      return { bottomDepthRatio: depth ?? 0, deviationFraction: 0, unusual: false };
    }
    const deviationFraction = (depth - median) / median;
    return {
      bottomDepthRatio: depth,
      deviationFraction,
      unusual: Math.abs(deviationFraction) > UNUSUAL_REP_FRACTION
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/form-checker/rep-deviation.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Write the corpus test that answers the open risk**

```typescript
// append to src/form-checker/rep-segmentation.corpus.test.ts
import { rollingDepthSeries, repDeviations } from "./rep-deviation";

function deviationsFor(name: string) {
  const corpus = loadCorpus(name);
  const samples: (TrunkSample | null)[] = corpus.frames.map((f) =>
    f.lm ? trunkSample(f.lm, corpus.aspectRatio) : null
  );
  const series = buildDepthSeries(samples)!;
  const reps = detectDepthReps(series.values);
  const rolling = rollingDepthSeries(samples, series.baseline, series.readyAt);
  return repDeviations(reps, rolling);
}

describe("the deviation signal — the open risk this phase resolves", () => {
  test("separates corpus-05-degrading's deliberately worse reps from its good ones", () => {
    // The product promises to flag a rep unlike the user's others. Until reps
    // could be segmented there was no way to know whether that signal exists.
    // This is the only take that can test it: reps 6-8 were performed
    // deliberately worse than reps 1-5.
    const deviations = deviationsFor("corpus-05-degrading");

    expect(deviations).toHaveLength(8);
    expect(deviations.slice(0, 5).every((d) => !d.unusual)).toBe(true);
    expect(deviations.slice(5).every((d) => d.unusual)).toBe(true);
  });

  test("flags nothing on the takes where every rep was the same", () => {
    // The negative control for the flag. corpus-06-drift is included on purpose:
    // with a session-global baseline its reps 3-5 read 39% deeper than reps 1-2
    // for an identical movement, which would flag three good reps.
    for (const name of ["corpus-02-five-slow", "corpus-03-five-normal", "corpus-06-drift"]) {
      const deviations = deviationsFor(name);

      expect(
        deviations.filter((d) => d.unusual).length,
        `${name} flagged a rep that was like all the others`
      ).toBe(0);
    }
  });

  test("flags nothing on the shallow take, where every rep was shallow alike", () => {
    // Consistently shallow is not the same as one rep unlike the others. The
    // deviation signal is within-set only; whether shallow is good is a
    // different question and not one this tool answers.
    expect(deviationsFor("corpus-04-shallow").filter((d) => d.unusual)).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run it**

Run: `npx vitest run src/form-checker/rep-segmentation.corpus.test.ts`

Expected from the scratchpad measurement: `corpus-05-degrading` deviations of
roughly `0%, +2%, +5%, +5%, +11%, -65%, -58%, -50%`, and consistent-take spreads
within ±18%. **If the separation does not hold, that is the finding and the phase
stops here** — record it in the manifest, say plainly that the deviation feature
does not work, and flag it before Phase 5 builds UI on it. Do not widen
`UNUSUAL_REP_FRACTION` until it passes; the whole point of the measured window is
that a value outside it is known to break one of the two directions.

- [ ] **Step 7: Record the answer in the manifest**

Under a new `## Deviation signal — answered in Phase 3 (2026-07-29)` heading in
`corpus-manifest.md`, record:

- The per-rep deviation table for `corpus-05-degrading` with the actual numbers
  the implementation produced.
- The observed spread on each consistent take, and the widest one.
- The measured working window for `UNUSUAL_REP_FRACTION` and where 0.30 sits in it.
- **The finding that lean does not separate.** Measured on take 5: maximum
  `leanDelta` excursion per rep gives −2%, +32%, +113% for the three degraded
  reps while rep 1, a good rep, reads +233%, and `corpus-03-five-normal`'s rep 1
  reads +99%. Trunk-lean deviation is noise at this scale and must not be used as
  a flag. Only depth separates. Phase 5 must not present a lean-based flag.
- Strike through the corresponding bullet in "What this corpus does NOT yet
  resolve" and point at this section.

- [ ] **Step 8: Commit**

```bash
git add src/form-checker/rep-deviation.ts src/form-checker/rep-deviation.test.ts \
  src/form-checker/rep-segmentation.corpus.test.ts \
  docs/superpowers/plans/2026-07-28-measurement-rebuild/corpus-manifest.md
git commit -m "feat(measure): compare reps against a rolling within-set baseline"
```

---

### Task 6: Wire `summarizeSession` to the depth path

Keeps both signals alive, as the structural plan requires. No UI or copy change —
that is Phase 5, and so is removing the knee path.

**Files:**
- Modify: `src/render/progress-chart.ts:31-64` (`summarizeSession`)
- Test: `src/render/progress-chart.test.ts` (append)

**Interfaces:**
- Consumes: `buildDepthSeries` (Task 1), `detectDepthReps` (Task 3),
  `TrunkSample`.
- Produces:
  ```ts
  export function summarizeSession(
    frames: SessionFrameRecord[],
    exercise: ExerciseDefinition,
    trunkSamples?: (TrunkSample | null)[]
  ): SessionSummary;
  ```
  `SessionSummary` is unchanged. When `trunkSamples` is omitted the behaviour is
  byte-for-byte what it is today.

- [ ] **Step 1: Write the failing tests**

```typescript
// append to src/render/progress-chart.test.ts
import type { TrunkSample } from "../pose/planar-measures";

/**
 * Frames whose knee-angle rule never evaluates, so the only way a rep can be
 * found is through the depth signal.
 */
function unevaluatedFrames(count: number): SessionFrameRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    sessionId: "s",
    timestamp: i,
    ruleResults: [
      { ruleName: squat.repSignalRuleName, evaluated: false, passed: false, angleDegrees: null },
      { ruleName: "Trunk lean", evaluated: true, passed: true, angleDegrees: 8 }
    ]
  }));
}

/** 90 still frames, then `reps` descents to 0.6 trunk lengths and back. */
function trunkSamplesWithReps(reps: number): (TrunkSample | null)[] {
  const still = (n: number) =>
    Array.from({ length: n }, () => ({
      leanDegrees: 2,
      hipY: 0.5,
      trunkLength: 0.3,
      minVisibility: 0.99
    }));
  const descent = Array.from({ length: 30 }, (_, i) => ({
    leanDegrees: 2,
    hipY: 0.5 + (0.18 * (i + 1)) / 30,
    trunkLength: 0.3,
    minVisibility: 0.99
  }));
  const out = [...still(120)];
  for (let r = 0; r < reps; r++) {
    out.push(...descent, ...[...descent].reverse(), ...still(30));
  }
  return out;
}

describe("summarizeSession with the depth signal", () => {
  test("still uses the knee-angle path when no trunk samples are supplied", () => {
    const summary = summarizeSession(repFrames(115), squat);

    expect(summary.repCount).toBeGreaterThan(0);
  });

  test("counts reps from the depth signal when trunk samples are supplied", () => {
    const samples = trunkSamplesWithReps(3);
    const summary = summarizeSession(unevaluatedFrames(samples.length), squat, samples);

    expect(summary.repCount).toBe(3);
  });

  test("grades the rules at the depth-segmented rep bottoms", () => {
    const samples = trunkSamplesWithReps(3);
    const summary = summarizeSession(unevaluatedFrames(samples.length), squat, samples);

    // Every frame's "Trunk lean" rule passes, and the knee rule never evaluates.
    expect(summary.passRate).toBe(1);
  });

  test("reports no reps when the depth signal never calibrates", () => {
    const drifting = Array.from({ length: 300 }, (_, i) => ({
      leanDegrees: 2,
      hipY: 0.2 + i * 0.01,
      trunkLength: 0.3,
      minVisibility: 0.99
    }));
    const summary = summarizeSession(unevaluatedFrames(300), squat, drifting);

    expect(summary.repCount).toBe(0);
    expect(summary.passRate).toBeNull();
  });
});
```

Check the existing helper names in `progress-chart.test.ts` before adding this —
`squat` and `repFrames` are already defined there; reuse them rather than
redefining. If `SessionFrameRecord` is not already imported in that file, add it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/render/progress-chart.test.ts`
Expected: FAIL — `summarizeSession` ignores its third argument, so the depth
tests report 0 reps.

- [ ] **Step 3: Modify `summarizeSession`**

Add these imports at the top of `src/render/progress-chart.ts`:

```typescript
import type { TrunkSample } from "../pose/planar-measures";
import { buildDepthSeries } from "../form-checker/depth-series";
import { detectDepthReps } from "../form-checker/rep-segmentation";
```

Replace the body's rep-finding section (currently the `signalAngles` /
`detectReps` block) with:

```typescript
  // Two rep signals, deliberately both alive through Phase 3. The depth signal
  // is the one the rebuild is moving to — the knee has cleared a 0.5 visibility
  // threshold on as little as 59% of frames across captures, while shoulder and
  // hip have tracked at 99-100% in every one. Running both on the same takes is
  // how we found out the new signal is actually better rather than merely
  // different. Removing the knee path is Phase 5.
  const bottomIndexes = trunkSamples
    ? depthRepBottoms(trunkSamples)
    : kneeRepBottoms(frames, exercise);

  if (bottomIndexes.length === 0) {
    return { repCount: 0, passRate: null, coverageRate };
  }

  let passedAtBottoms = 0;
  let evaluatedAtBottoms = 0;
  for (const bottomIndex of bottomIndexes) {
    const frame = frames[bottomIndex];
    if (frame === undefined) continue;
    for (const rule of frame.ruleResults) {
      if (!rule.evaluated) continue;
      evaluatedAtBottoms += 1;
      if (rule.passed) passedAtBottoms += 1;
    }
  }

  return {
    repCount: bottomIndexes.length,
    passRate: evaluatedAtBottoms === 0 ? null : passedAtBottoms / evaluatedAtBottoms,
    coverageRate
  };
}

/** Rep bottoms from the exercise's knee-angle rep signal. */
function kneeRepBottoms(
  frames: SessionFrameRecord[],
  exercise: ExerciseDefinition
): number[] {
  const signalAngles = frames.map((f) => {
    const signal = f.ruleResults.find((r) => r.ruleName === exercise.repSignalRuleName);
    return signal?.evaluated ? signal.angleDegrees : null;
  });
  return detectReps(signalAngles).map((rep) => rep.bottomIndex);
}

/**
 * Rep bottoms from the hip-depth signal. Returns nothing when the run never
 * produced a usable standing baseline — a refusal to measure, which is distinct
 * from measuring zero reps.
 */
function depthRepBottoms(trunkSamples: (TrunkSample | null)[]): number[] {
  const series = buildDepthSeries(trunkSamples);
  if (series === null) return [];
  return detectDepthReps(series.values).map((rep) => rep.bottomIndex);
}
```

and change the signature to:

```typescript
export function summarizeSession(
  frames: SessionFrameRecord[],
  exercise: ExerciseDefinition,
  trunkSamples?: (TrunkSample | null)[]
): SessionSummary {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/render/progress-chart.test.ts`
Expected: PASS — the four new tests plus every existing one. The existing tests
call `summarizeSession(frames, squat)` with no third argument and must be
unchanged.

- [ ] **Step 5: Full verification**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no typecheck output; all test files pass; build succeeds with only the
pre-existing chunk-size warning.

- [ ] **Step 6: Mutation-test the phase's load-bearing decisions**

Per the standing lesson that a green test is evidence about the test, not the
code. Break each of these one at a time, confirm the named test fails, then
revert:

| mutation | must fail |
|---|---|
| Remove the `Math.min(..., MAX_ENTER_OFFSET)` cap | `corpus-05-degrading segments to its ground-truth 8 reps`; `counts a shallower rep in the same set as the deep ones` |
| Use `MAX_ENTER_OFFSET` flat, dropping `range * ENTER_FRACTION` | `counts reps in a set shallower than the absolute enter threshold` (synthetic — no corpus take exercises this branch) |
| Flip `depth > enterThreshold` to `<` | every squatting take's count |
| Flip `depth > bottomDepth` to `<` | `reports the deepest point as the maximum, not the minimum` |
| Treat `null` as 0 instead of `continue` | `does not end a rep because the tracker blinked at the bottom` |
| Set `MIN_REP_DEPTH_RATIO = 0.01` | `corpus-01-standing segments to its ground-truth 0 reps` |
| Remove the `rejectImplausibleDepthJumps` call from `detectDepthReps` | **nothing — this mutation survives.** Expected, and recorded in the manifest rather than fixed with a contrived test: the filter rejects 7 frames in the whole corpus and none could form a rep. Do not spend time trying to make it fail. |
| Swap hip-Y p10 for p90 in `rollingDepthSeries` | `separates corpus-05-degrading's deliberately worse reps` |
| Set `ROLLING_BASELINE_FRAMES = 600` (10s) | `flags nothing on the takes where every rep was the same` (corpus-06-drift) |
| Use mean instead of median in `repDeviations` | `separates corpus-05-degrading's deliberately worse reps` |

Record any mutation that does **not** fail a test — that is a gap in the suite,
and the fix is a new test, not a shrug.

- [ ] **Step 7: Commit**

```bash
git add src/render/progress-chart.ts src/render/progress-chart.test.ts
git commit -m "feat(progress): summarize sessions from the depth-signal rep segmentation"
```

---

## Done criteria

- [ ] `npx tsc --noEmit` clean.
- [ ] `npm test` passes, including every pre-existing test.
- [ ] All six corpus takes segment to their ground-truth rep counts (0/5/5/5/8/5)
      with one set of constants and no per-take special cases.
- [ ] Every threshold constant cites the take it was measured from and the
      measured window it sits inside.
- [ ] The knee-angle path still passes its own tests and is still reachable from
      `summarizeSession`.
- [ ] The drift finding from Phase 2 is honoured, not re-decided: session-global
      for counting, 3s rolling for within-set comparison.
- [ ] The deviation-signal risk is answered in writing in `corpus-manifest.md`
      with numbers, including the negative finding about trunk lean.
- [ ] Every mutation in Task 6 Step 6 fails the test that names it.

## Does NOT do

Confidence gating (Phase 4). Any UI, copy, or `main.ts` change (Phase 5).
Removing the knee-angle path (Phase 5). Any claim about the spine, discs, or
injury risk, ever.

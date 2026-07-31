# Phase 4 + 5 Combined Implementation Plan — Wiring, Calibration, Copy Honesty, Confidence Gating

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the depth signal (built in Phases 2–3) into the running app, replace the
absolute-degree "% good form" session score with baseline-relative depth/lean numbers,
require a live standing calibration before recording, retire the knee-angle rep-counting
path, and — once that UI exists to speak through — add rep-level confidence gating so a
tracking dropout produces "seen but not graded" instead of corrupting a verdict.

**Architecture:** Part A wires `main.ts` to the existing `buildDepthSeries` /
`detectDepthReps` pipeline, adds a live calibration gate ahead of the space-bar
recording trigger, and rewrites `summarizeSession` / `renderProgressSummary` around
depth and lean deltas instead of the knee-angle rule's pass rate. Part B adds
`src/pose/smoothing.ts` and `src/form-checker/rep-confidence.ts` on top of that wiring.

**Tech Stack:** TypeScript, Vite, Vitest, MediaPipe Tasks Vision, IndexedDB.

**Read first:** `HANDOFF.md` and `corpus-manifest.md` in this repo (already read this
session). This plan assumes both.

---

## Scope correction versus the two structural docs this replaces

`phase-5-ui-and-copy.md` (written 2026-07-28, before Phase 3 ran) lists "Streak" and
"Worst-rep replay" as this phase's features. **`HANDOFF.md`, updated 2026-07-30, overrides
that:** "Not the deviation flag UI, not the streak — those are Phase 5b, still after this
session." Worst-rep replay depends on the deviation flag (`repDeviations`'s `unusual`
field — "the single rep with the largest deviation"), so it is excluded for the same
reason. **This plan builds none of the three.** They remain Phase 5b, unscheduled.

`phase-4-confidence-gating.md`'s file list includes `src/form-checker/form-checker.ts`
("per-frame hard gate steps back"). That instruction predates Phase 5's decision (this
plan, Task 4) to drop the knee-angle rule's pass rate from the session summary entirely.
`form-checker.ts`'s per-frame `VISIBILITY_THRESHOLD` gate now only feeds the live overlay
dot and `rule-settings.ts` — a real-time practice cue, not a stored verdict — so it is
**out of scope** for this plan. The confidence-gating problem the design spec describes
("a dropout mid-descent corrupts the verdict") now applies to the **depth** signal, which
is what `rep-confidence.ts` (Part B) gates. This is a deliberate, documented deviation,
not an oversight.

## What was measured before writing this plan (the discipline Phase 3 used)

Phase 4's structural doc listed two unmeasured constants. Both were measured against the
real corpus before this plan was written, the same way Phase 3 derived its constants
before Phase 3's plan was written.

**Rep-bottom window size.** For every rep in `corpus-02-five-slow`, `corpus-03-five-normal`,
and `corpus-05-degrading` (18 reps total — 5+5+8, per `corpus-manifest.md`'s ground-truth
table — frame spans and bottom indices already recorded
in `corpus-manifest.md`'s per-rep detail table), the distance from the rep's bottom frame
to its nearer boundary (`startIndex`/`endIndex`) was computed. The tightest is
**14 frames**, in `corpus-05-degrading`'s sixth rep (`startIndex 1045, bottomIndex 1059,
endIndex 1080` — 14 frames to the start, 21 to the end). A half-window of 12 frames
(25-frame window, ~0.42s at 60fps) fits inside every rep in the corpus with 2 frames of
margin on the tightest one.

**`MIN_REP_MEDIAN_VISIBILITY`.** Median trunk-landmark (shoulder/hip) visibility was
computed in a ±12-frame window around every one of the same 18 rep bottoms. **The lowest
median found anywhere is 0.9979** (`corpus-02-five-slow`, rep bottom 514), and the lowest
*single-frame* visibility anywhere inside any rep's full span (not just the bottom window)
is also 0.9979 (`corpus-02-five-slow`, frame 521). **This corpus contains no example of a
genuinely low-confidence rep** — shoulder and hip track at ≥99.79% visibility through
every graded rep in every take that reaches segmentation, consistent with Phase 2's
finding that shoulder/hip track near-perfectly everywhere. This means the accept side of
`MIN_REP_MEDIAN_VISIBILITY` is trivially satisfied by any threshold below 0.998, but the
**reject side cannot be corpus-validated** — there is no real degraded rep to check it
against. The threshold is therefore set to **0.5**, matching the existing
`VISIBILITY_THRESHOLD` used everywhere else in this codebase for the same "is this joint
occluded" question, and the reject side is covered by a synthetic test, labelled as such —
the same honesty precedent Phase 3 set for `MAX_ENTER_OFFSET`'s relative term.

**Consequence for validation (Task 11):** because no real rep in the corpus is ever
expected to fail this gate, "every corpus-02/03/05 rep is graded" is not a strong test —
it would pass even with the gate's logic backwards. Task 11 must additionally use a
synthetic-injected low-visibility window on a real corpus rep to prove the gate can
actually reject.

## The riskiest assumption in this plan — flagged here, not buried in a task

Task 5 runs a **live** calibration gate (`assessCalibration`, trailing 90-frame window)
from camera-start, independent of `recording`. Task 6 then starts a **separate**
`trunkSamples` array only once `recording` becomes true, and hands it to
`summarizeSession` → `buildDepthSeries` → `findBaseline`, which does its own forward scan
for a fresh 90-frame stable window.

**Those are two different 90-frame windows, and the second one is not guaranteed to
exist.** The live gate's proof of stillness lives in `calibrationBuffer`, which is
discarded at the moment recording starts. Independent replay against the corpus shows the
post-press series fails to re-calibrate on the majority of takes — inter-rep standing
gaps in this corpus run 37-66 frames, never the 90 the gate needs, so a user who starts
squatting promptly after "Calibrated" appears gets **zero reps reported** despite doing
everything right. Task 6, Step 1 fixes this by seeding `trunkSamples` with the exact
90-frame window the live gate just accepted, rather than discarding it — do not skip that
step or treat it as optional; without it, Part A's live wiring does not actually work.

## Decision this session must make about `rejectImplausibleDepthJumps`

`corpus-manifest.md` and `HANDOFF.md` both flag this as open: "Phase 4 should decide
whether a filter with no failing case on real data belongs in the pipeline at all." **Kept
in place, unchanged.** Its own behavior has six direct unit tests; it is the guard against
high-visibility nonsense mid-take (a different failure mode than `withinCalibratedScale`,
which the capture-protocol tail defeats — see corpus-manifest.md, "Neither existing guard
catches it, and one of them provably cannot"); and it is not inert even though it changes
no rep count — removing it shifts `corpus-04-shallow`'s p05 calibration point by 0.011.
"No effect on rep counts" is not "no effect." No task in this plan touches it.

---

# Part A — Wiring, calibration, knee-path retirement, copy honesty

## Task 1: Extract `percentile` out of the file being deleted

**Files:**
- Create: `src/pose/percentile.ts`
- Create: `src/pose/percentile.test.ts`
- Modify: `src/form-checker/rep-segmentation.ts:1`
- Modify: `src/form-checker/rep-deviation.ts:3`

`percentile` lives in `rep-detection.ts`, which Task 3 relocates out of production. Two other modules
(`rep-segmentation.ts`, `rep-deviation.ts`) import it from there, so it must move to a
domain-neutral home first.

- [ ] **Step 1: Write the failing test**

```typescript
// src/pose/percentile.test.ts
import { describe, test, expect } from "vitest";
import { percentile } from "./percentile";

describe("percentile", () => {
  test("returns null for an empty series", () => {
    expect(percentile([], 0.5)).toBeNull();
  });

  test("returns the single value for a one-element series", () => {
    expect(percentile([42], 0.05)).toBe(42);
  });

  test("interpolates between neighbouring samples", () => {
    expect(percentile([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.05)).toBe(5);
  });

  test("returns the extremes at p=0 and p=1", () => {
    expect(percentile([1, 2, 3], 0)).toBe(1);
    expect(percentile([1, 2, 3], 1)).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pose/percentile.test.ts`
Expected: FAIL — `Cannot find module './percentile'`

- [ ] **Step 3: Create the module (moved verbatim from `rep-detection.ts:47-60`)**

```typescript
// src/pose/percentile.ts
/**
 * Linear-interpolated percentile over an ascending-sorted series.
 *
 * Moved here from rep-detection.ts (deleted with the knee-angle rep path) because
 * rep-segmentation.ts and rep-deviation.ts both depend on it and neither is
 * knee-specific — this is a general statistics helper, not exercise geometry.
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pose/percentile.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Repoint the two importers**

In `src/form-checker/rep-segmentation.ts:1`, change:
```typescript
import { percentile } from "./rep-detection";
```
to:
```typescript
import { percentile } from "../pose/percentile";
```

In `src/form-checker/rep-deviation.ts:3`, change:
```typescript
import { percentile } from "./rep-detection";
```
to:
```typescript
import { percentile } from "../pose/percentile";
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: All passing (rep-detection.ts still exists and still exports its own
`percentile`, unused by anything but its own tests, until Task 3 relocates it out of
production).

- [ ] **Step 7: Commit**

```bash
git add src/pose/percentile.ts src/pose/percentile.test.ts src/form-checker/rep-segmentation.ts src/form-checker/rep-deviation.ts
git commit -m "refactor: extract percentile out of rep-detection.ts ahead of its removal"
```

## Task 2: Redesign `SessionSummary` around the depth signal only

**Files:**
- Modify: `src/render/progress-chart.ts`
- Modify: `src/render/progress-chart.test.ts`

This is the core of "retire the knee-angle path" and "fix copy that claims more than the
tool can measure" combined: `kneeRepBottoms` (the fallback) is deleted, and the summary's
shape changes from a knee-rule pass rate (an absolute-degree claim, forbidden by the
design spec's checklist item 3 and item 4 — a score computed from partial coverage) to
per-rep depth and lean **deltas from the user's own baseline** (explicitly the honest
claim set's first two items). `summarizeSession` also drops the `frames`/`exercise`
parameters it no longer reads — the depth signal comes entirely from `trunkSamples`, so
carrying unused parameters forward would only invite the next reader to assume they still
matter.

- [ ] **Step 1: Write the failing tests (replacing the file's existing knee-path tests)**

Replace `src/render/progress-chart.test.ts` in full with:

```typescript
import { describe, test, expect } from "vitest";
import { summarizeSession, renderProgressSummary } from "./progress-chart";
import type { TrunkSample } from "../pose/planar-measures";

/** 120 still frames, then `reps` descents to 0.6 trunk lengths and back. */
function trunkSamplesWithReps(reps: number, leanDegrees = 2): (TrunkSample | null)[] {
  const still = (n: number) =>
    Array.from({ length: n }, () => ({
      leanDegrees,
      hipY: 0.5,
      trunkLength: 0.3,
      minVisibility: 0.99
    }));
  const descent = Array.from({ length: 30 }, (_, i) => ({
    leanDegrees,
    hipY: 0.5 + (0.18 * (i + 1)) / 30,
    trunkLength: 0.3,
    minVisibility: 0.99
  }));
  const out: (TrunkSample | null)[] = [...still(120)];
  for (let r = 0; r < reps; r++) {
    out.push(...descent, ...[...descent].reverse(), ...still(30));
  }
  return out;
}

describe("summarizeSession", () => {
  test("reports no reps for an empty session", () => {
    const summary = summarizeSession([]);
    expect(summary.repCount).toBe(0);
    expect(summary.reps).toEqual([]);
  });

  test("reports no reps for a session that never calibrates", () => {
    const drifting = Array.from({ length: 300 }, (_, i) => ({
      leanDegrees: 2,
      hipY: 0.2 + i * 0.01,
      trunkLength: 0.3,
      minVisibility: 0.99
    }));
    const summary = summarizeSession(drifting);
    expect(summary.repCount).toBe(0);
    expect(summary.reps).toEqual([]);
  });

  test("counts reps from the depth signal and reports each rep's depth", () => {
    const samples = trunkSamplesWithReps(3);
    const summary = summarizeSession(samples);

    expect(summary.repCount).toBe(3);
    expect(summary.reps).toHaveLength(3);
    for (const rep of summary.reps) {
      expect(rep.bottomDepthRatio).toBeGreaterThan(0.5);
      expect(rep.bottomDepthRatio).toBeLessThan(0.7);
    }
  });

  test("reports each rep's trunk-lean delta from the standing baseline", () => {
    const samples = trunkSamplesWithReps(1, 9);
    const summary = summarizeSession(samples);

    expect(summary.reps).toHaveLength(1);
    // Baseline lean is calibrated from the still frames at leanDegrees 9, and the
    // descent samples also hold leanDegrees at 9, so the delta is ~0.
    expect(summary.reps[0].leanDeltaDegrees).toBeCloseTo(0, 1);
  });

  test("reports trunk-tracking coverage, not rule-evaluation coverage", () => {
    const samples = trunkSamplesWithReps(1);
    const half = Math.floor(samples.length / 2);
    const withGaps = samples.map((s, i) => (i < half ? null : s));
    const summary = summarizeSession(withGaps);

    expect(summary.coverageRate).toBeGreaterThan(0);
    expect(summary.coverageRate).toBeLessThan(1);
  });
});

describe("renderProgressSummary", () => {
  test("states that no reps were detected instead of claiming a form score", () => {
    const container = document.createElement("div");
    renderProgressSummary(container, { repCount: 0, reps: [], coverageRate: 0.14 });

    expect(container.textContent).not.toContain("% good form");
    expect(container.textContent!.toLowerCase()).toContain("no ");
    expect(container.textContent).toContain("rep");
  });

  test("never prints a bare degree value that isn't framed as a delta", () => {
    const container = document.createElement("div");
    renderProgressSummary(container, {
      repCount: 2,
      reps: [
        { bottomDepthRatio: 0.61, leanDeltaDegrees: 2.4 },
        { bottomDepthRatio: 0.58, leanDeltaDegrees: -1.1 }
      ],
      coverageRate: 0.97
    });

    expect(container.textContent).toContain("2 reps");
    // Every degree figure must be adjacent to "baseline" or "standing" language,
    // never presented as a standalone absolute angle.
    expect(container.textContent).toMatch(/from your standing/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/render/progress-chart.test.ts`
Expected: FAIL — `summarizeSession` still returns the old shape and takes the old
arguments; `renderProgressSummary` still expects `passRate`.

- [ ] **Step 3: Rewrite `progress-chart.ts`**

Replace the file in full:

```typescript
import type { TrunkSample } from "../pose/planar-measures";
import { buildDepthSeries } from "../form-checker/depth-series";
import { detectDepthReps, type DepthRep } from "../form-checker/rep-segmentation";
import { leanDelta } from "../form-checker/calibration";

/** One rep's depth and lean, both already expressed as deltas from the user's own baseline. */
export interface RepSummary {
  /** Hip descent at this rep's deepest point, in units of the user's own trunk length. ~0 = standing. */
  bottomDepthRatio: number;
  /** Trunk-lean change from standing posture at this rep's deepest point, in degrees. */
  leanDeltaDegrees: number;
}

export interface SessionSummary {
  /** Number of complete reps detected in the session. */
  repCount: number;
  /** One entry per detected rep, in order. Empty when repCount is 0. */
  reps: RepSummary[];
  /**
   * 0-1, fraction of the session with a usable trunk measurement (shoulders and
   * hips in frame and in a plausible position). Low means the camera rarely had a
   * clear enough view to measure — a framing problem, not a form problem.
   */
  coverageRate: number;
}

/**
 * Grades a session entirely from the depth signal (Phase 2-3). The knee-angle path
 * (relocated to tests/knee-rep-baseline.ts in Task 3) is retired from production: it got
 * three of six corpus ground-truth rep counts wrong where this signal gets all six right
 * (corpus-manifest.md), and its "% good form" score was computed from an absolute-degree
 * rule the design forbids presenting as a claim (see the forbidden-claims checklist in
 * the measurement rebuild spec). Every number this function returns is a delta from the
 * user's own standing baseline, never an absolute angle.
 */
export function summarizeSession(trunkSamples: (TrunkSample | null)[]): SessionSummary {
  const measured = trunkSamples.filter((s): s is TrunkSample => s !== null).length;
  const coverageRate = trunkSamples.length === 0 ? 0 : measured / trunkSamples.length;

  const series = buildDepthSeries(trunkSamples);
  if (series === null) {
    return { repCount: 0, reps: [], coverageRate };
  }

  const depthReps = detectDepthReps(series.values);
  const reps: RepSummary[] = depthReps.map((rep) => repSummary(rep, trunkSamples, series.baseline));

  return { repCount: reps.length, reps, coverageRate };
}

function repSummary(
  rep: DepthRep,
  trunkSamples: (TrunkSample | null)[],
  baseline: Parameters<typeof leanDelta>[1]
): RepSummary {
  const bottomSample = trunkSamples[rep.bottomIndex];
  return {
    bottomDepthRatio: rep.bottomDepthRatio,
    leanDeltaDegrees: bottomSample ? leanDelta(bottomSample, baseline) : 0
  };
}

/** Renders honest, baseline-relative session text into a container. */
export function renderProgressSummary(container: HTMLElement, summary: SessionSummary): void {
  const coveragePercent = Math.round(summary.coverageRate * 100);

  if (summary.repCount === 0) {
    container.textContent =
      `No complete reps detected this session. ` +
      `${coveragePercent}% of the session had a clear enough view of your hips and ` +
      `shoulders to measure depth — if that's low, move further back so your whole ` +
      `body is in frame and try again.`;
    return;
  }

  const repLabel = summary.repCount === 1 ? "1 rep" : `${summary.repCount} reps`;
  const avgDepth = average(summary.reps.map((r) => r.bottomDepthRatio));
  const avgLean = average(summary.reps.map((r) => r.leanDeltaDegrees));

  container.textContent =
    `${repLabel} this session. Hips dropped an average of ${avgDepth.toFixed(2)}x your ` +
    `standing trunk length at each rep's deepest point, with trunk lean averaging ` +
    `${formatSigned(avgLean)}° from your standing posture ` +
    `(${coveragePercent}% of the session had a clear view).`;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function formatSigned(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/render/progress-chart.test.ts`
Expected: PASS (all tests in the rewritten file)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: `main.ts`'s single call site (`summarizeSession(frames, exercise)`) now fails to
type-check — wrong arity entirely, since the new signature takes one argument, not two.
That is fixed in Task 6, not here. Confirm the failure is exactly that and nothing else:

Run: `npx tsc --noEmit`
Expected: one error at `src/main.ts:191`, an arity mismatch on the `summarizeSession` call.

- [ ] **Step 6: Commit**

```bash
git add src/render/progress-chart.ts src/render/progress-chart.test.ts
git commit -m "feat: replace the knee-rule pass rate with baseline-relative depth and lean

SessionSummary now reports each rep's depth and lean as deltas from the
user's own standing baseline instead of a pass rate computed from an
absolute-degree rule, and takes only trunkSamples — it never read frames
or exercise. main.ts's call site is fixed in the next task."
```

## Task 3: Relocate the knee-angle rep path to test-only code

**Files:**
- Delete: `src/form-checker/rep-detection.ts`
- Delete: `src/form-checker/rep-detection.test.ts`
- Delete: `src/form-checker/rep-detection.capture.test.ts`
- Create: `tests/knee-rep-baseline.ts`
- Create: `tests/knee-rep-baseline.test.ts`
- Create: `tests/knee-rep-baseline.capture.test.ts`
- Modify: `src/form-checker/rep-segmentation.corpus.test.ts:6`

The knee-angle rep signal is superseded by the depth signal on every measured axis (see
`corpus-manifest.md`: depth gets all six ground-truth counts right, knee gets three of
six wrong), so it is retired from production. But `rep-segmentation.corpus.test.ts:6`
(`import { detectReps } from "./rep-detection";`) uses it as the measured baseline for
that comparison — HANDOFF.md: "That comparison is locked in
`rep-segmentation.corpus.test.ts` so the premise of the rebuild stays measured rather
than assumed." **Deleting `rep-detection.ts` outright breaks that test.** The fix is to
relocate the knee path into test-only code rather than delete it — it stops being
something the app can run, but stays available as the comparison baseline and keeps its
own historical regression coverage (the two 2026-07-28 real-capture findings
`rep-detection.capture.test.ts` guards — fabricated reps from a stationary body, and the
one real session with genuine squats — are otherwise only preserved in prose).

`percentile` was already moved to `src/pose/percentile.ts` in Task 1; the relocated
module imports it from there rather than keeping its own duplicate copy.

- [ ] **Step 1: Create the relocated module**

```typescript
// tests/knee-rep-baseline.ts
/**
 * The knee-angle rep-counting path, retired from production (see
 * corpus-manifest.md: it gets three of six corpus ground-truth rep counts wrong
 * where the depth signal gets all six right) and kept here only as the measured
 * baseline rep-segmentation.corpus.test.ts compares the depth signal against, so
 * that comparison stays measured rather than assumed (HANDOFF.md). Moved
 * verbatim from src/form-checker/rep-detection.ts except for percentile, which
 * now lives in src/pose/percentile.ts and is imported rather than duplicated.
 */
import { percentile } from "../src/pose/percentile";

export interface Rep {
  /** Index into the input series of this rep's deepest point. */
  bottomIndex: number;
  bottomAngleDegrees: number;
}

const MIN_REP_RANGE_DEGREES = 40;
const ENTER_FRACTION = 0.6;
const EXIT_FRACTION = 0.3;
const CALIBRATION_LOW_PERCENTILE = 0.05;
const CALIBRATION_HIGH_PERCENTILE = 0.95;
const MAX_DEGREES_PER_FRAME = 10;
const MAX_BRIDGED_GAP_FRAMES = 30;
const MIN_REP_FRAMES = 18;

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

export function detectReps(angles: (number | null)[]): Rep[] {
  const cleaned = rejectImplausibleJumps(angles);

  const sorted = cleaned.filter((a): a is number => a !== null).sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const standingAngle = percentile(sorted, CALIBRATION_HIGH_PERCENTILE)!;
  const deepestAngle = percentile(sorted, CALIBRATION_LOW_PERCENTILE)!;

  const range = standingAngle - deepestAngle;
  if (range < MIN_REP_RANGE_DEGREES) return [];

  const enterThreshold = standingAngle - range * ENTER_FRACTION;
  const exitThreshold = standingAngle - range * EXIT_FRACTION;

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

  if (inRep && cleaned.length - 1 - openIndex >= MIN_REP_FRAMES) {
    reps.push({ bottomIndex, bottomAngleDegrees: bottomAngle });
  }

  return reps;
}
```

- [ ] **Step 2: Relocate the unit tests, dropping the percentile-specific block already covered by `src/pose/percentile.test.ts`**

Read `src/form-checker/rep-detection.test.ts` in full first. Copy it to
`tests/knee-rep-baseline.test.ts`, then: change the import from
`import { detectReps, percentile, rejectImplausibleJumps } from "./rep-detection";` to
`import { detectReps, rejectImplausibleJumps } from "./knee-rep-baseline";`; delete the
entire `describe("percentile", ...)` block (already covered by `percentile.test.ts`,
Task 1); leave every other test unchanged.

- [ ] **Step 3: Relocate the capture regression test**

Read `src/form-checker/rep-detection.capture.test.ts` in full first (reproduced below for
reference — verify it matches before copying, since this plan was written from a
snapshot). Copy it to `tests/knee-rep-baseline.capture.test.ts` with two path changes:
the `detectReps` import and the `.claude-test-artifacts/` read path (now one directory
higher):

```typescript
// tests/knee-rep-baseline.capture.test.ts
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { detectReps } from "./knee-rep-baseline";

function loadSignal(file: string): (number | null)[] {
  const raw = JSON.parse(readFileSync(`.claude-test-artifacts/${file}`, "utf8"));
  return raw.signalAngles ?? raw.angleSeries["Knee bend depth"];
}

describe("detectReps against real captures", () => {
  test("reports no reps for 25.9s of standing perfectly still", () => {
    expect(detectReps(loadSignal("session-2026-07-28-standing-test.json"))).toEqual([]);
  });

  test("still finds both reps in the one session that contained real squats", () => {
    const reps = detectReps(loadSignal("session-2026-07-27-835frames.json"));
    expect(reps).toHaveLength(2);
    expect(reps.every((r) => r.bottomAngleDegrees < 60)).toBe(true);
  });

  test("reports no reps for the demo-video capture, where no squat was measured", () => {
    expect(detectReps(loadSignal("session-2026-07-28-demo-video-967frames.json"))).toEqual([]);
  });

  test("reports no reps for the redo2 capture, where no squat was measured", () => {
    expect(detectReps(loadSignal("session-2026-07-28-redo2-1028frames.json"))).toEqual([]);
  });
});
```

(The read path `.claude-test-artifacts/${file}` is unchanged — it was already relative to
the repo root via vitest's working directory, not to the test file's own location, so
moving the test file does not require changing it.)

- [ ] **Step 4: Repoint `rep-segmentation.corpus.test.ts`'s import**

In `src/form-checker/rep-segmentation.corpus.test.ts:6`, change:
```typescript
import { detectReps } from "./rep-detection";
```
to:
```typescript
import { detectReps } from "../../tests/knee-rep-baseline";
```

- [ ] **Step 5: Delete the three original files**

```bash
git rm src/form-checker/rep-detection.ts src/form-checker/rep-detection.test.ts src/form-checker/rep-detection.capture.test.ts
```

- [ ] **Step 6: Run the full suite and the type check**

Run: `npm test && npx tsc --noEmit`
Expected: All passing, no type errors. In particular, confirm
`rep-segmentation.corpus.test.ts`'s knee-vs-depth comparison still runs (it's the test
that makes the rebuild's premise measured rather than assumed) and that
`tests/knee-rep-baseline.capture.test.ts`'s four assertions still hold against the same
`.claude-test-artifacts/` files.

- [ ] **Step 7: Commit**

```bash
git add tests/knee-rep-baseline.ts tests/knee-rep-baseline.test.ts tests/knee-rep-baseline.capture.test.ts src/form-checker/rep-segmentation.corpus.test.ts
git rm src/form-checker/rep-detection.ts src/form-checker/rep-detection.test.ts src/form-checker/rep-detection.capture.test.ts
git commit -m "chore: relocate the knee-angle rep path out of production into test-only code

Kept as tests/knee-rep-baseline.ts rather than deleted outright: it is
the measured baseline rep-segmentation.corpus.test.ts compares the depth
signal against (HANDOFF.md), and deleting it outright would have broken
that comparison. percentile now comes from src/pose/percentile.ts."
```

## Task 4: Add the live calibration readout UI

**Files:**
- Create: `src/render/calibration-readout.ts`
- Create: `src/render/calibration-readout.test.ts`
- Modify: `index.html`

A new, separate readout from the existing framing readout: framing checks per-frame
joint visibility for the exercise's angle rule (unrelated live-overlay concern);
calibration checks temporal trunk stillness, per `assessCalibration`
(`src/form-checker/calibration.ts`) — "hold still → ready → couldn't calibrate," per
`HANDOFF.md`'s explicit scope line.

- [ ] **Step 1: Write the failing test**

```typescript
// src/render/calibration-readout.test.ts
import { describe, test, expect } from "vitest";
import { renderCalibrationReadout } from "./calibration-readout";
import type { CalibrationState } from "../form-checker/calibration";

describe("renderCalibrationReadout", () => {
  test("shows the hold-still message and is not marked ready", () => {
    const container = document.createElement("div");
    const state: CalibrationState = {
      ready: false,
      baseline: null,
      message: "Hold still — measuring your standing position."
    };

    renderCalibrationReadout(container, state);

    expect(container.textContent).toContain("Hold still");
    expect(container.classList.contains("ready")).toBe(false);
    expect(container.classList.contains("not-ready")).toBe(true);
  });

  test("shows the ready message and is marked ready", () => {
    const container = document.createElement("div");
    const state: CalibrationState = {
      ready: true,
      baseline: { hipY: 0.5, trunkLength: 0.3, leanDegrees: 0, frameCount: 90 },
      message: "Calibrated. Press space to start your set."
    };

    renderCalibrationReadout(container, state);

    expect(container.textContent).toContain("Calibrated");
    expect(container.classList.contains("ready")).toBe(true);
    expect(container.classList.contains("not-ready")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/render/calibration-readout.test.ts`
Expected: FAIL — `Cannot find module './calibration-readout'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/render/calibration-readout.ts
import type { CalibrationState } from "../form-checker/calibration";

/**
 * Live pre-recording calibration feedback, separate from the framing readout.
 * Framing asks "is your body in frame this instant"; calibration asks "have you
 * held still long enough for the tracker to converge" (corpus-manifest.md: this
 * takes 4.6-6.5s in every corpus take). Rendered every frame during setup.
 */
export function renderCalibrationReadout(container: HTMLElement, state: CalibrationState): void {
  container.classList.toggle("ready", state.ready);
  container.classList.toggle("not-ready", !state.ready);
  container.textContent = state.message;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/render/calibration-readout.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Add the container element and styling to `index.html`**

In `index.html`, inside the `<section><h2>Setup</h2>...` block, immediately after the
existing `<div id="framing-readout">Starting camera…</div>` line, add:

```html
        <div id="calibration-readout">Waiting for framing…</div>
```

In the `<style>` block, immediately after the existing `#framing-readout .readout-hint`
rule, add:

```css
      #calibration-readout {
        font-size: 15px;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-top: none;
        background: #f6f6f6;
      }
      #calibration-readout.ready {
        background: #eef7ee;
        border-color: #cfe3cf;
      }
      #calibration-readout.not-ready {
        background: #fdeded;
        border-color: #f3c9c9;
      }
```

- [ ] **Step 6: Commit**

```bash
git add src/render/calibration-readout.ts src/render/calibration-readout.test.ts index.html
git commit -m "feat: add the live calibration readout UI"
```

## Task 5: Wire continuous trunk-sample collection and the live calibration gate into `main.ts`

**Files:**
- Modify: `src/main.ts`

Calibration must run from the moment the camera starts (not gated by `recording`) so the
user can hold still and become ready **before** pressing space — "the tool will not
record until it has a clean standing baseline" (design spec, locked decision). This task
adds the live gate; Task 6 wires the recording-phase trunk-sample array `summarizeSession`
needs and enforces the gate on the space key.

- [ ] **Step 1: Add the calibration imports and buffer**

In `src/main.ts`, add to the import block (after the existing `framing-check`/
`framing-readout` imports):

```typescript
import { trunkSample, type TrunkSample } from "./pose/planar-measures";
import { assessCalibration, type CalibrationState } from "./form-checker/calibration";
import { renderCalibrationReadout } from "./render/calibration-readout";
```

- [ ] **Step 2: Compute the aspect ratio and grab the new DOM element**

In `main()`, immediately after the existing:
```typescript
  const framingInstructions = document.getElementById("framing-instructions")!;
```
add:
```typescript
  const calibrationReadout = document.getElementById("calibration-readout")!;
```

Immediately after the existing:
```typescript
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
```
add:
```typescript
  const aspectRatio = video.videoWidth / video.videoHeight;
```

- [ ] **Step 3: Add the calibration buffer and live gate state**

Immediately after the existing:
```typescript
  const rawFrames: RecordedFrame[] = [];
```
add:
```typescript
  // Must match assessCalibration's own CALIBRATION_WINDOW_FRAMES
  // (src/form-checker/calibration.ts) — it is module-private there, so this is a
  // second declaration of the same measured constant (1.5s at 60fps, per Phase 2),
  // not an independent choice. Needed here so Task 6 can seed the recording-phase
  // trunkSamples array with the exact window the live gate just accepted.
  const CALIBRATION_WINDOW_FRAMES = 90;

  // Grows from the moment the camera starts, independent of `recording` — the
  // live calibration gate scans its trailing window every frame so the user can
  // become "ready" before pressing space. See assessCalibration's own docs: the
  // opening ~4.6-6.5s is the tracker converging and is the WORST window in every
  // corpus take, never a valid baseline.
  const calibrationBuffer: (TrunkSample | null)[] = [];
  let calibrationState: CalibrationState = {
    ready: false,
    baseline: null,
    message: "Hold still — measuring your standing position."
  };
```

- [ ] **Step 4: Compute the trunk sample every frame and drive the live gate**

In the `engine.start(video, (result) => { ... })` callback, immediately after the
existing:
```typescript
    const landmarks = result.worldLandmarks[0] as PoseWorldLandmark[] | undefined;
    const frameResult = landmarks ? checkFrame(exercise, landmarks, overrides) : null;
```
add:
```typescript
    const recordedLm = serializeLandmarks(result.landmarks[0], Date.now()).lm;
    const trunk = recordedLm ? trunkSample(recordedLm, aspectRatio) : null;
```

Then change the existing early-return block from:
```typescript
    if (!recording) {
      renderFramingReadout(framingReadout, assessFraming(exercise, landmarks ?? []));
      return;
    }
```
to:
```typescript
    if (!recording) {
      renderFramingReadout(framingReadout, assessFraming(exercise, landmarks ?? []));
      calibrationBuffer.push(trunk);
      calibrationState = assessCalibration(calibrationBuffer);
      renderCalibrationReadout(calibrationReadout, calibrationState);
      return;
    }
```

- [ ] **Step 5: Run the type check**

Run: `npx tsc --noEmit`
Expected: same single pre-existing error as Task 2 left (`main.ts:191`, the
`summarizeSession` arity mismatch) — nothing new. `serializeLandmarks` and
`RecordedFrame` are already imported at the top of `main.ts`; no new import needed for
those.

- [ ] **Step 6: Manual smoke check (no test framework covers a live camera loop)**

Run: `npm run dev`, open the app, grant camera access, and confirm in the browser
console (add a temporary `console.log(calibrationState)` inside the block above if
needed, then remove it) that the readout starts on "Hold still" and flips to
"Calibrated. Press space to start your set." after a few seconds of standing still,
side-on to the camera. Remove any temporary logging before committing.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts
git commit -m "feat: run the live calibration gate from camera start, before recording"
```

## Task 6: Gate the space key on calibration and collect recording-phase trunk samples

**Files:**
- Modify: `src/main.ts`

**The single most important step in this task is Step 2.** Without it, `summarizeSession`
reports zero reps on a majority of otherwise-correct sessions — see this plan's preamble,
"The riskiest assumption in this plan." The live gate's proof of stillness (90 frames in
`calibrationBuffer`) is thrown away at the moment recording starts unless it is carried
forward explicitly.

- [ ] **Step 1: Gate the space-bar handler on `calibrationState.ready`**

Change the existing:
```typescript
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || recording) return;
    e.preventDefault();
    recording = true;
    framingReadout.classList.remove("ready", "not-ready");
    framingReadout.textContent = "Recording — press \"e\" to end the session.";
  });
```
to:
```typescript
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || recording) return;
    e.preventDefault();
    if (!calibrationState.ready) return;
    recording = true;
    framingReadout.classList.remove("ready", "not-ready");
    framingReadout.textContent = "Recording — press \"e\" to end the session.";
    calibrationReadout.classList.remove("ready", "not-ready");
    calibrationReadout.textContent = "Recording — hips and shoulders being tracked for depth.";
  });
```

- [ ] **Step 2: Add the recording-phase trunk-sample array, seeded from the calibration buffer**

This must be a `let`, not a `const`: it starts empty (declared before recording begins,
alongside the other per-session buffers) but is populated with a COPY of the trailing
calibration window at the exact moment recording starts — `calibrationBuffer` keeps
growing until the space key is pressed, so the seed can only be taken then, not at
declaration time.

Immediately after the existing:
```typescript
  const worldLandmarksHistory: PoseWorldLandmark[][] = [];
```
add:
```typescript
  // Seeded (see Step 1's handler) with a COPY of the trailing calibrationBuffer
  // window the live gate just accepted, not left empty. Without this seed,
  // buildDepthSeries (called later, on just this array) must independently
  // re-find a fresh 90-frame stable window from the post-press frames alone —
  // and a user who starts squatting promptly after "Calibrated" appears never
  // gives it one: measured against the corpus, inter-rep standing gaps run
  // 37-66 frames, never 90, so 4 of 6 takes would never re-calibrate and
  // summarizeSession would report zero reps despite a clean set. Seeding with
  // the already-proven window makes buildDepthSeries's own findBaseline return
  // readyAt = 90 on its first iteration, with the identical baseline the live
  // gate computed — same values from the ready point onward as the corpus's
  // batch pipeline, so rep counts are unaffected.
  let trunkSamples: (TrunkSample | null)[] = [];
```

Then, in Step 1's space-bar handler, immediately after `recording = true;`, add:
```typescript
    trunkSamples = calibrationBuffer.slice(-CALIBRATION_WINDOW_FRAMES);
```

- [ ] **Step 3: Push the trunk sample every recording frame, independent of `frameResult`/`landmarks`**

Change the existing:
```typescript
    tracking.push({
      t: Date.now(),
      posed: Boolean(landmarks),
      visibility: landmarks ? trackedJointIndices.map((i) => landmarks[i].visibility) : null
    });

    rawFrames.push(serializeLandmarks(result.landmarks[0], Date.now()));

    if (frameResult && landmarks) {
      worldLandmarksHistory.push(landmarks);
      const record: SessionFrameRecord = {
        sessionId,
        timestamp: Date.now(),
        ruleResults: frameResult.ruleResults
      };
      store.queueFrame(record);
    }
```
to:
```typescript
    tracking.push({
      t: Date.now(),
      posed: Boolean(landmarks),
      visibility: landmarks ? trackedJointIndices.map((i) => landmarks[i].visibility) : null
    });

    rawFrames.push({ t: Date.now(), lm: recordedLm });
    trunkSamples.push(trunk);

    if (frameResult && landmarks) {
      worldLandmarksHistory.push(landmarks);
      const record: SessionFrameRecord = {
        sessionId,
        timestamp: Date.now(),
        ruleResults: frameResult.ruleResults
      };
      store.queueFrame(record);
    }
```

`trunkSamples.push(trunk)` is placed **outside** the `if (frameResult && landmarks)`
guard, next to `rawFrames.push`, deliberately: `rawFrames` already documents why, three
lines above this exact insertion point in the real file — "Recorded outside the 'was this
frame graded' guard below, so a frame with no detected pose appears as `lm: null` instead
of vanishing." `trunkSamples` must follow the same rule for the same reason: a null entry
means "not evaluated this frame," which `buildDepthSeries`/`detectDepthReps` already
handle correctly (HANDOFF.md's hard constraint — null must never be read as zero and must
never end an in-progress rep). Pushing only inside the guard would make a no-pose frame
disappear from the series entirely instead of appearing as `null`, silently compressing
the time axis and corrupting every duration-based constant downstream
(`MIN_REP_FRAMES`, `MAX_BRIDGED_GAP_FRAMES`, the 90-frame calibration window).

(This also removes the duplicate `serializeLandmarks` call Task 5 introduced — `recordedLm`
computed once per frame is reused for both the raw-frame dump and the trunk sample.)

- [ ] **Step 4: Pass `trunkSamples` into `summarizeSession`**

Change the existing:
```typescript
    const frames = await store.getFramesForSession(sessionId);
    const summary = summarizeSession(frames, exercise);
```
to:
```typescript
    const frames = await store.getFramesForSession(sessionId);
    const summary = summarizeSession(trunkSamples);
```
(`frames` is still used below this line for `angleSeries`/`ruleStats`, which read
`ruleResults` — leave those uses alone; only the `summarizeSession` call changes.)

- [ ] **Step 5: Fix the framing-readout hint, now stale**

`src/render/framing-readout.ts:21-22` renders, every frame during setup: ready →
"Press space to start recording."; not-ready → "Press space to record anyway — form
checks are skipped while joints are out of frame." Both are now false: space does
nothing until `calibrationState.ready`, a *different* condition (trunk stillness, not
knee-rule joint visibility) than what this readout describes. Change:
```typescript
  const hint = document.createElement("span");
  hint.className = "readout-hint";
  hint.textContent = assessment.ready
    ? "Press space to start recording."
    : "Press space to record anyway — form checks are skipped while joints are out of frame.";
  container.appendChild(hint);
```
to:
```typescript
  const hint = document.createElement("span");
  hint.className = "readout-hint";
  hint.textContent = assessment.ready
    ? "Hold still until calibration finishes below, then press space."
    : "Step into frame — the live joint cue is skipped while joints are out of frame.";
  container.appendChild(hint);
```
Read `src/render/framing-readout.test.ts` first to confirm: its ready-state test only
asserts the hint text contains the word "space" (case-insensitive), which the new copy
still does, and no test asserts the not-ready hint's exact wording. No test changes are
required by this step — this note exists so the implementer doesn't skip verifying that,
rather than assuming it and finding out otherwise at Step 6.

- [ ] **Step 6: Run the type check and full suite**

Run: `npx tsc --noEmit && npm test`
Expected: both clean — this closes out the last type error Task 2 left open.

- [ ] **Step 7: Manual smoke check**

Run: `npm run dev`. Grant camera access, wait for "Calibrated," press space, do 2-3
squats, press "e" to end. Confirm the Session Summary section shows rep count and
depth/lean text (from Task 2), not the old "% good form" wording. Confirm pressing
space before calibration is ready does nothing (no "Recording" text appears).

- [ ] **Step 8: Commit**

```bash
git add src/main.ts src/render/framing-readout.ts
git commit -m "feat: wire the depth path into the live app

Recording is now gated on a completed standing calibration, seeded from
the exact 90-frame window the live gate accepted so summarizeSession can
re-find that same baseline from the recorded frames alone. The framing
readout's space-bar hint is corrected to describe what the key now does."
```

## Task 7: Forbidden-claims review pass

**Files:**
- Modify: `src/render/rule-settings.ts`
- Modify (as needed): `README.md`, `index.html`, any other `src/render/*.ts` string found
  to violate the checklist.

Run the design spec's review procedure literally, now that Tasks 1-6 have changed the
summary, the calibration copy, and (via Task 3) removed the knee-path's contribution to
it. Read `README.md` in full first, before Step 1 — several of its claims about the tool
predate this rebuild and are checked individually below.

- [ ] **Step 1: Grep for bare degree symbols reaching the DOM**

Run: `grep -rn "°\|deg\b\|degrees" index.html src/render/*.ts src/main.ts README.md`

Expected hits and their disposition (verify each, don't skip any):
- `src/render/rule-settings.ts` — degree values shown next to a rule name the user
  edits themselves ("adjusted by you" / "default (70-100°)"). This is the **personal
  red line, physio-set** item from the honest claim set, not a claim the tool is
  making about the user — the note text already reads "general reference values...
  not a personalized or clinical assessment" (`rule-settings.ts:21-23`), which is
  what makes this survive the checklist; **do not weaken that sentence**. But add one
  more sentence to it in Step 2 below — see why there.
- `src/render/progress-chart.ts` — the new `formatSigned` lean output. Confirm (from
  Task 2's test `never prints a bare degree value that isn't framed as a delta`)
  that every degree figure sits next to "from your standing" language. If a new hit
  appears anywhere else, it fails the checklist — fix the copy before proceeding.
- Any other hit — read it against items 1-7 below and fix it before proceeding.

- [ ] **Step 2: Close the gap the summary redesign opened in `rule-settings.ts`**

After Task 2, the "Form ranges (adjust for your body)" panel is the most prominent
numeric UI on the page, and it feeds only the live overlay dot — the Session Summary a
user actually reads no longer uses those ranges at all. A user who adjusts a range and
then sees the summary unchanged would reasonably conclude the tool is ignoring their
input; that is a claim-by-implication even though no single string is false. Fix it with
one added sentence, not a behavior change. In `src/render/rule-settings.ts`, change:
```typescript
  note.textContent =
    "These ranges are general reference values from public PT guidance — not a personalized or clinical assessment. " +
    "If a range doesn't match your body or your current mobility, adjust it here before starting.";
```
to:
```typescript
  note.textContent =
    "These ranges are general reference values from public PT guidance — not a personalized or clinical assessment. " +
    "If a range doesn't match your body or your current mobility, adjust it here before starting. " +
    "They drive the live on-screen cue only — your session summary reports depth and lean against your own standing baseline and doesn't use them.";
```

- [ ] **Step 3: Read every string in `index.html`, `src/render/*.ts`, and `README.md`**

Confirm none of them:
1. Mentions the spine, disc, back, or injury risk.
2. Mentions posterior pelvic tilt / "butt wink" as something detected (only, if at
   all, named explicitly as a proxy — not built this session, so it should not
   appear at all yet).
3. Presents an absolute joint angle as a standard (see Step 1).
4. Computes a score silently from partial coverage (Task 2's `renderProgressSummary`
   states coverage explicitly whenever repCount is 0, and never hides it).
5. Says "0 reps" where the truth is "I could not see you" — confirm the no-reps
   message (Task 2) says "No complete reps detected... {coverage}% of the session had
   a clear view," not a bare "0 reps."
6. Implies medical, diagnostic, or clinical judgment, or that the tool substitutes
   for a physio.
7. Implies data leaves the device (the existing `#privacy-note` in `index.html`
   already states the opposite correctly — confirm it still matches what the code
   does after this session's changes: still true, no network call was added).
8. **Still describes something a prior task in this session already changed** — the
   framing-readout hint (Task 6, Step 5) is exactly this class of bug: correct when
   written, false after a later behavior change. Re-read every instruction telling
   the user to press a key or look at a specific readout and confirm it still
   describes what that key/readout now does.

- [ ] **Step 4: Update `README.md`'s stale claims — four locations, not just "How it works"**

All four exist as of this session's read; fix each:

1. The section describing how angles are computed still says they come from
   `worldLandmarks` alone. Rewrite it to state the actual split: the knee-bend-depth
   rule (live overlay dot, adjustable ranges) uses `worldLandmarks` for
   viewpoint-robust interior joint angles; rep counting and the session summary's
   depth/lean numbers use normalized 2D landmarks (`result.landmarks`), because in a
   side-on view the sagittal plane approximately *is* the image plane and
   `worldLandmarks`' undocumented axis orientation would add noise, not remove it
   (see `docs/superpowers/specs/2026-07-28-measurement-rebuild-design.md`,
   "Coordinate space").
2. `README.md:100-101` (or wherever it now lives — search for "pass rate"): says the
   app produces "a summary of pass rate and rule coverage." False after Task 2 —
   replace with a description of the depth/lean-relative summary.
3. `README.md:129`-area text describing the tool as measuring "consistency against a
   reference range you control": rewrite to distinguish the live per-frame cue
   (reference-range-based, described in item 1) from the session summary
   (baseline-relative, no reference range).
4. The `src/form-checker/` description (around `README.md:151-153`) framed purely in
   terms of rule coverage: update to mention `src/form-checker/depth-series.ts` and
   `rep-segmentation.ts` as the rep-counting/summary path, with `form-checker.ts`
   scoped to the live per-frame cue only.

- [ ] **Step 5: Rewrite the reference-ranges table if present**

If `README.md` has a table of population reference ranges left over from before Phase 0,
replace it with a short paragraph: the only remaining rule (Knee bend depth) is a
general PT-literature reference the user can retune per-body in the app's Setup section
(`rule-settings.ts`); the session summary itself reports only baseline-relative depth
and lean, which have no population reference band by construction.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all passing — `rule-settings.test.ts`, if it asserts on the note's exact text,
needs its expected string updated to match Step 2's addition.

- [ ] **Step 7: Commit**

```bash
git add README.md index.html src/render/rule-settings.ts
git commit -m "docs: fix README and rule-settings claims that predate the depth-signal rebuild"
```

---

# Part B — Rep-level confidence gating

Everything below assumes Part A is committed: `main.ts` collects `trunkSamples` per
recorded frame, and `summarizeSession` reads them via `buildDepthSeries` /
`detectDepthReps`. This part adds a rep-level confidence check on top of that pipeline —
see the measurement section above for the two constants derived for this part
(25-frame bottom window, `MIN_REP_MEDIAN_VISIBILITY = 0.5`).

## Task 8: Position smoothing

**Files:**
- Create: `src/pose/smoothing.ts`
- Create: `src/pose/smoothing.test.ts`

A short trailing median filter over each trunk landmark's raw x/y position, applied
before `trunkSample` converts positions into lean/depth. Smooths the input, not the
output — per the design spec's confidence-gating section — so a single-frame position
glitch does not become a single-frame depth glitch that the existing jump/scale guards
then have to catch after the fact.

- [ ] **Step 1: Write the failing test**

```typescript
// src/pose/smoothing.test.ts
import { describe, test, expect } from "vitest";
import { PositionSmoother } from "./smoothing";

describe("PositionSmoother", () => {
  test("returns the single sample fed so far, unchanged, until the window fills", () => {
    const smoother = new PositionSmoother(5);
    expect(smoother.push([1, 2])).toEqual([1, 2]);
  });

  test("returns the trailing median once enough samples have been seen", () => {
    const smoother = new PositionSmoother(5);
    smoother.push([0, 0]);
    smoother.push([1, 1]);
    smoother.push([2, 2]);
    smoother.push([3, 3]);
    const result = smoother.push([4, 4]);
    // Median of [0,1,2,3,4] per coordinate is 2.
    expect(result).toEqual([2, 2]);
  });

  test("a single-frame spike does not reach the output", () => {
    const smoother = new PositionSmoother(5);
    smoother.push([0.5, 0.5]);
    smoother.push([0.51, 0.51]);
    smoother.push([0.49, 0.49]);
    smoother.push([0.5, 0.5]);
    const result = smoother.push([5.0, 5.0]); // physically impossible one-frame jump
    // Median of [0.49, 0.5, 0.5, 0.51, 5.0] is 0.5, not anywhere near 5.0.
    expect(result[0]).toBeCloseTo(0.5, 2);
    expect(result[1]).toBeCloseTo(0.5, 2);
  });

  test("tracks multiple independently-keyed points without cross-contaminating them", () => {
    const shoulder = new PositionSmoother(3);
    const hip = new PositionSmoother(3);
    shoulder.push([0, 0]);
    hip.push([1, 1]);
    const shoulderResult = shoulder.push([0.1, 0.1]);
    const hipResult = hip.push([1.1, 1.1]);
    expect(shoulderResult).not.toEqual(hipResult);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pose/smoothing.test.ts`
Expected: FAIL — `Cannot find module './smoothing'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/pose/smoothing.ts
/**
 * Trailing median filter over a 2D point, one instance per landmark.
 *
 * Smooths the INPUT position before angle/depth computation, not the output
 * measurement — a single-frame position glitch (MediaPipe reporting a physically
 * impossible position with high visibility, corpus-manifest.md's "hip visibility
 * >= 0.5 is not sufficient to trust position") should not reach trunkSample at all,
 * rather than being caught after the fact by the bounds/scale/jump guards downstream.
 * Median rather than mean for the same reason every other calibration in this
 * codebase uses median: one bad frame inside the window must not shift the result
 * toward it.
 */
export class PositionSmoother {
  private xs: number[] = [];
  private ys: number[] = [];

  constructor(private readonly windowSize: number) {}

  /** Pushes one new sample and returns the current trailing median. */
  push(point: [number, number]): [number, number] {
    this.xs.push(point[0]);
    this.ys.push(point[1]);
    if (this.xs.length > this.windowSize) {
      this.xs.shift();
      this.ys.shift();
    }
    return [median(this.xs), median(this.ys)];
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pose/smoothing.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pose/smoothing.ts src/pose/smoothing.test.ts
git commit -m "feat: add a trailing-median position smoother for trunk landmarks"
```

## Task 9: Rep-confidence module

**Files:**
- Create: `src/form-checker/rep-confidence.ts`
- Create: `src/form-checker/rep-confidence.test.ts`

Implements the two measured constants from this plan's preamble: a 25-frame bottom
window (half-window 12, fits inside every corpus rep with margin) and
`MIN_REP_MEDIAN_VISIBILITY = 0.5`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/form-checker/rep-confidence.test.ts
import { describe, test, expect } from "vitest";
import { assessRepConfidence } from "./rep-confidence";
import type { DepthRep } from "./rep-segmentation";
import type { TrunkSample } from "../pose/planar-measures";

function repAt(startIndex: number, bottomIndex: number, endIndex: number): DepthRep {
  return { startIndex, endIndex, bottomIndex, bottomDepthRatio: 0.6 };
}

function sampleAt(visibility: number): TrunkSample {
  return { leanDegrees: 0, hipY: 0.6, trunkLength: 0.3, minVisibility: visibility };
}

describe("assessRepConfidence", () => {
  test("grades a rep whose bottom window has uniformly high visibility", () => {
    const rep = repAt(50, 75, 100);
    const samples = Array.from({ length: 150 }, () => sampleAt(0.99));

    const verdict = assessRepConfidence(rep, samples);

    expect(verdict).toBe("graded");
  });

  test("withholds a verdict when the bottom window's median visibility is degraded", () => {
    const rep = repAt(50, 75, 100);
    const samples = Array.from({ length: 150 }, (_, i) =>
      i >= 63 && i <= 87 ? sampleAt(0.1) : sampleAt(0.99)
    );

    const verdict = assessRepConfidence(rep, samples);

    expect(verdict).toBe("seen-not-graded");
  });

  test("one bad frame inside an otherwise clean bottom window does not withhold the verdict", () => {
    const rep = repAt(50, 75, 100);
    const samples = Array.from({ length: 150 }, (_, i) => (i === 75 ? sampleAt(0.01) : sampleAt(0.99)));

    const verdict = assessRepConfidence(rep, samples);

    expect(verdict).toBe("graded");
  });

  test("a null sample inside the bottom window is excluded, not treated as zero visibility", () => {
    const rep = repAt(50, 75, 100);
    const samples: (TrunkSample | null)[] = Array.from({ length: 150 }, (_, i) =>
      i === 75 ? null : sampleAt(0.99)
    );

    const verdict = assessRepConfidence(rep, samples);

    expect(verdict).toBe("graded");
  });

  test("clamps the bottom window to the rep's own start/end bounds on a short rep", () => {
    // A 20-frame rep is shorter than the 25-frame window; the window must not
    // reach into a neighbouring rep's frames.
    const rep = repAt(70, 80, 90);
    const samples = Array.from({ length: 150 }, (_, i) =>
      i < 70 || i > 90 ? sampleAt(0.01) : sampleAt(0.99)
    );

    const verdict = assessRepConfidence(rep, samples);

    expect(verdict).toBe("graded");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/form-checker/rep-confidence.test.ts`
Expected: FAIL — `Cannot find module './rep-confidence'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/form-checker/rep-confidence.ts
import type { DepthRep } from "./rep-segmentation";
import type { TrunkSample } from "../pose/planar-measures";
import { percentile } from "../pose/percentile";
import { VISIBILITY_THRESHOLD } from "./form-checker";

/**
 * Frames on each side of a rep's bottom the confidence check assesses. 12 (a
 * 25-frame window) is the largest half-window that fits inside every rep in the
 * corpus without reaching a neighbouring rep's frames: the tightest bottom-to-
 * boundary distance measured across all 18 reps in corpus-02/03/05 is 14 frames
 * (corpus-05-degrading, rep bottomIndex 1059, startIndex 1045). See this plan's
 * "What was measured before writing this plan" section.
 *
 * Exported so rep-confidence.corpus.test.ts's synthetic degradation window can't
 * silently drift out of sync with the value actually used here.
 */
export const BOTTOM_WINDOW_HALF_FRAMES = 12;

/**
 * Minimum median trunk-landmark visibility across a rep's bottom window for the
 * rep to earn a verdict.
 *
 * NOT corpus-derived on the reject side: across all 18 reps in corpus-02, -03 and
 * -05, the lowest median visibility found in any bottom window is 0.9979, and the
 * lowest single-frame visibility anywhere inside any rep's full span is also
 * 0.9979 — this corpus contains no example of a genuinely low-confidence rep,
 * consistent with Phase 2's finding that shoulder and hip track near-perfectly
 * everywhere. Set to VISIBILITY_THRESHOLD (form-checker.ts) rather than inventing
 * a new number for a threshold the corpus cannot validate on the reject side.
 * Covered by a synthetic test only (rep-confidence.test.ts), the same honesty
 * precedent as Phase 3's MAX_ENTER_OFFSET relative term.
 */
const MIN_REP_MEDIAN_VISIBILITY = VISIBILITY_THRESHOLD;

export type RepConfidenceVerdict = "graded" | "seen-not-graded";

/**
 * Decides whether a depth-segmented rep's tracking was good enough at its bottom
 * to earn a verdict, or whether it should count toward the rep total while
 * withholding any claim about its form.
 *
 * seen-not-graded is a first-class outcome, not a failure — it preserves the rep
 * count and the streak (Phase 5b) while admitting the tool could not see well
 * enough to judge that particular rep. Frame-level dropout must never end a rep
 * (enforced upstream, in detectDepthReps) and must never silently become "zero
 * confidence" here: null samples inside the window are excluded from the median,
 * not counted as zero visibility.
 */
export function assessRepConfidence(
  rep: DepthRep,
  trunkSamples: (TrunkSample | null)[]
): RepConfidenceVerdict {
  const lo = Math.max(rep.startIndex, rep.bottomIndex - BOTTOM_WINDOW_HALF_FRAMES);
  const hi = Math.min(rep.endIndex, rep.bottomIndex + BOTTOM_WINDOW_HALF_FRAMES);

  const visibilities: number[] = [];
  for (let i = lo; i <= hi; i++) {
    const sample = trunkSamples[i];
    if (sample === null || sample === undefined) continue;
    visibilities.push(sample.minVisibility);
  }

  if (visibilities.length === 0) return "seen-not-graded";

  visibilities.sort((a, b) => a - b);
  const medianVisibility = percentile(visibilities, 0.5)!;

  return medianVisibility >= MIN_REP_MEDIAN_VISIBILITY ? "graded" : "seen-not-graded";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/form-checker/rep-confidence.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/form-checker/rep-confidence.ts src/form-checker/rep-confidence.test.ts
git commit -m "feat: add rep-level confidence gating (25-frame bottom window, measured)"
```

## Task 10: Corpus validation, including the synthetic ungrade case the corpus can't provide

**Files:**
- Create: `src/form-checker/rep-confidence.corpus.test.ts`

Per this plan's preamble: because no real corpus rep is ever expected to fail the gate,
"every corpus rep is graded" alone would pass even with the gate's comparison backwards.
This task adds that real-corpus check *and* a synthetic-injection check that proves the
gate can actually reject, using real corpus data with an artificially degraded window —
the same honesty pattern `rep-segmentation.corpus.test.ts` set for the synthetic
shallow-set test in Phase 3.

- [ ] **Step 1: Write the tests**

```typescript
// src/form-checker/rep-confidence.corpus.test.ts
import { describe, test, expect } from "vitest";
import { loadCorpus } from "../../tests/corpus";
import { trunkSample } from "../pose/planar-measures";
import { withinCalibratedScale, depthRatio } from "./calibration";
import { findBaseline } from "./depth-series";
import { detectDepthReps, type DepthRep } from "./rep-segmentation";
import { assessRepConfidence, BOTTOM_WINDOW_HALF_FRAMES } from "./rep-confidence";
import type { TrunkSample } from "../pose/planar-measures";

const GRADED_TAKES = ["corpus-02-five-slow", "corpus-03-five-normal", "corpus-05-degrading"];

/** Loads a corpus take's trunk samples and segments its reps, exactly as summarizeSession does. */
function repsFor(name: string): { samples: (TrunkSample | null)[]; reps: DepthRep[] } {
  const corpus = loadCorpus(name);
  const samples = corpus.frames.map((f) => (f.lm ? trunkSample(f.lm, corpus.aspectRatio) : null));
  const found = findBaseline(samples)!;
  const depthSeries = samples.map((s, i) =>
    i < found.readyAt || s === null || !withinCalibratedScale(s, found.baseline)
      ? null
      : depthRatio(s, found.baseline)
  );
  return { samples, reps: detectDepthReps(depthSeries) };
}

describe("assessRepConfidence against the real corpus", () => {
  for (const name of GRADED_TAKES) {
    test(`every rep in ${name} is graded — real trunk visibility never drops`, () => {
      const { samples, reps } = repsFor(name);

      expect(reps.length).toBeGreaterThan(0);
      for (const rep of reps) {
        expect(assessRepConfidence(rep, samples)).toBe("graded");
      }
    });
  }

  test("a synthetically degraded bottom window on a real rep is withheld", () => {
    // corpus-05-degrading's first rep is a real, cleanly-tracked rep (per the test
    // above). This test does not invent a rep — it takes that real rep's real
    // segmentation and asks what the gate does if the bottom window's tracking had
    // been bad, which the corpus itself never exercises (see this plan's
    // measurement note). Degrading the FULL ±BOTTOM_WINDOW_HALF_FRAMES window (not
    // a narrower slice) is deliberate: a partial degradation could still leave the
    // window's median above threshold and this test would pass for the wrong
    // reason. Importing the constant rather than hardcoding ±12 keeps this test
    // from silently drifting out of sync with rep-confidence.ts if that value ever
    // changes.
    const { samples, reps } = repsFor("corpus-05-degrading");
    const firstRep = reps[0];
    expect(assessRepConfidence(firstRep, samples)).toBe("graded"); // sanity check first

    const degraded = samples.map((s, i) =>
      i >= firstRep.bottomIndex - BOTTOM_WINDOW_HALF_FRAMES &&
      i <= firstRep.bottomIndex + BOTTOM_WINDOW_HALF_FRAMES &&
      s
        ? { ...s, minVisibility: 0.1 }
        : s
    );

    expect(assessRepConfidence(firstRep, degraded)).toBe("seen-not-graded");
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/form-checker/rep-confidence.corpus.test.ts`
Expected: PASS (4 tests — 3 per-take + 1 synthetic)

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all passing.

- [ ] **Step 4: Commit**

```bash
git add src/form-checker/rep-confidence.corpus.test.ts
git commit -m "test: validate rep-confidence against the corpus, plus a synthetic ungrade case

The real corpus has no rep with degraded bottom-window visibility (lowest
measured is 0.9979), so the reject path is only provable synthetically —
recorded honestly rather than presented as corpus-validated on both sides."
```

## Task 11: Wire smoothing and confidence gating into `main.ts` and the session summary

**Files:**
- Modify: `src/main.ts`
- Modify: `src/render/progress-chart.ts`
- Modify: `src/render/progress-chart.test.ts`

This is the "once the UI exists to speak through" step `HANDOFF.md` describes — the only
part of the original Phase 5 doc's forbidden-claims item "seen but not graded" that could
not be built until now.

- [ ] **Step 1: Write the failing `progress-chart` tests for the graded/seen-not-graded split**

**First, fix an existing fixture that `RepSummary` gaining a required `graded` field will
break.** Task 2's test `"never prints a bare degree value that isn't framed as a delta"`
constructs two `RepSummary` literals without a `graded` field. Once this task makes
`graded` required, those literals type-check as `undefined` for that field — which is
falsy, so `renderProgressSummary` would (after Step 4 below) route them into the
zero-graded branch instead of the branch the test actually means to exercise, and the
test's `toMatch(/from your standing/)` assertion would fail for the wrong reason. Find
that test (`describe("renderProgressSummary" ...)`, in the file created by Task 2) and
add `graded: true` to both objects:
```typescript
      reps: [
        { bottomDepthRatio: 0.61, leanDeltaDegrees: 2.4, graded: true },
        { bottomDepthRatio: 0.58, leanDeltaDegrees: -1.1, graded: true }
      ],
```

Then add to `src/render/progress-chart.test.ts` (inside the existing
`describe("summarizeSession"...)` block, after the last test):

```typescript
  test("marks a rep with a degraded bottom window as seen-not-graded, not failed", () => {
    const samples = trunkSamplesWithReps(2);
    // trunkSamplesWithReps(2)'s first rep segments to startIndex 129, bottomIndex
    // 149, endIndex 176 (still(120) then a 30-frame descent from index 120, so the
    // hip-Y maximum lands at index 149 — verify this against detectDepthReps
    // directly if the fixture above ever changes). assessRepConfidence's window is
    // therefore [137, 161] (bottomIndex ± BOTTOM_WINDOW_HALF_FRAMES, 12). Degrading
    // [130, 170] covers that full window with margin — a narrower degradation
    // (e.g. only ±5 frames) leaves most of the 25-frame window at 0.99 and the
    // median stays above threshold, which is a real bug this test must not
    // reproduce: it would assert "seen-not-graded" while actually testing nothing.
    const degraded = samples.map((s, i) => (i >= 130 && i <= 170 && s ? { ...s, minVisibility: 0.1 } : s));

    const summary = summarizeSession(degraded);

    expect(summary.repCount).toBe(2);
    expect(summary.reps.filter((r) => r.graded)).toHaveLength(1);
    expect(summary.reps.filter((r) => !r.graded)).toHaveLength(1);
  });
```

Add to the `RepSummary`-shaped fixtures used by the `renderProgressSummary` tests
(inside `describe("renderProgressSummary"...)`, after the existing tests):

```typescript
  test("does not present an ungraded rep's numbers as a verdict", () => {
    const container = document.createElement("div");
    renderProgressSummary(container, {
      repCount: 2,
      reps: [
        { bottomDepthRatio: 0.61, leanDeltaDegrees: 2.4, graded: true },
        { bottomDepthRatio: 0.2, leanDeltaDegrees: 9.9, graded: false }
      ],
      coverageRate: 0.8
    });

    expect(container.textContent).toContain("1 of 2 reps");
    expect(container.textContent!.toLowerCase()).toContain("couldn't see");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/render/progress-chart.test.ts`
Expected: FAIL — `RepSummary` has no `graded` field yet.

- [ ] **Step 3: Add `graded` to `RepSummary` and wire `assessRepConfidence` into `summarizeSession`**

In `src/render/progress-chart.ts`, add the import:
```typescript
import { assessRepConfidence } from "../form-checker/rep-confidence";
```

Change the `RepSummary` interface:
```typescript
export interface RepSummary {
  /** Hip descent at this rep's deepest point, in units of the user's own trunk length. ~0 = standing. */
  bottomDepthRatio: number;
  /** Trunk-lean change from standing posture at this rep's deepest point, in degrees. */
  leanDeltaDegrees: number;
  /**
   * Whether this rep's bottom window had adequate tracking confidence to support a
   * claim. false means "seen but not graded" — the rep still counts toward
   * repCount, but its numbers must not be presented as a verdict.
   */
  graded: boolean;
}
```

Change `repSummary`:
```typescript
function repSummary(
  rep: DepthRep,
  trunkSamples: (TrunkSample | null)[],
  baseline: Parameters<typeof leanDelta>[1]
): RepSummary {
  const bottomSample = trunkSamples[rep.bottomIndex];
  return {
    bottomDepthRatio: rep.bottomDepthRatio,
    leanDeltaDegrees: bottomSample ? leanDelta(bottomSample, baseline) : 0,
    graded: assessRepConfidence(rep, trunkSamples) === "graded"
  };
}
```

- [ ] **Step 4: Update `renderProgressSummary` to speak honestly about the split**

Replace the body of `renderProgressSummary` (everything after the `repCount === 0` early
return) with:

```typescript
  const gradedReps = summary.reps.filter((r) => r.graded);
  const repLabel = summary.repCount === 1 ? "1 rep" : `${summary.repCount} reps`;

  if (gradedReps.length === 0) {
    container.textContent =
      `${repLabel} this session, but tracking wasn't clear enough at any of their ` +
      `bottoms to judge depth or lean — I couldn't see you well enough to grade them. ` +
      `${coveragePercent}% of the session had a clear view overall.`;
    return;
  }

  const avgDepth = average(gradedReps.map((r) => r.bottomDepthRatio));
  const avgLean = average(gradedReps.map((r) => r.leanDeltaDegrees));
  const allGraded = gradedReps.length === summary.repCount;
  const gradedLabel = allGraded ? repLabel : `${gradedReps.length} of ${summary.repCount} reps`;
  // Only claim there's a "rest" the tool couldn't see when there actually is one —
  // per this plan's own measurement, real tracking essentially never degrades
  // enough to trigger seen-not-graded, so allGraded is the overwhelmingly common
  // path, and a summary whose subject is honesty must not default to a false
  // statement on its own most common outcome.
  const ungradedClause = allGraded ? "" : " I couldn't see the rest well enough to judge.";

  container.textContent =
    `${gradedLabel} graded this session.${ungradedClause} ` +
    `Hips dropped an average of ${avgDepth.toFixed(2)}x your standing trunk length at ` +
    `each graded rep's deepest point, with trunk lean averaging ` +
    `${formatSigned(avgLean)}° from your standing posture ` +
    `(${coveragePercent}% of the session had a clear view).`;
```

- [ ] **Step 5: Add a test for the all-graded default path, then run everything**

Add to `src/render/progress-chart.test.ts`, inside `describe("renderProgressSummary"...)`,
after the test added in Step 1:

```typescript
  test("does not claim it couldn't see reps that were all graded", () => {
    const container = document.createElement("div");
    renderProgressSummary(container, {
      repCount: 2,
      reps: [
        { bottomDepthRatio: 0.61, leanDeltaDegrees: 2.4, graded: true },
        { bottomDepthRatio: 0.58, leanDeltaDegrees: -1.1, graded: true }
      ],
      coverageRate: 0.97
    });

    expect(container.textContent).toContain("2 reps");
    expect(container.textContent!.toLowerCase()).not.toContain("couldn't see");
  });
```

Run: `npx vitest run src/render/progress-chart.test.ts`
Expected: PASS (all tests, including the three added across Step 1 and this step). Note:
the earlier test `"reports each rep's trunk-lean delta from the standing baseline"` and
others built with `trunkSamplesWithReps` use `minVisibility: 0.99` throughout, so every
rep in those fixtures is graded and unaffected by this change.

- [ ] **Step 6: Wire `PositionSmoother` into `main.ts`'s live trunk-sample computation**

In `src/main.ts`, add the import:
```typescript
import { PositionSmoother } from "./pose/smoothing";
```

Immediately after the existing `calibrationBuffer`/`calibrationState` declarations, add:
```typescript
  // One smoother per trunk landmark position. TRUNK_POSITIONS holds each trunk
  // landmark's index WITHIN the recorded 8-element array (landmark-recording.ts's
  // LM_INDEX order), not the raw MediaPipe landmark index — recordedLm is already
  // narrowed to that 8-element array by serializeLandmarks. 5-frame trailing
  // median: short enough to track a real descent (the fastest measured is 0.0625
  // depth-ratio/frame, corpus-manifest.md) while still killing a single-frame
  // position glitch before it reaches trunkSample.
  // Annotated number[] rather than left to infer: LM_INDEX is `as const`
  // (landmark-recording.ts), so an uncast array literal here would infer as
  // (0|1|2|3)[], and TRUNK_POSITIONS.indexOf(i) below passes it a plain `number`
  // (the .map callback's index) — a type error against the narrower inferred type.
  const TRUNK_POSITIONS: number[] = [LM_INDEX.leftShoulder, LM_INDEX.rightShoulder, LM_INDEX.leftHip, LM_INDEX.rightHip];
  const SMOOTHING_WINDOW = 5;
  const positionSmoothers = TRUNK_POSITIONS.map(() => new PositionSmoother(SMOOTHING_WINDOW));
```

Add the import for `LM_INDEX`:
```typescript
import { serializeLandmarks, RECORDED_LANDMARK_INDICES, LM_INDEX } from "./pose/landmark-recording";
```
(replacing the existing `serializeLandmarks, RECORDED_LANDMARK_INDICES` import line.)

Change:
```typescript
    const recordedLm = serializeLandmarks(result.landmarks[0], Date.now()).lm;
    const trunk = recordedLm ? trunkSample(recordedLm, aspectRatio) : null;
```
to:
```typescript
    const recordedLm = serializeLandmarks(result.landmarks[0], Date.now()).lm;
    const smoothedLm = recordedLm
      ? recordedLm.map((point, i) => {
          const trunkPosition = TRUNK_POSITIONS.indexOf(i);
          if (trunkPosition === -1) return point;
          const [x, y] = positionSmoothers[trunkPosition].push([point[0], point[1]]);
          return [x, y, point[2], point[3]];
        })
      : null;
    const trunk = smoothedLm ? trunkSample(smoothedLm, aspectRatio) : null;
```

Note: `rawFrames` (Task 6) must keep storing the **unsmoothed** `recordedLm` — it is the
diagnostic dump used to validate future measurement changes against real capture, per
its own existing comment ("so measurement changes can be replayed against real capture
rather than only synthetic fixtures"); smoothing it would corrupt that record. Confirm
`rawFrames.push({ t: Date.now(), lm: recordedLm })` still reads `recordedLm`, not
`smoothedLm` — it already does, from Task 6's edit; this step must not change it.

- [ ] **Step 7: Run the type check and full suite**

Run: `npx tsc --noEmit && npm test`
Expected: both clean.

- [ ] **Step 8: Manual smoke check**

Run: `npm run dev`. Calibrate, record a short set, end the session, confirm the summary
text still reads correctly (all reps graded in a normal, well-lit take — this is
expected per this plan's own measurement, since real tracking essentially never
degrades enough to trigger "seen but not graded").

- [ ] **Step 9: Commit**

```bash
git add src/main.ts src/render/progress-chart.ts src/render/progress-chart.test.ts
git commit -m "feat: wire rep-level confidence gating into the live session summary

Reps with a degraded bottom window are now seen-not-graded instead of
silently contributing bad numbers to the average. Trunk landmark
positions are smoothed with a 5-frame trailing median before trunkSample."
```

## Task 12: Final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: all tests passing.

- [ ] **Step 2: Run the type check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: clean (only the pre-existing chunk-size warning, per `HANDOFF.md`).

- [ ] **Step 4: Re-run the forbidden-claims grep now that Part B's copy exists too**

Run: `grep -rn "°\|deg\b\|degrees" index.html src/render/*.ts src/main.ts README.md`

Confirm every hit is still either a delta ("from your standing…") or a user-set
personal range in `rule-settings.ts`, per Task 7's Step 1 disposition — Task 11 added
new degree-adjacent copy ("I couldn't see you well enough to grade them") that must be
re-checked here since it did not exist when Task 7 ran.

- [ ] **Step 5: One live end-to-end session**

Run: `npm run dev`. Calibrate, record a full set of 3-5 squats, end the session, and
confirm: the calibration readout showed hold-still → ready; recording was blocked before
calibration was ready; the summary reports rep count, graded count (if less than total),
depth, and lean, all as deltas; no absolute-degree or spine/injury claim appears anywhere
on screen.

- [ ] **Step 6: Update `HANDOFF.md`'s phase table**

Change the row:
```
| 4 + 5 | Confidence gating + wire the depth path into the live app (calibration UX, copy honesty) | ⬅️ **NEXT**, combined into one session; both plans are structural |
```
to:
```
| 4 + 5 | Confidence gating + wire the depth path into the live app (calibration UX, copy honesty) | ✅ **DONE** 2026-07-30 |
```

- [ ] **Step 7: Commit**

```bash
git add HANDOFF.md
git commit -m "docs: mark Phase 4+5 done"
```

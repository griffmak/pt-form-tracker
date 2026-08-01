# Phase 5b + UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-corpus-validated deviation signal (`src/form-checker/rep-deviation.ts`) into the session summary UI (flag, streak, worst-rep replay), and restyle the app's three sections (LIVE, 3D REPLAY, SESSION SUMMARY) with a new visual design system — bold block layout, sky blue/amber palette, Clash Display/Satoshi typography — without changing any detection logic or the app's section order.

**Architecture:** Pure-function modules for the two new derived stats (streak, worst-rep selection), following the existing `src/form-checker/*.ts` pattern. `progress-chart.ts` grows to wire `rollingDepthSeries`/`repDeviations` (already built, do not modify) into `SessionSummary`, and `renderProgressSummary` changes from a single paragraph into a paragraph + a clickable rep list. A pre-existing indexing bug between the depth series and the replay's raw landmark history is fixed first, because worst-rep replay depends on it. The visual redesign is CSS-only against the existing `index.html` structure — no new build tooling, no framework.

**Tech Stack:** Vite, vanilla TypeScript, Vitest (jsdom environment), Playwright (e2e, unaffected by this plan except where noted), Three.js (existing 3D replay, untouched internals), plain CSS with custom properties (no CSS framework — matches the codebase's existing no-framework approach), Fontshare self-hosted `@font-face` (decision made in Task 8, rationale there).

**Source spec:** `brainstorms/2026-08-01-phase-5b-ui-redesign.md` — read that file for the full design rationale behind each decision below; this plan implements it, not re-derives it.

---

## Before you start

Two claims in the source spec turned out to be wrong once the actual code was read while writing this plan — both corrected here so you don't have to re-discover them:

1. **The 3D replay does not "already replay a rep"** — it replays the entire session's raw landmark history once, via a one-shot `setInterval` in `main.ts` (lines ~327-336). There is no per-rep selector today. Task 5 builds one.
2. **`SESSION SUMMARY` has no rep list today** — `renderProgressSummary` writes one paragraph of averaged stats (`container.textContent = ...`). Task 6 replaces this with a paragraph + a rep list, which is where the flag/streak/click-to-replay UI actually lives.

Both of these make the 5b half of this plan bigger than "UI wiring on top of finished logic" — the detection math is finished and untouched, but the summary/replay UI it feeds into needs real new code, not just new markup.

---

## Task 1: Expose per-rep deviation (`unusual`, `deviationFraction`) and frame range on `RepSummary`

**Files:**
- Modify: `src/render/progress-chart.ts`
- Test: `src/render/progress-chart.test.ts`

`rollingDepthSeries` and `repDeviations` already exist and are corpus-validated (`src/form-checker/rep-deviation.ts`) — this task only calls them from `summarizeSession`, which already computes everything they need (`series.baseline`, `series.readyAt` from `buildDepthSeries`).

- [ ] **Step 1: Write the failing test**

Add this test to the `describe("summarizeSession", ...)` block in `src/render/progress-chart.test.ts`, and add the helper above it:

```typescript
/** Same shape as trunkSamplesWithReps, but each rep gets its own depth. */
function trunkSamplesWithVariedDepths(depths: number[], leanDegrees = 2): (TrunkSample | null)[] {
  const still = (n: number) =>
    Array.from({ length: n }, () => ({
      leanDegrees,
      hipY: 0.5,
      trunkLength: 0.3,
      minVisibility: 0.99
    }));
  const descent = (depth: number) =>
    Array.from({ length: 30 }, (_, i) => ({
      leanDegrees,
      hipY: 0.5 + (depth * (i + 1)) / 30,
      trunkLength: 0.3,
      minVisibility: 0.99
    }));
  const out: (TrunkSample | null)[] = [...still(120)];
  for (const depth of depths) {
    const down = descent(depth);
    out.push(...down, ...[...down].reverse(), ...still(30));
  }
  return out;
}
```

```typescript
test("flags a rep whose depth is far from the set median as unusual", () => {
  // 0.18 matches trunkSamplesWithReps's own depth (see its descent() above) —
  // three ordinary reps. 0.05 is a rep barely a fifth as deep: (0.05-0.18)/0.18
  // = -72%, well past the 30% UNUSUAL_REP_FRACTION threshold rep-deviation.ts
  // documents.
  const samples = trunkSamplesWithVariedDepths([0.18, 0.18, 0.18, 0.05]);
  const summary = summarizeSession(samples);

  expect(summary.repCount).toBe(4);
  expect(summary.reps[3].unusual).toBe(true);
  expect(summary.reps[3].deviationFraction).toBeLessThan(-0.5);
  expect(summary.reps[0].unusual).toBe(false);
  expect(summary.reps[0].deviationFraction).toBeCloseTo(0, 1);
});

test("reports each rep's frame range for later replay lookup", () => {
  const samples = trunkSamplesWithReps(2);
  const summary = summarizeSession(samples);

  expect(summary.reps).toHaveLength(2);
  for (const rep of summary.reps) {
    expect(rep.endIndex).toBeGreaterThan(rep.startIndex);
  }
  expect(summary.reps[1].startIndex).toBeGreaterThan(summary.reps[0].endIndex);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- progress-chart`
Expected: FAIL — `summary.reps[3].unusual` is `undefined`, and TypeScript will also complain that `unusual`/`deviationFraction`/`startIndex`/`endIndex` don't exist on `RepSummary`.

- [ ] **Step 3: Implement**

In `src/render/progress-chart.ts`, add the import and extend the interfaces and functions:

```typescript
import { rollingDepthSeries, repDeviations, type RepDeviation } from "../form-checker/rep-deviation";
```

Extend `RepSummary`:

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
  /**
   * Whether this rep's depth is unlike the rest of this set's (see
   * rep-deviation.ts). Never a statement about injury risk — only that it
   * differs from what this user did in the rest of this set.
   */
  unusual: boolean;
  /** Signed fraction this rep's depth sits from the set median. Negative = shallower. */
  deviationFraction: number;
  /** First frame index of this rep, in the same index space as the session's trunkSamples/depth series. */
  startIndex: number;
  /** Last frame index of this rep, inclusive, same index space as startIndex. */
  endIndex: number;
}
```

Rewrite `summarizeSession` and `repSummary`:

```typescript
export function summarizeSession(trunkSamples: (TrunkSample | null)[]): SessionSummary {
  const measured = trunkSamples.filter((s): s is TrunkSample => s !== null).length;
  const coverageRate = trunkSamples.length === 0 ? 0 : measured / trunkSamples.length;

  const series = buildDepthSeries(trunkSamples);
  if (series === null) {
    return { repCount: 0, reps: [], coverageRate };
  }

  const depthReps = detectDepthReps(series.values);
  const rolling = rollingDepthSeries(trunkSamples, series.baseline, series.readyAt);
  const deviations = repDeviations(depthReps, rolling);
  const reps: RepSummary[] = depthReps.map((rep, i) =>
    repSummary(rep, trunkSamples, series.baseline, deviations[i])
  );

  return { repCount: reps.length, reps, coverageRate };
}

function repSummary(
  rep: DepthRep,
  trunkSamples: (TrunkSample | null)[],
  baseline: Parameters<typeof leanDelta>[1],
  deviation: RepDeviation
): RepSummary {
  const bottomSample = trunkSamples[rep.bottomIndex];
  return {
    bottomDepthRatio: rep.bottomDepthRatio,
    leanDeltaDegrees: bottomSample ? leanDelta(bottomSample, baseline) : 0,
    graded: assessRepConfidence(rep, trunkSamples) === "graded",
    unusual: deviation.unusual,
    deviationFraction: deviation.deviationFraction,
    startIndex: rep.startIndex,
    endIndex: rep.endIndex
  };
}
```

- [ ] **Step 4: Fix the now-broken existing `renderProgressSummary` test literals**

The tests in `describe("renderProgressSummary", ...)` construct `RepSummary` object literals by hand and will now fail to typecheck (missing fields). Update each one in `src/render/progress-chart.test.ts` — add `unusual: false, deviationFraction: 0, startIndex: 0, endIndex: 1` to every literal. For example, the "never prints a bare degree value" test becomes:

```typescript
test("never prints a bare degree value that isn't framed as a delta", () => {
  const container = document.createElement("div");
  renderProgressSummary(container, {
    repCount: 2,
    reps: [
      { bottomDepthRatio: 0.61, leanDeltaDegrees: 2.4, graded: true, unusual: false, deviationFraction: 0, startIndex: 0, endIndex: 1 },
      { bottomDepthRatio: 0.58, leanDeltaDegrees: -1.1, graded: true, unusual: false, deviationFraction: 0, startIndex: 2, endIndex: 3 }
    ],
    coverageRate: 0.97
  });

  expect(container.textContent).toContain("2 reps");
  expect(container.textContent).toMatch(/from your standing/);
});
```

Apply the same pattern (add the four fields, using distinct non-overlapping `startIndex`/`endIndex` per rep) to the other three `renderProgressSummary` tests ("states that no reps were detected...", "does not present an ungraded rep's numbers as a verdict", "does not claim it couldn't see reps that were all graded").

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- progress-chart`
Expected: PASS, all tests including the two new ones.

- [ ] **Step 6: Run the full suite to check nothing else broke**

Run: `npm test`
Expected: PASS. (No other file constructs a `RepSummary` literal — confirmed by `grep -rn "bottomDepthRatio:" src` before writing this plan; `progress-chart.test.ts` is the only place.)

- [ ] **Step 7: Commit**

```bash
git add src/render/progress-chart.ts src/render/progress-chart.test.ts
git commit -m "feat: expose per-rep deviation flag and frame range on RepSummary"
```

---

## Task 2: Streak — longest run of consecutive clean reps

**Files:**
- Create: `src/form-checker/rep-streak.ts`
- Test: `src/form-checker/rep-streak.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, test, expect } from "vitest";
import { longestCleanStreak } from "./rep-streak";

describe("longestCleanStreak", () => {
  test("returns 0 for no reps", () => {
    expect(longestCleanStreak([])).toBe(0);
  });

  test("returns the full count when nothing is flagged", () => {
    const reps = [{ unusual: false }, { unusual: false }, { unusual: false }];
    expect(longestCleanStreak(reps)).toBe(3);
  });

  test("returns 0 when every rep is flagged", () => {
    const reps = [{ unusual: true }, { unusual: true }];
    expect(longestCleanStreak(reps)).toBe(0);
  });

  test("finds the longest clean run, not the first or last", () => {
    // clean, clean, FLAG, clean, clean, clean, FLAG, clean
    const reps = [
      { unusual: false },
      { unusual: false },
      { unusual: true },
      { unusual: false },
      { unusual: false },
      { unusual: false },
      { unusual: true },
      { unusual: false }
    ];
    expect(longestCleanStreak(reps)).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rep-streak`
Expected: FAIL with "Cannot find module './rep-streak'".

- [ ] **Step 3: Implement**

```typescript
/**
 * Longest run of consecutive non-`unusual` reps in the set. 0 for an empty
 * set or a set with no clean run at all — never negative, never undefined.
 */
export function longestCleanStreak(reps: { unusual: boolean }[]): number {
  let longest = 0;
  let current = 0;

  for (const rep of reps) {
    if (rep.unusual) {
      current = 0;
      continue;
    }
    current += 1;
    longest = Math.max(longest, current);
  }

  return longest;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- rep-streak`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/form-checker/rep-streak.ts src/form-checker/rep-streak.test.ts
git commit -m "feat: add longestCleanStreak pure function"
```

---

## Task 3: Worst-rep selection

**Files:**
- Create: `src/form-checker/worst-rep.ts`
- Test: `src/form-checker/worst-rep.test.ts`

Per the spec (Q9): "worst" is the rep with the largest deviation magnitude from the set median, and it is only meaningful to surface when at least one rep is actually flagged unusual — so this function returns `null` unless at least one rep is `unusual`, which folds Q9's "what defines worst" and "when to trigger" into one place instead of two.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, test, expect } from "vitest";
import { worstRepIndex } from "./worst-rep";

describe("worstRepIndex", () => {
  test("returns null for no reps", () => {
    expect(worstRepIndex([])).toBeNull();
  });

  test("returns null when nothing is flagged, even if depths differ slightly", () => {
    const reps = [
      { unusual: false, deviationFraction: 0.1 },
      { unusual: false, deviationFraction: -0.05 }
    ];
    expect(worstRepIndex(reps)).toBeNull();
  });

  test("returns the index of the single flagged rep", () => {
    const reps = [
      { unusual: false, deviationFraction: 0.02 },
      { unusual: true, deviationFraction: -0.55 },
      { unusual: false, deviationFraction: 0.01 }
    ];
    expect(worstRepIndex(reps)).toBe(1);
  });

  test("picks the larger magnitude among multiple flagged reps, regardless of sign", () => {
    const reps = [
      { unusual: true, deviationFraction: 0.4 },
      { unusual: true, deviationFraction: -0.7 },
      { unusual: false, deviationFraction: 0.02 }
    ];
    expect(worstRepIndex(reps)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- worst-rep`
Expected: FAIL with "Cannot find module './worst-rep'".

- [ ] **Step 3: Implement**

```typescript
/**
 * Index of the rep with the largest deviation magnitude from the set median,
 * among reps flagged `unusual` — null if none are flagged, so a clean set
 * never has a "worst" rep to highlight.
 */
export function worstRepIndex(reps: { unusual: boolean; deviationFraction: number }[]): number | null {
  let worst: number | null = null;
  let worstMagnitude = -Infinity;

  reps.forEach((rep, i) => {
    if (!rep.unusual) return;
    const magnitude = Math.abs(rep.deviationFraction);
    if (magnitude > worstMagnitude) {
      worstMagnitude = magnitude;
      worst = i;
    }
  });

  return worst;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- worst-rep`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/form-checker/worst-rep.ts src/form-checker/worst-rep.test.ts
git commit -m "feat: add worstRepIndex pure function"
```

---

## Task 4: Wire streak and worst-rep into `SessionSummary`

**Files:**
- Modify: `src/render/progress-chart.ts`
- Test: `src/render/progress-chart.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/render/progress-chart.test.ts`:

```typescript
test("reports a streak and worst-rep index when a rep is flagged", () => {
  const samples = trunkSamplesWithVariedDepths([0.18, 0.18, 0.18, 0.05]);
  const summary = summarizeSession(samples);

  expect(summary.streak).toBe(3);
  expect(summary.worstRepIndex).toBe(3);
});

test("reports a full streak and no worst rep when nothing is flagged", () => {
  const samples = trunkSamplesWithReps(3);
  const summary = summarizeSession(samples);

  expect(summary.streak).toBe(3);
  expect(summary.worstRepIndex).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- progress-chart`
Expected: FAIL — `summary.streak` and `summary.worstRepIndex` are `undefined`.

- [ ] **Step 3: Implement**

Add the imports:

```typescript
import { longestCleanStreak } from "../form-checker/rep-streak";
import { worstRepIndex } from "../form-checker/worst-rep";
```

Extend `SessionSummary`:

```typescript
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
  /** Longest run of consecutive non-unusual reps in the set. 0 when repCount is 0. */
  streak: number;
  /** Index into `reps` of the rep with the largest deviation, or null if none is flagged. */
  worstRepIndex: number | null;
}
```

Update `summarizeSession`'s two return points:

```typescript
export function summarizeSession(trunkSamples: (TrunkSample | null)[]): SessionSummary {
  const measured = trunkSamples.filter((s): s is TrunkSample => s !== null).length;
  const coverageRate = trunkSamples.length === 0 ? 0 : measured / trunkSamples.length;

  const series = buildDepthSeries(trunkSamples);
  if (series === null) {
    return { repCount: 0, reps: [], coverageRate, streak: 0, worstRepIndex: null };
  }

  const depthReps = detectDepthReps(series.values);
  const rolling = rollingDepthSeries(trunkSamples, series.baseline, series.readyAt);
  const deviations = repDeviations(depthReps, rolling);
  const reps: RepSummary[] = depthReps.map((rep, i) =>
    repSummary(rep, trunkSamples, series.baseline, deviations[i])
  );

  return {
    repCount: reps.length,
    reps,
    coverageRate,
    streak: longestCleanStreak(reps),
    worstRepIndex: worstRepIndex(reps)
  };
}
```

- [ ] **Step 4: Fix now-broken literals again**

Every hand-built `SessionSummary` object in the `renderProgressSummary` tests (from Task 1 Step 4) now also needs `streak` and `worstRepIndex`. Add `streak: 0, worstRepIndex: null` (or the correct value if the test's point is about streak/worst-rep specifically — none of the current four are) to each of the four literals in `src/render/progress-chart.test.ts`'s `describe("renderProgressSummary", ...)` block, including the `repCount: 0` one.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- progress-chart`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/render/progress-chart.ts src/render/progress-chart.test.ts
git commit -m "feat: wire streak and worst-rep index into SessionSummary"
```

---

## Task 5: Fix the replay/depth-series index misalignment, then add a rep-scoped replay player

**Why this is needed:** `rep.startIndex`/`rep.endIndex` (Task 1) are indices into `trunkSamples` — one entry per recorded frame, including frames where no pose was detected (`trunkSamples.push(trunk)` runs unconditionally at `src/main.ts:250`). `worldLandmarksHistory` — what the 3D replay actually plays — only gets an entry when a pose *was* detected (`if (frameResult && landmarks) { worldLandmarksHistory.push(landmarks); ... }` at `src/main.ts:252-253`). Any frame with no detected pose during a session makes these two arrays diverge in length and in what each index means, so `rep.startIndex`/`endIndex` cannot be used to slice `worldLandmarksHistory` as-is. This task fixes that alignment, then adds a way to replay just one rep's slice.

**Files:**
- Modify: `src/main.ts`
- Create: `src/render/rep-player.ts`
- Test: `src/render/rep-player.test.ts`

`main.ts` has no unit tests today (it's entry-point glue; the app is covered by `e2e/smoke.spec.ts` instead) — this task's `main.ts` edits are not TDD'd for that reason, consistent with the existing pattern. The new `rep-player.ts` module (pure frame-stepping logic, no `setInterval`) does get unit tests.

- [ ] **Step 1: Fix the index misalignment in `main.ts`**

In `src/main.ts`, change the `worldLandmarksHistory` push to run unconditionally alongside `trunkSamples`, storing `null` for frames with no detected pose instead of skipping them. Replace lines 249-260:

```typescript
    rawFrames.push({ t: Date.now(), lm: recordedLm });
    trunkSamples.push(trunk);
    worldLandmarksHistory.push(landmarks ?? null);

    if (frameResult && landmarks) {
      const record: SessionFrameRecord = {
        sessionId,
        timestamp: Date.now(),
        ruleResults: frameResult.ruleResults
      };
      store.queueFrame(record);
    }
```

And change the array's declared type at line 112 to allow `null`:

```typescript
  const worldLandmarksHistory: (PoseWorldLandmark[] | null)[] = [];
```

Now `worldLandmarksHistory[i]` and `trunkSamples[i]` refer to the same recorded frame for every `i`, so `rep.startIndex`/`rep.endIndex` can slice both.

- [ ] **Step 2: Write the failing test for the new player module**

```typescript
import { describe, test, expect } from "vitest";
import { framesForRep, nextPlaybackFrame } from "./rep-player";

describe("framesForRep", () => {
  test("slices the history to the rep's range and drops null (no-pose) frames", () => {
    const history = [null, "a", "b", null, "c", "d", null];
    const frames = framesForRep(history, { startIndex: 1, endIndex: 5 });

    expect(frames).toEqual(["a", "b", "c", "d"]);
  });

  test("returns an empty array when the rep's whole range has no detected pose", () => {
    const history = [null, null, null];
    const frames = framesForRep(history, { startIndex: 0, endIndex: 2 });

    expect(frames).toEqual([]);
  });
});

describe("nextPlaybackFrame", () => {
  test("advances by one and signals not done", () => {
    expect(nextPlaybackFrame(0, 5)).toEqual({ index: 1, done: false });
  });

  test("signals done once past the last frame", () => {
    expect(nextPlaybackFrame(4, 5)).toEqual({ index: 5, done: true });
  });

  test("treats an empty frame list as immediately done", () => {
    expect(nextPlaybackFrame(0, 0)).toEqual({ index: 0, done: true });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- rep-player`
Expected: FAIL with "Cannot find module './rep-player'".

- [ ] **Step 4: Implement**

```typescript
/**
 * Slices a frame-index-aligned history (see main.ts's worldLandmarksHistory,
 * which stores null for frames with no detected pose at every index a
 * trunkSample also exists for) to one rep's range, dropping the nulls — the
 * replay only ever needs frames it can actually draw.
 */
export function framesForRep<T>(history: (T | null)[], rep: { startIndex: number; endIndex: number }): T[] {
  const frames: T[] = [];
  for (let i = rep.startIndex; i <= rep.endIndex && i < history.length; i++) {
    const frame = history[i];
    if (frame !== null) frames.push(frame);
  }
  return frames;
}

/**
 * One step of a frame-index cursor. `done` is true once index has passed the
 * last playable frame — the caller stops advancing (e.g. clears its
 * setInterval) rather than reading out of bounds.
 */
export function nextPlaybackFrame(index: number, frameCount: number): { index: number; done: boolean } {
  if (index >= frameCount) return { index, done: true };
  const next = index + 1;
  return { index: next, done: next >= frameCount };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- rep-player`
Expected: PASS.

- [ ] **Step 6: Wire a restartable replay function into `main.ts`**

The existing replay code (lines 327-336) is a one-shot `setInterval` over the whole session, run once when the session ends. Replace it with a named function that can be called again for a different rep, and call it once at the end with the worst rep (or the whole session if nothing is flagged). Replace lines 327-336:

```typescript
    const replay = new ReplayView(replayContainer);
    let replayTimer: ReturnType<typeof setInterval> | null = null;

    function playFrames(frames: PoseWorldLandmark[][]): void {
      if (replayTimer !== null) clearInterval(replayTimer);
      let cursor = 0;
      if (frames.length === 0) return;
      replayTimer = setInterval(() => {
        replay.showFrame(frames[cursor]);
        const step = nextPlaybackFrame(cursor, frames.length);
        cursor = step.index;
        if (step.done && replayTimer !== null) {
          clearInterval(replayTimer);
          replayTimer = null;
        }
      }, 33);
    }

    const worstRep = summary.worstRepIndex !== null ? summary.reps[summary.worstRepIndex] : null;
    if (worstRep) {
      playFrames(framesForRep(worldLandmarksHistory, worstRep));
    } else {
      playFrames(worldLandmarksHistory.filter((f): f is PoseWorldLandmark[] => f !== null));
    }
```

Add the imports at the top of `main.ts`:

```typescript
import { framesForRep, nextPlaybackFrame } from "./render/rep-player";
```

Note `playFrames` and `replay`/`replayTimer` need to be reachable from the click handler added in Task 7 — move their declarations (the `const replay = new ReplayView(...)`, `let replayTimer`, and `function playFrames(...)`) up to just before `renderProgressSummary` is called, so Task 7's `onRepSelect` callback can close over `playFrames`.

- [ ] **Step 7: Run the full suite and the dev server smoke-check**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: builds with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add src/main.ts src/render/rep-player.ts src/render/rep-player.test.ts
git commit -m "fix: align replay history indices with the depth series, add rep-scoped replay"
```

---

## Task 6: Rep list UI — flag icon, streak stat, click-to-replay

**Files:**
- Modify: `src/render/progress-chart.ts`
- Test: `src/render/progress-chart.test.ts`

Per the spec (Q7, Q8, Q11): flagged reps show only in the summary (never live), each gets an amber icon + "unusual" text label (never color alone, per `ui-ux-pro-max`'s `color-not-only` rule) next to its existing stats, a streak stat sits near the rep list, and clicking a flagged rep replays it.

- [ ] **Step 1: Write the failing test**

Add to `src/render/progress-chart.test.ts`:

```typescript
test("renders a streak stat and a row per rep", () => {
  const container = document.createElement("div");
  renderProgressSummary(container, {
    repCount: 2,
    reps: [
      { bottomDepthRatio: 0.61, leanDeltaDegrees: 2.4, graded: true, unusual: false, deviationFraction: 0.02, startIndex: 0, endIndex: 10 },
      { bottomDepthRatio: 0.2, leanDeltaDegrees: 9.9, graded: true, unusual: true, deviationFraction: -0.6, startIndex: 11, endIndex: 20 }
    ],
    coverageRate: 0.97,
    streak: 1,
    worstRepIndex: 1
  });

  expect(container.querySelectorAll(".rep-row")).toHaveLength(2);
  expect(container.textContent).toMatch(/streak/i);
  expect(container.textContent).toContain("1");
});

test("marks a flagged rep with an icon and an 'unusual' text label, not color alone", () => {
  const container = document.createElement("div");
  renderProgressSummary(container, {
    repCount: 1,
    reps: [
      { bottomDepthRatio: 0.2, leanDeltaDegrees: 9.9, graded: true, unusual: true, deviationFraction: -0.6, startIndex: 0, endIndex: 10 }
    ],
    coverageRate: 0.97,
    streak: 0,
    worstRepIndex: 0
  });

  const row = container.querySelector(".rep-row")!;
  expect(row.classList.contains("rep-row--unusual")).toBe(true);
  expect(row.querySelector(".rep-flag-icon")).not.toBeNull();
  expect(row.textContent).toMatch(/unusual/i);
});

test("does not mark a clean rep as unusual", () => {
  const container = document.createElement("div");
  renderProgressSummary(container, {
    repCount: 1,
    reps: [
      { bottomDepthRatio: 0.61, leanDeltaDegrees: 2.4, graded: true, unusual: false, deviationFraction: 0.02, startIndex: 0, endIndex: 10 }
    ],
    coverageRate: 0.97,
    streak: 1,
    worstRepIndex: null
  });

  const row = container.querySelector(".rep-row")!;
  expect(row.classList.contains("rep-row--unusual")).toBe(false);
  expect(row.querySelector(".rep-flag-icon")).toBeNull();
});

test("calls onRepSelect with the rep's index when a rep row is clicked", () => {
  const container = document.createElement("div");
  const selected: number[] = [];
  renderProgressSummary(
    container,
    {
      repCount: 2,
      reps: [
        { bottomDepthRatio: 0.61, leanDeltaDegrees: 2.4, graded: true, unusual: false, deviationFraction: 0.02, startIndex: 0, endIndex: 10 },
        { bottomDepthRatio: 0.2, leanDeltaDegrees: 9.9, graded: true, unusual: true, deviationFraction: -0.6, startIndex: 11, endIndex: 20 }
      ],
      coverageRate: 0.97,
      streak: 1,
      worstRepIndex: 1
    },
    (index) => selected.push(index)
  );

  const rows = container.querySelectorAll(".rep-row");
  (rows[1] as HTMLElement).click();

  expect(selected).toEqual([1]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- progress-chart`
Expected: FAIL — no `.rep-row` elements exist yet, `renderProgressSummary` doesn't accept a third argument.

- [ ] **Step 3: Implement**

Replace `renderProgressSummary` in `src/render/progress-chart.ts`. Keep the existing paragraph logic exactly as-is (it's already corpus-honest text per the file's own comments) but append a streak stat + rep list after it, and accept an optional click callback:

```typescript
/** Renders honest, baseline-relative session text into a container. */
export function renderProgressSummary(
  container: HTMLElement,
  summary: SessionSummary,
  onRepSelect?: (repIndex: number) => void
): void {
  const coveragePercent = Math.round(summary.coverageRate * 100);

  const paragraph = document.createElement("p");
  paragraph.className = "session-summary-text";

  if (summary.repCount === 0) {
    paragraph.textContent =
      `No complete reps detected this session. ` +
      `${coveragePercent}% of the session had a clear enough view of your hips and ` +
      `shoulders to measure depth — if that's low, move further back so your whole ` +
      `body is in frame and try again.`;
    container.replaceChildren(paragraph);
    return;
  }

  const gradedReps = summary.reps.filter((r) => r.graded);
  const repLabel = summary.repCount === 1 ? "1 rep" : `${summary.repCount} reps`;

  if (gradedReps.length === 0) {
    paragraph.textContent =
      `${repLabel} this session, but tracking wasn't clear enough at any of their ` +
      `bottoms to judge depth or lean — I couldn't see you well enough to grade them. ` +
      `${coveragePercent}% of the session had a clear view overall.`;
    container.replaceChildren(paragraph);
    return;
  }

  const avgDepth = average(gradedReps.map((r) => r.bottomDepthRatio));
  const avgLean = average(gradedReps.map((r) => r.leanDeltaDegrees));
  const allGraded = gradedReps.length === summary.repCount;
  const gradedLabel = allGraded ? repLabel : `${gradedReps.length} of ${summary.repCount} reps`;
  const ungradedClause = allGraded ? "" : " I couldn't see the rest well enough to judge.";

  paragraph.textContent =
    `${gradedLabel} graded this session.${ungradedClause} ` +
    `Hips dropped an average of ${avgDepth.toFixed(2)}x your standing trunk length at ` +
    `each graded rep's deepest point, with trunk lean averaging ` +
    `${formatSigned(avgLean)}° from your standing posture ` +
    `(${coveragePercent}% of the session had a clear view).`;

  const streakStat = document.createElement("div");
  streakStat.className = "session-streak-stat";
  streakStat.textContent = `Longest clean streak: ${summary.streak}`;

  const list = document.createElement("div");
  list.className = "rep-list";
  summary.reps.forEach((rep, index) => {
    list.appendChild(renderRepRow(rep, index, onRepSelect));
  });

  container.replaceChildren(paragraph, streakStat, list);
}

function renderRepRow(rep: RepSummary, index: number, onRepSelect?: (repIndex: number) => void): HTMLElement {
  const row = document.createElement("button");
  row.type = "button";
  row.className = rep.unusual ? "rep-row rep-row--unusual" : "rep-row";

  const number = document.createElement("span");
  number.className = "rep-number";
  number.textContent = `Rep ${index + 1}`;

  const stats = document.createElement("span");
  stats.className = "rep-stats";
  stats.textContent = rep.graded
    ? `${rep.bottomDepthRatio.toFixed(2)}x depth, ${formatSigned(rep.leanDeltaDegrees)}° lean`
    : "not enough tracking to grade";

  row.append(number, stats);

  if (rep.unusual) {
    const icon = document.createElement("span");
    icon.className = "rep-flag-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "!";

    const label = document.createElement("span");
    label.className = "rep-flag-label";
    label.textContent = "unusual";

    row.append(icon, label);
  }

  if (onRepSelect) {
    row.addEventListener("click", () => onRepSelect(index));
  }

  return row;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- progress-chart`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/render/progress-chart.ts src/render/progress-chart.test.ts
git commit -m "feat: render a clickable rep list with streak stat and unusual-rep flags"
```

---

## Task 7: Wire the rep list's click-to-replay into `main.ts`

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Pass the click callback into `renderProgressSummary`**

In `src/main.ts`, the call to `renderProgressSummary(progressContainer, summary);` (around line 306) must move to *after* `playFrames` is declared (Task 5, Step 6), and pass a callback that replays the clicked rep:

```typescript
    renderProgressSummary(progressContainer, summary, (index) => {
      const rep = summary.reps[index];
      playFrames(framesForRep(worldLandmarksHistory, rep));
    });
```

Delete the old bare `renderProgressSummary(progressContainer, summary);` call if it's still present from before Task 5's edits — there should be exactly one call, in this position, after `playFrames` exists and before the worst-rep auto-play block from Task 5 Step 6.

- [ ] **Step 2: Run the full suite and build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: builds with no TypeScript errors.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`, open the app, do a short set with camera movement or an obviously shallower rep among a few normal ones. Confirm: the session summary shows a rep list, a flagged rep (if any) shows the amber icon + "unusual" label, clicking a rep replays just that rep in the 3D view, and if a rep was flagged the replay auto-starts on the worst one when the session ends.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire rep-list clicks to per-rep 3D replay"
```

---

## Task 8: Design tokens — colors, typography, font loading

**Files:**
- Modify: `index.html`

**Decision made here (not left open):** Clash Display and Satoshi are Fontshare fonts, not Google Fonts. Two ways to load them: Fontshare's hosted CDN (`api.fontshare.com`, requires no key but is a third-party runtime dependency and an external network request every load) or self-hosted `.woff2` files via `@font-face`. **Self-hosted is the right call here**: pt-form-tracker's whole pitch is that nothing leaves the browser and nothing depends on a remote service at runtime (see `src/form-checker/rep-deviation.ts` and the project's local-first positioning) — pulling render-blocking fonts from a third-party CDN on every load is a small but real contradiction of that, and self-hosting is a one-time download with no ongoing dependency.

- [ ] **Step 1: Download the font files**

Download these weights from Fontshare (https://www.fontshare.com/fonts/clash-display and https://www.fontshare.com/fonts/satoshi) as `.woff2`:
- Clash Display: `Bold` (700), `Medium` (500)
- Satoshi: `Regular` (400), `Bold` (700)

Save them to a new `public/fonts/` directory:
```
public/fonts/ClashDisplay-Bold.woff2
public/fonts/ClashDisplay-Medium.woff2
public/fonts/Satoshi-Regular.woff2
public/fonts/Satoshi-Bold.woff2
```

(Files in `public/` are served as-is by Vite at the site root, i.e. `/fonts/ClashDisplay-Bold.woff2` — no import needed.)

- [ ] **Step 2: Add `@font-face` rules and design tokens to `index.html`**

In the `<style>` block, before the existing `body` rule, add:

```css
@font-face {
  font-family: "Clash Display";
  src: url("/fonts/ClashDisplay-Bold.woff2") format("woff2");
  font-weight: 700;
  font-display: swap;
}
@font-face {
  font-family: "Clash Display";
  src: url("/fonts/ClashDisplay-Medium.woff2") format("woff2");
  font-weight: 500;
  font-display: swap;
}
@font-face {
  font-family: "Satoshi";
  src: url("/fonts/Satoshi-Regular.woff2") format("woff2");
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: "Satoshi";
  src: url("/fonts/Satoshi-Bold.woff2") format("woff2");
  font-weight: 700;
  font-display: swap;
}

:root {
  --color-primary: #0284c7;
  --color-primary-dark: #026aa3;
  --color-accent: #f59e0b;
  --color-bg: #f0f9ff;
  --color-surface: #ffffff;
  --color-text: #0c2536;
  --color-text-muted: #4b6a7d;
  --color-border: #cfe6f5;
  --color-success-bg: #eef7ee;
  --color-success-border: #cfe3cf;
  --color-danger-bg: #fdeded;
  --color-danger-border: #f3c9c9;

  --font-heading: "Clash Display", sans-serif;
  --font-body: "Satoshi", sans-serif;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 32px;

  --radius-block: 12px;
}
```

`font-display: swap` follows the `ui-ux-pro-max` `font-loading` rule (avoid invisible text while the font downloads).

- [ ] **Step 3: Run the dev server and confirm fonts load**

Run: `npm run dev`, open the app in a browser, open devtools Network tab, confirm the four `.woff2` files load with a 200 status and no console errors.

- [ ] **Step 4: Commit**

```bash
git add public/fonts index.html
git commit -m "feat: add design tokens and self-hosted Clash Display/Satoshi fonts"
```

---

## Task 9: Restyle the three sections as distinct visual blocks

**Files:**
- Modify: `index.html`

Per the spec (Q6, Q10): same LIVE → 3D REPLAY → SESSION SUMMARY order, each restyled in place as a bold, bordered block using the Task 8 tokens — no tabs, no dashboard grid.

- [ ] **Step 1: Replace the base styles and section styling**

Replace the `body` and `section` rules in `index.html`'s `<style>` block:

```css
body {
  font-family: var(--font-body);
  background: var(--color-bg);
  color: var(--color-text);
  margin: 0;
  padding: var(--space-4);
}

h1, h2, h3 {
  font-family: var(--font-heading);
  font-weight: 700;
}

section {
  background: var(--color-surface);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-block);
  padding: var(--space-4);
  margin-bottom: var(--space-4);
}

section h2 {
  font-family: var(--font-heading);
  font-weight: 500;
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-primary-dark);
  margin: 0 0 var(--space-2);
}
```

- [ ] **Step 2: Restyle the rep list and flag markers (Task 6's new elements)**

Add:

```css
.session-summary-text {
  margin: 0 0 var(--space-3);
}

.session-streak-stat {
  font-family: var(--font-heading);
  font-weight: 500;
  font-size: 14px;
  color: var(--color-primary-dark);
  margin-bottom: var(--space-2);
}

.rep-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.rep-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  text-align: left;
  font-family: var(--font-body);
  font-size: 14px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
}

.rep-row:hover {
  border-color: var(--color-primary);
}

.rep-number {
  font-weight: 700;
  min-width: 60px;
}

.rep-stats {
  color: var(--color-text-muted);
  flex: 1;
}

.rep-row--unusual {
  border-color: var(--color-accent);
}

.rep-flag-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-surface);
  font-weight: 700;
  font-size: 12px;
}

.rep-flag-label {
  color: var(--color-accent);
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
```

- [ ] **Step 3: Restyle the framing/calibration readouts and replay container to match the new tokens**

Replace the `#framing-instructions`, `#framing-readout`, `#calibration-readout`, `#privacy-note`, and `#replay-container` rules:

```css
#replay-container {
  width: 100%;
  max-width: 640px;
  aspect-ratio: 4 / 3;
  background: var(--color-text);
  border-radius: 8px;
}

#framing-instructions {
  font-family: var(--font-heading);
  font-weight: 500;
  font-size: 15px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: var(--space-2) var(--space-3);
}

#framing-readout,
#calibration-readout {
  font-size: 15px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-top: none;
  background: var(--color-bg);
}

#framing-readout.ready,
#calibration-readout.ready {
  background: var(--color-success-bg);
  border-color: var(--color-success-border);
}

#framing-readout.not-ready,
#calibration-readout.not-ready {
  background: var(--color-danger-bg);
  border-color: var(--color-danger-border);
}

#framing-readout .readout-hint {
  display: block;
  font-weight: 700;
  margin-top: var(--space-1);
}

#privacy-note {
  font-size: 14px;
  background: var(--color-success-bg);
  border: 1px solid var(--color-success-border);
  border-radius: 8px;
  padding: var(--space-2) var(--space-3);
  margin-bottom: var(--space-3);
}
```

Leave `.settings-note` and `.rule-row` as-is for this task — they're covered by Task 10's responsive pass, not the block-styling pass, since they're already reasonably compact.

- [ ] **Step 4: Manual visual check**

Run: `npm run dev`, open the app, confirm: each section (Setup, Form ranges, Live, 3D Replay, Session Summary) reads as a distinct bordered/rounded block on the sky-blue-tinted background, headings use Clash Display, body text uses Satoshi, flagged reps show the amber icon+label, no layout is broken.

- [ ] **Step 5: Run the e2e smoke test**

Run: `npm run test:e2e`
Expected: PASS — `e2e/smoke.spec.ts` only asserts on element presence/emptiness and console errors, not styling, so this should be unaffected. If it fails, read the failure before assuming it's unrelated — this step exists to catch exactly that kind of surprise.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: restyle sections as bordered blocks with the new design tokens"
```

---

## Task 10: Responsive layout for desktop and mobile

**Files:**
- Modify: `index.html`

**Decision made here:** single breakpoint at `768px` (the `ui-ux-pro-max` `breakpoint-consistency` rule's own suggested set is 375/768/1024/1440; 768 is the one that matters for this app, since the three-section stacked layout is already single-column and doesn't need a tablet-specific in-between state — mobile-first, then desktop). Below 768px: tighten padding, let `#replay-container`'s existing `max-width: 640px` (Task 9) naturally shrink to fill the viewport since it's already percentage-width, and stack the rule-settings rows (currently a fixed-width flex row that will overflow a narrow screen).

- [ ] **Step 1: Add the breakpoint**

Add to the end of `index.html`'s `<style>` block:

```css
@media (max-width: 768px) {
  body {
    padding: var(--space-2);
  }

  section {
    padding: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .rule-row {
    flex-wrap: wrap;
  }

  .rule-row .rule-name,
  .rule-row .rule-status {
    min-width: 0;
  }

  .rep-row {
    flex-wrap: wrap;
  }

  .rep-stats {
    flex-basis: 100%;
  }
}
```

- [ ] **Step 2: Manual check at mobile width**

Run: `npm run dev`, open the app, use devtools device toolbar (or resize the window) to ~375px and ~414px widths. Confirm: no horizontal scroll, the rule-settings rows wrap instead of overflowing, rep rows wrap their stats line instead of clipping, the replay canvas shrinks to fit instead of overflowing.

- [ ] **Step 3: Run the e2e smoke test**

Run: `npm run test:e2e`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add mobile responsive breakpoint at 768px"
```

---

## Self-review notes

- **Spec coverage:** Q6 (colors/type/layout) → Tasks 8-9. Q7 (summary-only flag) → Task 6 (flag only ever rendered in `renderProgressSummary`, never in the live per-frame path). Q8 (streak) → Task 2 + 4. Q9 (worst-rep auto-select) → Task 3 + 5 Step 6. Q10 (same section order, block styling) → Task 9. Q11 (icon+label, not color-only) → Task 6. Q12 (light-only) → Tasks 8-10 define no dark-mode variant. Q13 (desktop+mobile) → Task 10.
- **Deferred-in-spec items resolved, not left as TBD:** Fontshare loading mechanism decided in Task 8 (self-hosted, with rationale). Mobile breakpoint decided in Task 10 (768px, with rationale).
- **Type consistency check:** `RepSummary` (Task 1) → `SessionSummary.reps`/`streak`/`worstRepIndex` (Task 4) → `renderProgressSummary`'s `onRepSelect` (Task 6) → `main.ts`'s `framesForRep(worldLandmarksHistory, rep)` (Task 7) all use the same `startIndex`/`endIndex`/`unusual`/`deviationFraction` field names throughout — verified no renaming drift across tasks.

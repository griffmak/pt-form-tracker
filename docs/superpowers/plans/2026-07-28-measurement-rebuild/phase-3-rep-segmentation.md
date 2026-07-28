# Phase 3 — Rep Segmentation on the Depth Signal

> **Read `phase-2-measurement-primitives.md` first**, specifically its "Context
> you need" section. Phases 2, 3 and 4 are strictly sequential; whoever runs
> this will have just run Phase 2, so that context is not repeated here.

**Status: structural plan.** The detailed task-by-task version gets written
after Phase 1 delivers the corpus. The central constant here — how much hip
travel counts as a rep — cannot be computed from anything currently on disk, so
specifying its implementation in detail now would be false precision. What
follows is what *is* settled: the goal, the dependencies, the decisions already
locked, the measurements that must be taken first, and the done criteria.

**Goal:** Segment a set into reps from the hip-depth signal instead of knee
angle, so rep detection no longer depends on the joint the camera tracks worst.

**Model:** Opus. **On camera:** No.

---

## Why the signal changes

Rep detection currently reads `Knee bend depth`. Across captures the knee has
cleared a 0.5 visibility threshold on as little as 59% of frames, and on
2026-07-27 the ankle managed ~24%. No capture has ever tracked both legs well.
Shoulder and hip have tracked at 99–100% in every capture. Phase 2 built a depth
measure on those four landmarks; this phase makes rep segmentation read it.

## What is already settled — do not re-derive

- **Signal:** `depthRatio(sample, baseline)` from `src/form-checker/calibration.ts`.
  Unitless, ~0 standing, growing positive with descent.
- **Sign convention is inverted from Phase 0.** Knee angle *shrinks* as you
  descend; depth *grows*. Every comparison in the ported hysteresis flips.
  This is the most likely silent bug in the phase.
- **Hysteresis with enter/exit fractions**, carried over from
  `src/form-checker/rep-detection.ts`. Enter 0.6, exit 0.3 of the observed range.
- **Percentile calibration** (5th/95th) rather than raw min/max — Phase 0
  established that one glitch frame must never set the session's scale.
- **Kinematic plausibility filtering** — `rejectImplausibleJumps` from Phase 0
  ports across, with a depth-appropriate per-frame budget rather than 10°/frame.
- **Minimum rep duration** ~18 frames (0.3s at 60fps).
- A rep's deepest point is now its **maximum**, not its minimum.

## Measurements that must be taken before writing code

Each of these is a number that does not exist yet. Take them from the corpus,
record them in `corpus-manifest.md`, and cite the source take in the code
comment — the same discipline Phase 2 used.

1. **`MIN_REP_DEPTH_RATIO`** — the floor separating a rep from a weight shift.
   Derive from the peak depth in `corpus-04-shallow` (deliberately shallow
   quarter squats, ground truth 5 reps) versus the noise ceiling in
   `corpus-01-standing` (ground truth 0). If those two overlap, the measure
   cannot distinguish a shallow rep from standing and that is a finding, not a
   threshold to tune.
2. **`MAX_DEPTH_CHANGE_PER_FRAME`** — the plausibility budget, in depth-ratio
   units per frame. Derive from the fastest genuine descent observed in
   `corpus-03-five-normal`, with headroom.
3. **Baseline strategy** — session-global or rolling. Phase 2 Task 5 Step 3
   answers this from `corpus-06-drift` and records the answer under "Drift
   finding" in the manifest. **Read that answer; do not re-litigate it.** If it
   says rolling, use the 10th percentile of hip Y over a trailing ~10s window
   (hip Y grows downward, so the 10th percentile is the highest hip position).

## Validation — the part that decides whether this works

Segmentation must reproduce the ground-truth rep counts in
`corpus-manifest.md` across all six takes:

| take | expected |
|---|---|
| `corpus-01-standing` | 0 |
| `corpus-02-five-slow` | 5 |
| `corpus-03-five-normal` | 5 |
| `corpus-04-shallow` | 5 |
| `corpus-05-degrading` | 8 |
| `corpus-06-drift` | 5 |

Getting take 1 to 0 while takes 2–6 stay correct is the same trade Phase 0 had
to make and is the only evidence that matters. A filter strict enough to kill
real reps is no better than one loose enough to invent them.

## The open risk this phase resolves or exposes

**No deviation signal.** The product flags a rep unlike the user's others. If
their reps are near-identical there is nothing to flag. `corpus-05-degrading`
is the only take that can test this — its last three reps were performed
deliberately worse. Compute the within-set drift measure (last three reps versus
first three, on both depth and lean) and check whether it separates them.

**If it does not, stop and say so before Phase 5 builds UI on it.** The feature
does not work and the product needs rethinking. This was flagged as open in the
original design interview and has never been testable until now.

## File structure

| File | Action |
|---|---|
| `src/form-checker/rep-segmentation.ts` | Create — depth-signal segmentation |
| `src/form-checker/rep-segmentation.test.ts` | Create — synthetic unit tests |
| `src/form-checker/rep-segmentation.corpus.test.ts` | Create — the six ground-truth assertions |
| `src/render/progress-chart.ts` | Modify — `summarizeSession` reads the new segmentation |
| `src/form-checker/rep-detection.ts` | Leave in place until Phase 5 |

Keep the knee-angle path alive through this phase. Running both on the same
takes is how you find out whether the new signal is actually better, rather
than merely different.

## Done criteria

- [ ] `npm test` passes.
- [ ] All six corpus takes segment to their ground-truth rep counts.
- [ ] Every threshold constant cites the take it was measured from.
- [ ] The drift question from Phase 2 is honoured, not re-decided.
- [ ] The deviation-signal risk is answered in writing in `corpus-manifest.md` —
      either "drift separates the degraded reps" with numbers, or "it does not"
      with numbers.

## Does NOT do

Confidence gating (Phase 4). Any UI or copy change (Phase 5). Removing the
knee-angle path (Phase 5).

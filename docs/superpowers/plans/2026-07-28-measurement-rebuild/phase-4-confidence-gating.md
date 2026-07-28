# Phase 4 — Rep-Level Confidence Gating

> **Read `phase-2-measurement-primitives.md` first**, specifically its "Context
> you need" section. Phases 2, 3 and 4 are strictly sequential; whoever runs
> this will have just run Phase 3, so that context is not repeated here.

**Status: structural plan.** The detailed task-by-task version gets written
after Phase 3, when the corpus has shown what confidence actually looks like at
the bottom of a real rep. The design decisions below are settled and come from
the spec; the numbers are placeholders until measured.

**Goal:** Replace per-frame hard gating with rep-level gating, so a dropout
mid-descent withholds a verdict instead of silently corrupting one — and so
"I couldn't see you" becomes a real outcome rather than a fake zero.

**Model:** Opus. **On camera:** No.

---

## The defect this fixes

`src/form-checker/form-checker.ts` skips a rule whenever any one of its
landmarks falls below `VISIBILITY_THRESHOLD = 0.5` on that frame. Two
consequences, both bad:

- A single low-confidence frame at the bottom of an otherwise clean rep removes
  the only frame that mattered, and the session reports a score computed from
  whatever frames survived.
- Coverage and score are reported separately, so a session graded from 21% of
  its frames looks like a real score with a footnote. It is not a real score.

The deeper problem is that visibility was doing a job it cannot do.
**MediaPipe's `visibility` predicts non-occlusion, not positional correctness.**
The frames that fabricated two reps out of a stationary body all had high
visibility. Phase 0 added kinematic filtering because of this; this phase stops
treating visibility as a per-frame veto and starts treating it as a per-rep
quality signal, which is what it can actually support.

## What is already settled — do not re-derive

- **A rep earns a verdict when its bottom window has adequate median
  confidence.** Median, not mean, and not "every frame" — one bad frame in a
  window must not decide.
- **`seen-but-not-graded` is a first-class outcome.** It counts toward the rep
  count and preserves the streak while withholding any claim about form. It is
  not a failure and must never be rendered as one.
- **Gate hysteresis: enter 0.6, exit 0.35.** A rep must not be chopped
  mid-descent because confidence dipped for a moment.
- **Temporal smoothing on positions before angle computation** — a short median
  filter or one-euro filter. Smooth the inputs, not the outputs.
- **Frame-level dropout must never end a rep.** This is the invariant. If a
  change makes a dropout terminate a rep, the change is wrong.

## Measurements needed before writing code

1. **Bottom-window size** — how many frames around the deepest point to assess.
   Derive from the dwell time at the bottom in `corpus-02-five-slow` (paused
   reps) and `corpus-03-five-normal` (no pause). It must be short enough to fit
   inside an unpaused rep.
2. **`MIN_REP_MEDIAN_VISIBILITY`** — derive from the observed trunk-landmark
   confidence at the bottom of reps across takes 2, 3 and 5. Set it so clean
   reps pass and any take with genuinely poor tracking does not.

## Validation

- Every rep in `corpus-02-five-slow` and `corpus-03-five-normal` should be
  **graded**, not merely seen. If clean, well-tracked reps come back ungraded,
  the gate is too strict and the tool will withhold verdicts on good work.
- Synthetically drop confidence across the bottom window of one rep in a corpus
  take and confirm that rep becomes `seen-but-not-graded` while its neighbours
  stay graded and the rep count stays correct.
- Synthetically drop confidence for a handful of frames mid-descent and confirm
  the rep still segments and still earns a verdict.

## File structure

| File | Action |
|---|---|
| `src/form-checker/rep-confidence.ts` | Create — bottom-window assessment, verdict type |
| `src/form-checker/rep-confidence.test.ts` | Create |
| `src/form-checker/rep-confidence.corpus.test.ts` | Create |
| `src/pose/smoothing.ts` | Create — median or one-euro filter over landmark positions |
| `src/pose/smoothing.test.ts` | Create |
| `src/render/progress-chart.ts` | Modify — summary distinguishes graded from seen-not-graded |
| `src/form-checker/form-checker.ts` | Modify — per-frame hard gate steps back |

## Done criteria

- [ ] `npm test` passes.
- [ ] Clean corpus reps are graded; a rep with a degraded bottom window is
      `seen-but-not-graded` and still counted.
- [ ] A mid-descent dropout neither ends nor ungrades a rep.
- [ ] The session summary can express "5 reps, 4 graded" without implying the
      fifth was bad.
- [ ] Every threshold cites the take it was measured from.

## Does NOT do

Any user-facing copy or layout (Phase 5). The summary gains the *data* to
express `seen-but-not-graded`; the wording that surfaces it is Phase 5's job.

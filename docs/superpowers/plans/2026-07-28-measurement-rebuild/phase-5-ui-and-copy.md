# Phase 5 — UI, Copy Honesty, Streak, Worst-Rep Replay

> **Read `phase-2-measurement-primitives.md` first**, specifically its "Context
> you need" section. This phase runs last and assumes Phases 0–4 are done.

**Status: structural plan, with one section written out in full.** The
forbidden-claims checklist below is not a placeholder and is not to be
summarized — it is the deliverable this phase exists for. Everything else here
is structural and gets detailed once Phases 3 and 4 land.

**Goal:** Make every user-facing claim one the measurement layer can actually
support, and ship the two features the product promised — a streak and a
worst-rep skeleton replay.

**Model:** Sonnet. **On camera:** Light — one session to confirm the flow reads
correctly end to end.

---

## Why this phase is not cosmetic

The tool's measurement problems were diagnosable from data. Its *claims*
problem is not: nothing in a test suite catches a screen that says "83% good
form" when the honest statement is "I could see you well enough to judge four of
your five reps, and the last three were shallower than your first three."

The user is rehabbing a **spinal disc injury**. The single most harmful thing
this codebase has done was tell them their back position was wrong on
essentially every correctly-measured frame, while a rule whose pass band did not
match its own geometry passed only on pose-tracker glitches. That rule is gone
as of Phase 0. This phase makes sure nothing takes its place.

---

## The forbidden-claims checklist

**Every user-facing string — on screen, in the README, in the overlay, in any
error state — is checked against this list before this phase is done.** Read it
as a review pass over the finished text, not as advice while writing.

### Never claim, in any wording

1. **Anything about the spine, the disc, the back, or injury risk.** MediaPipe
   has 33 landmarks and **none between shoulder and hip** — no thoracolumbar
   junction, no sacrum, no L5/S1. The shoulder→hip chord spans the whole spine
   *plus* the hip joint and is dominated by hip flexion. The lumbar spine can
   flex fully with that chord unchanged. The tool is blind to the exact event
   the injury cares about.
2. **Anything about posterior pelvic tilt / "butt wink."** It is a rotation
   about the axis through the hip joint centres, which landmarks 23 and 24 *are*.
   Undetectable with this sensor at any price. Depth beyond personal baseline is
   the best available **proxy** for the risk window and must be named as a proxy
   wherever it appears.
3. **Absolute joint angles presented as standards.** No "your trunk was at 34°."
   Every user-visible number is a delta from the user's own baseline.
4. **A score computed from partial coverage.** If the tool could not see enough
   to judge, it says so instead of scoring what survived.
5. **"0 reps" when the truth is "I could not see you."** These are different
   facts and the copy must distinguish them.
6. **Any implication of medical, diagnostic, or clinical judgment**, or that the
   tool substitutes for or supplements a physio.
7. **Any implication that data leaves the device.** It does not, and the copy
   must not muddy that — but see the CDN note under "Also fix," which the
   current README already handles correctly and must keep handling correctly.

### Honest claim set — the complete list of what may be said

- Rep count, and volume across the set.
- Depth and trunk lean **relative to the user's own baseline**, this set.
- **Within-set drift** — last three reps versus first three. Every systematic
  sensor bias cancels in this comparison, which makes it the most trustworthy
  output the tool has. Lead with it.
- Whether a rep was **graded** or **seen but not graded**.
- The streak.
- Personal red lines the user set once, with their physio watching.

### Review procedure

- [ ] `grep -rn` the codebase for `°`, `deg`, `degrees` in any string that
      reaches the DOM. Every hit is either a delta or a defect.
- [ ] Read every string in `index.html`, `src/render/*.ts`, and `README.md`
      against items 1–7 above.
- [ ] Read the session-summary text aloud in the three states: all reps graded,
      some graded, none graded. Each must be true and none may read as a failure
      when the tool simply could not see.
- [ ] Confirm the privacy note on screen and in the README still matches what
      the code does.

---

## Features to ship

**Streak.** Sessions completed, persisted in `localStorage`. A rep that was seen
but not graded still counts toward the set — the streak measures showing up, not
performance. Note: Node's experimental `localStorage` shadows jsdom's under
vitest; inject `Storage` as a parameter rather than mocking it, the way
`src/exercise-library/overrides.ts` already does.

**Worst-rep replay.** The single rep with the largest deviation from the user's
own set, rendered as a skeleton via the existing `ReplayView`. One rep, not the
whole session. If no rep was graded, there is no worst rep — say that.

**Calibration in the flow.** Phase 2 made calibration required before every set.
The UI must reflect it: the tool does not record until it has a clean standing
baseline, and it says what to change when it does not have one.

## Also fix

- Remove the knee-angle path (`src/form-checker/rep-detection.ts` and its tests)
  once nothing reads it. Keep the capture regression test if it still runs —
  it documents a defect worth not reintroducing.
- Update `README.md`: the "How it works" section still says angles come from
  `worldLandmarks`, which is now only half true. State the split and why.
- Rewrite the ranges table. After Phase 0 it has one row; after this phase the
  concept of a population reference band may not apply at all.

## Done criteria

- [ ] Every item in the forbidden-claims checklist has been reviewed against the
      shipped text, and the review procedure's four boxes are ticked.
- [ ] `npm test` passes.
- [ ] One live session end-to-end: calibrate, record a set, see the summary, the
      streak, and the worst-rep replay.
- [ ] The summary is correct and non-alarming when no rep could be graded.
- [ ] README matches what the code actually does.

## Does NOT do

Deploy. The live link is deliberately stale during the rebuild — a locked
decision. Self-hosting the MediaPipe WASM and model is a separate track and
blocks nothing.

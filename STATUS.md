# Status — PT Form Tracker

**Last updated:** 2026-07-29
**Branch:** `measurement-rebuild` (pushed, in sync with origin)
**Tests:** 163/163 · `npx tsc --noEmit` clean · `npm run build` clean

## Worked on this session

Phases 2 and 3 of the measurement rebuild, combined because Phase 3's central
constant was not computable until Phase 2 existed.

**Phase 2** — planar trunk-lean and hip-depth primitives
(`src/pose/planar-measures.ts`) plus per-set calibration against a standing
baseline (`src/form-checker/calibration.ts`), validated against the six-take
capture corpus rather than synthetic fixtures.

**Phase 3** — its plan was rewritten task-by-task from Phase 2's measured numbers
and then executed: depth-series construction, hysteresis segmentation on the
inverted signal, per-rep within-set deviation, and `summarizeSession` wired to
the new path with the knee path still alive.

**Result:** all six corpus takes segment to their ground-truth rep counts
(0/5/5/5/8/5) from one set of constants. The knee-angle signal gets three of the
six wrong on the same takes. The last open product risk — whether a "this rep is
unlike your others" signal exists at all — is answered yes on depth (−65%/−59%/−50%
vs a 17.4% worst-case spread on consistent sets) and **no on trunk lean**.

## Where things left off

Phases 0–3 done and pushed. Nothing is half-finished; the working tree is clean.

`main.ts` is deliberately untouched, so the depth path is built and tested but not
yet reachable from the running app — that wiring belongs to Phase 5.

## Next action

**Phase 5 wiring, ahead of Phase 4 — the order changed.** Get the depth path into
the live app: wire it into `main.ts`, build the calibration experience (hold still
→ ready → couldn't calibrate), retire the knee-angle path, and fix copy that
claims more than the tool can measure.

Why ahead of confidence gating: what Phase 4 produces *is* a message on screen, so
building it with no interface to attach to means designing its semantics twice.
And until this lands, the rebuild has changed nothing a user can feel — the live
app still behaves like the version that reported 2 reps and 50% good form over 26
seconds of standing still.

Read `HANDOFF.md` first — its "Next session" section carries the full reasoning,
the ~4.6–6.5s calibration delay that now needs on-screen words, and the five open
findings.

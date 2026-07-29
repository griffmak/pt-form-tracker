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

**Phase 4 — rep-level confidence gating.** Its plan
(`docs/superpowers/plans/2026-07-28-measurement-rebuild/phase-4-confidence-gating.md`)
is still structural and needs writing out task-by-task from the numbers now in
`corpus-manifest.md`, the same way Phase 3's was.

Read `HANDOFF.md` first — it carries the five open findings Phase 4 should know
about, including the one mutation that survives Phase 3's test suite (removing the
depth jump filter breaks nothing on real data) which is itself a confidence-gating
question.

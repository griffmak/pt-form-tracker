# Handoff — PT Form Tracker, measurement rebuild

**Written:** 2026-07-29, at the end of the Phase 2 + Phase 3 session.
**Updated:** 2026-07-30 — Phase 4 and Phase 5 were executed together this
session, per the finalized `phase-4-5-combined-plan.md`. All six phases of the
measurement rebuild are now shipped. What's left is a live camera smoke test
(Griffin's action, not an agent's) and a design decision about what comes next
(Phase 5b vs. the demo video).
**Branch:** `measurement-rebuild` (pushed, in sync with origin — 24 commits
total, 13 from this session).
**Read next:** the "Next session" section immediately below. `corpus-manifest.md`
is still the source for every measured constant, but nothing in the next
session's scope requires re-deriving one.

---

## Paste-able prompt for the next session

```
pt-form-tracker's measurement rebuild (Phases 0-5) is done and pushed to
`measurement-rebuild` — 176/176 tests, tsc clean, build clean, forbidden-claims
grep passed. Read HANDOFF.md's "Where we are in the phases" table below to
confirm, then do the following in order.

1. LIVE SMOKE TEST FIRST, WITH ME, BEFORE ANY NEW CODE. Start the dev server
   (`npm run dev`) and I will calibrate (hold still ~5s), record a real set,
   and read the summary in an actual browser with a real camera — no prior
   session was able to do this, since it requires a physical camera. If
   anything looks wrong (calibration never goes ready, the summary claims
   something the forbidden-claims checklist forbids, reps miscount), stop and
   debug that before touching Phase 5b — a shipped-but-broken live path is
   worse than an unshipped one.

2. Once the smoke test passes, ask me which of these two tracks to take:
   (a) Phase 5b — deviation-flag UI, streak, worst-rep replay. This needs its
   own superpowers:brainstorming + superpowers:writing-plans pass before any
   code, because the product promise ("we tell you when you're doing it
   wrong," settled 2026-07-30) means the current relative-to-set-median
   deviation signal is insufficient on its own — corpus-04-shallow (every rep
   uniformly shallow) gets zero flags under it despite being wrong on every
   rep. Design an added absolute-depth check before writing any Phase 5b task
   plan; don't reuse the relative signal alone.
   (b) Shoot the demo video's "after" footage per `docs/demo-video-plan.md`.
   2 of 3 planned shots are available now (full-set recording with correct
   rep count; a shallow set counted rather than dropped). The 3rd shot (a rep
   flagged as unlike the others) is blocked on Phase 5b, so if that's the shot
   Griffin wants, do 5b first.

Hard constraints, unchanged: no runtime AI/API/LLM, deterministic geometry
only; the tool must never claim anything about the spine, disc, or injury
risk; interior-joint angle convention is 180° = extended, but the depth signal
is inverted (a rep's bottom is the signal's MAXIMUM); null means "not
evaluated," never ends an in-progress rep or gets read as zero. Corpus files
(session-*.json, corpus-*.json) are tracked and must not be modified.

Context is the binding constraint on a session like this, not effort —
verification is the first casualty of a tired session. Commit after each task,
run the full test suite before claiming anything done, and stop to flag rather
than push through if the session is running long.
```

---

## Where we are in the phases

| # | Phase | State |
|---|---|---|
| 0 | Kill fabricated reps; delete the wrong torso rule | ✅ **DONE** 2026-07-28 (pm), 5 commits, pushed |
| 1 | Raw-landmark instrumentation; record the capture corpus | ✅ **DONE** 2026-07-28 (night), 4 commits, pushed |
| 2 | Planar measurement primitives + calibration | ✅ **DONE** 2026-07-29, 6 commits |
| 3 | Rep segmentation on the depth signal | ✅ **DONE** 2026-07-29, 5 commits |
| 4 + 5 | Confidence gating + wire the depth path into the live app (calibration UX, copy honesty) | ✅ **DONE** 2026-07-30 |
| 5b | Deviation flag UI, streak, worst-rep replay | After 4+5; product promise now settled (see below), design not yet started |

Phase index: `docs/superpowers/plans/2026-07-28-measurement-rebuild/README.md`
Design spec: `docs/superpowers/specs/2026-07-28-measurement-rebuild-design.md`

**163/163 tests, `npx tsc --noEmit` clean, `npm run build` clean** (only the
pre-existing chunk-size warning). Up from 62 at the end of Phase 1.

## Phase 4 + Phase 5 combined — done 2026-07-30 (was: "Next session")

**As of 2026-07-30, this section describes completed work**, kept below for
its reasoning and locked decisions rather than rewritten — the "Next session"
work is now in the paste-able prompt above (live smoke test, then Phase 5b vs.
video). `main.ts` is no longer untouched; the depth path is wired end-to-end
and reachable from the running app.

**Wiring came first, inside the combined session**, per the reasoning from
2026-07-29 — Phase 4's output IS a message on screen ("I couldn't see you well
enough to judge that rep"), and building that logic with no interface to
attach it to would have meant designing its semantics twice.

**Scope:** wire the depth path into `main.ts`; build the calibration experience
(hold still → ready → couldn't calibrate); retire the knee-angle path; fix copy
that claims more than the tool can measure; then rep-level confidence gating
once the UI exists to speak through. **Not** the deviation flag UI, **not** the
streak — those are Phase 5b, still after this session.

**Expect a new user-visible step.** Calibration needs ~1.5s of stillness and, on
the six corpus takes, became ready **4.6–6.5s** after the camera started. Ship
that silently and the user's first rep goes into a dead app.

**The product decision is settled, 2026-07-30 — this session should build to
it, not around it.** The promise is "we tell you when you're doing it wrong,"
not "we spot inconsistency in your set." `corpus-04-shallow` gets **zero**
flags under the current relative-to-set-median deviation signal — every rep
shallow, consistently, so nothing looks "inconsistent" — which is wrong under
this promise. That's a Phase 5b design problem (needs an added absolute-depth
check), not this session's problem, but Phase 4's confidence-gating copy
should be written with the "wrong," not "inconsistent," framing in mind so it
doesn't need a rewrite later.

## The headline: the new signal works, and by how much

All six corpus takes now segment to their ground-truth rep counts —
**0 / 5 / 5 / 5 / 8 / 5** — from one set of constants with no per-take special
cases. The knee-angle signal, run over the same six takes by the same test, gets
**three of six wrong**: 0 reps on `corpus-03-five-normal` and `corpus-04-shallow`
(legs tracked too poorly to produce a 40° range at all) and 6 of 8 on
`corpus-05-degrading`. That comparison is locked in
`rep-segmentation.corpus.test.ts` so the premise of the rebuild stays measured
rather than assumed.

## What Phase 2 delivered

- `src/pose/planar-measures.ts` — `trunkSample(lm, aspectRatio)` returning
  `{ leanDegrees, hipY, trunkLength, minVisibility }` or **null**. Uses midpoints
  of both shoulders and both hips, never left-only, and multiplies `dx` by the
  aspect ratio because normalized x and y are normalized by width and height
  separately.
- `src/form-checker/calibration.ts` — `assessCalibration` (trailing-window live
  gate), `depthRatio`, `leanDelta`, `withinCalibratedScale`.
- `tests/corpus.ts` — shared corpus loader for Phases 2–4.
- `@types/node` added as a dev dependency; the per-file `@ts-expect-error` is gone.

Three findings, all recorded with numbers in `corpus-manifest.md`:

1. **MediaPipe's tracker needs ~4.5s to converge** — trunk length falls 36% on a
   confirmed-motionless body. The opening window is the *worst* window in every
   take, so calibration must be a forward scan, never `slice(0, 120)`.
2. **Every take ends with the user walking back to the laptop.** An ~84–92 frame
   run where body scale climbs past 2.0. In the standing take it alone
   manufactured a depth reading of 1.096 — more apparent descent than any real
   squat in the corpus, from 30s of stillness. Only a body-scale check catches it;
   a kinematic filter cannot, because the artifact is *slower* than real reps.
3. **Take 1 has no drift.** Its reported 0.236 was raw max-minus-min over a series
   whose two ends are artifacts. Over the converged region, hip-Y sd is 0.00024
   median / 0.00083 worst — ~20x *below* the plan's stop line rather than above it.

## What Phase 3 delivered

- `src/form-checker/depth-series.ts` — `findBaseline`, `buildDepthSeries`.
- `src/form-checker/rep-segmentation.ts` — `rejectImplausibleDepthJumps`,
  `detectDepthReps`, returning `DepthRep { startIndex, endIndex, bottomIndex,
  bottomDepthRatio }`. Sign convention inverted from `rep-detection.ts`: the
  bottom of a rep is the **maximum**.
- `src/form-checker/rep-deviation.ts` — `rollingDepthSeries`, `repDeviations`.
- `src/render/progress-chart.ts` — `summarizeSession(frames, exercise,
  trunkSamples?)`. With trunk samples it grades depth-segmented rep bottoms; without
  them its behaviour is unchanged. **The knee path is still alive and still
  reachable** — removing it is Phase 5.

**Measured constants, each with its working window** (full derivations in the
manifest):

| constant | value | window |
|---|---|---|
| `MIN_REP_DEPTH_RATIO` | 0.10 | (0.0151, 0.3411] |
| `MAX_ENTER_OFFSET` | 0.19 | 0.155–0.225 |
| `MAX_DEPTH_CHANGE_PER_FRAME` | 0.08 | > 0.0625 |
| `UNUSUAL_REP_FRACTION` | 0.30 | 0.175–0.499 |
| `ROLLING_BASELINE_FRAMES` | 180 (3s) | settled in Phase 2 |

**The one new design decision.** Phase 0's hysteresis puts the enter threshold at
a fraction of the session's range. On `corpus-05-degrading` that drops all three
of its deliberately degraded reps, because a threshold at 0.6 of the range sits at
0.412 while those reps peak at 0.24–0.34. Under a purely relative threshold, the
better your first reps are, the more of your worse reps disappear. The enter
threshold is now `min(range * 0.6, MAX_ENTER_OFFSET)`.

**The open product risk is answered: the deviation signal works, on depth only.**
`corpus-05-degrading`'s three degraded reps read −65.5%, −58.5%, −50.0% against
their set median, while the widest spread on any consistent take is 17.4%. No
overlap. **Trunk lean does not separate them** — the whole corpus lives between
1.0° and 4.3°, and take 5's degraded reps sit *inside* the range its own good reps
occupy. Phase 5 must not build a lean-based flag.

## Open findings and decisions Phase 4 should know about

**1. One mutation survives, and it is a finding, not a bug to fix.** Removing the
`rejectImplausibleDepthJumps` call from `detectDepthReps` breaks no test. With
Phase 2's bounds guard and scale guard in place, an infinite jump budget still
reproduces all six rep counts; the filter rejects 7 frames in the entire corpus
and none of them could form a rep. An attempt to write a discriminating test
failed for an instructive reason recorded in the manifest. **Phase 4 should decide
whether a filter with no failing case on real data belongs in the pipeline at
all** — that is a confidence-gating question, which is Phase 4's subject.

**2. The relative enter term is untested by the corpus.** Every take that reaches
segmentation has a range above ~0.317, so `MAX_ENTER_OFFSET` is the lower term on
all of them. The relative term is kept for a set shallower than any in the corpus
and is covered by a synthetic unit test, labelled as such. Do not present it as
corpus-measured.

**3. The deviation flag is not proven order-independent.** Every degrading take in
this corpus degrades *late*, so the set median is set by good reps. A set that
starts badly and improves would move the median and nothing here tests it. Not a
blocker — rep counting does not use the deviation measure — but Phase 5 must not
claim otherwise.

**4. `main.ts` is untouched by Phases 2 and 3.** Nothing in production computes
trunk samples yet, so `summarizeSession`'s depth path is not reachable from the
running app. That wiring is the next session's whole job.

**5. Still open from Phase 0/1:** `main.ts:156-157` replaces the framing readout
with "Recording..." once a session starts (Phase 5 fix). The cross-session history
premise remains deferred — frame data accumulates in IndexedDB and is never read
back.

## Hard constraints (unchanged, restated because they're easy to erode)

- **No runtime AI, API, LLM, or remote inference.** Deterministic geometry only.
  The privacy claim is why a stranger grants camera access at all.
- **The tool must never claim anything about the spine, the disc, back safety, or
  injury risk.** MediaPipe has no landmark between shoulder and hip.
- Joint angles use the interior convention: 180° = extended, a rep's deepest point
  is its **minimum**. **The depth signal is inverted** — larger `depthRatio` is
  deeper, and a rep's deepest point is its **maximum**.
- `null` means "not evaluated this frame". It must never be read as zero and must
  never end an in-progress rep.
- The four `.claude-test-artifacts/session-*.json` files and the six
  `corpus-*.json` files are the tracked corpus and must not be modified.
  `latest.json` is gitignored and gets overwritten by any session you record.

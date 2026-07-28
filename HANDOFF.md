# Handoff — PT Form Tracker, measurement rebuild

**Written:** 2026-07-28 (pm), at the end of the Phase 0 session.
**Branch:** `measurement-rebuild` (pushed, in sync with origin).
**Read next:** `docs/superpowers/plans/2026-07-28-measurement-rebuild/phase-1-instrumentation-and-corpus.md`

---

## Where we are in the phases

| # | Phase | State |
|---|---|---|
| 0 | Kill fabricated reps; delete the wrong torso rule | ✅ **DONE** 2026-07-28 (pm), 5 commits, pushed |
| 1 | Raw-landmark instrumentation; record the capture corpus | ⬅️ **NEXT — ON CAMERA**, ~60–90 min |
| 2 | Planar measurement primitives + calibration | Blocked on Phase 1 |
| 3 | Rep segmentation on the depth signal | Blocked on Phase 1; plan is structural, needs writing out |
| 4 | Rep-level confidence gating | Blocked on Phase 1; plan is structural |
| 5 | UI, copy honesty, streak, worst-rep replay | Structural |

Phase index: `docs/superpowers/plans/2026-07-28-measurement-rebuild/README.md`
Design spec: `docs/superpowers/specs/2026-07-28-measurement-rebuild-design.md`

## Primary task for this session

**Phase 1** — instrument raw landmark capture, then record six labelled takes.

Everything in phases 2–4 derives its constants from this corpus. It cannot be
faked, inferred, or replaced by more synthetic tests. If the corpus is bad, the
next three sessions build on sand.

## What Griffin needs to bring

**A camera set far enough back.** This is the one thing that can waste the whole
session, and the 2026-07-28 browser check showed the current setup failing it —
framing was cropped around mid-thigh with ankles out of frame entirely.

Before pressing space on take 1:

- [ ] Ankles **and some floor** visible at the bottom of your deepest rep
- [ ] Fully side-on to the camera (the squat rule declares `requiredFraming: "side-view"`)
- [ ] The framing readout says ready **before** recording starts
- [ ] Nothing between you and the lens at the bottom of the rep

Why it matters: the knee rule needs landmarks 23, 25 **and 27** (hip, knee,
ankle). With ankles out of frame the rule goes unevaluated on most frames, and
the session produces exactly what the `demo-video` and `redo2` captures produced
— 0 reps, because the tool genuinely never saw a squat. Beat the 2026-07-27
capture's **60.8%** rule coverage; that is the best any capture has managed.

Also bring: room for 6 takes back to back, and ~60–90 minutes uninterrupted.

## Open decisions carried into this session

**1. `@types/node` — unresolved, needs a call.**
`rep-detection.capture.test.ts` imports `node:fs` to read the archived captures.
The project has no `@types/node`, so TypeScript flags the import. It is currently
suppressed with a `@ts-expect-error` and a comment, because Phase 0's plan said
"no new dependencies." Nothing breaks — `npm run build` is `vite build` with no
typecheck, and all tests pass. But Phase 1 writes more replay/capture tooling and
will hit this again. **Decide:** add `@types/node` as a dev dependency, or keep
suppressing per-file.

**2. No mid-session framing feedback — a real risk for a six-take shoot.**
`main.ts:156-157` replaces the framing readout with "Recording — press \"e\" to end
the session" as soon as recording starts. Framing is checked in the setup phase
only. So if you drift out of frame mid-take, nothing tells you until replay.
Filed as a Phase 5 candidate, not fixed. Worth considering whether Phase 1 wants
a cheap temporary version of this, given the corpus depends on framing holding.

**3. Deferred, not dropped: the cross-session history premise.**
Frame data accumulates in IndexedDB and is never read back — `getFramesForSession`
is only ever called with the session that just ended. The README is honest about
this. Out of scope until measurement is trustworthy.

## What Phase 0 actually changed

Five commits, `996bb49` → `0a52004`. All in `rep-detection.ts` plus test files
and one rule deletion.

**Three guards, each closing a different hole:**

| Guard | Constant | Closes |
|---|---|---|
| Percentile calibration | 5th/95th, replacing raw min/max | One glitch frame setting the whole session's scale |
| `rejectImplausibleJumps` | `MAX_DEGREES_PER_FRAME = 10` (600°/s), gaps bridged to 30 frames | The ~4500°/s tracker glitch. Compares against the last *accepted* sample, so a multi-frame burst is rejected in full |
| Duration floor | `MIN_REP_FRAMES = 18` (~0.3s), index span not sample count | Stumbles and wobble; a dropout mid-rep does not shorten a real rep |

**Pinned against all four archived captures** in `rep-detection.capture.test.ts`:

| capture | before | after |
|---|---|---|
| standing test (25.9s stationary) | 2 reps @ 50% form | **0** |
| 2026-07-27 (835 frames) | 2 | **2** |
| demo video | 0 | 0 |
| redo2 | 0 | 0 |

`Torso lean` deleted from `squat.ts`; `squat.rules` now has exactly one entry and
`repSignalRuleName` stays `"Knee bend depth"`. Phase 2 builds the replacement
planar trunk measure. 57/57 tests, `npm run build` clean.

## Two things worth knowing before you touch the tests

**The plan's duration-floor test passed when it was supposed to fail.** Its
fixture dipped 170°→100° in one frame, so the plausibility filter nulled it before
the duration logic ran — it would have passed with `MIN_REP_FRAMES` deleted. It
was replaced with a plausible 8°/frame dip. Phase 0's plan document has been
corrected in place. General principle written up on
`wiki/pages/patterns/metric-verification-before-diagnosis.md`.

**Fixtures in this repo were describing impossible squats.** Two families —
`rep-detection`'s 960°/s ramps and `progress-chart`'s 2400°/s `repFrames` — were
rewritten to 60fps-realistic shapes. If a new guard makes a fixture fail, check
whether the fixture was ever physical *before* loosening the guard.

## Hard constraints (unchanged, restated because they're easy to erode)

- **No runtime AI, API, LLM, or remote inference.** Deterministic geometry only.
  The privacy claim is why a stranger grants camera access at all.
- **The tool must never claim anything about the spine, the disc, back safety, or
  injury risk.** MediaPipe has no landmark between shoulder and hip; the lumbar
  spine can flex fully with the shoulder→hip chord unchanged.
- Angles use the interior-joint convention: 180° = extended, a rep's deepest point
  is its **minimum**.
- `null` in an angle series means "not evaluated this frame" and must never end an
  in-progress rep.
- The four `.claude-test-artifacts/session-*.json` files are the tracked corpus
  and must not be modified. `latest.json` is gitignored and gets overwritten by
  any session you record.

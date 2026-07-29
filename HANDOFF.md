# Handoff — PT Form Tracker, measurement rebuild

**Written:** 2026-07-28 (night), at the end of the Phase 1 session.
**Branch:** `measurement-rebuild` (pushed, in sync with origin).
**Read next:** `docs/superpowers/plans/2026-07-28-measurement-rebuild/phase-2-measurement-primitives.md`

---

## Where we are in the phases

| # | Phase | State |
|---|---|---|
| 0 | Kill fabricated reps; delete the wrong torso rule | ✅ **DONE** 2026-07-28 (pm), 5 commits, pushed |
| 1 | Raw-landmark instrumentation; record the capture corpus | ✅ **DONE** 2026-07-28 (night), 4 commits, pushed |
| 2 | Planar measurement primitives + calibration | ⬅️ **NEXT**, not on camera |
| 3 | Rep segmentation on the depth signal | Blocked on Phase 2; plan is structural, needs writing out |
| 4 | Rep-level confidence gating | Blocked on Phase 2; plan is structural |
| 5 | UI, copy honesty, streak, worst-rep replay | Structural |

Phase index: `docs/superpowers/plans/2026-07-28-measurement-rebuild/README.md`
Design spec: `docs/superpowers/specs/2026-07-28-measurement-rebuild-design.md`

## Primary task for this session

**Phase 2** — build the planar trunk-lean and hip-depth measurement primitives, and
calibration against a per-set standing baseline, validated against the six-take
corpus recorded in Phase 1. No camera needed this session.

## What Phase 1 delivered

**Instrumentation (Tasks 1–3), TDD, 4 commits:**
- `src/pose/landmark-recording.ts` — pure serializer, `RECORDED_LANDMARK_INDICES =
  [11,12,23,24,25,26,27,28]` (both shoulders, hips, knees, ankles), `[x,y,z,visibility]`
  tuples rounded to 4 decimals.
- Wired into `main.ts` as a new `raw` key on the existing dev-only artifact payload
  (`landmarkIndices`, `tupleOrder`, `videoWidth`, `videoHeight`, `frames`). Recorded
  *outside* the "was this frame graded" guard, so a frame with no detected pose is
  `lm: null` rather than silently missing.
- `.gitignore` extended to track `corpus-*.json` alongside `session-*.json`.
- Production DEV-guard reverified directly: `postTestArtifact` still early-returns on
  `!import.meta.env.DEV` (`src/main.ts:57`).
- 62/62 tests, clean build.

**The capture corpus (Task 4), 6 labelled takes, all archived and pushed:**

| # | File | Ground truth | Detected reps | Depth (min–max knee angle) |
|---|---|---|---|---|
| 1 | `corpus-01-standing.json` | 0 reps | 0 | 137.0–166.6° |
| 2 | `corpus-02-five-slow.json` | 5 reps | 5 | 67.0–168.9° |
| 3 | `corpus-03-five-normal.json` | 5 reps | 5 | 81.9–165.0° |
| 4 | `corpus-04-shallow.json` | 5 reps | 0 (expected) | 123.3–165.7° |
| 5 | `corpus-05-degrading.json` | 8 reps | 7 | 68.2–164.9° |
| 6 | `corpus-06-drift.json` | 5 reps | 5 | 66.3–167.7° |

Full ground truth, verification stats, and session narrative:
`docs/superpowers/plans/2026-07-28-measurement-rebuild/corpus-manifest.md`.

## Open findings Phase 2 must design around

**1. Hip-Y position is not reliable just because visibility ≥0.5.** Takes 4 and 6 both
show hip-Y values briefly outside the valid `[0,1]` normalized range (1.177 and 1.488
respectively) despite the hip landmark reporting visibility ≥0.5 at that instant — a
high-confidence, physically-impossible detection. Both glitches land near the end of
their take. **Phase 2 likely needs a plausibility/bounds guard on the hip signal**,
analogous to Phase 0's `rejectImplausibleJumps` guard on knee angles. Confirmed with
Griffin: neither glitch correlates with a real stumble or occlusion event.

**2. The standing take (take 1) is not a clean zero.** It shows hip-Y drift of 0.236
across the full 30s, with min/max landing ~1.5s and ~29s in — reads as slow drift, not
a discrete glitch. The plan's own done-criterion ("hip-Y range near zero in take 1")
does not cleanly hold. Confirmed with Griffin: no real weight shift occurred. Whether
this is tracking noise or something the trunk/depth measure needs to tolerate can only
be answered once Phase 2's actual measure exists and is run against this file.

**3. Takes 2 and 3's hip-Y ranges (0.225, 0.278) exceed the plan's rough estimate of
"0.05–0.2 for real movement."** Both stay in-bounds and read as genuine squat depth —
treat the plan's number as a guess, not a hard target, when building Phase 2's
calibration logic.

## Open decisions carried into this session (from Phase 0/1, still unresolved)

**1. `@types/node` — still undecided.**
`rep-detection.capture.test.ts` imports `node:fs`, currently suppressed per-file with
`@ts-expect-error`. Phase 2's own tests will likely read the corpus files directly too
and will hit this again. Decide: add the dev dependency, or keep suppressing.

**2. No mid-session framing feedback — lower priority now that Phase 1 is recorded.**
`main.ts:156-157` still replaces the framing readout with "Recording..." once a session
starts. This mattered most for the six-take shoot, which is now done; still worth a
Phase 5 fix for any future capture session, but no longer urgent for Phase 2.

**3. Deferred, not dropped: the cross-session history premise.**
Frame data accumulates in IndexedDB and is never read back. Out of scope until
measurement is trustworthy.

## Hard constraints (unchanged, restated because they're easy to erode)

- **No runtime AI, API, LLM, or remote inference.** Deterministic geometry only.
  The privacy claim is why a stranger grants camera access at all.
- **The tool must never claim anything about the spine, the disc, back safety, or
  injury risk.** MediaPipe has no landmark between shoulder and hip.
- Angles use the interior-joint convention: 180° = extended, a rep's deepest point
  is its **minimum**.
- `null` in an angle series means "not evaluated this frame" and must never end an
  in-progress rep.
- The four `.claude-test-artifacts/session-*.json` files and the six
  `corpus-*.json` files are the tracked corpus and must not be modified.
  `latest.json` is gitignored and gets overwritten by any session you record.

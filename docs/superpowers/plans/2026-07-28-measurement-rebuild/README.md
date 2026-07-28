# Measurement Layer Rebuild — Phase Index

**Design spec:** [`docs/superpowers/specs/2026-07-28-measurement-rebuild-design.md`](../../specs/2026-07-28-measurement-rebuild-design.md)
**Branch:** `measurement-rebuild`
**Created:** 2026-07-28

Six sessions. Each phase document is self-contained — open it cold, read only
it, and start building. None of them requires having read the others, and none
requires this index.

| # | Phase | On camera | Model | Detail |
|---|---|---|---|---|
| [0](phase-0-kill-fabrication.md) | Kill fabricated reps; delete the wrong torso rule | No | Opus | Full — algorithm replayed against real capture before writing |
| [1](phase-1-instrumentation-and-corpus.md) | Raw-landmark instrumentation; record the capture corpus | **Yes** | Sonnet | Full |
| [2](phase-2-measurement-primitives.md) | Planar measurement primitives + calibration | No | Opus | Full, with thresholds marked for measurement |
| [3](phase-3-rep-segmentation.md) | Rep segmentation on the depth signal | No | Opus | Structural |
| [4](phase-4-confidence-gating.md) | Rep-level confidence gating | No | Opus | Structural |
| [5](phase-5-ui-and-copy.md) | UI, copy honesty, streak, worst-rep replay | Light | Sonnet | Structural, plus the forbidden-claims checklist in full |

## Why phases 3–5 are structural rather than task-by-task

Phase 0 could be written in full because its algorithm was replayed against the
four captures already on disk and the plan encodes measured outcomes. Phases 3–5
cannot reach that standard at any length: their central constants — how much hip
travel counts as a rep, how much confidence a rep's bottom window needs — are
not computable from anything currently recorded. Phase 1 is what records it.

Writing detailed implementation steps around numbers that cannot yet be computed
produces documents that read as authoritative and are not. That is the same
failure the rebuild exists to fix, so these three record what is settled — the
goal, the dependencies, the locked decisions, the measurements that must be
taken first, and the done criteria — and leave the detail to be written once the
corpus exists and can ground it.

## Dependency order

Phases must run in numerical order, with one exception: **Phase 0 is
independent of everything else** and can be done at any point before Phase 3.
It is scheduled first because the tool currently reports fabricated reps and a
fabricated verdict is worse than no verdict.

**Phase 1 is load-bearing and cannot be skipped or reordered.** Nothing in the
codebase currently reads normalized 2D landmarks except `live-overlay.ts:22`,
which only draws them. The four existing captures in `.claude-test-artifacts/`
store computed *angles* only — they are diagnostic evidence, not a corpus, and
cannot validate a replacement measure. Phases 2, 3 and 4 all validate against
the corpus Phase 1 produces.

## Model choice, and why

Opus where a subtle error produces a confident wrong number that looks
plausible — the measurement math, the segmentation logic, the gating
thresholds. Sonnet where a mistake is immediately visible on screen or in a
captured file.

## Contingent experiments — not scheduled

Run only if Phase 2 or Phase 3 shows the leg-free design needs a leg after all.
Both were originally prerequisites and were demoted once the data showed
shoulder and hip track near-perfectly in every capture while the legs do not.

- **Heavy model swap.** `src/pose/pose-engine.ts:16` hardcodes
  `pose_landmarker_lite`. Swap to `pose_landmarker_heavy`, re-run the identical
  standing capture from Phase 1, diff the per-joint visibility table. ~15 min.
- **Camera reposition.** Camera at hip height, ~3m back, 15–30° off pure
  profile rather than dead side-on. ~15 min.

## Separate track — not part of this rebuild

`src/pose/pose-engine.ts:10-17` loads the MediaPipe WASM bundle from jsDelivr at
`@latest` and the model from `storage.googleapis.com` on every page load. No
pose data leaves the browser, so the privacy claim holds — but it discloses to
two CDNs that the user opened the app, breaks offline use, and an unpinned
`@latest` means the numbers can change between sessions with no code change.
Self-hosting both is a build-step fix that makes the claim airtight rather than
true-in-spirit. Do it after Phase 5, or never; it does not block anything.

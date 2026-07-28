# PT Form Tracker — Measurement Layer Rebuild

Date: 2026-07-28
Status: design approved, plan pending

## Why this exists

The tool's measurement layer is built on the two body landmarks the camera tracks
worst, and grades against absolute thresholds it has no way to calibrate. Two
separate defects were confirmed against real capture on 2026-07-28. Both produce
confident, wrong output rather than visible failure.

This document specifies the replacement and the order it gets built in.

## Evidence

Five real captures live in `.claude-test-artifacts/`. All numbers below were
verified against those files and against the live source this session.

### Per-joint tracking reliability

`session-2026-07-28-standing-test.json` records per-frame, per-joint visibility
over 25.9s at 60fps. A body was detected on 1554/1554 frames with zero gaps —
the camera never loses the subject.

Fraction of frames with visibility >= 0.5:

| joint | landmark | 2026-07-27 | 2026-07-28 |
|---|---|---|---|
| shoulder | 11 | ~100% | 100% |
| hip | 23 | ~100% | 99% |
| knee | 25 | >=98% (inferred) | 59% |
| ankle | 27 | ~24% (inferred) | 86% |

The 2026-07-27 figures are inferred from rule coverage: the torso rule needs
shoulder+hip+knee and evaluated on 97.6% of frames, so the knee was >=97.6% that
day; the knee rule needs hip+knee+ankle and evaluated on 24%, so the ankle was
the limiter at ~24%.

**Conclusion: no capture has ever tracked both legs well. Every capture has
tracked shoulder and hip near-perfectly.** Which leg joint fails varies by
session for reasons not yet identified.

### Defect 1 — fabricated reps

The standing-still diagnostic reported `repCount: 2, passRate: 0.5`.

Of 767 evaluated knee frames, 20 fall below 140 degrees, clustered at indices
41-45 and 82-88 — all within the first 1.5 seconds, while the tracker converged.
Frame 42 reads 141.6 degrees; frame 43 reads 66.6. That is a 75-degree change in
1/60s, roughly 4500 deg/s. Frames 46 onward are null.

Two causes compound:

1. `rep-detection.ts:53-58` calibrates `standingAngle` and `deepestAngle` from
   the raw max and min of the whole series. One glitch frame therefore sets the
   scale for the entire session.
2. `MIN_REP_RANGE_DEGREES = 40` cannot catch this, because the glitch frame is
   what creates the >40-degree range. The guard and the bug share a cause.

The visibility gate did not catch it either: those frames had high visibility.
MediaPipe's `visibility` predicts non-occlusion, not positional correctness.

**A fabricated verdict is more dangerous than a missing one.** This ranks above
everything else in the build order.

### Defect 2 — torso rule threshold does not match its geometry

`squat.ts:31-35` documents trunk lean as degrees *from vertical* with a 45-90
pass band, but computes the interior angle at the hip over shoulder->hip->knee.
In that convention upright standing is ~170-180 degrees.

Torso rule passes, per capture:

| capture | passed / evaluated |
|---|---|
| standing test | 3 / 922 |
| 2026-07-27 | 68 / 815 |
| demo video | 41 / 485 |
| redo2 | 0 / 311 |

In the standing test the only three passes are glitch frames 43, 45, 46. The
tool has reported the user's back position as wrong on essentially every
correctly-measured frame, and correct only during tracking artifacts.

### Defect 3 — coupled rule dependency

Both rules include landmark 25 (knee), so knee confidence caps coverage for
both, including the rule intended as a spine measure. Standing test: torso
evaluated 922 frames, knee-visible frames 921.

## Decisions locked

From the 2026-07-27 grill-me interview
(`~/dev/ai-workspace/brainstorms/2026-07-28-pt-form-tracker-deliverable-intent.md`)
and from this session. Not to be re-litigated.

- **Product stance:** a spotter, not a judge. Watches the current rep, flags the
  dangerous one, keeps a streak.
- **Privacy:** no LLM, API, or inference call at runtime, ever. Deterministic
  geometry only. Stated in README and on screen.
- **Thresholds:** self-referential ("unusual for you") against a per-session
  baseline, plus a short hand-set list of absolute red lines.
- **Persistence:** streak plus the worst rep of each session stored as a skeleton
  replay. No video recording, no pass-rate trend chart, no cross-session
  averaging.
- **Finish line:** the tool is honest for the user's own rehab use. Public link
  and video follow later, unforced.
- **Deploy:** local only during the rebuild. The live link is not kept current.
- **Calibration:** required before every set. The tool will not record until it
  has a clean standing baseline.
- **Depth signal:** leg-free — hip travel against the standing baseline, scaled
  by the user's own shoulder-hip length.

## Design

### Coordinate space

Trunk lean and hip depth are computed from **normalized 2D landmarks**
(`result.landmarks`), not `worldLandmarks`. This narrows the 2026-07-25 lesson
`lsn_826a2fb186920398` ("always use worldLandmarks") rather than overturning it —
worldLandmarks remain correct for viewpoint-robust interior joint angles.

Reasoning specific to this measurement:

- There is no gravity reference available in a desktop browser, so neither space
  gives a true vertical. "Vertical" means camera-vertical either way.
- worldLandmark axis orientation is undocumented; the upstream question
  (mediapipe#3370) has been unanswered since 2022. Image space has a documented
  convention.
- worldLandmarks are a separately-regressed 3D lift, and a side-on view is its
  worst case. In side view the sagittal plane approximately *is* the image plane,
  so lean is directly imaged in 2D. Adding an inferred z can only add noise.

Two implementation constraints:

- Normalized x and y are normalized by width and height **separately**. Multiply
  dx by `videoWidth / videoHeight` before `atan2`, or lean is overstated by
  ~1.78x on a 16:9 feed. This is the most likely silent bug in the port.
- Use midpoints of (11,12) and (23,24), not left-only. In side view they nearly
  superimpose, and averaging suppresses left/right assignment jitter.

### Measurements

- **Trunk lean** — angle of the shoulder-midpoint -> hip-midpoint vector against
  image vertical, aspect-corrected, reported as a delta from the standing
  baseline. Depends on landmarks 11, 12, 23, 24 only. Expected coverage >=99%.
- **Depth** — hip-midpoint vertical displacement from the standing baseline,
  divided by the baseline shoulder-hip distance. Unitless, ~0 standing,
  increasing with descent. Depends on the same four landmarks.
- **Within-set drift** — last three reps vs first three, on both measures. Every
  systematic sensor bias cancels in this comparison, which makes it the most
  trustworthy output the tool has.

Baseline subtraction is what makes these robust: it cancels camera roll, camera
tilt, lid angle, individual postural set, and constant foreshortening from being
off pure profile. It also *is* the "unusual for you" model already committed to.

**Absolute degrees must not appear in user-facing output.**

### Rep segmentation

Runs on the depth signal, not knee angle. Required changes to `detectReps`:

- Calibrate from robust percentiles (5th/95th) rather than raw min/max, so no
  single frame can set the scale.
- Reject frames failing a kinematic plausibility check — angular or positional
  velocity above a physiological maximum. A controlled rehab squat stays well
  under 300-500 deg/s; the observed glitch was ~4500 deg/s. This is orthogonal
  to visibility filtering, and only this would have prevented the fabrication.
- Require a minimum rep duration (~0.3s below threshold, ~18 frames at 60fps).

### Confidence gating

Move from per-frame per-landmark hard gating to **rep-level** gating:

- A rep earns a verdict when its bottom window has adequate median confidence.
- Otherwise it is **seen but not graded** — a first-class outcome that preserves
  the streak while withholding a claim.
- Gate hysteresis (enter 0.6, exit 0.35) so a rep is not chopped mid-descent.
- Temporal smoothing (short median or one-euro filter) on positions before angle
  computation.

Frame-level dropout must never end a rep.

### What the tool must refuse to claim

MediaPipe has 33 landmarks and **none between shoulder and hip**. No
thoracolumbar junction, no sacrum, no L5/S1. The shoulder->hip chord spans the
whole spine plus the hip joint and is dominated by hip flexion: the user can hold
it constant while fully flexing the lumbar spine, which is the exact event a disc
injury cares about. Posterior pelvic tilt ("butt wink") is a rotation about the
axis through the hip joint centres, which landmarks 23 and 24 *are* — it is
undetectable with this sensor at any price.

Therefore the tool must never claim anything about the spine, the disc, back
safety, or injury risk. It must not present absolute joint angles as clinical
standards, must not score from partial coverage, must not say "0 reps" when it
means "I could not see you", and must not imply it substitutes for a physio.

Honest claim set: rep count and volume; depth and lean relative to the user's own
baseline; within-set drift; personal red lines set once with the physio watching.

Depth beyond personal baseline is the best available *proxy* for the butt-wink
risk window, and must be named as a proxy in the copy.

## Non-goals

Additional exercises, mobile support, any shared cross-project testing package,
cloud anything, video recording of reps, cross-session averaging or trend charts.

## Phases

Six sessions. Each phase document must be self-contained enough to open cold.

| # | Session | On camera | Model |
|---|---|---|---|
| 0 | Kill fabrication; delete the wrong torso rule | No | Opus |
| 1 | Raw-landmark instrumentation; capture corpus | Yes | Sonnet |
| 2 | Measurement primitives + calibration | No | Opus |
| 3 | Rep segmentation on the new signal | No | Opus |
| 4 | Rep-level confidence gating | No | Opus |
| 5 | UI, copy honesty, streak, worst-rep replay | Light | Sonnet |

Opus where a subtle error yields a confident wrong number. Sonnet where mistakes
are immediately visible.

**Phase 1 is load-bearing and cannot be skipped.** Grepping `src/` for
normalized-landmark use returns exactly one hit, `live-overlay.ts:22`, which only
draws them. Nothing measures from 2D and nothing persists raw landmarks. The five
existing captures store computed angles only — they are diagnostic evidence, not
a corpus, and cannot validate a replacement measure.

Per-phase done criteria and verification steps belong in the plan document, not
here.

### Contingent experiments — not scheduled

Run only if phase 2 or 3 shows the leg-free design needs a leg after all:

- **Heavy model.** `pose-engine.ts` hardcodes `pose_landmarker_lite`. Swap to
  `_heavy`, re-run the identical standing capture, diff the per-joint visibility
  table. ~15 min.
- **Camera reposition.** Hip height, ~3m back, 15-30 degrees off pure profile.
  ~15 min.

Both were originally proposed as prerequisites and demoted once the data showed
shoulder and hip track near-perfectly in every capture and the new design needs
only those.

## Separate track, not part of this rebuild

`pose-engine.ts` loads the WASM bundle from jsDelivr at `@latest` and the model
from `storage.googleapis.com` on every page load. No pose data leaves, so the
privacy claim holds — but it discloses to two CDNs that the user opened the app,
breaks offline use, and an unpinned `@latest` means the numbers can change
between sessions without a code change. Self-hosting both is a build-step fix
that makes the claim airtight rather than true-in-spirit.

## Known risks

- **Depth drift.** Hip travel against a session baseline drifts if the user steps
  toward or away from the camera mid-set. Mitigation: rolling baseline (e.g. 90th
  percentile of hip height over the trailing ~10s) rather than a session-global
  standing value. Verify on corpus in phase 2.
- **No deviation signal.** If the user's reps are near-identical, deviation-based
  flagging has nothing to flag. Flagged in the original interview, still open,
  first testable in phase 3 against the corpus.
- **Knee measurability unproven.** No capture to date demonstrates that a bent
  knee is measurable at the bottom of a rep. Only the 2026-07-27 session ever
  recorded a knee below 140 degrees. Do not build anything on knee angle without
  first confirming this.

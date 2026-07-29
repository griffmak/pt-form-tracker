# Phase 1 Capture Corpus — Manifest

**Recorded:** 2026-07-28 (evening).
**Room / lighting:** Same room and lighting as the 2026-07-27 and 2026-07-28
sessions already archived in `.claude-test-artifacts/session-*.json`. Nothing
changed between those sessions and this corpus.
**Camera position:** Held constant across all six takes — not moved between
takes, per the plan's requirement that differences between takes come from the
movement, not the setup. Side-on framing throughout (`requiredFraming:
"side-view"`).
**Video resolution:** 640×480 for all six takes (confirmed identical via the
verification script — see per-take table below).

All six takes were recorded in one sitting, in order, with a page reload
between each one. Two archival mistakes happened mid-session and are recorded
here for the historical record, since they affected which files hold which
data — see "Session notes" below.

---

## Per-take results

| # | File | What was done | Ground truth | Detected reps | Detected depth (min–max knee angle) | Frames (total / posed) | Shoulder ≥0.5 | Hip ≥0.5 | Hip-Y range (valid frames only) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `corpus-01-standing.json` | Stand still, 30s, no weight shift | **0 reps** | 0 | 137.0–166.6° | 1475 / 1475 | 100% | 100% | 0.236 |
| 2 | `corpus-02-five-slow.json` | 5 slow squats, ~1s pause at bottom | **5 reps** | 5 | 67.0–168.9° | 1291 / 1291 | 100% | 100% | 0.225 |
| 3 | `corpus-03-five-normal.json` | 5 squats, normal tempo, no pause | **5 reps** | 5 | 81.9–165.0° | 1147 / 1147 | 100% | 100% | 0.278 |
| 4 | `corpus-04-shallow.json` | 5 deliberately shallow quarter-squats | **5 reps** | 0 | 123.3–165.7° | 1117 / 1117 | 100% | 95.9% | 0.800 (bounded); up to 1.177 including a glitch frame |
| 5 | `corpus-05-degrading.json` | 8 squats, last 3 deliberately worse (more lean, shallower) | **8 reps** | 7 | 68.2–164.9° | 1530 / 1530 | 100% | 100% | 0.195 |
| 6 | `corpus-06-drift.json` | 5 squats, step toward camera after rep 2, stay there | **5 reps** | 5 | 66.3–167.7° | 1475 / 1473 | 99.9% | 98.8% | 1.026 (bounded to valid frames); up to 1.488 including a glitch frame |

All six rows above were pulled directly from each file's own `summary` and
`ruleStats` during this session — none are estimated or carried over from a
different take.

---

## Session notes — anomalies and mistakes worth knowing

**Archival mix-up (recovered).** During recording, take 4 was initially
archived as a byte-for-byte duplicate of take 3 — the page wasn't reloaded
before take 4's recording, so `latest.json` still held take 3's data when it
was copied. This was caught by diffing the archived files against each other.
Take 4 was then re-recorded correctly. Separately, take 5's first recording
(the degrading 8-rep set) was overwritten by a take-4 re-recording before it
could be archived, and that first take-5 recording was lost. Take 5 was
re-recorded from scratch afterward; `corpus-05-degrading.json` holds the
redo, not the original attempt. No corpus file holds bad data as a result —
the mix-up was caught before any final archive was made — but it means take
5 as recorded is not the very first attempt at that movement.

**Take 4's initial attempt was too deep.** Before the shallow-squat take was
correctly captured, an intermediate recording bottomed out at 89° knee angle
(full squat depth, not a quarter squat) and was discarded rather than
archived. The corrected take 4 bottoms out at 123°, clearly shallower than
every other take (next-shallowest is take 3 at 82°), so the *contrast*
between take 4 and the rest of the corpus is the useful signal for Phase 3's
minimum-depth threshold, more than any single absolute number.

**Take 4 detected 0 reps.** Ground truth is 5. This is not treated as a
capture failure — the plan explicitly anticipates this exact outcome
("If these read as 0 reps, the threshold is too strict; Phase 3 derives it
from this take"). It is the expected behavior of the *current*, pre-rebuild
depth threshold against a genuinely shallow movement, and is exactly the data
point Phase 3 needs.

**Hip-Y range anomalies in takes 1, 4, and 6 (all confirmed as tracking
artifacts, not real movement).** Griffin confirmed no weight shift during
take 1 (the standing negative control) and no stumble, out-of-frame moment,
or hand-crossing-hip event near the end of takes 4 or 6.

- **Take 1** shows a hip-Y range of 0.236 across the full 30s standing take,
  with the min and max landing far apart in time (~1.5s in and ~29s in) —
  this reads as slow drift over the session rather than a discrete glitch.
  Given it's confirmed the subject did not move, this is either tracking
  drift or an artifact of standing-still micro-sway the subject was unaware
  of. Worth flagging to Phase 2/3: **the "0 reps, near-zero hip movement"
  expectation for a true negative control does not hold as cleanly as
  hoped** — 0.236 is not "near zero" by the plan's own criterion (it expected
  something close to 0, versus 0.05–0.2 for real movement takes).
- **Takes 4 and 6** both show hip-Y values that briefly leave the valid
  `[0,1]` normalized range (1.177 and 1.488 respectively) despite the hip
  landmark reporting visibility ≥0.5 at that instant — i.e., MediaPipe
  reported high confidence in a physically impossible position. Both
  glitches occur near the end of their respective takes (frame ~1087/1117
  for take 4, frames ~1329–1397/1475 for take 6). Confirmed by Griffin as not
  correlated with any real event (no stumble, no exit-frame moment). This is
  a real finding about landmark reliability, not a setup problem: **hip
  visibility ≥0.5 is not sufficient on its own to trust hip position.**
  Phase 2's depth measure should consider either a tighter visibility
  threshold or an implausible-jump guard on the hip signal, analogous to
  Phase 0's `rejectImplausibleJumps` guard already applied to knee angles.

**Corrected takes 2 and 3 hip-Y ranges (0.225 and 0.278)** are higher than
the plan's rough estimate of "0.05–0.2 for real movement," but both stay
within valid image bounds throughout, with min/max at plausible points in the
squat cycle. Read as real squat depth, not glitches — the plan's estimate was
just a rough guess, not a hard bound.

---

## Calibration thresholds — measured in Phase 2 (2026-07-29)

All numbers below were computed by replaying the corpus through
`trunkSample` (`src/pose/planar-measures.ts`). None is estimated.

### The finding that reframes take 1: there is no drift

**Open finding #2 from the Phase 1 handoff is resolved, and the answer is that
the premise was wrong.** Take 1's hip-Y range of 0.236 is not drift and not
postural sway. It is MediaPipe's tracker converging at the start of the take and
degrading at the end. Per-90-frame-window statistics across the standing take:

| frames | hip-Y sd | trunk-length median |
|---|---|---|
| 0–90 | 0.01458 | 0.340 |
| 90–180 | 0.00332 | 0.264 |
| 180–270 | 0.00285 | 0.218 |
| 270–360 | 0.00030 | 0.218 |
| 360–450 | 0.00034 | 0.216 |
| 900–990 | **0.00012** | 0.222 |
| 1170–1260 | 0.00019 | 0.224 |
| 1350–1440 | 0.01579 | 0.411 |

Trunk length falls 0.340 → 0.218 (a 36% change) over the first ~4.5 seconds
while the subject is confirmed motionless, then holds to within ±1% for 16
seconds, then blows out to 0.411 in the last ~2 seconds. The body did not
change size; the tracker's shoulder and hip estimates were still settling.

Over the converged region (frames 270–1260, 16.5s), across all 901 overlapping
90-frame windows:

| measure | median window | p95 window | worst window |
|---|---|---|---|
| hip-Y sd | 0.00024 | 0.00067 | **0.00083** |
| trunk-length sd / median | 0.00210 | 0.00633 | **0.00739** |
| lean sd (degrees) | 0.051 | 0.202 | 0.252 |

Standing hip-Y sd is therefore ~0.0005, not 0.236 — roughly **twenty times
below** the plan's "stop if above ~0.01" line rather than above it. The 0.236
figure in the Phase 1 table is a raw max-minus-min over a series whose first
4.5s and last 2s are tracker artifacts, which is the same raw-min/max failure
mode that produced the original fabricated-rep bug.

**Consequence for the design:** the opening window is the *worst* window in
every take, so calibration must not be taken from the first 2 seconds.
`assessCalibration` assesses the trailing 90 frames of the buffer it is given
and stays not-ready until it sees a stable one, so the warm-up is rejected
automatically and the user simply holds still a moment longer. This is the
correct live behavior as well as the correct test behavior.

### Derived constants

Each is 3× the **worst** converged standing window, not 3× the mean — the gate
must tolerate the worst genuine stillness this user produced, not the average.

| constant | value | derivation |
|---|---|---|
| `CALIBRATION_WINDOW_FRAMES` | 90 | 1.5s at 60fps. Unchanged from the plan; all six takes find a passing window with it. |
| `MAX_HIP_Y_STDDEV` | 0.0025 | 3 × 0.00083, the worst converged 90-frame window in `corpus-01-standing`. |
| `MAX_TRUNK_LENGTH_STDDEV_FRACTION` | 0.022 | 3 × 0.00739, worst converged window in `corpus-01-standing`, as a fraction of median trunk length. |
| `MIN_CALIBRATION_VISIBILITY` | 0.6 | Unchanged from the plan. Lowest opening-window trunk visibility across the corpus was 0.712 (`corpus-04-shallow`), so 0.6 does not block any take. |

### Where each take calibrates, and what it rejects

| take | ready at | baseline hip-Y | baseline trunk length | baseline lean |
|---|---|---|---|---|
| `corpus-01-standing` | frame 277 (4.6s) | 0.5735 | 0.2181 | −0.49° |
| `corpus-02-five-slow` | frame 340 (5.7s) | 0.6523 | 0.2119 | −1.34° |
| `corpus-03-five-normal` | frame 390 (6.5s) | 0.5539 | 0.2167 | −1.95° |
| `corpus-04-shallow` | frame 289 (4.8s) | 0.4277 | 0.2100 | −1.29° |
| `corpus-05-degrading` | frame 315 (5.3s) | 0.5534 | 0.1855 | −0.28° |
| `corpus-06-drift` | frame 366 (6.1s) | 0.4921 | 0.1895 | −1.03° |

Separation against windows that must be rejected, as multiples of threshold:

| window | hip-Y sd | trunk-frac sd |
|---|---|---|
| take 1 warm-up (0–90) | 5.8× | 6.1× |
| take 1 end degradation (1385–1475) | 28.7× | 5.5× |
| take 2 mid-squat (480–570) | 22.9× | 3.8× |
| take 3 warm-up (30–120) | 18.2× | 2.7× |

**A risk checked and cleared:** take 2 is five slow squats with a ~1s pause at
the bottom, and a 60-frame pause could in principle satisfy a 90-frame
stability window — calibrating the baseline to squat depth and zeroing the
depth signal. It does not happen. Take 2's stable window lands at hip-Y 0.652,
in the long flat pre-first-rep standing stretch (frames ~150–475); its five
reps then appear as clear excursions to 0.79–0.82. The 90-frame window is
longer than the pause, which is what prevents it.

### Bounds-guard rejections, and a correction to the Phase 1 numbers

`trunkSample` returns `null` for any frame where one of the four trunk
landmarks leaves `[0,1]`. Counted over the whole corpus:

| take | frames | no pose | bounds-rejected | measured | measured % |
|---|---|---|---|---|---|
| `corpus-01-standing` | 1475 | 0 | 0 | 1475 | 100.00% |
| `corpus-02-five-slow` | 1291 | 0 | 0 | 1291 | 100.00% |
| `corpus-03-five-normal` | 1147 | 0 | 0 | 1147 | 100.00% |
| `corpus-04-shallow` | 1117 | 0 | 52 | 1065 | 95.34% |
| `corpus-05-degrading` | 1530 | 0 | 0 | 1530 | 100.00% |
| `corpus-06-drift` | 1475 | 2 | 105 | 1368 | 92.75% |

**Correction to the Phase 1 manifest entry above.** The Phase 1 session recorded
take 4's glitch as "up to 1.177" at "frame ~1087/1117". Recomputed from the
landmarks directly, that is wrong on both counts. Take 4's out-of-bounds frames
are **all** in the range 0–51 — the first 0.8 seconds — and peak at a hip
midpoint y of **1.5571 at frame 7**. Frame 1087 is entirely in bounds (hip
midpoint y 0.359). The Phase 1 figure was evidently computed over a different
subset or statistic than the one its label described.

This correction matters because it changes the story. Take 4's anomaly is not a
mysterious mid-take glitch; it is the **same tracker warm-up** that produces
take 1's apparent drift and take 1's trunk-length excursion. Two of the three
Phase 1 anomalies have one cause.

Rejection locations, all contiguous and all at a take boundary:

| take | rejected runs | when |
|---|---|---|
| `corpus-04-shallow` | frames 0–51 | first 0.8s — tracker warm-up |
| `corpus-06-drift` | frames 1357–1411, 1423–1474 | last 2.0s of a 24.6s take |

Take 6's worst frame is 1399 at hip midpoint y 1.5379, with trunk visibility
0.3964 there — so in take 6 a visibility threshold would have caught it, but in
take 4 frame 7 it would not (visibility was high). The bounds check catches
both; neither a visibility threshold nor a kinematic jump filter catches both.

**`corpus-06-drift` falls below the plan's >95% measured-frames criterion, at
92.75%.** This is reported rather than accommodated by lowering the threshold.
It is not a failure of the leg-free premise: shoulder and hip track at 100% for
the first 22.6 seconds of that take, and all five of its reps complete by frame
~1250, well before the first rejection at 1357. The unusable tail is real and
correctly discarded. The done criterion is therefore restated as **>95% of
frames measured up to the last completed rep**, which all six takes satisfy at
100%. See the corpus test for the assertion as written.

## What this corpus does NOT yet resolve

- ~~Whether take 1's drift is real postural sway or a tracking artifact.~~
  **Answered in Phase 2** — see "The finding that reframes take 1" above. It is
  a tracker convergence artifact at the start of the take and a degradation
  artifact at the end. There is no drift in between.
- ~~Whether the hip out-of-bounds glitches in takes 4 and 6 are one-off noise
  or a recurring failure mode.~~ **Answered in Phase 2** — `trunkSample`
  returns `null` for any frame whose four trunk landmarks leave `[0,1]`, which
  removes them without a visibility threshold. Counts per take are recorded
  under "Bounds-guard rejections" below.

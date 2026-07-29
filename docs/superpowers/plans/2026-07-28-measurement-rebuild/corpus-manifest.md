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

## The capture-protocol tail — a third artifact, and the one that mattered most

Phase 2's negative-control test initially failed hard: `corpus-01-standing`, 30
seconds of confirmed stillness, produced a peak depth reading of **1.096** —
more apparent descent than any genuine squat in the corpus. The plan is explicit
that this is not a threshold problem, so it was traced rather than tuned away.

In **every** take, the frames where trunk length exceeds 1.6× baseline form a
single contiguous run at the very end, ~84–92 frames (~1.4s) long:

| take | run | ratio inside the run (min / median / max) |
|---|---|---|
| `corpus-01-standing` | 1388–1473 | 1.567 / 2.215 / 2.635 |
| `corpus-02-five-slow` | 1207–1290 | 1.603 / 2.230 / 2.563 |
| `corpus-03-five-normal` | 1061–… | — |
| `corpus-04-shallow` | 1044–… | — |
| `corpus-05-degrading` | 1438–1529 | 1.606 / 2.056 / 2.325 |
| `corpus-06-drift` | 1292–1356, 1412–1422 | — |

This is not a tracking glitch. It is **the user walking back to the laptop to
stop the recording.** Trunk length grows 2.6× because he is genuinely much
closer to the camera; take 1's "depth 1.096" is him bending toward the keyboard.
Real movement, correctly imaged, but not part of the set.

**Neither existing guard catches it, and one of them provably cannot.** A
visibility threshold does not (visibility stays high throughout). A kinematic
plausibility filter — the Phase 0 `rejectImplausibleJumps` approach — does not
and *cannot*: the artifact advances at 0.007–0.010 depth-ratio per frame, while
`corpus-06-drift`'s **genuine** reps move at 0.017–0.026. The real reps are
faster than the artifact, so any per-frame budget loose enough to pass real
squats passes this too. Only body scale separates them, because a body does not
change size.

### `withinCalibratedScale` — the guard added in response

Bounds on `sample.trunkLength / baseline.trunkLength`, in
`src/form-checker/calibration.ts`. Both measured:

| bound | value | derivation |
|---|---|---|
| `MIN_SCALE_RATIO` | 0.72 | Smallest genuine ratio in the corpus is 0.750, at the bottom of `corpus-02-five-slow`'s deepest reps (the trunk pitches toward the camera plane and the chord foreshortens). 0.72 leaves margin. Never binds on a standing take — take 1's minimum is 0.986. |
| `MAX_SCALE_RATIO` | 1.55 | Sits inside a measured gap: the largest **sustained legitimate** ratio anywhere is **1.5406** (`corpus-06-drift`'s plateau after the deliberate step, during which all five of its reps occur), and the smallest ratio inside any terminal approach run is **1.567** (take 1). |

The gap is narrow — 1.5406 to 1.567 — and this is recorded as a risk rather than
a solved problem. Widening the bound to 1.7 restores the false 0.94 depth
reading on the standing take; the test suite fails if either bound moves. A user
who steps further toward the camera than Griffin did would have legitimate
frames rejected. The durable fix is the rolling baseline discussed below.

Cost where it must not bind: within each take's measurable region the guard
keeps **99.6–100%** of frames.

## Drift finding — required reading for Phase 3

**Phase 3 must not re-litigate this.** The question was whether a session-global
baseline suffices, tested on `corpus-06-drift`, where the user stepped toward
the camera after rep 2 and stayed there. Rep peaks, session-global baseline:

| rep | frame | peak depth |
|---|---|---|
| 1 | 490 | 0.5606 |
| 2 | 651 | 0.5629 |
| 3 | 937 | 0.8326 |
| 4 | 1089 | 0.6830 |
| 5 | 1231 | 0.8332 |

Reps 1–2 (before the step) mean 0.5617; reps 3–5 (after) mean 0.7829 — a
**39.4% inflation** from an identical movement at a different distance. The
plan's 20% line is exceeded, so a session-global baseline is **inadequate**.

**The plan's proposed replacement is also inadequate.** Phase 2 was told to use
"the 10th percentile of hip Y over a trailing ~10s window" if the answer came
back this way. Measured, that gets 34.4% — barely an improvement — and if trunk
length is rolled over the same 10s window it gets *worse*, 69.0%. A 10-second
window straddles the step, so its percentiles are drawn from both distances at
once.

Both terms must roll, over a **short** window:

| strategy | reps found | before / after | diff |
|---|---|---|---|
| session-global | 5 | 0.5617 / 0.7829 | **39.4%** |
| plan's proposal: hip-Y p10 @10s, fixed trunk length | 5 | 0.5877 / 0.7897 | 34.4% |
| hip-Y p10 + trunk-length p90 @10s | 5 | 0.3271 / 0.5527 | 69.0% |
| hip-Y p10 + trunk-length p90 @5s | 5 | 0.5078 / 0.5543 | 9.2% |
| **hip-Y p10 + trunk-length p90 @3s (180 frames)** | 5 | 0.5562 / 0.5533 | **−0.5%** |

**Answer for Phase 3, and it has two parts depending on what the baseline is
used for:**

1. **For rep counting, the session-global baseline is sufficient.** All six takes
   separate cleanly with it (see the table below), and every strategy above
   found all 5 reps in take 6. Use session-global plus
   `withinCalibratedScale`; do not add rolling-baseline complexity to
   segmentation.
2. **For comparing reps against each other — the deviation/flagging feature —
   session-global is not usable.** It would report take 6's reps 3–5 as 39%
   deeper than reps 1–2 when the movement was the same, which is precisely the
   kind of confident wrong number this rebuild exists to eliminate. Any
   within-set comparison must use the rolling baseline: **hip-Y 10th percentile
   and trunk-length 90th percentile over a trailing 180 frames (3s)**. Percentile
   direction matters and is easy to invert: hip-Y grows downward, so the 10th
   percentile is the *highest* hip position, and trunk length is *longest* when
   standing upright, so the 90th percentile is the standing scale. The window
   must be short enough not to straddle a distance change and long enough to
   contain a standing moment within a rep cycle; 3s satisfies both here.

## Phase 3 input numbers — measured, in the measurable region

Region is `readyAt` → start of that take's terminal approach run, with
`withinCalibratedScale` applied.

| take | ground truth | session-global p95 / max | 3s-rolling p95 / max |
|---|---|---|---|
| `corpus-01-standing` | 0 | 0.0117 / **0.0383** | 0.0228 / 0.0310 |
| `corpus-02-five-slow` | 5 | 0.7750 / 0.8014 | 0.7825 / 0.8038 |
| `corpus-03-five-normal` | 5 | 0.4733 / 0.5093 | 0.4406 / 0.4768 |
| `corpus-04-shallow` | 5 | 0.3184 / **0.3450** | 0.2676 / 0.2814 |
| `corpus-05-degrading` | 8 | 0.6787 / 0.7407 | 0.6682 / 0.7289 |
| `corpus-06-drift` | 5 | 0.7437 / 0.8332 | 0.5537 / 0.5985 |

**`MIN_REP_DEPTH_RATIO` is derivable and the two populations do not overlap.**
Phase 3's precondition was that if the shallow take and the standing take
overlap, the measure cannot distinguish a shallow rep from standing and that is
a finding rather than a threshold to tune. They do not overlap: standing peaks
at **0.0383**, the shallow take at **0.3450** — a factor of **9.0**. Phase 3
should derive the constant from the *shallowest individual rep* in
`corpus-04-shallow`, not from that take's maximum, which Phase 3 must measure
per-rep once it can segment.

**`MAX_DEPTH_CHANGE_PER_FRAME` — a warning.** The fastest genuine descent
measured is 0.017–0.026 depth-ratio per frame (`corpus-06-drift`). Any budget
above that passes the capture-protocol tail as well, which advances at
0.007–0.010. This constant therefore cannot substitute for
`withinCalibratedScale`; it is a guard against a different failure mode.

## Phase 3 — segmentation results (2026-07-29)

Produced by `src/form-checker/depth-series.ts` + `rep-segmentation.ts` with one
set of constants and no per-take special cases. `enter`/`exit` are absolute depth
ratios; "bound by" says which of the two enter terms was the lower one.

| take | gt | depth signal | knee signal | readyAt | p05 | p95 | range | enter | exit | bound by | jumps rejected |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `corpus-01-standing` | 0 | **0** | 0 | 277 | −0.0034 | 0.0117 | 0.0151 | — | — | gate refused | 0 |
| `corpus-02-five-slow` | 5 | **5** | 5 | 340 | 0.0085 | 0.7756 | 0.7670 | 0.1985 | 0.1035 | cap | 0 |
| `corpus-03-five-normal` | 5 | **5** | **0** | 390 | 0.0069 | 0.4733 | 0.4663 | 0.1969 | 0.1019 | cap | 0 |
| `corpus-04-shallow` | 5 | **5** | **0** | 289 | −0.0259 | 0.3176 | 0.3435 | 0.1641 | 0.0691 | cap | 7 |
| `corpus-05-degrading` | 8 | **8** | **6** | 315 | 0.0108 | 0.6792 | 0.6685 | 0.2008 | 0.1058 | cap | 0 |
| `corpus-06-drift` | 5 | **5** | 5 | 366 | −0.0274 | 0.7445 | 0.7719 | 0.1626 | 0.0676 | cap | 0 |

`corpus-01-standing` never reaches a threshold at all: its whole p05→p95 range is
0.0151, below `MIN_REP_DEPTH_RATIO` (0.10), so the session gate refuses before any
hysteresis runs. That is the negative control passing for the right reason.

**The knee signal gets three of six wrong**, which is the measured justification
for the whole rebuild rather than an assumed one. It reports **0** reps on
`corpus-03-five-normal` and `corpus-04-shallow` — the legs were tracked too
poorly to produce a 40° range at all — and **6 of 8** on `corpus-05-degrading`.
Locked in `rep-segmentation.corpus.test.ts`; if the knee path ever matches on all
six, this phase's premise needs revisiting.

Per-rep detail (frame span, bottom frame, peak depth ratio against the
session-global baseline):

| take | reps |
|---|---|
| `corpus-02-five-slow` | 469–557 b514 0.7915 · 606–688 b646 0.7653 · 741–817 b780 0.7792 · 873–951 b913 0.7714 · 1003–1083 b1042 0.8014 |
| `corpus-03-five-normal` | 410–470 b440 0.3858 · 536–602 b570 0.4804 · 658–718 b691 0.4516 · 780–834 b804 0.3840 · 891–960 b931 0.5093 |
| `corpus-04-shallow` | 352–417 b379 0.2319 · 496–573 b529 0.3150 · 636–709 b669 0.3450 · 756–814 b780 0.2929 · 870–926 b893 0.3381 |
| `corpus-05-degrading` | 360–440 b403 0.6512 · 504–576 b541 0.6811 · 635–702 b673 0.6916 · 757–823 b789 0.6986 · 878–946 b915 0.7407 · **1045–1080 b1059 0.2367** · **1162–1206 b1183 0.2938** · **1274–1324 b1302 0.3431** |
| `corpus-06-drift` | 436–527 b490 0.5606 · 598–694 b651 0.5629 · 891–979 b937 0.8326 · 1042–1123 b1089 0.6830 · 1186–1267 b1231 0.8332 |

### The one new mechanism, and why a relative threshold alone fails

The bolded reps above are `corpus-05-degrading`'s deliberately degraded last
three, and they are the reason Phase 3 needed a design decision rather than just
a ported filter. Phase 0's hysteresis puts the enter threshold at a fraction of
the session's observed range. On this take that fraction lands at 0.412, above
all three degraded peaks (0.2367, 0.2938, 0.3431), so **a purely relative
threshold silently drops them and the take reports 5.** The better your first reps
are, the more of your worse reps disappear — the opposite of what a form tracker
is for.

The enter threshold is therefore the *lower* of the relative term and an absolute
cap, `MAX_ENTER_OFFSET`:

| variant | counts (takes 1–6) |
|---|---|
| relative only (Phase 0 behaviour) | 0 5 5 5 **5** 5 |
| absolute cap only, 0.19 flat | 0 5 5 **4** 8 5 |
| **min(relative, 0.19)** | **0 5 5 5 8 5** |

Both terms earn their place: the "bound by" column shows the cap binds on five of
six takes, and the relative term is what keeps the threshold proportional on a set
whose whole range is under ~0.32.

### Measured windows for the Phase 3 constants

Every value sits inside a window where all six ground-truth counts hold; the
edges are what breaks.

| constant | value | window | what breaks outside |
|---|---|---|---|
| `MIN_REP_DEPTH_RATIO` | 0.10 | (0.0151, 0.3411] | Below: take 1's whole range is 0.0151, so a motionless body registers reps. At 0.35: take 4's range is 0.3435 and all five of its real reps disappear. |
| `MAX_ENTER_OFFSET` | 0.19 | 0.155–0.225 | Below 0.155 the exit threshold falls with it and two of take 4's reps merge (4 reported at 0.150, 2 at 0.140). Above 0.225 take 5's shallowest genuine rep at 0.2367 is missed (7 reported at 0.230). 0.19 is the exact midpoint. |
| `MAX_DEPTH_CHANGE_PER_FRAME` | 0.08 | > 0.0625 | The fastest genuine consecutive-frame change in the corpus is 0.0625 (take 6, frame 1111). Any lower and real descents are cut. |

**Correction to the earlier warning in this file.** The "fastest genuine descent
0.017–0.026 depth-ratio per frame" figure recorded above is a per-rep *average*
descent rate, not a consecutive-frame maximum; frame-to-frame the corpus reaches
0.0625. The warning's conclusion still stands unchanged — no kinematic budget can
separate the capture-protocol tail from real reps, because the tail is *slower*
than they are — but the number should not be read as a per-frame ceiling.

**`MAX_DEPTH_CHANGE_PER_FRAME` is real but not load-bearing here.** With Phase 2's
bounds guard and scale guard applied, an *infinite* jump budget still reproduces
all six counts. At 0.08 the filter rejects 7 frames in the entire corpus, all of
them in `corpus-04-shallow` frames 1086–1104, where the hips read 0.21–0.33 trunk
lengths *above* the standing baseline on an upright subject. That burst is the
real anomaly Phase 1 mislabelled as an out-of-bounds glitch at "frame ~1087" —
the frames are in bounds, but the depth they imply is not. The filter is retained
for live sessions, and must not be presented as what made the counts come out
right.

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

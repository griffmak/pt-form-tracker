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

## What this corpus does NOT yet resolve

- Whether take 1's drift is real postural sway or a tracking artifact.
  Neither this manifest nor Phase 1 computes the planar trunk/depth measure,
  so this can only be answered once Phase 2's code exists and is run against
  `corpus-01-standing.json`.
- Whether the hip out-of-bounds glitches in takes 4 and 6 are one-off noise
  or a recurring failure mode. Phase 2/3 should check whether an
  implausible-jump guard on the raw hip series (mirroring the existing knee
  guard) eliminates them cleanly.

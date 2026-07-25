# PT Movement Form Tracker — Design Spec

## Purpose

A browser-based tool that uses live webcam pose tracking to help someone
perform their own PT-prescribed exercises (e.g., L4/L5 rehab movements) with
visible, real-time form feedback, and tracks consistency across sessions over
time.

This is content-driven: the vehicle for a video demonstrating "watch AI catch
your bad form live," built as a genuine, usable, open-source tool — not a
throwaway demo. It is inspired by the idea behind the `3d_human_pose`
GitHub repo (real-time webcam → 3D pose skeleton) but built independently
against MediaPipe Pose Landmarker directly; no code from that repo (which
carries no license) is reused.

## Non-goals / explicit scope boundary

This tool does **not** diagnose, prescribe, or validate whether an exercise
is medically appropriate for a given injury. It has no visibility into
internal joint/disc mechanics — only external body position from a single
camera. The exercise library is a small, human-curated reference list of
commonly known PT exercises; the user selects which apply to them (ideally
confirmed with their own PT/doctor).

**Who defines "correct form" (resolves an ambiguity flagged in review):**
each exercise ships with a default joint-angle range sourced from common,
publicly documented PT guidance — labeled in the UI as a general reference,
not a medical prescription. Before tracking begins, the user reviews and
can adjust that range for their own body/mobility. Whatever value is
active at tracking time — default or user-adjusted — is what the system
treats as "correct form" for that person. The system never independently
decides what's medically appropriate; it only measures consistency against
whichever reference is currently active.

## Architecture

Single-page web app, 100% client-side, no backend server. MediaPipe Pose
Landmarker (WASM, optional GPU delegate) runs directly in the browser.
Camera video, pose inference, angle-checking, and session history all stay
on-device — nothing about the user's body or condition leaves the machine.
Session data persists in the browser's IndexedDB. Works on both desktop and
mobile browsers (Chrome/Safari); no login required for v1.

## Components

1. **Exercise Library** — local JSON, hand-curated (post-spec, via web
   research) list of exercises. Each entry: name, reference
   image/description, **required camera framing** (e.g., "side view" for
   squat depth, "front view" for knee valgus — some rules are only
   measurable from a specific angle, so this is not optional metadata), the
   joint-angle rules that define "good form" (e.g., squat: knee angle
   80-100 degrees at bottom, hip-shoulder alignment within a defined
   tolerance) as a **default reference range**, and a per-user override
   value the app persists once the user adjusts a range for their own body.

2. **Pose Engine** — thin wrapper around MediaPipe Pose Landmarker
   (`@mediapipe/tasks-vision`). Per frame, emits both `landmarks`
   (normalized 2D image coordinates, used only for the live overlay
   drawing) and `worldLandmarks` (metric 3D coordinates in meters, stored
   for post-session replay).

3. **Form Checker** — pure geometry functions. Computes joint angles each
   frame **from `worldLandmarks`, not `landmarks`** — normalized 2D
   coordinates distort badly with camera viewing angle and perspective
   foreshortening (a true 90-degree knee angle can read as 60 or 120
   degrees depending on phone placement), while metric 3D coordinates are
   far more robust to viewpoint, even though they're still MediaPipe's own
   depth estimate rather than ground truth. Angles are compared against the
   selected exercise's active range (default or user-adjusted, per
   Component 1), outputs a pass/fail per rule per frame. Skips a rule for a
   frame if that joint's `visibility` confidence is below a threshold,
   rather than flagging a false fault — and tracks **rule coverage**
   (how many of an exercise's rules were actually evaluated vs. skipped for
   low visibility) alongside the pass/fail result, so a session where a
   rule was never visible doesn't silently read as a passing session.

4. **Live Overlay Renderer** — draws the 2D skeleton plus red/green joint
   indicators directly on the camera canvas during the session.

5. **Session Recorder** — logs per-frame angle data and rule pass/fail
   results to IndexedDB as the session runs.

6. **Replay/Progress View** — post-session only. Renders a 3D stick-figure
   skeleton replay directly from stored `worldLandmarks` point positions
   (not a rigged/skinned avatar — that would require IK retargeting onto a
   humanoid rig, a separate and much larger sub-project, out of scope here)
   for reviewing individual reps, plus a simple consistency chart across
   sessions that reports both pass rate and rule coverage (e.g., "82% good
   form, 3 of 3 rules evaluated" vs. a session where a rule was skipped
   most of the time).

## Data flow

Camera -> Pose Engine (per frame) -> Form Checker (computes angles from
`worldLandmarks`, tracks pass/fail + rule coverage) -> simultaneously: Live
Overlay (immediate render, from `landmarks`) + Session Recorder (batched
IndexedDB write). After the session ends, the Replay/Progress View reads
the stored session back and renders the 3D skeleton replay plus the
progress chart. No network round-trip at any point in this flow.

## Error handling

- **No camera permission / no camera detected** — explicit upfront message;
  the app does not silently fail or show a blank screen.
- **Pose not detected** (person out of frame, poor lighting) — overlay shows
  a neutral "can't see you clearly" state rather than guessing or showing a
  false green/red result.
- **Low-confidence landmarks** (`visibility` below threshold) — that joint's
  check is skipped for the frame instead of being flagged as a fault, so
  poor lighting doesn't produce false form-correction noise.
- **IndexedDB write failure or unavailable storage** (e.g., Safari private
  browsing, which restricts or clears IndexedDB): the app surfaces that
  session history isn't being saved rather than silently losing it. Given
  the tool's value is longitudinal consistency tracking, a silently-empty
  history is a real failure, not a cosmetic one. Per-frame writes are
  batched (not written on every single inference frame) so storage I/O
  doesn't compete with the live inference/render loop on mobile.

## Testing

The Form Checker's angle math (pure functions) gets unit tests: feed known
synthetic `worldLandmarks`-shaped coordinates (metric x/y/z) in, confirm the
angle calculation, pass/fail thresholds, and rule-coverage tracking are
correct. Camera capture and rendering are verified by hand in a real
browser session, not automated.

## Deferred to later (explicitly out of scope for this spec)

- Sourcing and writing the actual curated exercise list (squats, pushups,
  lunges, and/or specific PT-prescribed movements) — to be done via web
  research after this spec is finalized.
- Any account system, cloud sync, or multi-device history.
- Mobile app packaging (this is a responsive web app only for v1).

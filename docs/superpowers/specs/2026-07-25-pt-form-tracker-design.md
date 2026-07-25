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
confirmed with their own PT/doctor). The system's job is limited to:
tracking the user's own defined "correct form" reference and reporting
consistency/drift against it over time.

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
   image/description, and the joint-angle rules that define "good form"
   (e.g., squat: knee angle 80-100 degrees at bottom, hip-shoulder alignment
   within a defined tolerance).

2. **Pose Engine** — thin wrapper around MediaPipe Pose Landmarker
   (`@mediapipe/tasks-vision`). Per frame, emits both `landmarks`
   (normalized 2D image coordinates, used for the live overlay) and
   `worldLandmarks` (metric 3D coordinates, stored for post-session replay).

3. **Form Checker** — pure geometry functions. Computes joint angles each
   frame from the landmarks, compares against the selected exercise's
   defined ranges, outputs a pass/fail per rule per frame. Skips a rule for
   a frame if that joint's `visibility` confidence is below a threshold,
   rather than flagging a false fault.

4. **Live Overlay Renderer** — draws the 2D skeleton plus red/green joint
   indicators directly on the camera canvas during the session.

5. **Session Recorder** — logs per-frame angle data and rule pass/fail
   results to IndexedDB as the session runs.

6. **Replay/Progress View** — post-session only. Reconstructs a 3D avatar
   from stored `worldLandmarks` for reviewing individual reps, plus a
   simple consistency chart across sessions (e.g., percentage of reps in
   good form, trending over time).

## Data flow

Camera -> Pose Engine (per frame) -> Form Checker (angles + pass/fail) ->
simultaneously: Live Overlay (immediate render) + Session Recorder
(IndexedDB write). After the session ends, the Replay/Progress View reads
the stored session back and renders the 3D avatar plus the progress chart.
No network round-trip at any point in this flow.

## Error handling

- **No camera permission / no camera detected** — explicit upfront message;
  the app does not silently fail or show a blank screen.
- **Pose not detected** (person out of frame, poor lighting) — overlay shows
  a neutral "can't see you clearly" state rather than guessing or showing a
  false green/red result.
- **Low-confidence landmarks** (`visibility` below threshold) — that joint's
  check is skipped for the frame instead of being flagged as a fault, so
  poor lighting doesn't produce false form-correction noise.

## Testing

The Form Checker's angle math (pure functions) gets unit tests: feed known
synthetic joint coordinates in, confirm the angle calculation and pass/fail
thresholds are correct. Camera capture and rendering are verified by hand in
a real browser session, not automated.

## Deferred to later (explicitly out of scope for this spec)

- Sourcing and writing the actual curated exercise list (squats, pushups,
  lunges, and/or specific PT-prescribed movements) — to be done via web
  research after this spec is finalized.
- Any account system, cloud sync, or multi-device history.
- Mobile app packaging (this is a responsive web app only for v1).

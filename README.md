# PT Form Tracker

A browser-based squat form tracker. It uses your webcam and on-device pose
estimation ([MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker))
to give live visual feedback on your joint angles during a squat, then shows a
3D skeleton replay and a per-rule summary of how that session went.

It runs entirely in your browser. There is no backend, no account, and no server
to send anything to.

---

## Current scope — read this before expecting more

This is **a single-session squat tracker**, and only that:

- **One exercise.** Squat, side-on to the camera. Nothing else is defined.
- **One session at a time.** You get a summary of the session you just finished.
  Frame data is written to IndexedDB and persists, but **nothing reads it back** —
  there is no history view, no across-sessions trend, and no "am I improving"
  answer yet. That is the intended next feature, not a shipped one.
- **Desktop only.** Mobile is untested and unsupported.
- **Validated against one body**, one room, one camera, by the person who built
  it. MediaPipe's accuracy is known to vary with lighting, camera quality, and
  skin tone. Treat it as an experimental tool, not a clinical instrument.

Form is graded **per rep** — the tool finds each rep's deepest point and checks
your joint angles there. If it can't find any complete reps it tells you that
plainly rather than reporting a score, because "no reps detected" and "bad form"
are different facts.

---

## Privacy and data handling

**Nothing leaves your browser. Ever.**

- Your camera feed is processed **on your own device**. Video frames are read
  into a `<canvas>`, passed to the pose model in-page, and discarded.
- **No video, no images, and no pose data are uploaded anywhere.** There is no
  backend and no analytics — the app has nowhere to send data even if it tried.
- Per-frame rule results (angles and pass/fail — numbers, not imagery) are
  written **locally to your browser's IndexedDB**. Your adjusted angle ranges are
  stored in `localStorage`. Note that this data currently accumulates but is
  never read back — see "Current scope" below.
- You can delete all of it at any time by clearing site data for this origin in
  your browser settings. Uninstalling is just closing the tab.
- Two assets are fetched over the network at startup: the MediaPipe WASM runtime
  (from the jsDelivr CDN) and the pose model file (from Google's model storage).
  These are **downloads into your browser** — your camera data is never sent in
  the other direction.

The camera permission prompt appears as soon as the page loads, and the same
privacy note is shown on-screen next to it, so you don't have to take a
README's word for it before deciding.

---

## Requirements

- **A webcam.**
- **A Chromium-based desktop browser** (Chrome, Edge, Arc, Brave). This is what
  it has been tested against. Desktop only — mobile is not supported yet.
- **HTTPS, or `localhost`.** Browsers only grant camera access on a secure
  origin. A deployed HTTPS URL or a local dev server both work; opening
  `index.html` as a `file://` path will not.
- Room to stand **side-on to the camera**, full body in frame.

## Setup

```bash
git clone https://github.com/griffmak/pt-form-tracker.git
cd pt-form-tracker
npm install
npm run dev
```

Then open the printed `localhost` URL and grant camera access.

Other commands:

```bash
npm run build     # production build into dist/ (static, deploy anywhere)
npm test          # unit tests
npm run test:e2e  # Playwright smoke test
```

The build output is a plain static site — any static host works.

## Using it

1. Open the page and allow camera access.
2. **Stand side-on to the camera**, with your whole body visible. This matters:
   the squat rules measure knee and hip angles that simply aren't measurable
   from the front, and a front-on session will report a misleadingly low pass
   rate. The app shows this instruction above the live view.
3. Review the **form ranges** panel and adjust them if they don't fit you (see
   below).
4. Squat. The overlay shows your skeleton and live per-rule pass/fail.
5. Press **`e`** to end the session. You'll get a 3D replay and a summary of
   pass rate and rule coverage.

---

## The angle ranges are a general guideline, not a personal assessment

This is the most important limitation to understand before trusting anything
this tool tells you.

The default ranges shipped for the squat are:

| Rule | Default range | Where it comes from |
|---|---|---|
| Knee bend depth | 70–100° | Clinical squat-depth literature placing near-parallel-to-parallel thigh position in this band |
| Torso lean | 45–90° | The commonly cited threshold for "excessive" forward trunk lean |

These are **population-level reference values from public PT guidance**. They
are not calibrated to you. If you have different limb proportions, an existing
mobility limitation, older joints, or a PT who has given you a deliberately
different target, these defaults can confidently tell you your form is "wrong"
when it is entirely correct *for your body*.

Because of that, every rule's range is editable in the **"Form ranges (adjust
for your body)"** panel on the page. Changes apply immediately and persist in
your browser, and each rule can be reset to its default. Whichever value is
active — default or yours — is the only thing the app measures against.

**The app never decides what is medically appropriate for you.** It has no
visibility into your joints, discs, or history; it only sees external body shape
from one camera. It measures consistency against a reference range you control.

## Limitations — read these honestly

- **Not a medical device.** This is not a diagnostic, clinical, or
  medical-grade instrument, and gives no medical advice. It does not diagnose,
  prescribe, or evaluate whether an exercise is appropriate for you. Talk to an
  actual physio or doctor about that.
- **Squat only.** One exercise. It is deliberately scoped as a squat tracker.
- **Desktop only.** No mobile support.
- **Barely tested, statistically speaking.** Validated against one body, one
  room, one lighting setup, one camera, by the person who wrote it. Pose
  estimation accuracy is known to vary with lighting, camera quality, clothing,
  and skin tone. Treat this as experimental/beta software.
- **Single-camera monocular estimation.** Depth is inferred, not measured. Some
  form errors (e.g. knee valgus) need a camera angle the squat rules don't use.

## How it works

Single-page Vite + TypeScript app, 100% client-side:

- `src/pose/` — MediaPipe wrapper and pure joint-angle math
- `src/form-checker/` — compares angles against the active range; tracks which
  rules were actually measurable per frame (rule coverage), so a session can't
  look "clean" just because a rule was never visible
- `src/exercise-library/` — exercise definitions and your saved range overrides
- `src/storage/` — batched IndexedDB writes, kept off the render loop
- `src/render/` — live 2D overlay, 3D replay, summary, settings panel

Angles are computed from MediaPipe's metric `worldLandmarks` rather than the 2D
`landmarks`, which distort heavily with camera viewing angle.

## License

ISC. Built fresh against MediaPipe Pose Landmarker (Apache 2.0); no code is
reused from other pose-tracking projects.

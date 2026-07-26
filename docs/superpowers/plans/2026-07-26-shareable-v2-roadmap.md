# PT Form Tracker: Roadmap to Shareable v2

**Partially executed: 2026-07-26.** Layer 1 (items 1–3) and Layer 2 (items 4–5) are all DONE and deployed live at https://pt-form-tracker-lyart.vercel.app. Live testing after the deploy exposed a NEW blocking item — see "Layer 0" added below, which now gates sharing the link.

Date: 2026-07-26
End goal (standing, cross-project): reach a professional, shareable state — something another person could pick up and use, not just a script that works for one tester on one body in one room. v1 (squat tracking, IndexedDB storage, 3D replay) is built, tested against a real session, pushed to GitHub, and one real bug (missing camera-framing instructions) was found and fixed via live testing. This roadmap is what's left before it's genuinely shareable, ordered by blocking-ness.

## Layer 0 — NEW BLOCKING ITEM, found by live testing after the deploy (2026-07-26)

0. **Scoring is per-frame, not per-rep — the app reports "0% good form" for correct squats.** `summarizeSession` (`src/render/progress-chart.ts`) grades *every frame* against "are you at the bottom of a squat right now." Standing still, descending, and ascending all count as failures, so five flawless reps still score near zero. The arithmetic is honest (`passRate = passed / evaluated`, so unseen frames don't dilute it) — the metric is what's wrong, and the label "0% good form" claims far more than it measures.

   Evidence, real 1303-frame session: knee bend evaluated 144/1303 with angles 139.8–161.4° (target 70–100°); torso lean evaluated 218/1303 at 134.0–176.3° (target 45–90°); coverage 13.9%, pass rate 0%, no console errors.

   **Fix:** detect each rep's deepest point (local minima in the knee-angle series) and grade *that*, rather than every frame. Already-persisted frame data is sufficient — no new capture needed. Deterministic geometry; explicitly **do not** introduce an LLM/Claude SDK call here, as sending pose data off-device would falsify the privacy claim the README and the on-screen note both make.

   **Secondary, same root area:** coverage of 13.9% means ~86% of rule checks were skipped for low landmark visibility. Compounding design tension — you must stand back several metres to be fully in frame, but the only way to end a session is pressing `e` at the keyboard, so every session is bookended by close-to-camera frames. The framing banner says "stand side-on" but never says how far back, and nothing verifies ankles are visible before starting. Candidate fix: a live coverage/visibility readout on the setup view before the session begins.

## Layer 1 — Blocking (must happen before sharing with anyone) — ✅ ALL DONE 2026-07-26

1. **Deploy as a static site.** `npm run build` already produces a clean `dist/` (confirmed 2026-07-26: 173KB gzipped JS, no errors). Ship it to Vercel, GitHub Pages, or Netlify. No backend needed — this is the single highest-leverage item, since it turns "here's a repo" into "here's a link."
2. **Write a README.** Must cover: what the tool does, browser/hardware requirements (webcam, Chromium-based browser, HTTPS or localhost for camera access), and an explicit privacy statement — all pose data stays in the browser's IndexedDB, nothing is uploaded anywhere. This last point matters more than onboarding convenience: people will hesitate to grant camera access to an unfamiliar tool without it being said plainly.
3. **Rule-range override, or explicit disclaimer.** The knee-bend (70-100deg) and torso-lean (45-90deg) ranges are tuned from general PT literature, hardcoded, with no way for a user to adjust them (`RuleOverride` type exists in `src/exercise-library/types.ts` but nothing in the UI reads or writes it). For a single user this is fine; for anyone else, it risks confidently telling someone their form is "bad" when it's actually a body the ranges weren't calibrated for (different limb proportions, an existing mobility limit, older joints). Before wider sharing: either build a minimal override UI, or at minimum say plainly in the UI/README that ranges are a general guideline, not a personalized or clinical assessment.

## Layer 2 — Should-fix soon — ✅ BOTH DONE 2026-07-26

4. **State the testing limitation plainly.** So far this has only been validated against one body, one lighting setup, one camera, by the person who built it. MediaPipe's accuracy is known to vary by lighting/skin tone/camera quality. Don't try to "solve" this with more test infrastructure — just say plainly in the README that this is an experimental/beta tool, not a clinical or medical-grade instrument.
5. **On-screen privacy note**, not just README — a line near the camera-permission prompt itself ("nothing leaves your browser") so the trust signal appears at the moment it's needed, not buried in a doc most people won't open first.

## Explicitly out of scope for v2 (don't build these yet)

- More exercises beyond squat — ship as "a squat tracker," be upfront about scope, expand only if there's real demand.
- Mobile support — desktop-only is a fine limitation to state, not fix.
- A shared cross-project testing package/library (already decided against this — see the testing-guardrail pattern page).

## How this list was produced

Derived from a live testing session on 2026-07-26: built a dev-only test-artifact bridge (Vite plugin writing session diagnostics to disk) and the `claude-video`/`watch` skill (installed globally) to review a real screen recording of a squat session. That review found the real bug behind this session's fix (`678ebbb` — camera framing instructions were never shown to the user) and confirmed the app runs clean otherwise (no console errors, `npm run build` succeeds). See the paired pattern page on the testing workflow itself for how to repeat this process on future projects.

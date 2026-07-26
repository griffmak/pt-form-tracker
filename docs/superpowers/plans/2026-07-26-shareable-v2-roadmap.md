# PT Form Tracker: Roadmap to Shareable v2

Date: 2026-07-26
End goal (standing, cross-project): reach a professional, shareable state — something another person could pick up and use, not just a script that works for one tester on one body in one room. v1 (squat tracking, IndexedDB storage, 3D replay) is built, tested against a real session, pushed to GitHub, and one real bug (missing camera-framing instructions) was found and fixed via live testing. This roadmap is what's left before it's genuinely shareable, ordered by blocking-ness.

## Layer 1 — Blocking (must happen before sharing with anyone)

1. **Deploy as a static site.** `npm run build` already produces a clean `dist/` (confirmed 2026-07-26: 173KB gzipped JS, no errors). Ship it to Vercel, GitHub Pages, or Netlify. No backend needed — this is the single highest-leverage item, since it turns "here's a repo" into "here's a link."
2. **Write a README.** Must cover: what the tool does, browser/hardware requirements (webcam, Chromium-based browser, HTTPS or localhost for camera access), and an explicit privacy statement — all pose data stays in the browser's IndexedDB, nothing is uploaded anywhere. This last point matters more than onboarding convenience: people will hesitate to grant camera access to an unfamiliar tool without it being said plainly.
3. **Rule-range override, or explicit disclaimer.** The knee-bend (70-100deg) and torso-lean (45-90deg) ranges are tuned from general PT literature, hardcoded, with no way for a user to adjust them (`RuleOverride` type exists in `src/exercise-library/types.ts` but nothing in the UI reads or writes it). For a single user this is fine; for anyone else, it risks confidently telling someone their form is "bad" when it's actually a body the ranges weren't calibrated for (different limb proportions, an existing mobility limit, older joints). Before wider sharing: either build a minimal override UI, or at minimum say plainly in the UI/README that ranges are a general guideline, not a personalized or clinical assessment.

## Layer 2 — Should-fix soon (not blocking, but real gaps)

4. **State the testing limitation plainly.** So far this has only been validated against one body, one lighting setup, one camera, by the person who built it. MediaPipe's accuracy is known to vary by lighting/skin tone/camera quality. Don't try to "solve" this with more test infrastructure — just say plainly in the README that this is an experimental/beta tool, not a clinical or medical-grade instrument.
5. **On-screen privacy note**, not just README — a line near the camera-permission prompt itself ("nothing leaves your browser") so the trust signal appears at the moment it's needed, not buried in a doc most people won't open first.

## Explicitly out of scope for v2 (don't build these yet)

- More exercises beyond squat — ship as "a squat tracker," be upfront about scope, expand only if there's real demand.
- Mobile support — desktop-only is a fine limitation to state, not fix.
- A shared cross-project testing package/library (already decided against this — see the testing-guardrail pattern page).

## How this list was produced

Derived from a live testing session on 2026-07-26: built a dev-only test-artifact bridge (Vite plugin writing session diagnostics to disk) and the `claude-video`/`watch` skill (installed globally) to review a real screen recording of a squat session. That review found the real bug behind this session's fix (`678ebbb` — camera framing instructions were never shown to the user) and confirmed the app runs clean otherwise (no console errors, `npm run build` succeeds). See the paired pattern page on the testing workflow itself for how to repeat this process on future projects.

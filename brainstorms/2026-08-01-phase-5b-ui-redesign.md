# Phase 5b + UI Redesign: Brainstorm / Discovery Notes
Date: 2026-08-01 · Goal: nail down a full spec covering Phase 5b (deviation-flag UI, streak, worst-rep-replay) combined with a broader visual redesign of pt-form-tracker's UI, ready to hand to writing-plans.

## Summary / key decisions
(running synthesis, updated as you go)

- Core detection logic (`src/form-checker/rep-deviation.ts`) already exists and is corpus-validated (Phase 3, 2026-07-29). Not being re-litigated.
- Currently zero UI wiring exists for deviation flags, streaks, or worst-rep replay (confirmed via grep on `src/main.ts`).
- The existing 3D replay component already replays a rep; it needs a "worst rep" selector added, not to be built from scratch.

**Visual system (locked, Q3–Q6):** keep the bold geometric block-layout structure of "Vibrant & Block-based" but drop its gym color story. Colors: sky blue `#0284C7` primary / amber `#F59E0B` accent / `#F0F9FF` background. Typography: Clash Display (headings) / Satoshi (body), Fontshare fonts. Light mode only (Q12). Supports desktop and mobile (Q13) — breakpoints TBD in the plan.

**Layout application (Q10):** same top-to-bottom flow — LIVE → 3D REPLAY → SESSION SUMMARY — restyled in place as distinct visual blocks. No tabs/dashboard restructure.

**Phase 5b features, mapped onto the new UI:**
- Flagged ("unusual") reps: summary-only, never a live mid-set interruption (Q7). Shown in SESSION SUMMARY's rep list as an amber icon + "unusual" text label next to the existing stats, not a full-row color change (Q11). Clicking a flagged rep jumps 3D replay to it.
- Streak: longest run of consecutive clean (non-unusual) reps within the current set, shown as a stat next to the rep list (Q8).
- Worst-rep replay: rep with the largest deviation magnitude from the set median; 3D replay auto-defaults to it when ≥1 rep is flagged, otherwise keeps current default behavior; manual rep selector still available (Q9).

**Deferred to writing-plans, not designed here:** Fontshare font-loading mechanism (CDN+key vs. self-hosted `@font-face`); exact mobile breakpoints and how the three blocks reflow under them.

## Q&A log

### Q1 — Scope of the redesign
- Asked: Full visual redesign of the whole app, or just new UI for the 5b features layered onto the existing plain style?
- Captured: Full redesign. Griffin wants to try the `ui-ux-pro-max-skill` (https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) for it. Need to fetch/inspect this skill before going further — unknown tool, not yet vetted.
- Flags: Need to determine what this skill actually does / how to install and invoke it -> investigate now.

### Q1b — What is ui-ux-pro-max-skill
- Investigated directly (no need to ask): it's a Claude Code skill/plugin (github.com/nextlevelbuilder/ui-ux-pro-max-skill, MIT, 112k stars) providing a design-system reasoning engine — 84 UI styles, 192 color palettes, 74 font pairings, 161 industry-specific reasoning rules, outputs a full design system (pattern + style + colors + typography + effects + anti-patterns + pre-delivery checklist) for a given product type/framework.
- Install options: Claude Code plugin marketplace (`/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` + `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill`), or CLI (`npm install -g ui-ux-pro-max-cli`, `uipro init --ai claude`), project-local or `--global`.
- Captured: Griffin wants to use this for the pt-form-tracker redesign.
- Flags: none — resolved.

### Q2 — Install scope
- Asked: project-local or global (~/.claude/skills/) install of ui-ux-pro-max-skill?
- Captured: Global. Confirmed.
- Installed: `npm install -g ui-ux-pro-max-cli` then `uipro init --ai claude --global` — succeeded, written to `~/.claude/skills/`. Session reloaded skills (`/reload-skills`); `ui-ux-pro-max` skill now live and invokable.

### Q3 — Visual style direction (via ui-ux-pro-max)
- Asked: which UI style fits — ran `--design-system` with several query phrasings.
- Captured: Griffin initially reacted against the tool's default "fitness" match (Vibrant & Block-based: bold/energetic/orange-green/gym-branding, paired with an irrelevant "Lead Magnet + Form" landing pattern — that pattern is for marketing pages capturing email signups, not in-app UI, and was a query artifact, not a real recommendation).
- Correction: Griffin then said he actually **likes** the Vibrant & Block-based *style* (bold geometric block layout, energetic structure) — just not its default gym-branded color story or the gamified connotation.
- Refined ask: keep the bold/blocky layout energy, but tone = "this is a cool tool you can use for free, be helpful" — not clinical/medical, not gym-flashy either.

### Q4 — Color palette
- Asked: what colors — captured from Griffin directly.
- Captured: "a mix of light blue and some other color." Searched `--domain color` for light-blue-primary/light-background palettes (not dark mode). Two strong candidates surfaced:
  - **Weather App**: Primary #0284C7 (sky blue) / Accent #F59E0B (amber) / Background #F0F9FF (near-white blue tint) — "sky blue + sun amber"
  - **Travel/Tourism**: Primary #0EA5E9 (sky blue) / Accent #EA580C (orange) / Background #F0F9FF — "sky blue + adventure orange"
  - Both are light-mode-first, WCAG-checked, friendly/approachable rather than clinical or gym-branded.
- Flags: none — resolved (see Q6 below for final pick).

### Q5 — "Spiderman" blue+red detour
- Asked/explored: Griffin floated a blue+red "Spiderman-esque" palette. Searched `--domain color` twice; nothing in the product-type-anchored database is a true 50/50 comic-book red+blue (closest real match: Email Client palette, blue-led `#2563EB` + red accent `#DC2626`, not equal-weight). Griffin decided not to deviate further ("no deviating too much") and asked instead for the original skill recommendation + my own judgment call, grounded in what pt-form-tracker actually is.
- Captured: Not pursued further. Superseded by Q6.

### Q6 — Final style/color/type decision (locked in)
- Asked: reconcile the original skill recommendation (Vibrant & Block-based / orange+green gym palette / Barlow) against Griffin's actual stated tone ("cool free tool, helpful," light blue + another color, not clinical, not gym-flashy) plus my own product knowledge (pt-form-tracker is local-first/privacy-first, free, deliberately non-clinical — geometry only, no injury/spine claims).
- Captured — LOCKED:
  - **Layout/style**: keep Vibrant & Block-based's bold geometric block-layout structure (gives the live cue / 3D replay / session summary real visual presence vs. today's flat stacked plain-text sections). Drop its default gym color story.
  - **Colors**: sky blue `#0284C7` primary + amber `#F59E0B` accent, background `#F0F9FF` (near-white, blue-tinted). Sourced from the tool's "Weather App" product-type palette as the closest real match to "light blue + another color"; amber reads warm/friendly/helpful rather than alarm-red or gym-orange/green.
  - **Typography**: Clash Display (headings) / Satoshi (body) — the "Startup Bold" pairing. Griffin explicitly rejected the first suggestion (Space Grotesk/DM Sans) as "too basic." Clash Display + Satoshi are Fontshare fonts (not Google Fonts — different CDN import mechanism, a build-time implementation detail to flag later, not a blocker).
- Flags: none — Griffin confirmed "yes."

### Q7 — How should an "unusual" rep be surfaced?
- Asked: `rep-deviation.ts` flags `unusual` only after a rep completes (needs the whole set's running median), so it can't be a live mid-rep warning. Two options: (1) live, rep-by-rep — brief inline badge right after each flagged rep finishes, before the next rep starts; (2) summary-only — no in-session interruption, flagged reps only appear in the post-session report (e.g. marked in the rep list).
- Recommended: summary-only — early in a set there's not enough data for the comparison to mean much, and interrupting mid-workout cuts against the precise, non-gamified tone of the locked design direction.
- Captured: Confirmed — summary-only. Flagged reps surface only in the session summary, not live during the set.
- Flags: none — resolved.

### Q8 — What does "streak" mean and how is it shown?
- Asked: no existing streak concept in the codebase — new logic needed. Options: (1) longest run of consecutive clean (non-`unusual`) reps within a set; (2) consecutive clean sessions across history (needs IndexedDB cross-session lookup); (3) just a count ("4 of 5 clean"), no consecutive-run logic.
- Recommended: #1 — reuses the same per-rep `unusual` data from Q7, no cross-session lookup needed, shown as a small stat next to the rep list (e.g. "longest streak: 4").
- Captured: Confirmed — option 1. Streak = longest run of consecutive clean reps within the current set, computed from per-rep `unusual` flags, displayed as a stat in the session summary next to the rep list.
- Flags: none — resolved.

### Q9 — How should the worst rep be selected for 3D replay?
- Asked: the 3D replay component already replays *a* rep — needs a way to default to/select the "worst" one. Two sub-questions: (1) what defines "worst" — the rep with the largest deviation magnitude from the set median (same computation `repDeviations()` already does to decide `unusual`, used as a ranking rather than a boolean threshold), not necessarily shallowest/deepest, just most-different-from-own-median; (2) trigger — auto-default the replay to the worst rep when the summary loads (rep selector still available to switch away), vs. leave today's default and add an explicit "jump to worst rep" control.
- Recommended: auto-default to the worst rep whenever at least one rep in the set is flagged `unusual`; if nothing's flagged, keep today's default replay behavior (no "worst" worth highlighting). Makes the flag actionable instead of requiring the user to hunt for it.
- Captured: Confirmed — agreed as recommended. Worst rep = largest deviation magnitude from set median; 3D replay auto-defaults to it when ≥1 rep is flagged `unusual`, else keeps current default; existing rep selector remains available to switch reps manually.
- Flags: none — resolved.

### Q10 — Applying the block-layout design to the existing sections
- Asked: today's UI is three flat stacked plain-text sections (LIVE, 3D REPLAY, SESSION SUMMARY). Settle (1) layout — keep the same top-to-bottom section order, just restyle each as a distinct visual block, vs. restructure into tabs/a dashboard grid; (2) where the new Phase 5b elements live — streak stat + flagged-rep markers in SESSION SUMMARY's rep list, worst-rep auto-select as a behavior change to the existing 3D REPLAY block (not a new section).
- Recommended: keep the existing top-to-bottom flow (already matches the natural session sequence — live camera, then replay, then summary); apply the new block styling to each section in place rather than introducing a new layout paradigm like tabs. A new look, not a new information architecture.
- Captured: Confirmed — agreed as recommended. Same LIVE → 3D REPLAY → SESSION SUMMARY order, restyled in place as distinct visual blocks. Streak + flagged-rep markers live in SESSION SUMMARY's rep list; worst-rep auto-select is a behavior change to the existing 3D REPLAY block, not a new section.
- Flags: none — resolved.

### Q11 — Visual treatment of a flagged rep in the list
- Asked: `ui-ux-pro-max`'s accessibility rules require color to never carry meaning alone (`color-not-only`). Recommended: each rep keeps its number + depth stat as today; a flagged rep additionally gets a small amber icon (locked accent color) + short "unusual" label, not a full-row color change (which would compete with the block-layout's use of color for section identity). Clicking/tapping a flagged rep also jumps 3D replay to that rep, consistent with Q9's worst-rep auto-select.
- Captured: Confirmed — agreed as recommended. Flagged reps get an amber icon + "unusual" text label next to their stats (not a full-row highlight); clicking a flagged rep in the list jumps the 3D replay to it.
- Flags: none — resolved.

### Q12 — Dark mode: now or later?
- Asked: locked palette is light-mode-first; `ui-ux-pro-max`'s `dark-mode-pairing` rule says dark mode needs its own tonal palette, not just inverted colors — a real design pass, not a toggle.
- Recommended: light-only for this pass. Doing dark mode properly would roughly double the design surface on top of the 5b feature work; ship light-mode well first, dark mode as a clean follow-up later.
- Captured: Confirmed — agreed as recommended. Light mode only for this redesign; dark mode explicitly out of scope, deferred to a future pass.
- Flags: none — resolved.

### Q13 — Responsive scope: desktop-only or desktop + mobile?
- Asked: verified directly (grep) that `index.html` has a viewport meta tag already but no `@font-face`/Fontshare setup and no CSS files — styling is all inline `font-family: sans-serif` in one `<style>` block. No existing responsive/breakpoint logic beyond the meta tag. Given the app's primary use case (filming yourself with a webcam/phone at a distance), does the redesign need to handle small viewports, or is desktop/laptop-with-webcam the only realistic form factor?
- Captured: Both — the redesign needs to support desktop and mobile viewports, not desktop-only.
- Flags: Fontshare font loading mechanism (CDN/API key vs. self-hosted @font-face) — implementation detail for writing-plans, not resolved here. Mobile breakpoint specifics (exact widths, how LIVE/3D REPLAY/SESSION SUMMARY blocks reflow on small screens) — also deferred to the plan, not designed in this interview.

## Open flags (pending input)
- Fontshare font loading mechanism (CDN+API key vs. self-hosted @font-face for Clash Display/Satoshi) -> resolve in writing-plans / at implementation time.
- Mobile breakpoint specifics for the block-layout redesign (exact breakpoints, how the three sections reflow under ~768px) -> resolve in writing-plans.

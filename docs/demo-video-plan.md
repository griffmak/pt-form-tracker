# Demo video — working plan

**Status:** in progress. "Before" footage shot; "after" footage not yet shot.
**Last updated:** 2026-07-29, end of the Phase 2 + Phase 3 session.

The before/after contrast is the video's spine. The tool reporting confident
wrong numbers on camera is the hook; the rebuild is the payoff.

## Assets

| asset | state | notes |
|---|---|---|
| `/Users/griffinmaklansky/Demo PT Video.mov` | ✅ shot 2026-07-28 | 43.9s, 2938×1726. Full screen recording of a real session against the **unmodified** tool, deliberately captured before any measurement fix. **Do not re-record** — it is a failure that has since been fixed and would have to be re-staged. |
| `.claude-test-artifacts/session-2026-07-28-demo-video-967frames.json` | ✅ tracked | The landmark data from that same recording, if the edit ever needs to overlay real numbers. |
| "After" footage | ❌ not shot | Depends on the rebuild reaching the screen. See "What has to land first" below. |

## Edit direction (Griffin's, 2026-07-28, during shooting)

The failure footage goes **close to the beginning**. The recording "shows the full
UI at one point, then in our montage we'll cut to a zoomed in version of the
skeleton output" — so: cut full-UI wide first, then push in on the skeleton
overlay.

## The story the video tells

Plain-language narration spine, written 2026-07-29 once the rebuild had numbers
behind it. This is the substance, not final script copy — but it is the substance
in the order it should land.

> The old version watched your knee bend. That was the problem — a laptop camera
> looking at you side-on often can't see your knees and ankles clearly, so on some
> recordings it just guessed, and on one it counted two squats from a video of you
> standing perfectly still. The new version watches your shoulders and hips, which
> the camera tracks reliably basically all the time.
>
> To check whether the new way actually works, I ran it against the six videos you
> recorded on 2026-07-28, where you know exactly how many squats you did in each.
> It got all six right: zero, five, five, five, eight, five. I ran the old
> knee-based method over the same six videos as a fair comparison, and it got three
> of them wrong — including reporting zero squats on two videos where you clearly
> did five. So the new approach isn't just different, it's measurably better, and
> that comparison is now a permanent test so nobody can quietly break it later.
>
> Two things I had to figure out along the way that weren't obvious. First, the
> video where you deliberately did your last three squats badly nearly broke it:
> the software was measuring "is this a real squat?" relative to your best squat in
> the set, so your three sloppy shallow ones got thrown away as not-real. That's
> backwards — the worse your form gets, the more the tool would pretend those reps
> never happened. Fixed by also having a fixed minimum, so a shallow rep still
> counts as a rep. Second, and this is the useful one for the product: the app
> promises to point out "this rep looked different from your others," and until now
> nobody knew whether that was even possible. It is — but only by measuring depth.
> Your three deliberately-bad reps came out about 50–65% shallower than your normal
> ones, while your consistent sets only vary by about 17%, so the gap is wide and
> clean. Measuring how much you lean forward does *not* work — every rep in every
> video sits between 1 and 4 degrees, good and bad alike. So the "you're leaning
> too much" style of feedback isn't supported by anything we've recorded, and I've
> written that down clearly so a future session doesn't build it anyway.

### Where each claim above is backed up

Every number in that narration is measured and reproducible, so a viewer who
digs will not find it hollow:

- Two reps from a standing body, the original bug. **Verified 2026-07-29 against
  the capture itself, not the write-up:**
  `.claude-test-artifacts/session-2026-07-28-standing-test.json` stores, in the
  summary written by the code that was running at the time, `repCount: 2` and
  `passRate: 0.5` over 1554 frames — 25.9 seconds of standing still. Knee angle
  ranged 66.6°–179.1°; frame 42 reads 141.6° and frame 43 reads 66.6°, a 75°
  change in 1/60s (~4500°/s) during tracker convergence, and the old code took its
  scale from the raw min and max of the series, so that one frame defined "deep"
  for the whole session. **Use the 50% form score on camera as well as the rep
  count** — "50% good form" over a video of a man standing motionless is the
  sharper hook of the two, and it is in the file.
- Knees and ankles tracked poorly, shoulders and hips at 99–100% —
  `corpus-manifest.md`, per-take table.
- Six ground-truth counts, and the knee signal getting three of six wrong —
  `src/form-checker/rep-segmentation.corpus.test.ts`, which asserts both.
- The relative-threshold trap and its fix — `corpus-manifest.md`, "The one new
  mechanism, and why a relative threshold alone fails".
- The 50–65% vs 17% separation, and the negative finding on lean —
  `corpus-manifest.md`, "Deviation signal".

## What has to land first

The "after" footage cannot be shot yet. The new counting engine is built, tested
and committed, but nothing in the running app computes the measurements it needs,
so opening the page today shows the old behaviour. Two phases sit between here
and a filmable "after":

- **Phase 4 — confidence gating.** When the app should say "I couldn't see you
  well enough to judge that rep" instead of scoring it confidently. Plan is
  structural and still needs writing out.
- **Phase 5 — UI and copy.** Wires the depth path into `main.ts`, removes the
  knee-angle path, and fixes the on-screen wording. **This is the phase that makes
  the "after" shot exist.**

Shot list for the "after" pass, to be confirmed once Phase 5 lands: a full-set
recording that produces a correct rep count on screen, a shallow set that is
counted rather than silently dropped, and — if Phase 5 surfaces it — a set where
one rep gets flagged as unlike the others.

One constraint the video must respect, not just the app: **nothing on screen or
in narration may claim anything about the spine, discs, back safety, or injury
risk.** MediaPipe has no landmark between shoulder and hip, so any such claim
would be unfounded regardless of how good the rep counting gets.

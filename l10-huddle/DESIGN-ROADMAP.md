# L10 Huddle — design roadmap to corporation-grade

> **A UX + graphic-design review of the L10 Huddle app** (the `apps-script/` web app,
> the new-member guide, and the recap emails). It answers one question: *what are the
> highest-leverage next steps to make this look and feel like real corporation-level
> software* — the bar of Linear / Notion / Asana / Monday.com — *rather than a competent
> internal tool.* Reviewed **2026-06-30** across eight design lenses (visual/brand,
> interaction/UX, data-viz/IA, accessibility, responsive/device, email system,
> states/onboarding, design-system/front-end).
>
> **Skim-first (per how Alex reads):** the verdict and the "if you only do three things"
> box are at the top. Every number below was read out of the code and spot-checked, but
> **re-confirm the exact counts in your current paste before acting** — the live files may
> be a version ahead of the repo.
>
> **✅ Status (2026-07-28): the roadmap is complete — 10/10 shipped.** #1–#3 (v1.14),
> #4/#5-scales/#6 (v1.15), #8 (v1.16), #9 (v1.17), and with **v2.8**: #5's deferred
> component/render refactor (inline styles 176→17 dynamic-only, one `.pill` base for the
> ~16 chip species, `btnH_`/`pillH_`/`fieldH_`/`cardH_` render helpers), #7 (in-app guide
> + first-run checklist), #10 (quiet toasts, Loading/Saving chip, timer reset,
> `armedConfirm()`, surgical error reverts), plus the honorable-mention IDS dialog
> semantics + focus restore, the `.ms-tl` ResizeObserver fix, loading skeletons, and the
> skip link. The verdict below describes the *pre-#1–3* state and stays as the baseline
> the roadmap was written against.

---

## Verdict — where it sits today

This is a **genuinely competent internal tool** with real flashes of product instinct: the
to-scale rock-milestone timeline, optimistic UI, the two-click "armed confirm" pattern, a
255-line onboarding guide. But it sits **firmly on the internal-tool side of the line**, and
the single thing holding it back most is that **there is no shared source of truth for
anything**:

- **Brady blue has three different definitions.** The app accent (`#0a58c4`) literally does
  not appear in the email or the guide palettes. Off-track red has two values
  (`#dc2626` app vs `#9c2a1c` email); ink is `#101828` vs `#16202C`; the hairline is
  `#eaecf0` vs `#E3E8EF`. The product **contradicts itself surface-to-surface within a
  single week** of a teammate's use.
- **It fails the first checkbox of any accessibility audit.** The only `:focus` rule in the
  stylesheet sets `outline:none`; the timeline milestones are click-only `<div>`s; on/off-track
  is encoded by **color alone** in the grid (the email already does it right, with text pills).
- **It owns the laptop and ignores the room.** No present/projection mode — the meeting lives
  in the facilitator's narration instead of on the shared screen.
- **It's built from ~1,857 lines of `innerHTML` string concatenation** with **67 inline
  styles** and three different input radii — so it *can't* evolve consistently.

None of this is broken. All of it reads as *a script someone bolted on* rather than software.
The fix path is unusually clean because **almost every finding traces back to four roots:**
no tokens, no component layer, no room mode, no accessible interaction baseline.

**North star:** *A single Brady-blue, tokenized, component-built meeting product that reads
identically in the app, the recap email, and the new-hire guide; runs the room from a
full-screen present mode; is fully keyboard- and screen-reader-operable; and lets any
mid-meeting mistake be undone in one click.*

---

## ▶ If you only do three things

| Do | Why this three | Effort |
|----|----------------|--------|
| **#1 Single token source** (color/space/type defined once, consumed by app + guide + email) | The keystone — every other visual fix depends on it, and it's what kills the "three near-misses of the same blue" read. | **M** |
| **#2 Focus ring + keyboard-operable controls** | The cheapest *highest-credibility* win on the board. Crisp focus rings are a direct tell of real software, and this is the floor of every procurement/VPAT check. | **S** |
| **#3 Undo-on-toast + Conclude confirm** | The defining safety pattern of Linear/Superhuman/Gmail. Its absence is the clearest "internal tool" tell, and a mis-click in a *live* meeting is currently only fixable by hand-editing a sheet row. | **M** |

These three are mostly foundation + cheap polish, deliver outsized perceived-quality, and
unblock the rest. **#1 should land before the visual/email work; #2 and #3 can go in parallel.**

---

## ⚠ Don't break the Jira sync (merged 2026-06-30)

After this review was written, a one-way **L10 → Jira** to-do sync shipped
([`apps-script/L10Jira.gs`](./apps-script/L10Jira.gs); see the README's *Jira sync*
section). It's **server-side and headless** — a 10-minute time trigger (and a *Jira → Sync
now* menu item) reads the `L10_Todos` tab directly, creates a Jira issue for each **OPEN**
to-do, and transitions the issue to **Done** when the to-do's `Status` flips to DONE. It does
**not** hook the client to-do functions. None of the top-10 below conflict with it, but four
items touch surfaces it reads — implement them Jira-safe:

- **`Status` is the sync's trigger.** Anything that changes a to-do's done/open state (**#3**
  undo-on-toast, **#10** surgical revert / optimistic UI) must keep **persisting `Status` to the
  sheet** — the sync reads it on its own schedule, not from the client. An optimistic-only update
  that never writes the cell would make Jira silently miss the completion.
- **`L10_Todos` columns are append-only.** The sync's `Jira Key` / `Jira Done` bookkeeping
  columns live at the **end** of the header (same convention as the IDS `Identified`/`Discussed`
  columns). Render/edit refactors (**#5** component layer, **#10**) read rows by header name, so
  reordering won't crash — but never drop or relocate those two columns, and keep new columns
  appended at the end.
- **Preserve the Jira submenu in any menu refactor.** **#7** touches `L10Setup.gs`; its
  `l10BuildMenu` now carries a **Jira** submenu (Set API token / Test connection / Sync now /
  auto-sync on·off). Keep it intact.
- **The sync is one-way (L10 → Jira).** An **undo** (#3) of a to-do completion flips it back to
  OPEN in the sheet, but if the 10-min sync already closed the Jira issue, that issue stays Done.
  Word the undo so it doesn't promise to reopen Jira — or have undo also clear the `Jira Done`
  stamp so the next sync's idempotency is clean (a reopened OPEN to-do already has a `Jira Key`,
  so it won't re-create; it simply won't auto-reopen the Jira side).

There's also a **new design opportunity** the merge surfaced — see the Jira chip in *Honorable
mentions*: today the sync is invisible in the app, so the team gets no in-room signal that a
to-do is tracked in Jira.

---

## The top 10 next steps (ranked by leverage)

Ranked so foundational moves precede what depends on them, with quick wins pulled early.
**Impact** 1–5 (5 = transformative to perceived quality). **Effort** S = hours, M = a day or
two, L = ~a week.

### 1 · Establish one canonical token source — app, guide, *and* email  ·  impact 5 · effort M  ·  ✅ shipped v1.14
**Theme:** single source of truth · **Files:** `L10Css.html`, `L10Guide.html`, `L10Mail.gs` · **Depends on:** none

Define one token list — Brady-blue ramp (`--accent #0a58c4` / `--accent-deep #043f8d` /
soft+tint), one neutral gray ramp, and semantic `success`/`danger`/`warning` each with a
`-soft` background and `-text` foreground — as **the** source of truth. Emit it as CSS custom
properties in `L10Css`; have `L10Guide.html` reuse the same hex instead of its own `:root`;
define `L10Mail.gs`'s `L10_MAIL` constants from the same list so the email inlines from one
place. Reconcile the six drifted email values to the digit (`INK #16202C → #101828`,
`LINE #E3E8EF → #eaecf0`, adopt accent `#0a58c4`; status pills `#1c6b43 → #15803d`,
`#9c2a1c → #dc2626`).

- **Why corp-grade:** at the Linear/Notion/Stripe bar a brand color has *exactly one*
  definition. Here it has three that already disagree. Single-source tokens are the
  precondition for every other visual and email finding — the keystone.
- **User value:** the app the team runs, the recap in Stuart's inbox, and the new-hire guide
  all read as **one product** instead of three near-misses of the same blue.

### 2 · Global focus-visible ring + keyboard-operable controls  ·  impact 5 · effort S  ·  ✅ shipped v1.14
**Theme:** accessible interaction baseline · **Files:** `L10Css.html`, `L10Js.html` · **Depends on:** lands cleanest after #1 (uses `--accent`), but can proceed independently

Add one global `:focus-visible` rule (`outline:2px solid var(--accent); outline-offset:2px`)
on every button/nav/chip/votebtn/snip and the timeline controls, and never set `outline:none`
without a ≥3:1 replacement (today the *only* `:focus` rule is `.field input:focus{outline:none}`).
Convert the click-only timeline `<div>`/`<span>`s (`ms-node`, `ms-lab`, edit/delete glyphs,
`+milestone`) into real `<button>`s (or `role=button tabindex=0` + Enter/Space + `aria-label`),
reusing `.btn.mini` so the visuals don't change. Size them ≥24px (folds in the touch-target fix).

- **Why corp-grade:** Focus Visible (WCAG 2.4.7 AA) and Keyboard (2.1.1 A) are the lowest
  non-negotiable bars in every VPAT — the first checkbox a buyer's accessibility team ticks.
- **User value:** the timeboxed huddle can be driven cleanly from the keyboard against the
  clock, and a screen-reader teammate can participate in rock/milestone tracking instead of
  being locked out.

### 3 · Undo-on-toast + a Conclude confirm/summary  ·  impact 5 · effort M  ·  ✅ shipped v1.14
**Theme:** trust & reversibility · **Files:** `L10Js.html` · **Depends on:** none

Add an inline **Undo** on the success toast for reversible mutations (solve, kill, park,
todo-done, rock-status, drop-to-issue) that calls the paired reverse server fn
(`reopenIssue`/`voteIssue`/`setTodoStatus` already exist — mostly wiring); keep that toast
alive ~8s and raise the 5-item cap so an undoable action can't scroll off. For reset-votes,
snapshot the prior vote map and restore. Separately, gate the **one-click Conclude** (which
wipes `state.segue`/ratings/drafts) behind a lightweight confirm that doubles as a pre-flight
summary: *"Concluding — N to-dos created, ratings X/10 from M people, recap copied?"*

- **Why corp-grade:** undo-on-toast is the defining safety pattern of Linear/Superhuman/Gmail
  (act first, undo cheaply). Today the trivial **Discard** is two-click-armed while the
  *irreversible* **Conclude** is one click — backwards.
- **User value:** a mis-click during the live meeting (wrong issue solved, votes wiped
  mid-prioritization) is recoverable in one click instead of hand-repairing an `L10_` row.
- **⚠ Jira-safe:** undo of a to-do completion must still persist `Status` to the sheet, and
  should clear the `Jira Done` stamp (the sync is one-way — it won't auto-reopen a Jira issue).
  See *Don't break the Jira sync* above.

### 4 · A Present / Room mode (pop-out to fullscreen) for the shared screen  ·  impact 5 · effort M  ·  ✅ shipped v1.15
**Theme:** in-room / projection · **Files:** `L10Js.html`, `L10Css.html`, `L10Index.html`, `L10Setup.gs` · **Depends on:** best after #1/#5 (scales off the type/space ramp); pop-out is independent

Add a **Present** control on the meeting view that opens the app at its own `doGet` URL in a
full browser tab (escaping the cramped Sheets iframe), calls `requestFullscreen()`, and toggles
a `body.present` class. Under that class: hide header/nav; scale the timer to a ~96–120px hero
with a **non-color over-time pulse**; segment-rail names ~22px; scorecard cells ~20px; widen the
IDS card and raise its title to ~30–34px; render data caveats **inline** under each metric
instead of behind the hover icon. Weekly edits stay in the embed.

- **Why corp-grade:** Linear/Superhuman-tier tools own the context they run in. A meeting app
  with no room mode reads as a personal utility someone happened to screen-share. The layout is
  already flex/grid, so this is mostly one CSS class plus a pop-out — and it folds four findings
  (room mode, hero timer, IDS scaling, inline caveats) into one epic.
- **User value:** the whole team reads the scorecard, countdown, and current IDS issue from
  across the table — and the GTM caveats the team cares about are finally visible *in the room*.

### 5 · Extract a render-helper component layer + the missing token scales  ·  impact 5 · effort L  ·  ✅ scales v1.15 · render-helper/pill refactor v2.8
**Theme:** component & render layer · **Files:** `L10Js.html`, `L10Css.html` · **Depends on:** #1 (consumes color tokens)

> **v1.15 shipped the additive token-scale half only:** `--space-1..8` (4px base), a
> `--text-1..8` ramp that snapped every `9.5/10.5/11.5/12.5/13.5/14.5` half-pixel font
> size to an integer step (killing the jitter), a `--radius-sm/md/lg/pill` scale (clean
> 8/10/12 swapped), and `--z-*`/`--dur-*`/`--ease` constants — CSS-only plus four cosmetic
> inline sizes in `L10Js`. **Deferred (too risky to do blind on a live tool):** the
> `innerHTML`→`btn/pill/field/card` render-helper extraction, retiring the 67 inline
> styles, and consolidating the ~14 chip variants into one `.pill`. That refactor is the
> remaining #5 work.

Add the remaining token scales — `--space-1..8` on a 4px base, a 6–8 step `--text` ramp that
kills the `9.5/10.5/11.5/12.5/13.5/14.5` half-pixel jitter, a small radius scale, and
`--z`/`--ease`/`--dur` constants. Then extract tiny render helpers (`btn`, `pill`, `field`,
`card`) returning class-driven markup with **zero inline style**. Consolidate the ~14 chip
variants into one `.pill` with tone+size modifiers, and the three input radii into
`.input`/`.input--sm`. Add `.field--tight` to retire the inline `style="margin:0"` overrides.

- **Why corp-grade:** corporation-grade UIs are component libraries first. This app has the
  *vocabulary* of components (cards/pills/buttons) but none of the encapsulation, so a restyle
  leaves half the screens on the old look. A 4pt grid + a fixed type ramp are the literal
  substrate of Linear/Asana polish.
- **User value:** status reads identically on a scorecard row, a rock, a to-do, and the email;
  every input looks the same mid-huddle; future Brady-theme/dark-mode work ships uniformly.
- **⚠ Jira-safe:** the to-do render/edit refactor must keep the appended `Jira Key`/`Jira Done`
  columns intact (read rows by header name, append-only). See *Don't break the Jira sync* above.

### 6 · Fix the sparklines to show magnitude-vs-goal and carry status  ·  impact 5 · effort M  ·  ✅ shipped v1.15
**Theme:** honest data display · **Files:** `L10Js.html`, `L10Css.html` · **Depends on:** #1 (status color tokens)

Rewrite `sparkline()` so it no longer **per-row min-max normalizes** (today a 2% wobble and a
200% blowout fill the same box). Draw a dashed **goal line** (band for "between"), color the
line/area by the metric's current `ruleCheck` status (green/red token, not the hardcoded
`#0a58c4`), add a filled dot on the latest point, and keep a stable one-slot-per-week x-scale so
null weeks render as **gaps not skips**. Then reuse the same engine at chart size on **History**
against the `RATING_BAR(8)` and `TODO_DONE_TARGET(90%)` lines that already exist in config but
are never drawn.

- **Why corp-grade:** Linear/Notion-tier dashboards never ship a trend mark that contradicts the
  metric's own status color or hides above/below target — Tufte's whole point about sparklines is
  the reference line. Right now the app's signature data-viz **actively misinforms** in a meeting
  whose only verb is "on/off track."
- **User value:** in the 5-minute scorecard read the team sees direction-vs-goal at a glance
  instead of a row of identical squiggles, so "drop it down" calls get faster and more honest.

### 7 · Surface the orphaned guide in-app + design the empty / first-run state  ·  impact 4 · effort M  ·  ✅ shipped v2.8
**Theme:** states & onboarding · **Files:** `L10Index.html`, `L10Js.html`, `L10Css.html`, `L10Setup.gs` · **Depends on:** none

Wire the already-built 255-line `L10Guide` (today reachable **only** from the host Sheets menu,
`L10Setup.gs:89`) into the SPA: add a **Guide / ?** button to the header nav that opens its
content in the existing `.ids-overlay`/`.ids-card` modal. Then design one cohesive first-run:
when there's no history and no rocks/issues, replace the bare start-screen tiles with a short
**"Set up your huddle" checklist** (add scorecard metrics → add this quarter's rocks → run your
first huddle), and make the scattered per-page emoji empties use **consistent, action-oriented**
copy. Fold in the manager-safe rewrite of the placeholder copy while you're here.

- **Why corp-grade:** Notion/Linear surface onboarding *inside* the product at the moment of
  need and invest most in the empty state — it's the first thing a new workspace sees. A
  fully-built guide that can't be reached from the app reads as *nobody designed day one* — and
  it's the cheapest finish on the board, since the asset already exists.
- **User value:** a new analyst self-orients in their first huddle in two clicks instead of being
  told it's "somewhere in the spreadsheet menu."
- **⚠ Jira-safe:** this item edits `L10Setup.gs` — preserve the `l10BuildMenu` **Jira** submenu
  (Set API token / Test connection / Sync now / auto-sync). See *Don't break the Jira sync* above.

### 8 · Make the emails corporation-grade (shell · Outlook · responsive · deep-link)  ·  impact 4 · effort L  ·  ✅ shipped v1.16
**Theme:** single source of truth · **Files:** `L10Mail.gs` · **Depends on:** #1 (reconciled tokens/pill colors)

Wrap every `htmlBody` in a minimal document shell (`DOCTYPE` + head + charset + viewport meta)
with a hidden **preheader** span (*"Scorecard 7/9 on track, 2 rocks off track"*), routed through
one shared `l10MailHeader_`/wrapper helper. Rebuild each email on a 600px
`role=presentation` table with `bgcolor` fallbacks and an **MSO conditional** for the gradient
header so Outlook desktop (Stuart's likely client) renders the brand band. Add one
`@media(max-width:480px)` block that stacks the scorecard's Goal/Status, plus a bulletproof
"Open the huddle" footer button. Lead with **movement** — a "vs last week" delta arrow on the
scorecard and a milestone progress bar on rocks.

- **Why corp-grade:** the weekly recap is the **most-seen surface** of this product and the one
  the manager judges it by. `div`-only mail with no preheader, no viewport, and no Outlook
  scaffolding is the clearest internal-tool tell; GitHub/Stripe/Superhuman digests ship table
  scaffolding + MSO conditionals + mobile-first by default.
- **User value:** Stuart — likely on Outlook and on mobile — sees the intended branded recap with
  the week's headline in the inbox preview and trajectory on every metric, instead of a
  flattened, sideways-panning dump.

### 9 · Scorecard health roll-up · always-visible caveats · screen-reader plumbing  ·  impact 4 · effort M  ·  ✅ shipped v1.17
**Theme:** honest data display · **Files:** `L10Js.html`, `L10Css.html` · **Depends on:** #1 (status tokens), #4 (shares inline-caveat pattern)

Add a summary strip atop the Scorecard — *"On track X · Off track Y · Not captured Z"* as
colored count chips (a trivial reduce over the `ruleCheck` data the page already computes) — plus
a one-click **"off track first"** sort and a bolded current week. Replace the hover-only `title=`
caveat icon with a **focus-reachable disclosure** (or always-on muted text, as the email already
does), honoring the team's own *"read the number with its caveat"* house rule. Carry **text/glyph**
status into the grid (▲/▼ or an on/off token, not hue alone); distinguish captured-0 (`—`) from
not-captured (hatched cell); add `role`/`aria-live` to the toast stack and the timer (one-shot at
0:00, never per tick).

- **Why corp-grade:** every corp-grade scorecard leads with the **aggregate health number**
  rather than making humans count red cells, and surfaces data-quality flags as first-class
  visible annotations (Looker/Mode known-issue banners). Use of Color (1.4.1 A), Content on
  Hover/Focus (1.4.13 AA) and Status Messages (4.1.3 AA) are among the most-cited VPAT failures —
  and the email already does the text-pill + inline-caveat right, making the grid a self-inconsistency.
- **User value:** the team opens Scorecard and instantly knows the week's health; nobody calls a
  polluted conversion number "on track" because the warning was one un-hoverable pixel away.

### 10 · Quiet the feedback layer · real timer controls · retire blanket `refresh()`  ·  impact 4 · effort M  ·  ✅ shipped v2.8
**Theme:** trust & reversibility · **Files:** `L10Js.html`, `L10Index.html` · **Depends on:** #3 (shares toast-Undo plumbing)

Drop *"Successfully"* from all **27** toast strings and reserve the green toast for consequential
events (solve+todos, rock auto-DONE, hub send, conclude); let optimistic UI carry high-frequency
flips (vote, on/off-track, todo-done) **silently**. Fix the sync chip to say *"Loading…"* for
reads vs *"Saving…"* for writes (it hard-codes `saving…` even during bootstrap). Give the segment
timer **pause/resume + reset + "segment done"** (tracking paused time so elapsed stays truthful).
Make error revert **surgical** — roll back the single mutated row instead of `refresh()`→`boot(true)`
repainting the app out from under an open editor/IDS. Extract one `armedConfirm()` helper so every
destructive confirm behaves identically.

- **Why corp-grade:** Linear's hallmark is **near-silent success** — a toast per click is the
  signature of a tool that doesn't trust its own optimistic rendering. A timed-meeting product
  whose central timer can't be paused reads as a prototype, and corp-grade SPAs reconcile a single
  record on conflict rather than repainting the whole app and losing your place.
- **User value:** during the rapid scorecard/rock pass the team isn't fighting a stream of green
  popups; the facilitator keeps an honest clock through interruptions; a stray background save
  failure no longer interrupts whoever is mid-edit or mid-IDS.
- **⚠ Jira-safe:** surgical to-do revert must still write `Status` to the sheet (the Jira sync
  reads it server-side on a 10-min trigger, not from the client). See *Don't break the Jira sync* above.

---

## The six cross-cutting themes

Every step above is an instance of one of these. Fixing the **themes** (not the symptoms) is what
moves the tier.

1. **Single source of truth (tokens)** — one canonical token set consumed verbatim by app CSS,
   the guide, and the email builder. *The keystone.*
2. **Component & render layer** — retire the `innerHTML` string-building + 67 inline styles for
   small render helpers and consolidated CSS components. The visual vocabulary exists; the
   encapsulation doesn't.
3. **Accessible interaction baseline** — the floor every procurement audit checks: focus ring,
   keyboard operability, text+glyph status (not color alone), `aria-live`, real dialog semantics,
   4.5:1 contrast on muted text.
4. **In-room / projection mode** — a deliberate present mode so the meeting lives on the shared
   screen, not in the driver's narration.
5. **Trust & reversibility** — undo-on-toast, a confirm before the state-wiping Conclude, draft
   persistence, surgical reconciliation instead of blanket repaint.
6. **Honest data display** — sparklines that show magnitude-vs-goal, always-visible caveats, a
   scorecard health roll-up, trend/delta carried into the exec email.

---

## Honorable mentions (strong, didn't make the 10)

- **Real product mark.** Replace the typed-string "L10" logo with an inline-SVG mark reused across
  app, guide, and email header — cheap every-screen polish.
- **One icon set.** Replace functional emoji (rock/test/delete/info/sync/vote glyphs) with a
  lightweight `currentColor` inline-SVG set matching the Experiment Hub; keep one decorative emoji
  for kudos.
- **IDS dialog semantics.** Give the IDS overlay `role=dialog` + `aria-modal` +
  `aria-labelledby=.ids-title`, a Tab trap, and focus restore — a 508 reviewer reproduces the
  focus leak in 30 seconds.
- **Persistent meeting in the IA.** A sticky-header chip showing current segment + remaining time
  so the clock survives navigating to a reference tab mid-IDS.
- **Content skeletons.** Replace the lone boot spinner with skeletons shaped like the
  tiles/segment-rail/scorecard rows so the room takes shape instead of blank-then-jump.
- **Cheap VPAT line items.** Add a skip link, `nav aria-label`, and `aria-current=page` on the
  active nav button (active state is color-only today).
- **Persist the Solve draft** on incidental Esc/backdrop close — notes autosave, but the
  hardest-won resolution wording is silently dropped.
- **`ResizeObserver` on `.ms-tl`** instead of the global window-resize listener, so the to-scale
  rock timeline relays out when the Sheets embed width changes (the one real correctness bug).
- **Mirror the gold kudos card in the email** Headlines section (the kudos-detection regex already
  exists) so shout-outs land with the same warmth in the recap.
- **Surface the Jira link in-app** (new — from the 2026-06-30 sync). A to-do that's been pushed to
  Jira now carries a `Jira Key` (e.g. `BNADM-398`) in its row, but the app shows nothing — the sync
  is invisible except for a toast and the sheet columns. Render a small `BNADM-398 ↗` chip on synced
  to-dos (links to `https://bradyagile.atlassian.net/browse/<key>`), and a muted "syncing…" state for
  an OPEN to-do with no key yet, so the team sees in the room that a commitment is tracked on the board.

---

## Suggested sequencing

```
Wave 1 (foundation + cheap wins) ✅ shipped v1.14   #1 tokens → #2 focus/keyboard → #3 undo/confirm
Wave 2 (the system + the room)   ✅ v1.15 + v2.8    #5 token scales (v1.15) + render-helper/pill refactor (v2.8) + #4 present mode + #6 sparklines
Wave 3 (the edges + the exec surface) ✅            #8 email v1.16 · #9 scorecard roll-up/a11y v1.17 · #7 guide/empty + #10 feedback/timer v2.8
Post-roadmap (v2.8): IDS dialog semantics + focus restore · .ms-tl ResizeObserver · skeletons · skip link
```

`#1` gates the visual/email work; `#5` gates consistent restyling; `#2` and `#3` are independent
and should ride along early for credibility. Everything in Wave 3 reads cleaner once the tokens and
component layer exist.

---

*Method: structured multi-lens design review of `apps-script/L10Css.html`, `L10Index.html`,
`L10Js.html`, `L10Guide.html`, and the `L10Mail.gs` HTML builders, against the polish bar of
best-in-class SaaS. 78 grounded findings were scored and de-duplicated into the ranked 10 above.
Every cited count was read from the code; re-confirm against your current paste before acting.*

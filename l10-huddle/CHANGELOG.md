# L10 Huddle — changelog & current state

Version history for the L10 Huddle app. Newest first. For current state, read
[`README.md`](./README.md) plus the newest version entry below. (The old
"Current state & open threads" block mid-file is a 2026-06-12 snapshot superseded
by the v2.0 rebase — historical only, don't plan from it.)

**Versions:** **v2.9.1 (2026-07-28)** · v2.9 (2026-07-28) · v2.8.1 (2026-07-28) · v2.8 (2026-07-28) · v2.7.3 (2026-07-27) · v2.7.2 (2026-07-27) · v2.7.1 (2026-07-27) · v2.7 (2026-07-27) · v2.6 (2026-07-20) · v2.5 (2026-07-20) · v2.4 (2026-07-20) · v2.3 (2026-07-15) · v2.2.1 (2026-07-10) · v2.2 (2026-07-10) · v2.1 (2026-07-10) · v2.0 (2026-07-10) · v1.22.1 (2026-07-09) · v1.22 (2026-07-09) · v1.21 (2026-07-08) · v1.20.2 (2026-07-02) · v1.20.1 (2026-07-02) · v1.20 (2026-07-02) · v1.19 (2026-07-01) · v1.18 (2026-06-30) · v1.17 (2026-06-30) · v1.16 (2026-06-30) · v1.15 (2026-06-30) · v1.14 (2026-06-30) · v1.13 (2026-06-25) · v1.12 (2026-06-25) · v1.11 (2026-06-24) · v1.10 (2026-06-16) · v1.9 (2026-06-16) · v1.8 (2026-06-15) · v1.7 (2026-06-15) · v1.6 (2026-06-12, evening) · v1.5 (2026-06-12, evening) · v1.4 (2026-06-12, evening) · v1.3 (2026-06-12, evening) · v1.2 (2026-06-12, later) · v1.1 (2026-06-12)

## v2.9.1 (2026-07-28) — Jira assignee regression fixed + retro-assign pass

Alex spotted the whole BNADM board reading **Unassigned** (BNADM-479–492+, the
Jul 28 ~7:52 AM burst). Root cause: the **v2.0 rebase regenerated `L10Jira.gs`
without the 2026-06-30 roster fallback** — `l10JiraTeamEmails_` read only
`L10_Config!TEAM_EMAILS` (blank by design), so owner→accountId resolution
returned nothing and every issue created since the v2.0 re-paste synced
unassigned. The v2.7 open-predicate change (OPEN/WORKING/BLOCKED all sync)
then pushed the whole started/blocked backlog to the board in one burst, which
made the quiet regression loud. `JIRA-SYNC.md` described the fallback the whole
time — doc drifted from code, not the reverse.

- **`L10Jira.gs`:** `l10JiraTeamEmails_` falls back to `L10_MAIL_TEAM_DEFAULT`
  again (guarded `typeof` check, warning comment so the next rebase keeps it).
- **New one-shot retro pass** (the old "optional upgrade (b)"): **Jira → Assign
  owners on existing issues** (`l10JiraBackfillAssignees` +
  `l10MenuJiraBackfillAssignees`) — assigns every open to-do's keyed issue from
  its Owner column; **never overwrites** an existing assignee, skips
  DONE/DROPPED rows, reports unresolvable owners, script-lock guarded,
  re-runnable.
- **`L10Setup.gs`:** the menu item + corrected `JIRA_USER_MAP` config
  description (it claimed blank = unassigned unless `TEAM_EMAILS` set).
- Verified by a 19-assertion stub harness (fallback precedence, create-payload
  assignee, backfill skip/overwrite/unresolved paths, end-to-end sync create).
- **Re-paste:** `L10Jira.gs` + `L10Setup.gs`, reload, run the new menu item
  once. No web-app redeploy.

## v2.9 (2026-07-28) — the scorecard checks its sources (data health)

The knowledge base's number landmines become an automated gate. A BigQuery view
in the sanctioned dataset scores every upstream source the scorecard depends on;
the app reads it and warns the room BEFORE a number gets read aloud. This is the
layer that makes the false −58% leads scare (a silently stale
`al_leads_lifecycle_v1`) structurally unrepeatable.

**Warehouse side — [`sql/l10-data-health.sql`](./sql/l10-data-health.sql), paste once in BQ console:**
- `v_l10_data_health` (in `mktg_alex_langton_paid_media`, the only write-allowed
  dataset): one row per source with FRESH/LAG/STALE/BROKEN computed in SQL —
  the spend mart (≤2-day lag), leads lifecycle **gated against the spend clock**
  (≤8 days behind, the deep dive's rule), the two A/S revenue tables
  (`Combined_order_items`, `aa_global_orders` — a lag there makes A/S read HIGH),
  both `mktg_amazon` tables, a hard-coded BROKEN row for `SF_AllOpportunites_view`
  (frozen 2024-05-24), and a reminder row for the `mktg_temporary` leads-source
  expiry (2026-08-13). Thresholds live in the view, so tuning is a SQL edit.
- Section 3 of the pack: the preserve-gap check to run until the expiry date
  (deliberately NOT in the view — a view referencing `mktg_temporary` would
  break when the table dies).

**App side — new optional [`apps-script/L10Health.gs`](./apps-script/L10Health.gs) (GA4-connector contract):**
- `l10_dataHealth()` reads the view via the BigQuery advanced service (already
  enabled — Revenue Pull uses it), cached ~30 min, plus the one check a static
  view can't do: **is the spend mart's Amazon block SP+SB or still SP-only?**
  (mart spend on `Brady-Amazon|US|*` vs `mktg_amazon` cost over 14 complete
  days, cost columns discovered via INFORMATION_SCHEMA — drift degrades to
  UNKNOWN, never a wrong verdict). Every failure path returns a value; health
  can never block a boot, a capture, or the huddle.
- **Scorecard strip**: all-fresh collapses to one quiet "✓ Data sources fresh"
  chip; anything STALE/BROKEN shows red chips naming the source and its
  data-through date. Fetched after boot, outside the boot barrier; never
  repaints a live meeting segment.
- **Per-metric flags** via `HEALTH_MAP` in `L10_Config` (seeded:
  SC-007→leads, SC-011/12→spend+revenue tables, SC-015→Amazon set): a mapped
  metric whose source is sick carries a ⛔ "source stale" pill and an
  always-visible "do not read this number as current" line — in the grid AND
  in the capture row, per the read-the-number-with-its-caveat house rule.
- Menu: **L10 Huddle → Data health check** (force-refresh + full detail).

**Deploy:** (1) run section 1 of `sql/l10-data-health.sql` in the BigQuery
console, verify with section 2; (2) add file `L10Health.gs` and re-paste
`L10Setup.gs`, `L10Code.gs`-untouched, `L10Js.html`, `L10Css.html`;
(3) **Setup / repair tabs** once (seeds `DATA_HEALTH` + `HEALTH_MAP`);
(4) redeploy the web app (New version). Blank/OFF config or a missing
BigQuery service = the feature is silently absent, nothing else changes.

**✅ Deployed + verified live 2026-07-27 22:34** (Alex ran L10 Huddle → Data
health check): safe-rank ordering correct (BROKEN → LAG → 8× FRESH), rebuilt
leads table reads FRESH through 2026-07-27, and the Amazon-block probe returned
its first real verdict — **mart carries 100% of SP+SB cost over the last 14
complete days**, i.e. the ops-side SB fix is applied (recorded in
`reference/mtd-spend-pull-amazon-fix.md`). Known follow-up for v2.9.1: the
seeded `HEALTH_MAP` maps `leads_lifecycle` to SC-007 on the strength of a
stale v1-era note — current SC-007 is the negatives-$-saved metric, so the
leads flag needs a real leads row (or no row) to point at.

## v2.8.1 (2026-07-28) — defects found by the adversarial review of v2.8

v2.8 merged before its review pass finished; the pass (6 lenses → refute-by-default
Opus verifiers, capped at the top 5 findings per lens) came back with 21 findings,
2 refuted, and **8 unique real defects** after cross-lens dedup — all in v2.8's own
code, all fixed here before the workbook paste. The two highs are both **cascade
lessons**: replacing an inline style with a single class trades a specificity of
infinity for (0,1,0), and every fight the old inline style used to win silently
becomes a loss.

- **🟠 Every form flattened to equal-width columns.** The new `.f-2/.f-3/.f-fix/.f-160/
  .f-170` width utilities lose to the pre-existing `.row > .field { flex: 1 }` at
  (0,2,0) — so the composer's text input, the IDS solve fields, the capture-week
  select and every other converted form ignored their widths. Compound
  `.row > .field.f-*` rules now carry them.
- **🟠 The skip link navigated the whole page away.** It inherited the page's
  `<base target="_top">`, so the control added *for* keyboard users would navigate
  the top window (in the Sheets modal: the whole spreadsheet tab) and destroy the
  running meeting's client state. `target="_self"` + `tabindex="-1"` on `#l10-main`.
  Invisible in the harness — it runs the page standalone, where `_top` is harmless.
- **🟡 A failed ✓ done write stranded the reverted row in the wrong card.** The
  surgical revert spliced in place wherever the row's node was — after a DONE flip
  that's inside "Done this week", so an OPEN row sat under the done card with the
  completion tile stale. The revert now does the full list pass whenever it crosses
  the open/done boundary, same rule as `setTodoStatus_` itself.
- **🟡 The Tab trap locked keyboard users out of the guide it wraps.** The focusable
  set omitted `iframe`, so in the guide dialog Close was first === last and Tab
  never reached the content. `iframe` joins the set.
- Also: the guide overlay was missing from `overlayOpen_` (the 3-minute staleness
  refetch could repaint the app under the open dialog and break focus restore);
  `.guide-card`'s 1040px lost to the later `.ids-card` 780px (now compound); the
  Open-issues empty state carried the parked-list copy (paste-slip); and the
  utility layer (`.m-0`, `.is-static`, spacing) moved to the END of the stylesheet
  where a utility layer belongs, fixing the scheduler tz label's margin and the
  Settings roster chips' pointer cursor.

The harness now asserts the failure modes directly: computed `flex-grow` on the
composer field, the skip link's `target`, Tab-from-Close landing on the iframe,
`.guide-card`'s computed max-width, and the roster chips' cursor.

**Files:** `L10Js.html`, `L10Css.html`, `L10Index.html`, `harness/run.js`.
**Deploy:** included in the v2.8 re-paste below (paste v2.8.1's files, not v2.8's).

## v2.8 (2026-07-28) — the design roadmap closes at 10/10

The 2026-06-30 corporation-grade review left three items open; this release ships all
three plus the honorable mentions that mattered, so **the roadmap is complete** (see
`DESIGN-ROADMAP.md` — every item now carries a shipped mark). Verified throughout in
headless Chromium against a fixture harness (now committed at [`harness/`](./harness/) —
see below), then adversarially reviewed before merge.

**#5 — the deferred component/render refactor, finally.** The half judged "too risky to
do blind on a live tool" in v1.15, done with the harness watching:
- **Inline styles 176 → 17.** Every static `style="…"` became a component class or a
  4px-grid spacing utility defined once in `L10Css` (`.field--tight`/`.f-*`,
  `.row--mid/--end/--follow`, `.mt-*/.mb-*`, `.ck-lbl`, `.h3-sub`, `.sum-lbl`,
  `.cap-in`, `.suggest-box` — retiring the issue form's hard-coded colors — `.set-block`,
  and an element-agnostic `.btn` so link-buttons stop hand-rolling their own). The 17
  survivors are legitimately dynamic (timeline/calendar positional math, per-person
  avatar colors, sparkline status color) or JS display-state contracts. Off-grid
  margins (6/10/14px) snapped to the 4px scale.
- **One `.pill` base.** The ~16 hand-rolled chip species (`.chip .tag .pill-status
  .sc-chip .sc-sortbtn .who-chip .fchip .vote-chip .td-group-n .ms-count .srcref .snip
  .person-chip .hdr-schedule .today-btn`) now alias a single base rule defined first in
  the sheet; each family keeps only its genuine delta. New code uses `.pill` +
  tone/size/`--btn` modifiers directly. To-dos and Scorecard verified pixel-identical.
- **Render helpers.** `attrs_` (escaped, always double-quoted — `esc()` deliberately
  skips single quotes), `btnH_`, `pillH_`, `fieldH_`, `cardH_`; adopted across the
  row-action family (the markup that renders dozens of times per paint). One-shot
  builders keep template form deliberately.

**#7 — the guide comes indoors + a real first run.** A **?** in the nav opens the
new-member guide in-app (new `l10_getGuideHtml` serves the standalone document into an
iframe so its styles never fight the app's; missing-file safe). Until the first huddle
concludes, the start screen leads with a **"Set up your huddle" checklist** — metrics,
rocks, guide — whose ticks derive from the data, so it retires itself. Bare empty
states ("Empty list.") replaced with action-oriented copy.

**#10 — the feedback layer grows up.**
- All 20 "Successfully …" toasts reworded to the outcome itself; votes and state-picker
  flips are silent — the ▲ count and the row's state tag are the confirmation.
  Undo-toasts stay: they're an affordance, not celebration.
- The sync chip distinguishes **Loading…** (reads in flight) from **Saving…** (a write
  in flight) instead of hard-coding "saving…" during boot.
- The segment timer gains **↺ reset** beside pause/resume; one **`armedConfirm()`**
  helper now runs every two-click confirm (Conclude with its pre-flight summary, both
  discards, milestone delete) identically.
- **Surgical error reverts:** `serverSync` accepts a one-row rollback, supplied for
  to-do status flips (snapshot taken BEFORE the optimistic mutation — argument
  evaluation order matters), rock status, due moves, cascade, headline kill/revive and
  votes — a background failure no longer `refresh()`-repaints the app out from under an
  open editor or IDS card. Paths without a safe row rollback keep the atomic fallback.

**Post-roadmap a11y/correctness:** every overlay card carries `role=dialog` +
`aria-modal` + `aria-labelledby` with one shared Tab trap and focus-restore-to-opener;
the rock timeline gets a **ResizeObserver** (the Sheets embed resizes without a window
resize — the review's "one real correctness bug"); loading **skeletons** replace the
lone spinner; a **skip link**, `nav aria-label`, and `aria-current="page"` land.

**The harness is now part of the repo** ([`harness/`](./harness/README.md)): v2.7.2
built one and threw it away; this one assembles the real three files, stubs
`google.script.run` with four-slice fixtures, and fails on any console/page error —
it caught a real crash during this build (the nav page-delegate hitting the new ?
button). Run it before pasting any front-end change.

**Files:** `L10Js.html`, `L10Css.html`, `L10Index.html` (skip link, nav ?, sync chip),
`L10Code.gs` (`l10_getGuideHtml` only). **No tab or schema change; no server API
changed.** **Deploy:** re-paste those four files → redeploy web app (New version).
Setup / repair tabs not needed.

## v2.7.3 (2026-07-27) — defects found by an adversarial review of v2.7

A 13-agent review of the v2.7 diff across five lenses (KPI integrity, client runtime,
Apps Script server, integration regressions, docs accuracy), each finding then handed to a
refute-by-default verifier. 15 raw findings → 6 confirmed, 2 refuted. Everything below is
a defect **in already-merged code**, fixed before the workbook paste.

> **Method note, recorded because it nearly cost us the worst bug:** the review script
> ranked findings with `rank[severity] || 9` — and `critical` maps to `0`, which is falsy,
> so **all three critical findings sorted last and fell outside the verify cap.** They were
> confirmed by hand instead. A severity ladder whose top rung is `0` must never be read
> through `||`.

**🔴 Critical — bulk actions wrote rows the user never selected.** The bulk bar counted
`shown` (filter-passing rows) but `runTodoBulk_` acted on `Object.keys(state.todoSel)` —
the whole selection, including rows the active filter was hiding. Tick five, filter to
Overdue, read *"2 selected"*, click Done → **five** to-dos completed, three of them
invisibly, each posting to the team chat and moving the completion metric. Count and action
now come from one function (`todoSelectedVisible_`), and narrowing the filter prunes the
selection (`pruneHiddenSelection_`) so nothing stays armed off-screen. Regression-tested in
headless Chromium: 5 selected → filter → bar 1, writes 1, state 1.

**🟠 High — `＋ Steps` and the stale-nudge links were dead in the huddle and on 1:1s.**
`[data-tddrawer]` and `[data-tdpromote]` were bound in `wireTodoControls`, which only
`renderTodos()` and `spliceTodoRow_()` ever call. A to-do row renders on **four** surfaces.
So in the room, clicking `＋ Steps` did nothing, and *"carried 3 weeks — make it a rock"*
did nothing at the exact moment the huddle was looking at it. Moved into `wireShared`,
which every surface calls exactly once per scope.

**🟠 High — deleting an already-done sub-step silently completed the parent.**
`l10_deleteTodoStep` rolled up whenever the *remainder* was all-DONE, so tidying away a
finished step closed the whole to-do — chat ping, weekly respawn, two-sided swing in the
completion metric, and worst case it re-closed a to-do somebody had deliberately reopened.
Now gated on the deleted step having been OPEN.

**🟡 The carry sweep claimed weeks it never swept.** `l10SweepCarriesIfDue_` stamped
`L10_CARRY_SWEPT_WEEK` even when `l10SweepCarries_` had bailed for missing columns — so on
an un-repaired workbook the first boot burned the week, and **running Setup / repair tabs
afterwards would have had no visible effect until the next Monday.** That is the upgrade
path every workbook takes. The sweep now returns `null` for "couldn't run" (distinct from
`0` for "nothing to do") and only a real run claims the week.

**🟡 Undo destroyed a blocked to-do's reason.** `Blocked On` was overwritten with `''`
whenever BLOCKED was set without a reason — and Undo and the bulk endpoint both call
through with no options. Re-entering BLOCKED with nothing supplied now keeps the existing
text.

**🟡 The activity trail couldn't order same-day entries.** `l10Now_` writes
`yyyy-MM-dd HH:mm`, but Sheets hands those cells back as `Date`s and `l10Sanitize_`
formats every `Date` as date-only — so the newest-first sort saw every entry from one day
as equal. The log tab keeps its time in the boot payload now.

**Also:** bulk date-push writes a trail entry like the single-row move did; the CHANGELOG's
trail claim is corrected (the generic inline edit row writes `Due` without one); a search
keystroke no longer wipes a half-typed to-do out of the composer (`todoCompose` now carries
`text`/`notes` through re-renders).

**Refuted, correctly:** that *"skipping the repair step is safe"* was still false (v2.7.1's
banner already fixed it), and that room mode leaks the new view state (it clears the
filters and selection it owns).

**Files:** `L10Js.html`, `L10Code.gs`, `CHANGELOG.md`. No schema or tab change.
**Deploy:** re-paste those two script files.

## v2.7.2 (2026-07-27) — strip the To-dos page back to the list

Alex, on the stat tiles: *"this is kind of useless and takes up space. I never look at
it."* Correct — a passive number row above a working list is chrome that never earns its
height. Removed, plus a pass over everything it was crowding.

**A rendering harness, finally.** There's no Apps Script runtime here, so this pass was
done by assembling `L10Index/Css/Js` into a standalone page with a stubbed
`google.script.run`, rendering it in headless Chromium, and *looking at it*. Four defects
below were invisible in source review and obvious on sight. Worth rebuilding for any
future front-end change (`scripts/build-preview.py` pattern: fixtures shaped like the four
boot slices, then screenshot `#page-todos`).

**Removed**
- **The four stat tiles** (still owed · % done · blocked · carried over). The ≥90% number
  still lives where it's actually read: the huddle's To-do segment and the Scorecard. The
  page keeps its one-line subtitle. `todoTilesHtml_`/`refreshTodoTiles_` deleted.
- **The per-row owner name.** The page groups *by owner* and every row underneath repeated
  the same name and avatar — pure noise under a header that already said it. `todoLine`
  takes an options object now (`{selectable, hideOwner}`) instead of a growing tail of
  positional booleans.
- **The permanent checkbox column.** A checkbox at the left of a to-do means "complete
  this" to everyone alive; here it meant "select for bulk" and sat next to a separate
  ✓ done button. Bulk select is now a **mode** (`☑ Select` in the filter bar) — off by
  default, so rows carry no checkbox and the ambiguity is gone.

**Quieter**
- **Composer collapses to one line** until focused (it was four stacked rows plus two
  lines of help prose, permanently expanded). Sticky once opened — collapsing on blur
  would eat the first owner-chip click.
- **Secondary row actions** (state · snooze · edit · schedule · drop) sit in `.td-acts`,
  transparent at rest, revealed on hover or `:focus-within`. They keep their layout space,
  so nothing jumps, and they stay in the tab order throughout. Only `＋ Steps` and
  `✓ done` are permanently lit.
- **`✓ done` is ghost, not solid.** A filled accent button is right when there's one on
  screen; repeated down every row it stops reading as emphasis and just becomes weight. It
  fills in on hover. `＋ Steps` went neutral so only one control on the row carries blue.
- **Denser rows and a quieter group header** — the owner label is a small muted divider
  with the count as a pill beside the name, not a headline with a number flung to the far
  edge.
- **The stale nudge is one line** — it was a full sentence plus two buttons, wrapping onto
  three lines, which made the stalest row the loudest thing on the page.

**Two bugs the render caught**
- **The whole page scrolled sideways on a phone.** `header .chips` is a flex row with no
  `flex-wrap` and individually `nowrap` chips, so they ran past the viewport
  (scrollWidth 647px at a 390px viewport). **Pre-existing — not from v2.7** — but it
  defeated the phone breakpoint, so it's fixed here.
- **A dead band on every mobile row.** `.td-acts` at `opacity: 0` still reserves its
  layout row, and the hover that reveals it doesn't exist on touch. Forced visible at
  ≤640px. (Trade-off kept deliberately: that means seven buttons over two lines per row on
  a phone. Better than a control hidden behind a gesture the device can't make.)

**Files:** `L10Js.html`, `L10Css.html`. No server, schema or tab change. **Deploy:**
re-paste those two.

## v2.7.1 (2026-07-27) — the sub-steps nobody could find

Same-day fix after Alex opened v2.7 on the live workbook and asked *"where's the sub
tasks?"* — two separate failures, both ours.

**1. The control was a glyph.** Sub-steps hid behind a bare `☰` sitting third in a
seven-button row cluster. That is not a control anyone discovers. It now reads
**`＋ Steps`** when a to-do has none — the only state in which someone is hunting for the
feature and hasn't found it — and gives way to **`☑ 2/5`** once steps exist, with `💬 n`
for notes. Extracted to `drawerBtnHtml_` with a real `aria-label`. (Bonus non-cause worth
knowing: in Alex's screenshot the row was in **edit mode**, which swaps the whole action
cluster for the edit form — so the button genuinely wasn't on screen.)

**2. An un-repaired workbook failed silently.** v2.7 degraded "gracefully" when
**Setup / repair tabs** hadn't been run: the two new tabs read as zero rows, so steps and
notes looked *empty* rather than *not set up*, a blocked to-do dropped its "waiting on"
text, and the carry sweep no-opped. Graceful to the code, indistinguishable from broken to
the user. `l10BootWork_` now returns **`todoTabsReady`** (both tabs present **and** both
new `L10_Todos` columns present), and the To-dos page shows a plain banner naming the one
menu item that fixes it. The drawer shows the same thing instead of an inviting-but-doomed
input.

Diagnostic that gave it away: the *"carried over ≥1 week"* tile still read **1** when four
open to-dos were past due — the sweep can't advance without its column, so the tile is a
reliable tell that the repair step is outstanding.

**Files:** `L10Js.html` (`drawerBtnHtml_`, drawer + page banners) · `L10Code.gs`
(`todoTabsReady` in the boot payload). **Deploy:** re-paste those two files. No tab or
schema change in this version — and if the v2.7 repair step is still outstanding, the app
now tells you so instead of looking broken.

## v2.7 (2026-07-27) — the To-dos surface becomes a daily work app

Alex, 2026-07-27: *"my team is spending 90% of their time in the to-do's section."* That
surface was built as a **5-minute meeting segment** — `segTodos()` reads "done or not
done" off a shared screen once a week — with the standalone page as a thin reuse of the
same row renderer. Every decision on it optimized for the room (fixed owner grouping, no
filtering by principle, read-aloud density, the write form parked below the list) and
none of it for one analyst at their desk on a Wednesday. This version closes that gap
without changing what the room sees.

**The governing constraint:** the app deliberately never filters lists — `lensOwnerOrder_`
only *reorders*, so the projected view is identical for everyone. That rule is kept, not
broken: the new controls are **transient** (in memory only — never the sheet, never
localStorage), the **huddle segment never consults them**, and `applyPresent_` **wipes them
on the way into room mode**, with a CSS rule hiding them there as belt and braces. The
shared screen is unfiltered by construction, not by discipline.

**Defects found and fixed (these were costing time every day):**
- **Every to-do action rebuilt six pages.** `setTodoStatus_` called `rerenderLists()`,
  which re-renders segment + rocks + headlines + todos + issues + 1:1s via `innerHTML` —
  destroying keyboard focus, reflowing the list under the pointer, and discarding any
  half-typed inline edit elsewhere. New `spliceTodoRow_` repaints **one row**; the full
  pass now runs only when a row actually leaves its list.
- **`Carried Over` only incremented inside `l10_concludeMeeting`.** A week where nobody
  pressed Conclude never advanced it, so the staleness signal the page leans on silently
  under-reported — it was a conclude-count, not a week-count. Replaced by an idempotent
  weekly sweep (`l10SweepCarries_`, stamped in the new `Last Carried Week` column, guarded
  to once per week per workbook by `l10SweepCarriesIfDue_`).
- **The boot payload shipped every to-do ever written** (headlines had a 21-day cutoff,
  to-dos had none). Still-owed to-dos always load whatever their age; finished ones load
  for `TODO_KEEP_DAYS` (default 60).
- **The composer had no keyboard path at all** — a click handler only — and re-rendered
  itself away after every add, clearing the owner chips you had just tapped.

**New — work states.** `TODO_STATUSES` gains **WORKING** and **BLOCKED** (+ a `Blocked On`
column). A to-do someone started Monday no longer looks identical to one nobody has
opened, and BLOCKED posts to the team chat — the one non-terminal state worth interrupting
for, since it means someone else has to move first. WORKING stays silent (a ping per
started task is noise).

> ⚠ **The ≥90% metric definition does NOT change.** WORKING and BLOCKED count exactly as
> OPEN did (done ÷ (done + still-owed-and-due)); only the status vocabulary widens. This is
> enforced by a single predicate on each side — `l10TodoOpen_` (server) / `todoOpen_`
> (client) — replacing every bare `Status === 'OPEN'` test. **Dropping those rows from the
> denominator would have silently inflated the team's score**, so the two twins
> (`weekTodos_` and `l10_concludeMeeting`) must always change together.

> ⚠ **Jira-safe.** `L10Jira.gs` created a ticket only when `status === 'OPEN'`, which would
> have left every started or blocked to-do off the board entirely. Its create test now uses
> the open set. The DONE transition and the `Jira Key` idempotency are untouched.

**New — everything else on the page:**
| | |
|---|---|
| **Search + filters** | One bar under the tiles: free text (matches to-do, notes, owner, ID, blocker; multiple words narrow) plus **Mine · Overdue · Next 7 days**. Shows "showing N of M" whenever a filter is live, so a filtered list can never be mistaken for an empty one. `/` focuses it. |
| **Composer moved to the top** | It sat below every owner card — i.e. below an unbounded list. Enter submits; owner, due date and ↻ persist across adds (`state.todoCompose`), so a burst of to-dos for one person is text + Enter, text + Enter. `n` focuses it. |
| **Snooze** | `+1d / +7d / next Monday / pick a date` from the row. Rescheduling is the most common between-huddle action and used to require opening the full edit row. Writes through a new date-only `l10_setTodoDue` — deliberately *not* `l10_editTodo`, which rewrites text and owner from its payload. |
| **Bulk actions** | Tick rows → done · working · +7 days · drop. One request, one toast, one Undo — and Undo restores each row's **own** prior status, so a mixed selection doesn't come back uniformly OPEN. |
| **Sub-steps** | New `L10_Todo_Steps` tab, mirroring `L10_Rock_Milestones` exactly — same parent/child shape, same roll-up: the last step to close carries the to-do DONE (routed through `l10_setTodoStatus`, so the chat ping and the weekly respawn fire as they would on a manual completion). |
| **Activity trail** | New append-only `L10_Todo_Log` tab. Status changes and date moves made from the to-do's own controls log themselves; anyone can add a progress note. (The inline **edit** row writes `Due` without a trail entry — it's the generic multi-field editor, not a to-do-specific action.) The story of a multi-day to-do stops living in Google Chat. |
| **Stale to-dos get re-filed, not nagged** | At `TODO_STALE_CARRIES` (default 3) the row is flagged with one line — *"carried N weeks — that usually means this isn't a to-do"* — and two doors: **make it a rock** or **take it to IDS**. EOS-correct and blame-free: a 7-day commitment that survives three weeks is misclassified work. |
| **Duplicate warning on add** | Opt-in per call site (`checkDupe`): the composer and quick-add ask, the machine-driven paths (IDS solve, weekly respawn, "bring the data") never do — a prompt there would stall a save mid-huddle. Warns with "Add anyway", never blocks; scoped to the same owner, since two people running the same play on different accounts is normal here. |
| **Phone** | `.itemline` was a rigid flex row (fixed 110px owner column + up to seven buttons) with no breakpoint below 900px. It stacks at 640px now, with real tap targets. |

**Still team-level, still no per-person score.** The PIP-sensitivity decision stands — the
completion % is collective, and nothing added here reports on an individual.

**Files:** `L10Setup.gs` (statuses, `Blocked On` + `Last Carried Week`, two new tabs,
validations, colors, two config rows) · `L10Code.gs` (the open-set predicate, sweep, steps,
trail, bulk, date-only write, dupe check, boot cutoff) · `L10Js.html` (splice, filters,
composer, snooze, bulk, drawer, popovers, hotkeys) · `L10Css.html` (the new components +
the phone breakpoint; also fixes `.itemline .m`'s hardcoded `12px` → `var(--text-3)`,
a straggler from design-roadmap item #1) · `L10Jira.gs` (open-set create test) ·
`L10Mail.gs` (four to-do filters that would have dropped WORKING/BLOCKED from the heads-up,
recap and 1:1 packs; WORKING/BLOCKED now show as text badges in the recap).

**Deploy (one-time, in this order):**
1. **Re-paste all six files** into the workbook's shared script project.
2. Run **L10 Huddle → Setup / repair tabs** once. It appends `Blocked On` and
   `Last Carried Week` to the end of `L10_Todos` (append-only — existing rows untouched),
   creates `L10_Todo_Steps` and `L10_Todo_Log`, re-applies the status dropdown with the two
   new values, and seeds `TODO_KEEP_DAYS` / `TODO_STALE_CARRIES`.
3. **Redeploy the web app → New version** (the boot payload changed shape).
4. **Smoke test on one scratch to-do:** mark it **working** — the row must update *in
   place* with the list not jumping, and the completion tile must not move. Confirm the
   Jira ticket still gets created. Then complete it — the tile moves, and Undo restores it.

**Skipping step 2 is safe but the new features are simply absent:** every new tab reads as
zero rows and the sweep no-ops rather than half-counting.

### Data safety — verified against the live workbook (2026-07-27)

Alex asked whether the existing to-dos, scorecard history etc. survive. Checked against an
export of the live *Paid Media Team | Hub* workbook, not against the code's assumptions:

- **`L10_Todos` (80 rows) — safe.** Its live headers are *exactly* the 13 the code expects,
  in order, and columns **N and O are empty across all 80 rows** — which is where
  `Blocked On` and `Last Carried Week` land. `l10Setup` only rewrites the header row, so the
  append writes two labels into two blank columns. Status values (53 DONE / 10 DROPPED /
  17 OPEN) all stay valid: the new dropdown is a superset, and it allows invalid entries
  anyway. The 17 rows carrying a `Jira Key` keep it — the sync's idempotency column isn't
  touched, and the create test only *widens*.
- **Nothing else is written by this change.** `L10_Scorecard` (15 metrics),
  `L10_Scorecard_Data` (**74 captured weekly values — the whole 13-week trend history**),
  `L10_Rocks` (6), `L10_Rock_Milestones` (18), `L10_Issues` (38), `L10_Headlines` (12),
  `L10_Meetings` (**20 concluded huddles — the completion-% history**), `L10_Events` (7),
  `L10_Playbook` (5), `L10_Notify` (4): no code path here writes to any of them.
- **`L10_Config` (36 keys) — additive only.** `l10SeedConfig_` appends a default *only when
  the key is absent*, so every customized value (TEAM, SEGMENTS, webhook, Jira, calendar,
  fiscal) is left alone. Exactly two rows are added: `TODO_KEEP_DAYS`, `TODO_STALE_CARRIES`.
- **The two new tabs don't collide** — no `L10_Todo_Steps` or `L10_Todo_Log` exists among
  the workbook's 68 tabs.
- **Two intentional changes to existing rows, both small and both expected:**
  1. The first boot's carry sweep adds **+1 to `Carried Over` on the 4 open, past-due
     to-dos**. That *is* the fix — three of those four currently read `carried = 0` despite
     being days overdue, which is the conclude-only bug showing up in live data.
  2. `TODO_KEEP_DAYS = 60` limits what the **app loads**, never what the **sheet stores** —
     no row is ever deleted. As of this export **0 finished to-dos fall outside the
     window**, so nothing disappears from any view today.
- **Cosmetic, pre-existing:** `l10StatusColors_` *pushes* conditional-format rules, so
  re-running Setup adds a duplicate set. Same colours, no data effect.

## v2.6 (2026-07-20) — Scorecard metrics regrouped by family (Sort order)

The 13-week scorecard now groups its rows by metric family instead of the chronological
order they were added in, so like sits next to like when the room reads the grid:
**budget utilization → A/S % → NB negatives → experiments**. Requested by Alex
(2026-07-20): *"grouped in an order that makes more sense from a continuity standpoint —
negatives all next to each other, A/S all next to each other."*

- **Why it drifted:** each row took the next free `Sort` number the week it was added, so
  the families interleaved — Brady negatives at Sort 6–7 but Seton/Emedco's at 13–14, and
  A/S split across 11–12 (Brady/Seton) and 15 (Amazon).
- **New order** (the `Sort` column is what every render sorts by — the tab's physical row
  order is irrelevant): **1–5** utilization (Brady · Seton/Emedco · PDC · Amazon ·
  Awareness) · **6–8** A/S (Brady · Seton/Emedco · Amazon) · **9–12** negatives (Brady
  added/$ saved · Seton/Emedco added/$ saved) · **13–15** experiments (hub · Brady ·
  Seton/Emedco).
- **One source of truth:** a new `L10_SCORECARD_ORDER` map holds the canonical Sort; both
  seed arrays (`l10SeedScorecard_` and `L10_SCORECARD_MANAGED`) read their Sort from it, so
  a fresh install and a repaired install can't drift apart.
- **Existing scorecards renumber in place:** a new idempotent `l10ReorderScorecardRows_`
  (called from `l10Setup`) rewrites the `Sort` column of the 15 known rows to the canonical
  values — only when they differ, and it never touches team-added custom metrics or their
  Sort. No metrics, goals, owners, source refs, or captured history change; only display order.

**Deploy:** re-paste `L10Setup.gs` → **L10 Huddle → Setup / repair tabs** once (renumbers
the `Sort` column). No web-app redeploy needed — no HTML or server-boot changes, and the
client already renders in `Sort` order.

## v2.5 (2026-07-20) — Amazon A/S (SC-015) now auto-pulled from BigQuery

Follow-up to v2.4 the same day (Alex: *"why is this manual — we pull the non-halo revenue in the
deep dive"*). **SC-015's source cell `K10` is unchanged**, but the number feeding it is now
**auto-pulled**, not hand-entered:

- The Financial Dashboard's Amazon A/S (`K10`) now divides MTD Amazon spend by the
  **advertised-only** Amazon sales that `RevenuePull.gs` pulls from BigQuery (`mktg_amazon`,
  SP `is_advertised` same-SKU + SB — same logic as the paid monthly deep dive). No more Manual
  Inputs tab (Financial Dashboard **v3.11**).
- **SC-015 itself did not change** (still `RANGE` → `Financial Dashboard v2!K10`, goal <15%).
  Only its caveat text now says "auto-pulled" instead of "hand-entered."
- ⚠️ 14-day attribution → early-month Amazon A/S reads high then settles; a weekly capture early
  in the month is directional.

**Deploy:** re-paste `RevenuePull.gs` + `V2.gs` (Financial Dashboard project), run
`pullPpcRevenue` → `buildFinancialDashboardV2`; re-paste `L10Setup.gs` and run **Setup / repair
tabs** to refresh the SC-015 caveat. Nothing else changes.

## v2.4 (2026-07-20) — Amazon A/S scorecard row (SC-015)

The scorecard now tracks **Amazon advertising A/S % (ACOS)**, alongside the Brady/Seton
paid-search A/S rows (SC-011/SC-012). Requested by Alex (2026-07-20).

- **One managed row** appended to `L10_SCORECARD_MANAGED` (so `l10EnsureScorecardRows_` adds
  it idempotently to the existing populated scorecard, no duplicates):
  - **`SC-015` Amazon — advertising A/S % (ACOS)** (pct, `<=`, goal **15**, owner CJ)
- **Source** = `RANGE`, text ref `Financial Dashboard v2!K10` — the Amazon exec row's new A/S
  cell (Financial Dashboard v3.10). Text (not formula) ref on purpose: a blank K10 (no Amazon
  sales entered yet) reads empty and capture skips it loudly, never a fake 0%.
- **Goal <15%** (≈ ROAS >6.7), per Alex 2026-07-20. Amazon is the most efficient channel;
  advertised-only A/S reads ~14–15% (the console halo-inclusive ACOS was ~10.9%, Jul 1–17).
- ✅ K10 uses **advertised-product-only** Amazon sales (SP same-SKU + SB, halo **excluded**),
  matching the monthly deep dive's trusted number — NOT the halo-inclusive console headline
  (see the Financial Dashboard v3.10 note).

**Deploy:** first rebuild the Financial Dashboard (`V2.gs` v3.10 → `buildFinancialDashboardV2`)
and enter the advertised-only Amazon sales in `Manual Inputs!B2`, so K10 has a value. Then re-paste `L10Setup.gs`
→ **L10 Huddle → Setup / repair tabs** once (appends SC-015). Next weekly capture picks it up
automatically. No web-app redeploy needed (no HTML/server changes).

## v2.3 (2026-07-15) — Seton/Emedco NB-negatives scorecard rows (SC-013/SC-014)

The scorecard now auto-pulls the **Seton/Emedco** weekly negatives volume + value the
same way it does Brady's (SC-006/SC-007). Requested by Alex (2026-07-15): the Seton/
Emedco Keep/Kill loop went live Jul 2026 and its impact belongs on the huddle scorecard.

- **Two managed rows** appended to `L10_SCORECARD_MANAGED` (so `l10EnsureScorecardRows_`
  adds them idempotently to the existing populated scorecard, no duplicates):
  - **`SC-013` Seton/Emedco NB negatives added / week** (num, owner Scott)
  - **`SC-014` Seton/Emedco — negatives est. annualized $ saved / week** (usd, owner Scott)
- **Source** = live `IMPORTRANGE` of the "MVP Search Terms SQR - Seton/Emed" sheet
  (`L10_NB_REVIEW_SETON_SHEET_ID`), tab `Weekly Negatives Impact`, cells `B3` (negatives
  added) / `B4` ($ saved) — the fixed **last-complete-week** cells, so every weekly
  capture snapshots the just-finished week, exactly like the Brady pair. One sheet covers
  all three accounts (Seton US + Seton CA + Emedco, one shared MCC list).
- **Goals are track-only placeholders** (≥10 / ≥$500) — the loop is brand new (first kill
  wk of Jun 29); set real targets once a few weeks of baseline land.
- Formula (not text) refs on purpose: `IMPORTRANGE` must live in the cell; until the
  one-time **Allow access** click it shows `#REF!` and capture skips it loudly.

**Deploy:** re-paste `L10Setup.gs` → **L10 Huddle → Setup / repair tabs** once (appends
the two rows) → open `L10_Scorecard`, click **Allow access** on the `SC-013`/`SC-014`
Source Ref cells (col I) to authorize the IMPORTRANGE. Next weekly capture picks them up
automatically. No web-app redeploy needed (no HTML/server changes).

## v2.2.1 (2026-07-10) — custom-digests fixes: open-time perf + dedup + label

Three fixes on top of v2.2, from a post-merge review + Alex reporting a slow app open
after adding the tabs. **Re-paste `L10Setup.gs`/`L10Code.gs`/`L10Mail.gs`/`L10Js.html`
and re-run Setup / repair tabs** to apply.

- **Open-time performance.** Setup was putting a 24-item **Hour** dropdown across ~1,000
  rows of `L10_Digests` — by far the heaviest data-validation in the workbook, which
  slowed opening the (large) book. Setup now keeps this app-managed, opt-in tab's
  validation footprint tiny: it clears any prior wide validation, applies the compact
  Frequency/Weekday/Enabled dropdowns to a modest range (200 rows), and gives Hour a
  plain-number format instead of a list (the app writes 0-23 and `l10_saveDigests`
  validates it). Fixes the slow-open regression.
- **Dedup double-send.** The runner compared the `Last Sent` stamp with raw `String()`
  equality, but Sheets coerces a date-like cell back into a `Date` on read (as the app
  documents in `l10DateStr_`), so the stamp could never match and a rule could re-send
  within the hour. Last Sent is now forced to plain text at setup **and** normalized on
  read (`l10DigestStampOf_`), so the string-equality dedup is reliable.
- **Label wipe.** The Settings card's `digestCollect_` hardcoded an empty label, so a
  Save blanked any sheet-authored `Label` (the subject override). It now round-trips the
  existing label via a hidden `data-dlabel` attribute.

## v2.2 (2026-07-10) — fully-customizable per-analyst "Custom digests"

Builds on v2.1's per-analyst notifications: keeps the meeting-anchored heads-up/recap
exactly as-is (the "normal" emails, toggled per person) and **adds a second, free-schedule
layer** so notifications are now customizable per analyst on **content × frequency × time
of day** — and mixable ("only to-do's daily, the rest normal"). Requested by Alex
(2026-07-10): _"Fully customizable [per analyst] — time of day, frequency, WHAT."_

**How it works:**
- New **`L10_Digests`** tab — **one row per rule**, many per person. **Opt-in: nothing is
  seeded**, so no one's email changes until they add a rule. Each rule =
  `{Content, Frequency, Weekday?, Hour, Enabled}` where Content is any of
  `TODOS / ROCKS / SCORECARD / HEADLINES`.
- New hourly trigger **`l10RunDigests`**: each run sends the rules whose `(Frequency,
  Weekday, Hour)` match "now" **in the spreadsheet timezone** (`l10DigestNow_` /
  `l10DigestRuleMatches_` — never `Date.getHours()`), deduped by a visible **`Last Sent`**
  stamp. Content reuses the recap/heads-up mail kit (the to-do list + rock cards were
  extracted to `l10MailTodoListHtml_` / `l10MailRockListHtml_` and are now shared with the
  heads-up — one source of truth); an **empty digest is not sent**.
- Settings gains a **Custom digests** card beside Notifications (the Notifications card is
  untouched): per person, add/remove rules (content checkboxes, frequency, weekday when
  weekly, hour, on/off). `boot.digests` (`l10_getDigests`) feeds it; `l10_saveDigests`
  (replace-all, preserves `Last Sent` by ID, rejects a bad hour) persists it.
- **No new OAuth scope** (send-only `MailApp` + `ScriptApp` triggers already in use).

**Chat is still unchanged** (same reason as v2.1 — webhooks post to a space, not a person).

**Deploy:** re-paste `L10Setup.gs`, `L10Code.gs`, `L10Mail.gs`, `L10Js.html`; run **L10 Huddle →
Setup / repair tabs** once (creates `L10_Digests`); **Settings → Install / refresh email
triggers** once (adds the hourly `l10RunDigests`); redeploy the web app. No new scopes.
Verified: `node --check` clean on all four files, no dangling `gs()`/menu handlers, a headless
table-test of the hour-match predicate (DAILY/WEEKDAYS/WEEKLY/enabled/dedup/blank-hour), and
the Settings **Custom digests** card renders + adds/removes/saves in the SPA harness (per team
member, off-roster surfaced, Weekly reveals the weekday select) with zero console errors.

## v2.1 (2026-07-10) — per-analyst email notification preferences

Each analyst now chooses how much and how often they're emailed, from **Settings →
Notifications** — no more one-size-fits-all sends. Two levers per person:
- **Heads-up** (the day-before personal email of their own to-dos + rocks due): on / off.
- **Recap** (the after-huddle team summary): **Every huddle / Every other / First huddle
  each month / Off** — a per-person cadence.

**How it works:**
- New **`L10_Notify`** tab, one row per person (`Person`, `Heads-up`, `Recap`, `Updated At`).
  `l10Setup` seeds a row per current `TEAM` member at the prior defaults (heads-up on,
  recap every), so **existing behavior is preserved until someone opts down**; a missing
  person or a pre-v2.1 workbook with no tab also falls back to those defaults.
- `l10SendMondayHeadsup` skips anyone with Heads-up = NO. `l10SendTuesdayRecap` builds its
  recipient list from whoever's recap cadence fires that huddle — cadence is a pure function
  of the huddle date + meeting history (`l10RecapDueFor_`: EVERY always, BIWEEKLY on even
  week-of-epoch huddles, MONTHLY on the first concluded huddle of the month), so there's no
  per-person "already sent" bookkeeping. **`RECAP_TO` addresses still always send**, regardless
  of cadence — that list is for people like the manager.
- The Settings **Notifications** card (a small table with a toggle + a cadence dropdown per
  person) reads `boot.notify` and saves via `l10_saveNotifyPrefs`; the prefs ride in the
  core boot slice (`l10_getNotifyPrefs`).

**Chat is unchanged (deliberate).** Google Chat incoming webhooks post to a *space*, not a
person, so true per-analyst chat volume would need each analyst to paste their own webhook —
deferred by choice (Alex, 2026-07-10). To-do pings stay a team-space broadcast.

**Deploy:** re-paste `L10Setup.gs`, `L10Code.gs`, `L10Mail.gs`, `L10Js.html`; run **L10 Huddle →
Setup / repair tabs** once (creates + seeds `L10_Notify`); redeploy the web app. No new scopes.
Verified: `node --check` clean, wiring audited, the Settings Notifications card renders + saves
in the SPA harness with zero console errors.

## v2.0 (2026-07-10) — rebased onto the Momentum Huddle codebase

Alex rebuilt and rebranded the L10 app as a standalone product ("Momentum Huddle") in a
separate repo, adding a large batch of improvements. This version **ports that improved
codebase back into the Brady L10 app** — the one the paid-media team runs weekly — while
keeping the L10 vocabulary the team knows, the `L10_*` tabs (so all existing data carries
over untouched), and **every** Brady-specific feature.

**Gained from the Momentum codebase (all preserved here):**
- **GA4 scorecard connector** (`L10Ga4.gs`, new file) — a scorecard metric can pull
  sessions/users/revenue/… straight from Google Analytics with each viewer's own sign-in
  (no tokens). New `GA4` source alongside `MANUAL`/`RANGE`/`HUB_RUNNING`/`HUB_DECISIONS`.
- **In-app metric builder** — create/edit scorecard metrics from the app (plain-language
  kind/goal/source, a live "test it" ref check, template packs, retire/revive).
- **Calm Issue-Solving (IDS) pass** — one-step accordion (only the lit step is a
  workspace), hover/hold peek, an evidence rail, and three solve doors: to-dos, a promoted
  rock, or a "bring the data" assignment that resurfaces the issue when the homework to-do
  lands (`Waiting On`). The **🧪 Make it a test** door (→ Experiment Hub Ideas) is restored
  on top.
- **Rocks upgrades** — definition-of-done, metric-linked cards showing the linked number's
  13-week trend, a two-way Rock↔Issue `Source` link, milestone-reality nudges,
  milestone-delete undo, and a rock-context modal. (`L10_Rocks` gains `Metric ID` + `Source`.)
- **To-dos P1–P3** — date-driven sorting (overdue floats, undated sinks), a quiet "Done this
  week" card, to-do notes, the Jira key/`ERR:` marker on the line, one `weekTodos_` split
  feeding every surface, and the visible/​endable weekly-repeat chain (`L10_Todos` gains
  `Repeat`).
- **Settings page** — meeting/agenda editor + integrations (email triggers, chat, Jira incl.
  token, GA4) + team access link, so nobody edits the config tab for day-to-day changes.
- **Parallel four-slice boot** + local-splice re-renders (faster first paint).

**Brady layer, re-injected and intact:** L10 vocabulary (Segue / Rocks / Rock review / IDS /
Cascade); the `L10_*` tabs; the roster (Alex, Courtney, Scott, CJ + Stuart) and 1:1 schedule;
Brady account tags, issue categories, Aug-1 fiscal (`FISCAL_START_MONTH=8`); **all** seeds
(scorecard SC-001…012 with Financial Dashboard v2 auto-pull, NB-negatives IMPORTRANGE,
experiment-count + A/S wiring; rocks RK-001…011; issues IS-001…006; events; playbook
PB-001…005); the **Meta Monday cascade** generator (revenue-first, Stuart's lens, hub
automation line); Financial Dashboard scorecard **auto-pull** + the HUB capture branch;
**Experiment Hub** read (header chip + auto counts) and write ("Make it a test"); the
**pre-huddle brief intake** (`doPost` + `L10_Brief` + docket card + promote); **Gmail
reply-ingest**; the full **email suite** (heads-up, team/manager recaps, Stuart's Monday ask,
1:1 prep packs, Monday cascade draft). **Dropped** only the commercial trial/license gate and
the customer onboarding wizard — an internal install needs neither.

**Files:** all `.gs`/`.html` change; **`L10Ga4.gs` is new**. `L10Mail.gs`, `L10Calendar.gs`,
and `L10Guide.html` are effectively the Brady originals (unchanged); `L10Jira.gs` gains only
the Settings-page token setter.

**Deploy steps (one-time):**
1. **Re-paste all files** into the workbook's shared script project, and **add the new
   `L10Ga4.gs`** (File → New → Script → paste).
2. Run **L10 Huddle → Setup / repair tabs** once — it appends the new columns (`L10_Rocks`
   `Metric ID`+`Source`, `L10_Todos` `Repeat`, `L10_Issues` `Waiting On`) at the **end** of
   each tab (append-only; existing rows/data untouched, since tab names stay `L10_*`) and
   seeds the new config rows (`GA4_PROPERTY_ID`, `FISCAL_START_MONTH=8`, `TIMER_CHIME`).
3. **Redeploy the web app → New version** (needed for the restored `doPost` and Present).
4. **Scopes / services** (reconcile into the shared project's manifest in the editor — a
   scope change re-authorizes the whole shared project on next open):
   - Calendar advanced service — already required (📅 Schedule).
   - GA4 metrics: enable the **Analytics Data API** in the project + the `analytics.readonly`
     scope. Blank `GA4_PROPERTY_ID` = the feature is simply off.
   - Unchanged from before: the Gmail **read** scope (reply-ingest), the web-app deployment
     (doPost), and the broader `spreadsheets` scope (Experiment Hub read of Alex's hub sheet).
5. No team retraining — vocabulary and config are unchanged; the roster/emails/Jira/hub URL/
   fiscal all read from the same `L10_Config` keys (manager recap still keys on `STUART_EMAIL`).

## ⚡ Current state & open threads (2026-06-12 — read this first, future sessions)

> **Superseded by v2.0 (above): the app was rebased onto the improved Momentum Huddle
> codebase on 2026-07-10.** See the v2.0 entry for what changed and the re-paste/deploy
> steps. The threads below predate the rebase.

> **In weekly use (confirmed 2026-06-23).** Alex introduced L10 to the team in a meeting
> **Fri Jun 12**; first full run **Tue Jun 16**, and it is now a regular weekly huddle.
> The huddle app + the full email-automation suite (heads-up, reply-ingest, team +
> manager recaps, Stuart Monday ask, 1:1 prep packs) are built and verified — this is a
> live, adopted system, not a prototype.

**Installed and live.** Alex pasted the app into the workbook's shared script
project, ran `l10Setup` (tabs seeded), and deployed the web app
(`script.google.com/a/macros/bradycorp.com/...`). It was then hardened through a
full day of live testing — PRs #75–81, see the changelog below. **The repo files
here are the source of truth for code; the live `L10_*` tabs are the source of
truth for content** (Alex's edits + test data live there, including
apostrophe-stripped Source Refs that the parser now tolerates — don't "fix" them).

Open threads, in order:

1. **Alex must re-paste the current file versions** after the final session's
   PRs (#80 notifications + capture fix, #81 IDS focus mode, the v1.3 capture
   fix, v1.4 rock milestones, v1.5 IDS reorder, v1.6 inline editing, and **v1.9
   no-auto-start (`L10Js.html` + `L10Css.html`)** —
   v1.4–v1.6 touch **all five files** and need one run of **L10 Huddle →
   Setup / repair tabs** to create the `L10_Rock_Milestones` tab and the two
   new `L10_Issues` columns; **v1.9 is client-only — no Setup/repair, just
   re-paste those two files + redeploy the web app**; **v1.10 multi-assign to-dos
   adds `L10Code.gs` to that re-paste set (`L10Code.gs` + `L10Js.html` +
   `L10Css.html`), still no Setup/repair**; **v1.11 to-do→chat notifications add
   `L10Code.gs` + `L10Setup.gs` — run Setup/repair once to seed the (blank)
   `CHAT_WEBHOOK_URL` config row (optional; the new Chat menu also creates it),
   then redeploy — now deployed & confirmed working (Alex, 2026-06-24)**)
   — if a reported bug matches something fixed below, check his paste is
   current FIRST. Web-app deployments also need Deploy → Manage deployments
   → ✏️ → New version. **Separately (2026-06-24): the A/S scorecard rows
   SC-011/SC-012 need `L10Setup.gs` re-pasted + Setup / repair tabs run once;
   they read the new Financial Dashboard v2 A/S column (K7/K8), so that dashboard
   rebuild + the `Revenue Pull` BigQuery pull must be live too — see
   [`../financial-dashboard/README.md`](../financial-dashboard/README.md).**
   **Also (2026-06-25): the experiment-count rows SC-009/SC-010 need `L10Setup.gs`
   re-pasted + Setup / repair tabs run once — that wires them to `RANGE` on the
   `L10 - Experiments Scorecard Google Ads pull` tab (B4/B5). They stay blank
   (capture skips them) until the two Google Ads pull scripts — one per MCC — first
   run; see [`../google-ads/README.md`](../google-ads/README.md).**
   **Also (2026-07-02): v1.20 needs all five files re-pasted + Setup/repair once +
   the intake token set + a NEW web-app deployment version (doPost) + mail triggers
   reinstalled — full steps in the v1.20 changelog entry.**
   **Also (2026-07-08): v1.21 (menu quick-add · to-do→IDS context · kill headlines ·
   turn-order voting) adds a NEW HTML file `L10QuickAdd` + re-paste `L10Setup.gs`,
   `L10Code.gs`, `L10Mail.gs`, `L10Js.html`, `L10Css.html`, run Setup/repair once
   (new `L10_Headlines` Status column), then redeploy — steps in the v1.21 entry.**
2. **Experiment Hub hygiene** (explains the "scorecard shows 7 live · 6 need
   decision" surprise, verified against the live hub 2026-06-12): the counts
   are CORRECT — the hub really holds 7 live (6 RUNNING + 1 QUEUED, including
   junk rows `test - delete`, `ignore`, and the QUEUED `EXP-001 … Script Test
   Upload (DELETE)`) and 6 ENDED experiments with no Decision logged (mostly
   2025 "imported from Google Ads, already finished" rows). To make the tiles
   read true: delete/archive the junk rows and log a Decision on (or ARCHIVE)
   the old ENDED imports. Alternatively, since v1.3 a filled Source Ref on a
   HUB_* metric overrides the auto-count.
3. **Huddle moved to Tuesday 10:00** (the Weekly Task Review slot is Tue as of
   the Jun 15 2026 week, per Alex's calendar). The email automation assumes this
   via `HUDDLE_DAY` in `L10_Config` (heads-up Monday, recap Tuesday). **Meta
   Monday timing tension — addressed in v1.20:** the digital-team "Meta Monday"
   meeting is still Mon 1pm, so the huddle-generated cascade landed *after* the
   meeting it feeds; the new **Monday ~10am cascade-draft email** (fresh live
   pulls + still-flagged headlines, to Alex only) now covers that slot. The
   in-app cascade remains the Tuesday artifact of record. Any test meetings
   should be discarded first (⏭ Conclude → discard).
4. **Three config decisions Alex hasn't made yet** (recommended in-session,
   2026-06-12): (a) 60-min segment profile
   (`[["Segue",5],["Scorecard",5],["Rock review",3],["Headlines",3],["To-do list",5],["IDS",35],["Conclude",4]]`
   in `L10_Config`); (b) swap the seeded FY27-goal rocks for **Q4-sized
   transition rocks** now, FY27 slices at the Aug 1 rock reset; (c) reorder
   scorecard Stuart-lens + feed manual metrics from the Monday weekly trend
   report; SC-007 (leads) stays Active NO until the BQ source refreshes daily.
5. **Install quirk to remember:** the script project is shared (FY27 Goals +
   Alex's older files); `l10BuildMenu();` must sit inside the existing
   `onOpen()`; never define a second `onOpen`/`doGet`; all L10 globals are
   `l10`-prefixed for this reason.
6. After-the-first-huddle candidates (roadmap below): auto-capture on a Monday
   trigger, ~~1:1 view of parked issues~~ (built, v1.20), quarterly rock-rollover
   ceremony.
7. **v1.20 first-run threads (2026-07-02):** ~~(b) mint + set the intake token~~
   ~~(c) confirm doPost answers ok:true~~ — **both done, verified live 2026-07-02**:
   token set, web-app access = Anyone (incognito-verified), endpoint **pinned via
   Brief → Set web app URL…** (v1.20.2 — the first two failures were a login page
   from a stale auto-detected URL, then a 404 from a mis-copied paste; the
   address-bar copy fixed it), self-test green ("2 sample rows landed").
   Remaining: **(a)** the Tuesday pre-brief routine's first run is a **dry run**
   to `_drafts/` — Alex eyeballs it, then flips the automation live (the
   `routines/tuesday-pre-brief/` spec — since removed with the 2026-07-09 routine
   retirement; the automation prompt needed the SAME pinned /exec URL + token,
   which lives in the L10 script properties).


## v1.22.1 (2026-07-09) — 📅 Schedule on the to-do surface too
Follow-up to v1.22: the **📅 Schedule** entry points were on issues and headlines but
not to-dos. Added a compact **📅** to every to-do line (title prefilled from the to-do
text) and a **📅 Schedule** button on the **New to-do** form (uses whatever text is
typed so far — the to-do doesn't need to be saved first). The `[data-schedule]` handler
already resolved `todo:<id>`; this just surfaces it. `L10Js.html` only.

## v1.22 (2026-07-09) — schedule to Google Calendar (Advanced Calendar service) · retire the repo export
Two changes this pass:

1. **Book a meeting straight from the huddle.** New **`L10Calendar.gs`** + a scheduler
   module in `L10Js.html` (styles in `L10Css.html`, a **📅 Schedule** button in
   `L10Index.html`). Alex's ask: schedule meetings during the L10 without leaving the
   app, with the **issue's text prefilled as the event title**, and a
   **calendar.google.com-style day view** so you "clearly see when you ARE and AREN'T
   busy" when you pick the time.
   - **Entry points at every point of the L10** — a compact **📅** on every issue and
     headline line, a **📅 Schedule** button in the header (blank title), and one inside
     the IDS overlay (schedule a follow-up for the issue being solved).
   - **The picker** — a left form (title · date · length · calendar · invite chips ·
     mini month) next to a scrollable day column: hour lines, **titled busy blocks** for
     the target calendar (`Calendar.Events.list`), **hatched anonymous "Busy" blocks**
     for invitees (`Calendar.Freebusy.query` — only the target calendar's titles are
     ever exposed, for privacy), a red now-line, and an accent **proposed-event** block.
     Click an open area to place it, drag to move, drag the handle to resize; overlaps
     raise a non-blocking warning. Create writes the event with `Calendar.Events.insert`
     (`sendUpdates:'all'` when invitees) and offers **Open in Google Calendar ↗**.
   - **Advanced Calendar service**, not `CalendarApp` (free/busy + multi-attendee inserts
     need it). One-time enable: **Services (＋) → Calendar API → Add**; until then the
     button shows a friendly "turn it on" note and the rest of the app is unaffected.
   - **Config** (`l10Setup`-seeded): `CALENDAR_ENABLED`, `CALENDAR_ID`,
     `CALENDAR_DAY_START/END`, `CALENDAR_SLOT_MIN`, `CALENDAR_DEFAULT_DURATION`; invitee
     free/busy reuses the existing `TEAM_EMAILS` map. Full write-up: **`CALENDAR.md`**.
2. **Retired the L10 → repo export** (`L10Export.gs` + `L10-EXPORT.md` + the generated
   `l10-status.md` / `data/l10-status.json`). Alex is moving to a different strategy for
   todos/updates; todos & team updates now live solely in the L10 sheet + Jira **BNADM**
   (no repo snapshot). Routing in the root `CLAUDE.md` + README updated accordingly.

## v1.21 (2026-07-08) — quick-add menu dialogs · to-do→IDS context · kill headlines · turn-order voting
Four asks from Alex in one pass, all quality-of-life on the live huddle:

1. **Quick add straight from the sheet menu — no app, no meeting.** The **L10 Huddle**
   menu grows five items: **Add headlines… / Add issues… / Add to-dos… / Add rocks… /
   Update scorecard…** Each opens a small modal dialog (new **`L10QuickAdd.html`**,
   one file templated per mode) with open rows and the full features of the app's
   forms: type · text · by · cascade for headlines; text · by · account · category for
   issues; text · due · **multi-owner chips** for to-dos (one to-do per tapped person —
   the same fan-out as the app, one grouped chat ping per row); title · owner · due ·
   shift · account for rocks. **Update scorecard…** is the capture grid: auto metrics
   show "auto on capture", manual metrics take typed values (`95%` / `$1,234` fine),
   blank inputs are skipped — never written as zero. "＋ another row" adds slots; Save
   reports **per-row results** — rows that landed disappear from the dialog (the log
   names the new ids), failed rows stay editable with their error named. Everything
   funnels through the app's own single-add functions (`l10_addHeadline` /
   `l10_addIssue` / `l10_addTodoMulti` / `l10_addRock` / `l10_captureWeek`, via the new
   `l10_quickAdd` batcher), so id minting, the next-Monday due default, and the v1.11
   chat pings stay defined in exactly one place.
2. **To-dos link back to the IDS that spawned them.** A to-do whose `Source` is a real
   issue id now renders **`from IS-014 ↗`** as a tappable chip (to-do segment, To-dos
   page, 1:1 pages). It opens a read-only **issue-context modal**: the issue text +
   status, its ① Identify / ② Discuss / ③ Solve notes, every sibling to-do the issue
   created (done/open), and an **"Open in IDS →"** button while the issue is still
   OPEN. Fixes "assigned it in 30 seconds during IDS, zero context a week later." The
   data was already there (`Source` column, v1.5) — non-issue sources (e.g. `EMAIL`)
   render as plain text like before.
3. **Kill stale headlines mid-huddle.** Every headline line (in-meeting Headlines
   segment + the Headlines page) gets **✕ kill** — one click, with an Undo toast (same
   pattern as issue kill). New **`Status` column at the END of `L10_Headlines`**
   (blank = live, `KILLED` = gone): killed rows leave the app lists, the Segue kudos,
   the start-screen queue count, **both recap emails, the 1:1 prep context, the
   cascade builder and the Monday cascade draft** — but stay in the tab as the audit
   trail. Killing by hand in the tab works too (the column carries a KILLED validation
   + grey conditional format). A pre-repair tab fails loudly ("run Setup / repair
   tabs"), never a silent no-op.
4. **IDS voting is now a turn-order round.** **"Start voting round"** atop the IDS
   segment: clears lingering votes (server + local), picks a **random first voter**,
   then proceeds around the room in attendee order (wrapping), **3 votes each** —
   stack them on one issue or spread them. The banner names whose turn it is and votes
   left, with done ✓ / current / up-next chips, plus **skip** (stepped out) and **end
   round early** controls. The issue list **freezes in pre-round order during the
   round** (vote buttons can't jump under a voter's finger) and **auto-sorts
   descending by vote total the moment the last person finishes** — TOP PICK lands on
   the leader. Ad-hoc ▲ voting outside a round is unchanged; "reset votes" hides while
   a round runs. Round state is per-browser by design (the huddle drives off one
   shared screen); every vote still writes to the sheet as it's cast, so the totals
   survive a reload.

- **Files:** `L10Setup.gs` (menu items · `L10_Headlines` Status column + validation/
  color) · `L10Code.gs` (quick-add dialog openers + `l10QuickBoot_` + `l10_quickAdd`,
  `l10_killHeadline`/`l10_reviveHeadline` + `l10HeadlineLive_`, bootstrap filter) ·
  **new `L10QuickAdd.html`** · `L10Js.html` + `L10Css.html` (source-ref chip, context
  modal, voting round, kill buttons) · `L10Mail.gs` (killed headlines excluded from
  recaps / 1:1 prep / cascade draft). `L10Index.html`, `L10Guide.html`, `L10Jira.gs`
  untouched.
- **Upgrade:** in the Apps Script editor add a file named **`L10QuickAdd`** (File →
  New → HTML) and paste it; re-paste `L10Setup.gs`, `L10Code.gs`, `L10Mail.gs`,
  `L10Js.html`, `L10Css.html`; run **L10 Huddle → Setup / repair tabs** once (adds the
  `L10_Headlines` Status column); reload the workbook (menu rebuilds with the quick-add
  items) → Deploy → Manage deployments → ✏️ → **New version** (for the web-app client).
- **Verified:** `node --check` on all six JS surfaces + a 58-assertion stubbed harness —
  client (source-ref chips incl. EMAIL/unknown-id fallbacks, context modal, kill
  filtering across recent list/kudos/cascade, full voting round: random first, wrapped
  turn order, 3-vote turns, mid-round freeze, skip, early end, post-round sort, vote
  reset on start, round cleared on the start screen) and server (quick-add per-row
  results + multi-owner fan-out + next-Monday due default, kill/revive incl. the
  pre-repair guard and bootstrap exclusion, scorecard boot payload).

## v1.20.2 (2026-07-02) — pin the intake URL (fixes the self-test hitting a stale door)
Live debugging with Alex: the self-test kept failing with "web page instead of JSON"
through THREE redeploys — while the real deployment was verified fine (the /exec URL
loads the app **in an incognito window**, so code + "Anyone" access were both correct).
Root cause: **`ScriptApp.getService().getUrl()` misreports the project's own URL in
menu/editor context when several deployments exist** (it can return a stale or /dev
URL, which serves a Google login page → exactly the failure seen). Fix, `L10Code.gs` +
`L10Setup.gs`:
- **Brief → Set web app URL…** — paste the real `/exec` link once (validated: must be
  `script.google.com/…/exec`); stored in the `L10_BRIEF_URL` script property. The
  self-test and Intake status now prefer it (`l10BriefEndpointUrl_`), falling back to
  auto-detect when unset.
- **Self-test failure messages now name the actual fix** by sniffing the page that
  came back: "Script function not found" → that deployment runs old code, new version
  it; a login page → access isn't plain "Anyone" OR the URL is stale/dev → paste the
  incognito-verified URL. Every failure now also echoes WHICH URL was tested.
- **Debug recipe that settled it (keep for next time):** copy the deployment's /exec
  URL → open in incognito. Sign-in page = access problem; app loads = the tooling was
  testing the wrong URL.
- **Upgrade:** re-paste `L10Code.gs` + `L10Setup.gs`, reload the sheet, then Brief →
  Set web app URL… (paste the incognito-verified link) → Send test brief.

## v1.20.1 (2026-07-02) — one-click intake self-test (no terminal)
Alex, testing v1.20: "I don't know how to do that terminal shit." The curl contract
test now has a menu twin: **Brief → Send test brief (sample rows)** —
`l10BriefSelfTest()` in `L10Code.gs` POSTs two TEST rows to the project's own `/exec`
URL via `UrlFetchApp` (same 302-follow behavior as `curl -L`), reads the JSON reply,
and alerts pass/fail with the exact next step (no token → set it; HTML instead of
JSON → the deployment needs a new version). **`L10Code.gs` + `L10Setup.gs` only** —
re-paste both, reload the sheet (menu rebuilds); no Setup/repair, and redeploying is
NOT needed for the button itself (it runs in the editor context), only for the
endpoint it tests.

## v1.20 (2026-07-02) — the meeting preps itself: pre-huddle brief, decision memory, 1:1 pages, Monday cascade draft
Alex: "quality-of-life changes … built FOR US, not for the masses" — pushed past
feature-level suggestions to the self-prepping-meeting reframe. Two big swings (A:
self-prepping meeting, B: evidence + decision memory) plus the folded-in earlier picks
(My-lens/1:1 pages, Monday pre-cascade fix). UI copy stays **neutral** (Alex's explicit
voice call). **`L10Setup.gs` + `L10Code.gs` + `L10Index.html` + `L10Js.html` +
`L10Mail.gs`** (`L10Css.html` untouched).
- **Pre-huddle brief** — new `L10_Brief` tab + token-guarded `doPost` intake (contract
  above). The start screen and the IDS segment render the week's ranked **docket**
  ("what deserves IDS time", dollars-at-stake + caveat ⓘ per item) and context strips;
  **promote-to-issues** creates the `IS-###` with the evidence, caveat, and the
  playbook's how-to-run pre-filled into the Identify notes (idempotent — a promoted
  docket row shows `→ IS-###` and re-taps return the existing issue). Honesty rails:
  the docket footer names the snapshot date and says the scorecard capture stays the
  number of record; `BRIEF_ENABLED` config kills the whole surface; the app's empty
  state (no brief) changes nothing about the meeting.
- **Analysis playbook + "seen before"** — new `L10_Playbook` tab (seeded PB-001…005:
  NB pullback report, S-curve read, serving-URL audit, Keep/Kill loop, hub test; all
  sanitized business language) matched **live while typing an issue** (new-issue forms
  + the IDS modal's evidence rail): "🧭 <report> answers this — how to run it" and
  "🗂 Seen before: IS-014 (Mar) — solved: <resolution>" via keyword/token overlap,
  all client-side.
- **Decision ledger + outcome loop** — `L10_Issues` gains `Outcome`/`Outcome At`/
  `Review On` (appended at the END, same rule as the IDS-notes and Jira columns).
  Solving stamps `Review On` = today + `OUTCOME_REVIEW_WEEKS` (config, default 4);
  when it comes due the **Conclude segment asks "did the fix hold?"** (held / didn't /
  too early → pushes 2 weeks). Verdicts badge the new **Decision ledger** on the
  History page — searchable past SOLVED/KILLED issues (keyword + account) so the
  room never re-litigates March's call.
- **1:1 pages** (roadmap item, now built) — new **1:1s** nav page, one view per
  person: parked-for-their-1:1 issues (with "back to the team list"), their open
  to-dos, their rocks, issues they raised. Deliberately no completion percentages
  (the team-level-only rule extends here).
- **"My lens" chip** — header chip cycles the roster (per-browser, `localStorage`);
  puts that person's groups first on To-dos/Rocks and pre-selects their 1:1 page.
  Display-only by design: same data for everyone, no auth pretense.
- **Monday cascade draft** (`L10Mail.gs`) — resolves open thread #3's timing tension:
  the huddle is Tuesday but the digital-team meeting the cascade feeds is Monday 1pm,
  so the in-app cascade always landed a week stale. New Monday ~10am trigger emails
  Alex a fresh draft: **live dashboard pulls** for the pacing lines (read-only — NOT
  written to `L10_Scorecard_Data`; in-meeting capture stays the number of record, and
  the roadmap's "no auto-capture" decision stands), this week's captured manual
  values or `___`, hub counts, still-flagged headlines — in the same
  revenue-first order as the in-app builder. `CASCADE_DRAFT` config = NO turns it
  off; menu **Email → Send Monday cascade draft now (to me)** to test.
- **Upgrade (all five files):** re-paste `L10Setup.gs`, `L10Code.gs`, `L10Index.html`,
  `L10Js.html`, `L10Mail.gs` → run **L10 Huddle → Setup / repair tabs** once (creates
  `L10_Brief` + `L10_Playbook`, appends the three `L10_Issues` columns, seeds the
  `BRIEF_ENABLED` / `OUTCOME_REVIEW_WEEKS` / `CASCADE_DRAFT` config rows + the PB
  seeds) → **Brief → Set intake token…** → Deploy → Manage deployments → ✏️ → **New
  version** (REQUIRED — `doPost` doesn't exist in older deployments) → **Email →
  Install / refresh triggers** (adds the Monday cascade-draft trigger).
- **QA checklist (after pasting):** start screen shows no brief card (empty week) and
  the meeting runs unchanged → POST the curl sample → reload: docket renders, ⓘ shows
  the caveat → promote #1 → `IS-###` appears with evidence in Identify → type
  "pullback" in a new-issue form → 🧭 playbook suggestion appears → solve a test issue
  → its row gets `Review On` → set `Review On` to today in the tab → Conclude shows
  the outcome card → verdict lands in `Outcome` → History → Decision ledger finds it →
  1:1s page lists parked/to-dos/rocks per person → lens chip reorders To-dos → Email
  menu → cascade draft arrives with live pacing numbers and `___` where blank.

## v1.19 (2026-07-01) — analysts can add headlines before the meeting starts
Alex: "update the L10 code so my analysts can add in headlines prior to starting the meeting."
Before this, the only way to log a headline was inside a running huddle (the **Headlines
segment**, or Kudos in the Segue) — so nothing could be queued ahead of time from the
"Ready to huddle?" start screen. Now headlines follow the same "edit any time, on their own
tab" model that to-dos / rocks / issues already use. **`L10Index.html` + `L10Js.html` only**
(client) — re-paste both + redeploy the web app; **no schema change, no Setup/repair, no
server (`L10Code.gs`) change.** The server `l10_addHeadline` already accepted a blank
`Meeting ID`, so a pre-meeting headline simply lands unattached and shows up in the huddle's
Headlines segment.
- **New standalone Headlines nav page** (`renderHeadlines`, page `page-headlines`, nav button
  between **Rocks** and **To-dos**) — mirrors the To-dos / Issues / Rocks pages: an "Add a
  headline" card (type · text · by · cascade ↗) plus the recent-headlines list with the same
  in-place cascade toggle. Reachable any time without starting the clock.
- **Add-headline card on the start screen** — the "Ready to huddle?" screen now carries the
  same add form ("Headlines — add yours before you start _(N queued)_"), so analysts drop
  headlines in right in the pre-meeting flow. The full list/edit stays on the Headlines tab.
- **One shared code path.** Extracted `headlineAddCardHtml()` / `recentHeadlinesCardHtml()` /
  `wireHeadlineAdd(scope)`; the in-meeting Headlines segment (`segHeadlines`) and `wireSegment`
  now compose from them, so the meeting UI is **byte-for-byte unchanged** — the new page and
  start-screen card reuse the exact same form and server call (`l10_addHeadline`, `meetingId_()`
  = `''` when no huddle is open). The cascade toggle re-renders both the segment and the new page.
- **Upgrade:** re-paste `L10Index.html` + `L10Js.html` → Deploy → Manage deployments → ✏️ →
  New version. No Setup/repair, no trigger or schema change.

## v1.18 (2026-06-30) — IDS focus modal redesign ("Quiet Rail")
Alex (design critique with a screenshot): the IDS modal "looks crammed, crowded, overwhelming."
Diagnosed as a **hierarchy bug** — Identify, Discuss and Solve were painted at identical weight all
at once (~9 controls, no "you are here"), which fights the one-issue-at-a-time EOS sequencing.
Redesigned via a multi-agent design judge-panel (4 directions → 3 lenses → synthesis); winner
"Quiet Rail" (9/9/9). **`L10Js.html` + `L10Css.html` only** — re-paste both + redeploy; no schema
change, no Setup/repair.
- **Progress rail** under the header (Identify · Discuss · Solve) cloned from the segment rail —
  current step filled, **done steps show a ✓ + a one-line summary of what was captured**, future
  plain. Doubles as click-to-jump nav.
- **Only the lit step is loud.** Identify + Discuss sit in a recessed context zone; the active one
  expands (accent left bar, full field, filled badge), the others **shrink to a one-line peek but
  never hide** (so the root cause + options stay visible while you solve). The lit step travels
  with focus via a `.is-on` class swap — **every textarea stays mounted**, so the notes→sheet save
  path is byte-for-byte unchanged (the design's key safety property). Solve becomes a **white
  raised "output" panel** (the to-do builder nested one tier down in a recessed inset), and
  Park/Test/Kill collapse to one muted "Didn't solve it?" row.
- **Easier heavy typing** (lean, no rich-text engine — values stay plain-text strings): **Enter
  continues a `- ` bullet** (empty bullet ends the list), **Tab indents / Shift-Tab outdents**
  (Shift-Tab with nothing to outdent falls through, so no keyboard trap), **⌘/Ctrl-B wraps the
  selection in `**…**`** (a convention, not WYSIWYG), and **⌘/Ctrl-Enter advances**
  Identify→Discuss→Solve (or fires Solve on Solve). Per-step snippet chips scaffold Identify/Discuss
  too. A shortcut hint shows under the active field only.
- **Zero added clicks** on the happy path; escape hatches still one click; present-mode bumped so
  the rail + lit step read on a projector.
- **Upgrade:** re-paste `L10Js.html` + `L10Css.html` → Deploy → Manage deployments → ✏️ → New
  version. No Setup/repair, no schema change.

## v1.17 (2026-06-30) — design pass #9: scorecard health roll-up + accessibility
Roadmap [`DESIGN-ROADMAP.md`](./DESIGN-ROADMAP.md) **#9** — honest data display + the
accessibility floor. **`L10Js.html` + `L10Css.html` only** (client) — re-paste both + redeploy
the web app; no schema change, no Setup/repair. Built on #4's inline-caveat pattern and #1's
status tokens.
- **Health roll-up strip** atop the Scorecard: **"On track X · Off track Y · Not captured Z"**
  (+ "No goal N" when present) count chips — a reduce over `ruleCheck(d, currentWeekValue)`. The
  team reads the week's health at a glance instead of counting red cells. ("Captured" is tested
  on the raw value, so a metric with a value but no goal counts as *No goal*, not *Not captured*.)
- **"Off track first" sort** toggle (client-only, `aria-pressed`) reorders the 13-week grid
  off → on → no-goal → not-captured (Sort-order tiebreak); default stays Sort order. It
  re-renders **only the grid block**, so the capture card's inputs below it aren't wiped. The
  current-week column is now **bold**.
- **Focus-reachable caveats:** the hover-only `title=` ⓘ becomes a real **`<button aria-expanded>`**
  that toggles an always-in-DOM caveat line — keyboard- and screen-reader-reachable, honoring the
  "read the number with its caveat" house rule (and still lean: collapsed until used; forced open
  in present mode). Wired by DOM traversal (no per-cell id → SPA-safe).
- **Status not by color alone (WCAG 1.4.1):** judged cells get a small `aria-hidden` **✓/✕**
  glyph alongside the color; the current-week cell also carries an **sr-only "(on track)/(off
  track)"** for screen readers (not repeated across all 13 columns).
- **Captured-0 vs not-captured:** a real captured `0` renders `0`; a not-captured week is a
  **hatched cell** + sr-only "not captured" — so they stop reading alike.
- **Screen-reader plumbing (WCAG 4.1.3):** `#notify-stack` becomes a `role=status`
  `aria-live=polite` region (set at load, before the first toast); the segment timer gets a
  visually-hidden live region that announces over-time **once** (not every tick), reset per
  segment.
- **Upgrade:** re-paste `L10Js.html` + `L10Css.html` → Deploy → Manage deployments → ✏️ → New
  version. No Setup/repair, no schema change.
- **v1.17.1 follow-up (focus fix):** the "Off track first" toggle now **reorders the existing
  `<tr>` nodes in place** instead of re-rendering the grid — so the button keeps keyboard/SR
  focus (a re-render dropped focus to `<body>`) and any open caveat lines stay open. Each row
  carries a canonical `data-ord` so toggling back restores Sort order. (Adversarial-review
  finding; verified the in-place sort matches the render sort both directions.)

## v1.16 (2026-06-30) — design pass #8: corporation-grade recap emails
Roadmap [`DESIGN-ROADMAP.md`](./DESIGN-ROADMAP.md) **#8** — the weekly recap is Stuart's
most-seen surface, so this rebuilds both recaps (team + manager) to read like real product
mail. **`L10Mail.gs` only** (server) — re-paste it; no schema change, no trigger reinstall.
Grounded by a code spec **and** an email-client deliverability audit (Outlook Word engine,
Gmail clipping, `@media` support).
- **Shared document shell** `l10MailDoc_` — a real HTML document: charset-first `<head>` +
  viewport + `color-scheme` metas + one well-formed `<style>` block, a **hidden preheader**
  (the inbox-preview line, hidden both inline *and* via class so Gmail iOS — which drops
  `<style>` — keeps it hidden), a **fixed 600px** `role=presentation` table (Outlook ignores
  `max-width`), and a deep-link **"Open the huddle" footer button** reusing v1.15's
  `l10WebAppUrl_()` (omitted entirely when the project isn't deployed). A `>95KB` byte-warn
  guards the Gmail ~102KB clip. Both `l10MailRecapHtml_` and `l10MailStuartHtml_` route
  through it — they never fork.
- **Outlook brand band** — `l10MailRecapHeader_` is now a `<table>` with a solid `bgcolor`
  fallback, so Outlook desktop (which drops the CSS gradient) shows a solid deep-blue band
  instead of white; modern clients layer the gradient on top. (Robust `bgcolor` fallbacks
  used throughout instead of fragile, untestable VML.)
- **Lead with movement** — each scorecard row carries a **"vs last week" ▲/▼ delta** (read
  from the prior captured week in the DATA tab), colored by the metric's *own* good/bad rule
  (`>=` up-good, `<=` down-good, `between` neutral), with the sign carrying the meaning and
  the arrow `aria-hidden`. No prior week → no delta (never a guessed move). Each rock card
  gets a **table-cell milestone progress bar** (bgcolor fill survives Outlook + dark-mode).
- **Responsive** — one `@media(max-width:480px)` stacks the scorecard's Goal/Status; the
  default no-media layout is already single-column-safe for clients that ignore `@media`.
- **Upgrade:** re-paste `L10Mail.gs`. **Preview safely first** via **Email → Test team recap
  (to me)** and **Test manager recap (to me)** (send-to-self) — ideally forward one to an
  Outlook account to confirm the brand band — *before* any real team/Stuart send. Triggers
  and schema unchanged.

## v1.15 (2026-06-30) — design pass #4–6 (present mode · token scales · honest sparklines)
Second wave of [`DESIGN-ROADMAP.md`](./DESIGN-ROADMAP.md) (#4 Present/Room mode, #5 token
*scales* only, #6 honest sparklines). Files: `L10Css.html`, `L10Js.html`, `L10Index.html`,
`L10Setup.gs` — **no schema change, no Setup/repair**; the only server change is `doGet`/
`l10OpenDashboard`, so a **web-app redeploy** is needed for Present to work.
- **#4 Present / Room mode.** A **⛶ Present** button on the in-meeting timerbar. From the
  embedded Sheets modal it pops the app out into its own standalone web-app tab (full-screen
  is blocked inside the cross-origin Sheets iframe); in that tab it calls `requestFullscreen()`
  and toggles a `body.present` class (driven by a `fullscreenchange` listener, so Esc/F11 exit
  cleanly). Under `body.present`: header/nav hide, the timer becomes a 96–120px hero with a
  **non-color over-time pulse** (scale + ring, not red alone), the segment rail / scorecard
  cells / IDS title scale up, and scorecard **caveats render inline** instead of behind the
  hover ⓘ. `L10Setup.gs` `doGet` now templates the deployed web-app URL into the page
  (`ScriptApp.getService().getUrl()`, try/caught → '' in the modal); `l10OpenDashboard` sets it
  blank. **Jira-safe:** presentation-only — no to-do/Status write path, columns, or the Jira
  submenu touched.
- **#5 token scales (additive half only).** Added `--space-1..8` (4px base), a `--text-1..8`
  ramp that **snapped every `9.5/10.5/11.5/12.5/13.5/14.5` half-pixel font size to an integer**
  (killing the jitter), a `--radius-sm/md/lg/pill` scale (clean 8/10/12 swapped to tokens), and
  `--z-header/overlay/notify` + `--dur-fast/base/slow` + `--ease` constants. CSS-only plus four
  cosmetic inline sizes in `L10Js`. **Deferred:** the `innerHTML`→render-helper refactor + chip
  consolidation (the risky #5 half — left for a careful incremental pass).
- **#6 honest sparklines.** Rewrote `sparkline()` so the y-axis spans the data **union the
  goal value(s)** (a 2% wobble and a 200% blowout no longer fill the same box), draws a dashed
  **goal line** (a band for `between`), tints the line/area/dot by the metric's `ruleCheck`
  status via `--good`/`--bad` tokens (the hardcoded `#0a58c4` is gone), puts a filled dot on
  the latest point, and renders null weeks as **gaps** on a fixed per-week x-scale. History now
  draws the `RATING_BAR(8)` and `TODO_DONE_TARGET(90%)` reference lines that were in config but
  never plotted. Verified by `node --check` + sparkline logic asserts (gaps, goal-in-domain,
  band, status color, no hardcoded blue).
- **Upgrade:** re-paste `L10Css.html`, `L10Js.html`, `L10Index.html`, `L10Setup.gs` → reload →
  Deploy → Manage deployments → ✏️ → New version (the web-app redeploy is what makes Present's
  pop-out URL + the templated `doGet` live). No Setup/repair, no trigger/schema change.

## v1.14 (2026-06-30) — design pass #1–3 from the corporation-grade roadmap
First wave of [`DESIGN-ROADMAP.md`](./DESIGN-ROADMAP.md) (#1 one token source, #2 focus
ring + keyboard, #3 undo + Conclude confirm). `L10Css.html` + `L10Js.html` +
`L10Guide.html` + `L10Mail.gs` (and the byte-identical
[`../../processes/l10-new-member-guide.html`](../../processes/l10-new-member-guide.html)) —
**client + email + guide only; no `L10Code.gs`/`L10Setup.gs` change, no schema change, no
Setup/repair.**
- **#1 One palette across app, guide & email.** Brady blue is now `#0a58c4` everywhere
  (it was absent from the email, which used `#043f8d`); the guide's and email's drifted
  ink/line/green/red/amber were reconciled to the app's token values to the digit. `--good`
  aligned to `#15803d` so on-track green is one value. The app's `:root` is the single
  source; the guide `:root` and the email's `L10_MAIL` constants mirror its values.
- **#2 Keyboard + focus.** One global `:focus-visible` ring (`--ring` token) on every
  control; `button:active` press state. The click-only milestone timeline is now
  keyboard-operable — the dot is a `role=button` toggle, the ✎/✕ glyphs are focusable
  buttons (hidden via opacity, not visibility, so they stay tabbable), and a global
  Enter/Space delegate activates any custom `role=button`. `aria-pressed` on the
  attendee/owner chips.
- **#3 Undo + confirm.** `notify()` takes an optional `{fn,label}` and renders an **Undo**
  button (toast lingers 8s); wired to to-do done, rock on/off-track, milestone toggle,
  issue kill/park, and reset-votes (each reverses via the existing server fns). The
  irreversible **Conclude** now two-click-arms with a pre-flight summary (new to-dos · avg
  rating · recap-empty warning) — same armed pattern as Discard. **Jira-safe:** undo still
  persists `Status` (the sync's trigger); the to-do render keeps the appended `Jira Key`/
  `Jira Done` columns; the menu is untouched.
- **Upgrade:** re-paste `L10Css.html`, `L10Js.html`, `L10Guide.html`, `L10Mail.gs` →
  Deploy → Manage deployments → ✏️ → New version (for the web-app client). No Setup/repair,
  no trigger or schema change.

## v1.13 (2026-06-25) — team recap email upgraded to match the manager recap
Alex: "why is [the team recap] so ass compared to what Stuart gets?" The weekly
**team recap** was plain (free-text dump + a 3-item auto-summary) while the
**manager recap** (Stuart's) was a rich styled email. `L10Mail.gs` + `L10Setup.gs`
(server-side — re-paste both, run **Email: install / refresh triggers** not needed;
no schema change):
- **Extracted the manager recap's rich sections into shared builders**
  (`l10MailScorecardHtml_`, `l10MailRocksHtml_`, `l10MailSolvedHtml_`,
  `l10MailOpenTodosHtml_`, `l10MailHeadlinesHtml_`, plus `l10MailRecapHeader_` and the
  badge/onoff/sect helpers). `l10MailStuartHtml_` now composes from them — **output
  unchanged** (same styled scorecard table w/ ON/OFF-TRACK pills, rock cards, etc.).
- **The team recap now uses the same builders** — gradient header + BDay/FY chips,
  an optional **Summary** block (the room's free-text recap, if any) on top, then the
  full Scorecard / Rocks / What we solved / To-dos / Headlines sections. Removed the
  old `l10MailRecapAuto_`.
- **New safe preview:** `l10TestRecap` / menu **Email → Test team recap (to me)** sends
  the team recap to Alex only (mirrors the existing manager-recap test) so the layout
  can be checked without emailing the whole team.
- **Upgrade:** re-paste `L10Mail.gs` + `L10Setup.gs`, reload (the menu picks up the new
  item). Triggers/schema unchanged.

## v1.12 (2026-06-25) — leaner scorecard: caveats → hover ⓘ, prominent owner
Alex: the scorecard rows had a wall of caveat text under every metric — "lean it
out … and make the person responsible more prominent." `L10Js.html` + `L10Css.html`
(client-only — **no schema change, no Setup/repair**; re-paste both files + redeploy
the web app):
- **Caveat off the row, onto a hover ⓘ.** Both scorecard renders (the 13-week grid
  `renderScorecard` *and* the in-huddle `captureGrid`) drop the inline `.caveat`
  block; a small `ⓘ` (`caveatTip`, `title=` tooltip, only when a caveat exists)
  carries it on hover so the data-quality warnings aren't lost. Page-sub updated to
  "Hover the ⓘ for a metric's caveat."
- **Owner promoted to a pill** (`whoChip`: bigger 26px avatar + bold name on a light
  `--bg` pill). In the grid it sits on its own line under the metric name (was a tiny
  muted "· CJ"); in the capture grid it fills the Owner column. `who()` is unchanged,
  so rocks/to-dos keep their lighter style.
- **Metric names are sheet content, not changed in code** — to shorten them (e.g.
  "Budget — Brady (US+CA)") edit the `Metric` column in `L10_Scorecard` directly; the
  render just prints whatever's there.
- **Upgrade:** re-paste `L10Js.html` + `L10Css.html` → Deploy → Manage deployments →
  ✏️ → New version. (In-sheet menu already runs latest.)

## v1.11 (2026-06-24) — to-do adds/completions post to the team chat
> **✅ Live — webhook set, deployed, and confirmed working by Alex 2026-06-24.**

Alex: "whenever someone checks off a To-Do or adds a To-Do I'd like a chat message
in *Paid Team & Stuart* — 'L10 To-Do - Complete - Name - Task'." Done with a Google
Chat **incoming webhook** posted server-side from the existing to-do functions — no
new tab, no new service, no credentials in code. `L10Code.gs` + `L10Setup.gs`:
- **How it posts:** a new `l10NotifyChat_(text)` does a fire-and-forget
  `UrlFetchApp` POST of `{text}` to the webhook URL. It **never throws** (a chat
  hiccup must not block the sheet write) and the message text names nothing about
  how it's generated. The URL is read from **`CHAT_WEBHOOK_URL` in `L10_Config`**,
  or the **`L10_CHAT_WEBHOOK_URL` script property** (which wins). **Blank = off** —
  the feature is opt-in and dormant until Alex pastes a webhook URL.
- **Three hook points** (all already the only paths to create/complete a to-do):
  `l10_addTodo` fires `📝 *L10 To-Do - Added* - {Owner} - {Task}  _(due …)_`;
  `l10_setTodoStatus` fires `✅ *L10 To-Do - Complete* - {Owner} - {Task}` **only on
  the OPEN→DONE transition** (re-confirming an already-DONE row, or un-checking back
  to OPEN, stays silent — it reads the row first to know the prior status and to get
  the Owner/Task for the line). `{Owner}` is the to-do's owner (the deployed web app
  runs as Alex, so *who clicked* isn't knowable — the accountable owner is the right
  name); blank owner → "Unassigned".
- **Multi-assign sends ONE grouped line, not N pings:** `l10_addTodoMulti` (the
  module's New-to-do card, even for one owner) suppresses the per-row pings
  (`_silent`) and posts a single `… - Scott, CJ, Courtney - {Task}` line. IDS
  solve-spawned to-dos and email-ingested to-dos go through `l10_addTodo` and each
  announce individually (each is a discrete new commitment).
- **Set it / test it:** new **L10 Huddle → Chat** submenu — **Set to-do webhook
  URL…** (prompts, writes `CHAT_WEBHOOK_URL`) and **Send test message** (posts a
  sample line so Alex can confirm it lands in the right space). Menu wrappers live in
  `L10Setup.gs` so they don't depend on the optional `L10Mail.gs`.
- **One-time setup (Alex):** in the *Paid Team & Stuart* space → **Apps &
  integrations → Webhooks → Add** (name it e.g. "L10 To-Do Bot"), copy the URL, then
  **L10 Huddle → Chat → Set to-do webhook URL…** and paste it. (Incoming webhooks are
  a Google **Workspace** feature — this works on the `@bradycorp.com` space, not a
  consumer Gmail.) Webhooks post under their own configured name/avatar, not as the
  person who acted.
- **Upgrade:** re-paste `L10Code.gs` + `L10Setup.gs`; run **Setup / repair tabs**
  once to seed the (blank) `CHAT_WEBHOOK_URL` config row *(optional — the Chat menu
  setter also creates it)*; then Deploy → Manage deployments → ✏️ → New version so the
  deployed web app's server calls pick up the hooks (the in-sheet menu already runs
  latest). **No schema change.** Does **not** cover marking a to-do DONE by hand-
  editing the `L10_Todos` Status cell in the tab (no `onEdit` watcher) — only the app
  actions and email-ingested adds; an optional edit-watcher can be added if wanted.

## v1.10 (2026-06-16) — assign a to-do to several people at once
Alex: "update the To-Do's section so there's an option to easily select/check team
members for assignment — if 4 people have a to-do I don't want to rebuild it 4 times."
The **New to-do** card's single owner dropdown is now a multi-select chip row (same
tap-to-toggle pattern as the "who's here?" attendee picker — solid blue + ✓ when on).
Tap any number of people, hit **Add**, and one to-do is created **per person** in a
single action. `L10Code.gs` + `L10Js.html` + `L10Css.html` — **no schema change, no
Setup/repair run** (client + one new server function; web-app redeploy needed):
- **Why N rows, not one row with N owners:** EOS to-dos have a single accountable
  owner, the To-dos page groups by `Owner`, and the Monday heads-up email filters
  per person — so fanning out keeps the per-person lists, the team done-%, and the
  emails all correct. A single row holding `"A, B, C"` in Owner would break all three.
- New server fn **`l10_addTodoMulti`** loops the existing `l10_addTodo` once per
  selected owner (so id minting + the next-Monday due default stay in one place) and
  returns the created items. The single-owner `l10_addTodo` is **unchanged**, so the
  IDS Solve panel and the email reply-ingest path keep working as-is.
- Applies on **both** the standalone **To-dos** page and the in-meeting **To-do list**
  segment — both render the same card and `wireSegment` delegates to `wireShared`, so
  the one handler covers both.
- The IDS **Solve** panel still takes one owner per to-do row (it already supports
  multiple rows for distinct actions) — left unchanged on purpose.
- **Upgrade:** re-paste `L10Code.gs`, `L10Js.html`, `L10Css.html`, then Deploy →
  Manage deployments → ✏️ → New version. No Setup/repair tabs run needed.

## v1.9 (2026-06-16) — opening the app no longer auto-starts the huddle
Alex: "the L10 session starts automatically even when I just want to pop in and
make some updates to to-dos … can we have a start button for actual meetings? I
swear a previous version had that and then it disappeared." Root cause (in the
code since v1, surfaced once a huddle got left OPEN): `renderHuddle()` dropped
straight into the timed in-progress view whenever **any** meeting row was
`Status=OPEN`, and the start screen only showed when there was *no* open meeting.
A previous-day OPEN meeting is auto-closed only *inside* `l10_startMeeting` — which
you reach by pressing Start — so a single un-concluded huddle hid the Start button
permanently and made the meeting "launch by itself" on every open. `L10Js.html` +
`L10Css.html` only — **no schema change, no Setup/repair run** (web-app redeploy
needed since it's client-side):
- **Opening the app always lands on the "Ready to huddle?" start screen.** The
  timed meeting view is entered only after an explicit **Start** or **Resume**
  this session (new `state.inMeeting` flag); a reload returns to the start screen
  even while a meeting row is OPEN. Updating to-dos / rocks / issues from the tabs
  never starts the clock.
- **Resume / discard card** when today's huddle is still open: ▶ Resume picks the
  timed agenda back up (segue notes already rehydrated on boot); **discard it**
  (two-click arm, calls `l10_cancelMeeting`) clears a stray/test huddle straight
  from the start screen — no more "enter it → ⏭ Conclude → discard" dance. A
  **previous-day** open huddle shows a one-line note that it'll be archived when
  you start the next one (unchanged auto-close on Start).
- The start screen clears any stray timer (`clearInterval`) so nothing ticks in
  the background; conclude/discard null out `openMeeting`, so `renderHuddle` resets
  `inMeeting` and self-heals back to the start screen.

## v1.8 (2026-06-15) — scorecard auto-seeds the NB negatives metrics
- `L10Setup.gs`: new `l10EnsureScorecardRows_` (called from `l10Setup`) appends two
  managed scorecard rows **only if their ID is missing** — `SC-012` *NB negatives added /
  week* (num) and `SC-013` *Negatives — est. annualized $ saved / week* (usd). Both are
  `RANGE` metrics whose `Source Ref` is a live `IMPORTRANGE` of the SQR review sheet's
  `Weekly Negatives Impact!B3`/`!B4`. Idempotent like `l10SeedConfig_`, so it lands on an
  already-populated scorecard without duplicating or disturbing edits (unlike
  `l10SeedScorecard_`, which only seeds an empty scorecard).
- **Upgrade:** re-paste `L10Setup.gs`, run **L10 Huddle → Setup / repair tabs** once
  (adds the two rows), then open `L10_Scorecard`, find the `SC-012`/`SC-013` Source Ref
  cells (col I), and click **Allow access** once each to authorize the IMPORTRANGE. Until
  authorized they show `#REF!` and capture skips them with a loud note (never a wrong
  number). If you had manually added these two rows earlier, delete those first so the
  seeded `SC-012`/`SC-013` aren't duplicated.

## v1.7 (2026-06-15) — reply sweep won't silently drop a reply
- `l10ProcessMailReplies` marked every Gmail message processed *before* the skip
  checks ("mark seen no matter what"), so a message skipped for being
  unattributable (or an owner message without `Re:`) was burned permanently —
  never retried, never confirmed. Reordered so only the heads-up itself and
  *handled* replies get marked; an unattributable message is left for the next
  sweep. Surfaced when Alex self-replied and nothing landed (root cause there:
  the hourly trigger wasn't running — but this bug would mask any real miss).

## v1.6 (2026-06-12, evening) — inline editing on every line item

Alex: "I accidentally put in the wrong date. I know I can go to the separate
tabs and do that but I want to be able to do it in the module." Changes
(`L10Code.gs`, `L10Js.html`, `L10Css.html` — no schema; the v1.4/v1.5
Setup/repair run still covers everything):

- **✎ on every editable line** — to-dos (text/owner/due), rocks
  (title/owner/due), issues (text/raiser/account/category). Clicking flips
  the line into an inline edit row (highlighted blue) with Save / Cancel;
  Enter saves, Esc cancels. One line edits at a time.
- **Milestones edit through the same form they're added with**: ✎ on a
  timeline label prefills the rock's add form and flips its button to Save.
- **Selects never eat data**: an issue's multi-account CSV (e.g. "Brady US,
  Marking") or an ex-roster owner that isn't among the dropdown options is
  prepended as the selected option, so saving an untouched field round-trips
  the stored value instead of silently blanking it.
- Rock edits trigger a refresh afterwards (the fiscal-quarter chip is
  computed server-side from the new due date). Server validates text
  non-empty + date format; blank due is allowed on to-dos/rocks (clears it),
  required on milestones (the timeline places them by date).

## v1.5 (2026-06-12, evening) — IDS in EOS order: Identify → Discuss → Solve

Alex's critique of the v1.2 focus mode: opening an issue led with the four
outcome buttons ("you immediately see buttons that let you say 'eh, let's not
talk about this'"); Identify/Discuss had nowhere to take notes; to-dos were
hostage to hitting Solved. Changes (`L10Setup.gs`, `L10Code.gs`, `L10Js.html`,
`L10Css.html`):

- **The module now runs in EOS order**: ① Identify (the issue owner names the
  real problem — its own notes field) → ② Discuss (notes) → ③ Solve (the
  one-line decision + to-dos). The outcome picker is gone; the coach banner
  and the Ctrl+Enter/dictate hint line are gone (Ctrl+Enter still works in
  the solve field, just unadvertised).
- **Identify/Discuss notes persist**: two new `L10_Issues` columns,
  `Identified` and `Discussed` — appended at the END of the header row so
  existing rows keep their column mapping (Setup/repair adds them; the same
  run v1.4 already requires). Notes save on blur and ride along on every
  outcome (solve/park/kill/hub), so the thinking survives even when the
  issue gets no outcome this huddle.
- **To-dos no longer need a solve**: every to-do row has "＋ Add now" which
  creates it immediately (`Source` = the issue id); already-created to-dos
  list under the rows. Anything still filled in is swept up by "Solved —
  save it" exactly as before. Answer to "does the to-do save if you don't
  hit Solved?" — before: no, it silently died; now: yes, if you hit its
  own Add now.
- **Park / Make-it-a-test / Kill demoted** to a "Didn't solve it?" row below
  the Solve panel — present, but no longer the first thing the room sees.
  Each expands its own controls inline (second click collapses).

## v1.4 (2026-06-12, evening) — rock milestones on a to-scale timeline

Alex's ask: "rocks should have mini milestones … under each rock title …
spread out for the quarter … the dates the milestones fall on are actually
represented in that distance to scale … once the last milestone is done the
rock is done." All five files changed; **one run of Setup / repair tabs is
required** (new `L10_Rock_Milestones` tab: ID, Rock ID, Milestone, Due,
Status, Done At, Created, Notes — `MS-*` ids, OPEN/DONE validation).

- **To-scale timeline under every rock** (huddle Rock review + Rocks page):
  the track spans the rock's life — `Created` → `Due`, or a 90-day EOS window
  when no due date is set (stretched if milestones run past it). A milestone
  7 days into a 90-day rock sits at 7/90 of the width. Start/due date caps,
  elapsed-time fill, and a "today" line ride along.
- **No overlaps, guaranteed**: labels (name + date) lane-pack greedily using
  real rendered pixel widths — close-together milestones stack into extra
  label rows with stems connecting each to its dot; same-day dots get a
  minimum horizontal gap; row height grows to fit the lanes. Re-laid-out on
  window resize and on page switches (hidden pages have no measurable widths).
- **Tick-off in place**: click a dot or label to toggle done (✓ green; open
  blue; past-due red). Completing the **last** open milestone auto-marks the
  rock DONE — server-side, so the sheet agrees — with a "🪨 Last milestone
  done" notification. Reopening a milestone deliberately does NOT reopen the
  rock (that stays a human call on the rock's buttons).
- **Inline add** ("＋ milestone" on the rock's meta line — `window.prompt` is
  blocked in the Sheets iframe, so it's an inline name + date form; Enter
  submits). Delete is a two-click arm (✕ → "delete?") on label hover; the
  `n/m milestones` chip on the meta line goes green at n = m.
- Milestones live in their own sheet rows (not JSON) so Alex can bulk-edit
  them in the tab like everything else. No seeds — rocks start clean and the
  team adds milestones as they plan. A pre-setup workbook (tab missing) reads
  as zero milestones and the add API says to run Setup / repair tabs.

## v1.3 (2026-06-12, evening) — capture follows re-pointed Source Refs

Alex's bug report: all five RANGE metrics failed capture with
`could not read 1.089606214614685 — re-point Source Ref`, and the hub tiles
showed 7·6 while his Source Ref cells said 6·1. `L10Code.gs` only:

- **Formula Source Refs work** (the capture failure's root cause): Alex had
  re-entered the refs as live formulas (`='Financial Dashboard v2'!H7`), so
  `getValues()` handed the server the computed *number* (1.0896…) instead of a
  reference string. Capture now reads the Source Ref column's formulas and
  display text separately: a formula cell's own displayed value IS the metric
  value; plain text still resolves as a reference. A typed constant, a formula
  error, or an empty cell fails loudly with a note saying exactly which shape
  the cell is in.
- **HUB metrics honor a filled Source Ref** as an override (formula or
  reference) — blank keeps the auto-count from the hub. An unresolvable
  override falls back to the hub count and says so in the capture notes.
- **The 7·6 vs 6·1 mismatch itself was not a bug** — verified against the live
  hub: 7 live (incl. 3 junk test rows) and 6 ENDED with no Decision logged.
  See "Experiment Hub hygiene" in the open threads above.

## v1.2 (2026-06-12, later) — live-testing iteration with Alex (PRs #77–81)

- **Web-app deploy fix** (#77): `l10BuildMenu` try/catch-wrapped — a stray
  top-level call had crashed `doGet` (`getUi()` is illegal in web-app context).
- **Auto-capture root cause** (#77 partial, #80 final): Sheets **strips a
  leading apostrophe** from stored cell text, so the seeded
  `'Financial Dashboard v2'!H7` refs were stored broken. `l10PullRange_` now
  strips apostrophes and resolves the sheet name itself; seeds use the unquoted
  form. Existing cells work unedited.
- **Top-right notification stack** (#80): green "✓ Successfully …" on every
  confirmed server write (optimistic actions confirm on ack), amber validation,
  red errors. Replaces the bottom toast.
- **Scribe QoL** (#78): multi to-do rows per solve, snippet chips, autofocus +
  autosize + Ctrl+Enter, OS-dictation hint.
- **Conclude affordances** (#79): ⏭ Conclude jump button on every segment,
  two-click "discard this huddle" (status `CANCELLED` — hidden from History and
  the open-meeting check), rail hover.
- **IDS focus mode** (#81): "IDS →" opens a full-screen single-issue module —
  coach line (talk first), then an explicit outcome picker (Solve / Park to a
  1:1 / Make it a test / Kill), each path showing only its own controls; the
  Solve panel labels where to-dos save. Replaced the everything-at-once inline
  panel after Alex's six-point critique.
- Scorecard: drop-to-issue button on **every** metric row (accented when
  off-track), not just off-track rows.

## v1.1 (2026-06-12) — fix pass after Alex's first live session + full code review

User-reported: rock buttons/"drop to issue" looked dead · Kill dead-or-slow ·
hard-to-read text. Review found 10 issues; all fixed:

- **Every server call now surfaces errors** (19 previously-silent failure paths
  → error toasts; Start/Conclude buttons re-enable on failure instead of
  bricking) and a **spinning "saving…" chip** shows whenever a call is in flight.
- **Status changes are instant** (optimistic UI for rock/to-do status, kill,
  park, solve, reopen, votes, cascade) and **hub counts are cached 5 min** —
  the cross-spreadsheet fetch no longer rides on every click. Conclude went
  from ~20 sheet operations to 3.
- **"Send to Experiment Hub ideas" actually works now** — `window.prompt()` is
  blocked inside the Sheets iframe, so the hypothesis is an inline field.
- **To-do done-% math fixed** (Date cells were being compared as strings —
  the % was pinned ~100% and carry-over counts never incremented); conclude
  now validates the meeting row before any side effects.
- **Stale meetings can't hijack Monday**: an OPEN meeting from a previous day
  is auto-closed (`[auto-closed — never concluded]`) and a same-day resume
  updates the attendee list; segue notes rehydrate after a reload instead of
  being wiped and overwritten.
- **Timezone correctness**: client uses local dates (was UTC — evening huddles
  misfiled to-dos and dropped them from the recap); server formats everything
  in the *spreadsheet's* timezone (was script TZ — could split week keys).
- **Capture is forgiving**: manual entries accept `95%` / `$1,234` / `1,234`,
  and anything unparseable warns instead of vanishing; a stray date-typed cell
  in the data tab no longer bricks the whole app load.
- **Contrast pass** (the screenshot-3 fix): small gray text darkened to ≥4.5:1,
  caveats bumped to the safety tier, selected attendee chips are now solid blue
  with a ✓, gray mini-buttons no longer styled like disabled buttons, events
  strip text enlarged.
- Misc: "Finish" no-op button removed (rail + Conclude are the exits), typed
  IDS resolutions survive re-renders (drafts), copy-to-clipboard never claims
  success on failure, ID minting survives >999 rows, concurrent captures can't
  overwrite each other, setup repairs narrow sheets.

**Upgrading an existing install:** replace the contents of all five files in
the Apps Script editor with these versions and save. **v1.4 adds a tab and
v1.5 adds two `L10_Issues` columns**, so run **L10 Huddle → Setup / repair
tabs** once after pasting (it creates `L10_Rock_Milestones`, appends
`Identified`/`Discussed` to the issues header row, and leaves every existing
tab's data untouched — setup is repair-safe). If you deployed a web app, also
Deploy → Manage deployments → ✏️ → New version, or the bookmarked URL keeps
serving the old code (the in-sheet menu always runs the latest saved code).

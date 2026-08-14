# Momentum Huddle — weekly meeting app for the paid media team

One Apps Script web app inside the **MTD Spend — Paid Channel FY26/27** workbook
(the live pacing dashboard Alex works from daily) that runs the team's weekly
huddle in a structured format: Check-in → Metrics → Priority review → Headlines → To-do
list → Solve → Wrap-up, with hard timeboxes, 13 weeks of metrics, and everything
written back to `L10_*` tabs as the audit trail.

**Built 2026-06-12** (requested by Alex: "take the weekly huddles to the next
level — very very similar to a structured system"). Natural home: the **Tuesday 10:00
Weekly Task Review** (moved from Monday as of the week of Jun 15 2026 — see current
state below). Stuart already likes a structured format (his "GSD" format),
so the vocabulary lands upward too.
**Workbook:** <https://docs.google.com/spreadsheets/d/1Xxjn4EI-oyZuMxaew-YEUEDX8EQNRKCB_8O9NHCLEOw/edit>

> **Rebased onto the Momentum Huddle codebase — v2.0 (2026-07-10).** The app now carries the
> GA4 metrics connector (`L10Ga4.gs`), an in-app metric builder, the calm Solve
> accordion + evidence rail, the to-dos P1–P3 upgrades, a Settings page, and a four-slice
> parallel boot — while keeping **every** Brady feature below and the `L10_*` tabs (existing
> data untouched). See [`CHANGELOG.md`](./CHANGELOG.md) (v2.0) for the full list and the
> one-time re-paste / repair-tabs / redeploy steps.

> **Sterility rule (same as every script here):** the in-workbook copies carry
> only neutral technical comments — no reference to this repo or Claude. All real
> documentation lives here. **Team SOP:
> [`../../processes/level10-huddle.md`](../../processes/level10-huddle.md)**
> (sterile, shareable). **New-member visual onboarding one-pager (HTML, sterile):
> [`../../processes/l10-new-member-guide.html`](../../processes/l10-new-member-guide.html)
> (standalone, for sharing) — also opens inside the workbook via
> [`apps-script/L10Guide.html`](./apps-script/L10Guide.html), menu **Momentum Huddle →
> New member guide**.**


> **This README is the slim index.** Deep-dive docs live alongside it:
> version history & current state → [`CHANGELOG.md`](./CHANGELOG.md) ·
> email automation → [`EMAIL-AUTOMATION.md`](./EMAIL-AUTOMATION.md) ·
> Jira sync → [`JIRA-SYNC.md`](./JIRA-SYNC.md) ·
> pre-huddle brief intake (doPost contract) → [`BRIEF-INTAKE.md`](./BRIEF-INTAKE.md) ·
> calendar scheduling (Advanced Calendar Service) → [`CALENDAR.md`](./CALENDAR.md).

## Why this exists (Brady context)

The Monday huddle had no standing agenda; Meta Monday prep is a fresh doc 10
minutes before; to-dos live in heads (Jira exists, nobody uses it); issues
resurface ad hoc. Momentum Huddle supplies the missing structure, and the app removes
the discipline cost of running it: timers keep 5-minute segments at 5 minutes,
the metrics grid auto-pulls what can be pulled, and the Wrap-up segment generates
both the team-chat recap and Alex's **Meta Monday cascade in Stuart's exact
priority order** (revenue/pacing → leading indicators → volume → automation —
never leading with an efficiency cut).

## What's built FOR this team specifically (the QoL layer)

| Feature | Why it's theirs |
|---------|-----------------|
| **Metrics auto-pull** from `Financial Dashboard v2` utilization cells (per-rollup: Brady, Seton/Emedco, PDC, Amazon, Awareness) | The dashboard already computes MTD/projected/utilization — capture snapshots it weekly instead of re-typing |
| **NB negatives metrics rows** — Brady `SC-006`/`SC-007` (added 2026-06-15; renumbered from SC-012/013 in the Jun 26 live-sheet reconcile) + Seton/Emedco `SC-013`/`SC-014` (added 2026-07-15): `Negatives added/wk` + `Est. annualized $ saved/wk` per rollup, `Source Ref` = `IMPORTRANGE` of each SQR review sheet's `Weekly Negatives Impact!B3`/`!B4` (last complete week) | Brady pair ships in the metrics seed; Seton/Emedco pair **auto-added by `l10Setup`** via `l10EnsureScorecardRows_` (idempotent — added only if the ID is missing, so it lands on the *existing* populated metrics grid without duplicating). Surfaces the search-terms loop's impact as a weekly leading indicator; **cost-based, so not subject to the GTM/ROAS caveats**. Source data built by the Ads scripts — see [`../google-ads/README.md`](../google-ads/README.md) ("Weekly Negatives Impact"; the Seton/Emedco variant covers Seton US + Seton CA + Emedco in one shared sheet). One-time IMPORTRANGE allow-access per cell. |
| **A/S metrics rows** `SC-011`/`SC-012`/`SC-015` (added 2026-06-24; Amazon 2026-07-20) | **Auto-seeded by `l10Setup`** via `l10EnsureScorecardRows_`. Brady & Seton/Emedco paid-search **A/S %** (MTD spend ÷ first-touch paid-search order revenue), `RANGE` metrics auto-pulling from `Financial Dashboard v2!K7`/`!K8` (the new A/S column — built by [`../financial-dashboard/README.md`](../financial-dashboard/README.md)). Goals: **Brady <40%, Seton/Emedco <80%** (Alex, 2026-06-24), **Amazon <15%** (Alex, 2026-07-20 — SC-015 reads `!K10`, which divides MTD Amazon spend by **advertised-only** Amazon sales auto-pulled from BigQuery by `RevenuePull.gs` (`mktg_amazon`, halo **excluded**, matching the deep dive — not the console headline; 14-day attribution → early-month reads high)). Needs the dashboard rebuilt + `Revenue Pull` refreshed before capture reads a value; a blank cell makes capture skip loudly, never a wrong number. |
| **Experiments Running metrics rows** `SC-009`/`SC-010` (wired 2026-06-25) | Auto-pull the **live experiment count from Google Ads** — `B4` = Brady (US+CA), `B5` = Seton/Emedco (US+CA+Emedco) of the `L10 - Experiments Scorecard Google Ads pull` tab. Counted only if **non-terminal AND serving impressions in the last day** (not merely "enabled"). Wired by `l10WireExperimentScorecardRows_` (idempotent, in-place; respects a manual override). Text refs, so a not-yet-run script reads blank and capture skips it. Source = two Google Ads scripts, one per MCC — see [`../google-ads/README.md`](../google-ads/README.md). |
| **Experiment Hub integration** (read) | Two auto-metrics: experiments live + verdicts awaiting decision, pulled from the hub sheet |
| **Experiment Hub integration** (write) | Any issue can be sent to the hub's **Ideas** backlog as an `IDEA-*` row ("Send to Experiment Hub ideas") |
| **Caveat chips on every metric** | The documented data gotchas ride along: GTM-defect skew, BQ-leads-source freshness, NB-visitors proxy definition. (Two original chips are resolved and due for in-app retirement: Amazon SB spend missing — mart fix confirmed applied Jul 2026, watched by the health gate — and the 242% budget-mapping artifact, fixed in Financial Dashboard v3.6, 2026-06-23) |
| **Data-source health gate** (v2.9) | The warehouse scores every upstream the metrics depend on (`v_l10_data_health` in Alex's dataset + a live SP-vs-SB mart check) and the app warns the room BEFORE a number is read: red strip naming sick sources, ⛔ "source stale — do not read as current" on mapped metrics in grid and capture. Leads gated ≤8 days behind the spend clock — the false −58% scare can't recur silently. See [`sql/l10-data-health.sql`](./sql/l10-data-health.sql) + `L10Health.gs`. |
| **Meta Monday cascade generator** | Wrap-up builds copy-paste talking points in Stuart's lens order, with `___` blanks where a live number must come from the source tool (never invents numbers) |
| **"Park to 1:1"** | Issues that belong in a smaller room park to the real 1:1s (Courtney Wed 9:30, CJ Wed 10:30, Scott Fri 11:00, Stuart Thu 10:00, Seton/EMEDCO weekly Wed 2:00) |
| **Four-shifts priority tags** | Priorities tag to Alex's FY27 strategic framing (Shift 1–4) + account tags in the team's vocabulary |
| **Priority milestones on a to-scale timeline** (v1.4) | Each priority carries dated mini-milestones plotted proportionally across its life (Created → Due; 90-day default when no due date): tick them off in the huddle, the last one auto-marks the priority DONE; labels lane-pack so close dates never overlap |
| **BDay + fiscal chips** | Header shows "BDay n of N" (Stuart's per-business-day framing) and FY/Q on the Aug-1 fiscal calendar; priority due dates display their fiscal quarter |
| **Events strip** | Seeded with the real calendar: M610/M710 promo, FY27 start, leads-table expiry, Grand Geneva, HR self-eval + year-end windows, the Jun 23 experiment end |
| **Team-level to-do completion %** | The ≥90% target is computed **for the team, not per person** — deliberate (PIP sensitivity); individual lists are visible, the score is collective |
| **To-dos as a daily work surface** (v2.7) | Alex: *"my team is spending 90% of their time in the to-do's section."* The page was built as a 5-minute meeting segment; v2.7 gives it desk-grade controls — **search + Mine/Overdue/Next-7-days filters**, a **top-of-page composer** with Enter-to-add and sticky owner/date, **snooze** (`+1d/+7d/next Monday`), **bulk actions** with a per-row Undo, **sub-steps** (`L10_Todo_Steps`, mirroring priority milestones incl. the last-step roll-up), an **append-only activity trail** (`L10_Todo_Log`), and a **phone breakpoint**. Row updates now splice one row instead of re-rendering six pages |
| **WORKING / BLOCKED to-do states** (v2.7) | "Started it" and "stuck on someone else" stop looking identical to untouched. BLOCKED carries a `Blocked On` note and pings the team chat (WORKING stays silent). ⚠ **The ≥90% definition is unchanged** — both count as still-owed, via one predicate (`l10TodoOpen_`/`todoOpen_`) that replaced every bare `Status === 'OPEN'` test; the Jira create test uses it too, or started/blocked to-dos would never reach the board |
| **Stale to-dos get re-filed, not nagged** (v2.7) | At 3 carry-overs (`TODO_STALE_CARRIES`) a row is flagged once with two doors — **make it a priority** or **take it to Solve**. A 7-day commitment that survives three weeks is misclassified work, not a lazy owner. The carry counter itself moved out of Wrap-up into an idempotent weekly sweep, so skipping Wrap-up no longer freezes the staleness signal |
| **Kudos capture in Check-in** | Matches the room's hype-man culture; kudos log to `L10_Headlines` |
| **To-do → team-chat ping** (v1.11) | Adding or completing a to-do posts `Momentum Huddle To-Do - Added/Complete - {Owner} - {Task}` to the *Paid Team & Stuart* space via an incoming webhook — async visibility (esp. for Stuart, who's never in the room). Opt-in via `CHAT_WEBHOOK_URL`; **live since 2026-06-24** |
| **Per-analyst notifications** (v2.1) | Each person sets, in **Settings → Notifications**, whether they get the day-before **heads-up** and how often the **recap** reaches them (every / every-other / monthly / off) — stored in `L10_Notify`; defaults preserve the old all-send behavior. See [`EMAIL-AUTOMATION.md`](./EMAIL-AUTOMATION.md) |
| **Custom digests** (v2.2) | On top of that, anyone can add **their own scheduled emails** in **Settings → Custom digests** — fully customizable per analyst on **content** (to-dos / priorities / metrics / headlines) **× frequency** (daily / weekdays / weekly) **× time of day**, mix-and-match. Opt-in `L10_Digests` tab; hourly `l10RunDigests` sends on a sheet-timezone clock-hour match, deduped, empty-skipped. See [`EMAIL-AUTOMATION.md`](./EMAIL-AUTOMATION.md) |
| **Seeded with real state** | Priorities from the FY27 goal drafts (flagged "confirm with analyst"), issues from the live problem list (PDC feed, LinkedIn feed, Amazon mapping, NB lead decline, unattached neg lists, Seton stand-up) |
| **Schedule to Google Calendar** (v1.22) | **📅 Schedule** on every issue, headline, and to-do (and the New-to-do form), in the header, and inside Solve opens a calendar.google.com-style day view: the item's text prefills the event title, busy blocks grey out (own events titled, invitees anonymous), click/drag to pick an open slot, invite the room, and it writes the event via the Advanced Calendar service. See [`CALENDAR.md`](./CALENDAR.md) |
| **Quick add from the sheet menu** (v1.21) | **Momentum Huddle → Add headlines… / Add issues… / Add to-dos… / Add priorities… / Update metrics…** — batch-entry dialogs with the app's full form features (multi-owner to-do chips, cascade flag, capture grid) for between-huddle upkeep without opening the app |
| **To-do → source-Solve context** (v1.21) | A to-do born in Solve carries a tappable **`from IS-### ↗`** chip → read-only modal with the issue + its Identify/Discuss/Decide notes and sibling to-dos — a week-old assignment explains itself |
| **Kill stale headlines** (v1.21) | ✕ on any headline (in-huddle or on the page) retires old news from every list, recap and cascade — with Undo; the row stays in the tab as the audit trail |
| **Turn-order Solve voting** (v1.21) | "Start voting round": random first voter, around the room in turn, 3 votes each; the list freezes during the round and auto-sorts by vote total when the room's done |
| **Pre-huddle brief docket** (v1.20) | A ranked "what deserves Solve time" list ($-at-stake, evidence, caveats attached) appears on the start screen when something POSTs it in via the [`doPost` contract](./BRIEF-INTAKE.md); one tap promotes an item to a real issue with the evidence in its Identify notes. (The scheduled `tuesday-pre-brief` poster was retired 2026-07-09 — the docket arrives only if a session or future automation POSTs the JSON) |
| **Analysis playbook + "seen before"** (v1.20) | Typing an issue live-matches the team's standing reports (NB pullback, S-curve read, serving-URL audit, Keep/Kill, hub test — `L10_Playbook`) and past decisions ("IS-014, March — decided: …"), so Solve starts from the record instead of memory |
| **Decision ledger + outcome loop** (v1.20) | Decided issues come due for a "did the fix hold?" verdict in Wrap-up (`Review On`, default +4 weeks); verdicts build the searchable ledger on History — the anti-re-litigation memory |
| **1:1 pages + "My lens"** (v1.20) | A per-person 1:1 page (parked issues, their to-dos/priorities, issues they raised — matches the analyst-led 1:1 format; deliberately no per-person completion %) and a per-browser lens chip that leads lists with your own items |
| **Monday cascade draft** (v1.20) | Monday ~10am email to Alex with fresh live pacing pulls + flagged headlines in Stuart's order — hours before the Monday 1pm meeting the cascade feeds (the Tuesday-huddle cascade always landed a week late) |

## Architecture

```
┌─ MTD Spend workbook ────────────────────────────────────────────────┐
│ L10_Meetings · L10_Scorecard (+_Data) · L10_Rocks (+_Milestones)    │
│ L10_Todos (+_Steps, +_Log) · Issues · Headlines · Events · Config   │
│ L10_Brief · L10_Playbook                             ← database     │
│ Financial Dashboard v2  ← read-only source for utilization metrics  │
└─────────────────────────────────────────────────────────────────────┘
        ▲ bound Apps Script (this folder)            ▲ read/write Ideas, read Experiments
        ▲ doPost (token) ← pre-brief JSON (see BRIEF-INTAKE.md; scheduled poster retired 2026-07-09)
┌───────┴─────────────────────────┐   ┌──────────────┴────────────────┐
│ web app (L10Index/Css/Js)       │   │ Experiment Hub sheet          │
│ • meeting runner w/ timers      │   │ (URL in L10_Config)           │
│ • 13-wk metrics + sparklines    │   └───────────────────────────────┘
│ • Solve voting / decide / park  │
│ • recap + Meta Monday cascade   │
└─────────────────────────────────┘
```

No external services, no credentials, nothing leaves the workbook except the
optional hub read/write (Alex's own sheet).

## Install (~10 minutes, one-time)

⚠️ **Read step 2 — this workbook's script project already has an `onOpen()`**
(the FY27 Goals template). A second `onOpen()` in the same project silently
overrides the first, so this app deliberately doesn't define one.

1. Open the workbook → **Extensions → Apps Script**. Add files and paste:
   `L10Setup.gs`, `L10Code.gs`, `L10Mail.gs`, `L10Ga4.gs` (script files), then `L10Index`,
   `L10Css`, `L10Js`, `L10Guide`, `L10QuickAdd` (File → New → HTML — paste each
   file's contents). Save. (`L10Mail.gs` is optional — only for the email automation
   below; `L10Guide` is optional — only for the in-sheet **New member guide** menu
   item; `L10QuickAdd` powers the menu's Add headlines/issues/to-dos/priorities + Update
   metrics dialogs; `L10Calendar.gs` is optional — only for **📅 Schedule** meeting
   creation, and it needs the Calendar advanced service turned on: **Services (＋) →
   Calendar API → Add**. See [`CALENDAR.md`](./CALENDAR.md). `L10Ga4.gs` is optional —
   only for GA4 metrics; it needs the **Analytics Data API** enabled in the
   script's Cloud project and the `analytics.readonly` scope, plus a `GA4_PROPERTY_ID` in
   `L10_Config` — blank = off.)
2. **Menu merge:** in the existing `onOpen()` (in the FY27 Goals file), add one
   line inside the function body: `l10BuildMenu();`
   Also check the project for any other `doGet()` — there should be none; if one
   exists, the web app can't coexist in this project (use a standalone project +
   script property `L10_SPREADSHEET_ID` instead — `l10Ss_()` supports it).
3. Run **`l10Setup`** once from the editor (or reload → **Momentum Huddle → Setup /
   repair tabs**). Nine `L10_*` tabs appear, seeded.
4. **Verify the auto-pull cells:** `L10_Scorecard` column `Source Ref` points at
   `'Financial Dashboard v2'!H7:H11` (the Utilization column per rollup, June
   2026 layout). If the dashboard layout has changed, re-point them — either as
   text (`Financial Dashboard v2!H7`) or as a live formula
   (`='Financial Dashboard v2'!H7`); both work since v1.3. A wrong ref fails
   loudly at capture; it never writes a wrong number.
5. **Deploy:** Deploy → New deployment → Web app → Execute as **me**, access:
   only yourself (or anyone in the org if the team should open it themselves).
   Bookmark the URL. The in-sheet menu's "Open huddle" works without deploying.
6. Optional: edit `L10_Config` — segment minutes (default = the classic 90-min
   format; the Monday slot may want a 60-min profile), team roster, tags, hub URL.

## Running a huddle (the 30-second version)

Open the app Monday → pick who's in the room → **Start**. The rail walks the
seven segments with countdown timers. Metrics and Priorities are read-only
ON/OFF-track calls — anything off track gets sent to Issues with one
click. Solve: vote, expand the top issue, then ① Identify (owner names the root
cause) → ② Discuss (notes) → ③ Decide (one-line decision + to-dos; "＋ Add now"
saves a to-do without waiting for a decision). Wrap-up: copy the recap to the
team chat, copy the cascade for Meta Monday, everyone rates 1–10, done. Full
SOP: [`../../processes/level10-huddle.md`](../../processes/level10-huddle.md).

## Design decisions (so future sessions don't re-litigate)

- **All globals are `l10`/`L10_`-prefixed** — the script project is shared;
  collisions with the FY27 Goals code (or anything Alex adds later) would fail
  silently. `doGet()` is the single unavoidable global.
- **Team-level (not per-person) to-do completion** — Scott's PIP is active;
  the huddle must not double as a surveillance dashboard. Alex tracks individual
  performance through the PIP process, not here.
- **Seeded priorities are flagged as drafts** — they mirror
  [`goals/fy27-team-goals.md`](../../goals/fy27-team-goals.md), which still
  needs each analyst's confirmation. Same source-of-truth rule as the goals
  template: if a goal changes, that file is canonical.
- **The cascade generator never invents numbers** — blanks (`___`) mark where a
  live number must be pulled, matching the standing never-invent rule and the
  May-28 "basically final" lesson.
- **Owner seeds follow the in-motion transitions** (Brady→CJ, Seton/Emedco→Scott,
  PDC→Scott-departing, Amazon→CJ, Social→Courtney) — edit the Owner columns
  freely as the cutover lands.
- **Weeks key on Monday** (`Week Of`), matching the huddle day and the weekly
  trend report's week framing.
- **BDay chip is a weekday count** (no holiday calendar) with a per-month
  override in `L10_Config` (`BDAYS_OVERRIDE`, e.g. `2026-09=21` for Labor Day).

## Files

| File | What it is |
|------|------------|
| [`apps-script/L10Setup.gs`](./apps-script/L10Setup.gs) | Schema, menu builder (no onOpen!), validations, all seeds (metrics, priorities, issues, events, config) |
| [`apps-script/L10Code.gs`](./apps-script/L10Code.gs) | Server API: four-slice parallel boot, meeting lifecycle, week capture (RANGE/GA4/hub auto-pulls), the metrics builder, priorities + milestones/todos/issues/headlines, Experiment Hub read+write, pre-huddle brief intake (`doPost`), settings, BDay + fiscal math |
| [`apps-script/L10Index.html`](./apps-script/L10Index.html) | App shell + the "How it runs" page (the Momentum Huddle explainer + house rules) |
| [`apps-script/L10Css.html`](./apps-script/L10Css.html) | Styles (Brady-blue accent, Inter, same component language as the Experiment Hub) |
| [`apps-script/L10Js.html`](./apps-script/L10Js.html) | The SPA: huddle runner, metrics grid + sparklines + in-app metric builder, priority milestone timelines, the calm Solve accordion (peek + evidence rail + three resolution doors incl. 🧪 Make-it-a-test) + turn-order voting + issue-context modal, pre-huddle brief docket, the Settings page, history |
| [`apps-script/L10Ga4.gs`](./apps-script/L10Ga4.gs) | **GA4 metrics connector** (new, v2.0): a metric with the `GA4` source pulls sessions/users/revenue/… from the Google Analytics Data API using each viewer's own sign-in — no tokens stored. Needs the Analytics Data API + `analytics.readonly`; property ID in `GA4_PROPERTY_ID`. |
| [`apps-script/L10QuickAdd.html`](./apps-script/L10QuickAdd.html) | The quick-add dialog (v1.21): one templated modal serving the menu's **Add headlines/issues/to-dos/priorities** batch forms + **Update metrics** capture grid — rows funnel through the app's own add functions via `l10_quickAdd` |
| [`apps-script/L10Mail.gs`](./apps-script/L10Mail.gs) | Email automation: personalized Monday heads-up, Gmail reply-ingest of issues/headlines/priorities, Tuesday recap, per-analyst **custom digests** (hourly `l10RunDigests`, sheet-timezone match), triggers + menu items |
| [`apps-script/L10Jira.gs`](./apps-script/L10Jira.gs) | One-way **Momentum Huddle → Jira** to-do sync: OPEN to-do → Jira issue, DONE to-do → issue transitioned to Done; idempotent via the `Jira Key` column; 10-min trigger + **Jira** submenu. Token in script property, settings in `L10_Config`. See the *Jira sync* section above. |
| [`apps-script/L10Calendar.gs`](./apps-script/L10Calendar.gs) | **Google Calendar scheduling** (Advanced Calendar service): book a meeting from any issue/headline with a day-view free/busy picker. `Freebusy.query` + `Events.insert`. Needs the Calendar API added under **Services** once. See [`CALENDAR.md`](./CALENDAR.md). |
| [`apps-script/L10Guide.html`](./apps-script/L10Guide.html) | The visual new-member onboarding one-pager, opened in a modal from **Momentum Huddle → New member guide** (`l10OpenGuide`) — and, since v2.8, from the **? button in the app's nav** (served by `l10_getGuideHtml` into an iframe). Byte-identical to [`../../processes/l10-new-member-guide.html`](../../processes/l10-new-member-guide.html) (the standalone shareable copy) — **keep the two in sync**. |
| [`harness/`](./harness/README.md) | **Headless rendering harness** (v2.8): assembles Index+Css+Js with a stubbed `google.script.run` + realistic four-slice fixtures and drives the app in headless Chromium. The regression gate for any front-end change — run it before pasting into the workbook. |
| [`apps-script/L10Health.gs`](./apps-script/L10Health.gs) | **Data-source health** (v2.9, optional): reads `v_l10_data_health` via the BigQuery advanced service + the SP-vs-SB Amazon mart-block check (INFORMATION_SCHEMA-discovered, drift → UNKNOWN). Cached ~30 min; feeds the metrics strip + per-metric ⛔ flags; **Momentum Huddle → Data health check** menu. Off silently when the service or config is absent. |
| [`sql/l10-data-health.sql`](./sql/l10-data-health.sql) | The one-paste BigQuery pack behind v2.9: creates `v_l10_data_health` in `mktg_alex_langton_paid_media` (the sanctioned write target), verification query, and the run-until-2026-08-13 leads preserve-gap check. |

## Design roadmap → corporation-grade (2026-06-30)

A UX + graphic-design review of the front end (`L10Css`/`L10Index`/`L10Js`/`L10Guide`
+ the `L10Mail.gs` HTML builders) produced a ranked **top-10 next steps to make this
look and feel like corporation-level software** (the bar of Linear/Notion/Asana). Full
write-up: **[`DESIGN-ROADMAP.md`](./DESIGN-ROADMAP.md)** (canonical) and a shareable,
sterile, Brady-branded one-pager **[`design-roadmap.html`](./design-roadmap.html)** (the
HTML itself models step #1 — one token set, a visible focus ring, a reduced-motion guard).

> **Progress: the roadmap is complete — 10/10 (v2.8, 2026-07-28).** #1–3 v1.14 (token source ·
> focus/keyboard · undo+confirm) · #4/#5-scales/#6 v1.15 (present mode · token scales · honest
> sparklines) · #8 v1.16 (corporation-grade emails) · #9 v1.17 (metrics health roll-up + a11y) ·
> **#5's render-helper/pill refactor + #7 guide/first-run + #10 quiet-feedback/timer/surgical-revert
> v2.8**, plus the honorable-mention Solve dialog semantics, the `.ms-tl` ResizeObserver fix,
> loading skeletons and a skip link. See `CHANGELOG.md` (v2.8).

The verdict: competent internal tool, but **no shared source of truth** — Brady blue has
three different hex values across app/guide/email (app `#0a58c4` doesn't appear in the email
palette at all), the only `:focus` rule is `outline:none`, status is colour-only in the grid,
and it's 1,857 lines of `innerHTML` with 67 inline styles. **If you only do three:**
(1) one canonical token source consumed by app+guide+email, (2) a global focus-visible ring +
keyboard-operable controls, (3) undo-on-toast + a Wrap-up confirm. Everything traces back to
four roots: no tokens, no component layer, no room/projection mode, no accessible interaction
baseline.

## Roadmap (deliberately not in v1)

Auto-capture on a Monday time trigger (capture currently happens in-meeting on
purpose — the team should *see* the numbers land; the v1.20 Monday cascade draft
resolves refs live but deliberately does NOT write them) · pulling NB-visitor and
leads numbers from the data feed once goal #9's automated pipeline lands ·
~~a 1:1 view for the parked-issues lists~~ (built, v1.20) · per-quarter priority
rollover ceremony · meeting-notes export to Drive · evidence-suggested priority
statuses (Experiment Hub / Keep/Kill completion feeds propose ON/OFF TRACK, owner
confirms) · a Stuart pre-flight check on the cascade (per-BD normalization, one
number per topic, revenue-first framing) — both offered 2026-07-02, not selected.

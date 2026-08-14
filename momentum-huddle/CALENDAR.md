---
title: "Momentum Huddle calendar scheduling"
summary: "Book a Google Calendar meeting from any issue/headline, with a day-view free/busy picker."
status: live
domain: scripts
source_of_truth: false
---

# Momentum Huddle → Google Calendar scheduling

Books a Google Calendar meeting straight from the huddle — no context switch. From
any issue, headline, or the header **📅 Schedule** button, a modal opens with the
item's text prefilled as the event title and a **calendar.google.com-style day
view** showing when the chosen calendars are busy, so the open slot is obvious. Pick
a time (click / drag), invite people, and it writes the event to Google Calendar.

**Backend:** [`apps-script/L10Calendar.gs`](./apps-script/L10Calendar.gs) ·
**Front end:** the scheduler module in [`apps-script/L10Js.html`](./apps-script/L10Js.html)
+ styles in `L10Css.html` + the header button in `L10Index.html`.

Uses the **Advanced Calendar service** (`Calendar.*`), not `CalendarApp` — free/busy
(`Calendar.Freebusy.query`) and multi-attendee inserts aren't in the basic service.

## One-time enable (per script project)

The advanced service must be turned on once, or the button shows a friendly "turn it
on" note (the rest of the app keeps working):

1. Open the workbook → **Extensions → Apps Script**.
2. Add **`L10Calendar.gs`** (File → New → Script) and paste its contents.
3. Click **Services** (the ＋ beside "Services") → choose **Calendar API** → **Add**.
   Keep the default identifier **`Calendar`**.
4. Reload the app, press **📅 Schedule**, and approve the calendar permission once.

> Shared-project note: this workbook's script project is shared (FY27 Goals + Momentum Huddle).
> Adding the service via the **Services** panel edits the project manifest safely —
> don't paste a hand-written `appsscript.json` over the existing one.

## Config (L10_Config, seeded by `l10Setup`)

| Key | Default | What it does |
|-----|---------|--------------|
| `CALENDAR_ENABLED` | `YES` | `NO` hides the 📅 controls entirely. |
| `CALENDAR_ID` | `primary` | Default calendar new events land on (`primary` = the deploying user's own, or a calendar ID / address). The modal still lets you pick any calendar you can write to. |
| `CALENDAR_DAY_START` | `7` | First hour shown on the day view. |
| `CALENDAR_DAY_END` | `19` | Last hour shown on the day view. |
| `CALENDAR_SLOT_MIN` | `30` | Snap granularity (minutes) for picking a start time. |
| `CALENDAR_DEFAULT_DURATION` | `30` | Default meeting length when the modal opens. |

Attendees + their free/busy overlay reuse the existing **`TEAM_EMAILS`** map
(`Alex=alex@…, Scott=…`). Blank by default — with no map, the day view still shows
the target calendar's own busy blocks (the deploying user's, which is the shared-screen
huddle case). The executing user's `Alex` entry falls back to their own address.

## Server API (called via `google.script.run`)

- **`l10_calContext()`** → `{ enabled, timeZone, me, dayStart, dayEnd, slotMin,
  defaultDuration, defaultCalendarId, calendars[], people[] }`. Returns
  `{ enabled:false, reason }` when the service is off or `CALENDAR_ENABLED=NO`, so the
  UI degrades gracefully. `calendars` comes from `Calendar.CalendarList.list` (writer
  access, primary first).
- **`l10_calDay(dateStr, targetId, extraIds[])`** → `{ blocks[] }` for the day.
  `blocks` = busy intervals in minutes-from-midnight (local), each `{ start, end,
  label, self }`. The **target** calendar's own events come back **with titles**
  (`Calendar.Events.list`); attendee calendars (`extraIds`) come back as anonymous
  `Busy` via `Calendar.Freebusy.query` — **only the target calendar's titles are ever
  exposed** (privacy). All-day events don't grey out the grid.
- **`l10_calCreate(payload)`** → inserts the event with `Calendar.Events.insert` and
  returns `{ ok, id, htmlLink, calendarName, when }`. Wall-clock local `dateTime` +
  explicit `timeZone` so Google resolves DST; `sendUpdates:'all'` when there are
  attendees.

## Front end (the day view)

- **Entry points** — every issue line, every headline line, **every to-do line and
  the New-to-do form**, the **📅 Schedule** header button (blank title), and a
  **📅 Schedule** button inside the Solve overlay (schedule a follow-up for the issue
  you're solving). So it's reachable at every point of the huddle. The item's text
  prefills the event title; on the New-to-do form it uses whatever you've typed so
  far (the to-do doesn't need to be saved first).
- **The picker** — a left form (title, date, length, calendar, invite chips, mini
  month) beside a scrollable GCal-style day column: hour lines, titled busy blocks
  (own calendar) and hatched "Busy" blocks (attendees), a red now-line, and an accent
  **proposed-event** block. Click an open area to place it, drag it to move, drag the
  bottom handle to resize; overlaps flag a non-blocking "this overlaps a busy block"
  warning. On success a panel offers **Open in Google Calendar ↗**.

## Notes / boundaries

- **Sterile** — the in-workbook copy carries only neutral technical comments (no repo
  or AI references), same rule as every script here.
- **No warehouse, no sheet write-back (v1)** — the event *is* the record; nothing is
  written back to the `L10_*` tabs. (A breadcrumb on the source issue is a possible
  later add.)
- **Runs as the deploying user** — free/busy and event creation act as whoever the web
  app executes as (Alex), which is why the default day view is Alex's calendar.

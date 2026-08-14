# Email automation (added 2026-06-14) — heads-up · reply-ingest · recap

[`apps-script/L10Mail.gs`](./apps-script/L10Mail.gs) adds three pieces around the
weekly cadence (Monday heads-up → Tuesday huddle → Tuesday recap). It reuses the
existing server API (`l10_addIssue/_addHeadline/_addRock/_addTodo`, the date and
config helpers) and the `L10_*` schema — no new tabs.

> **Status:** live (2026-06-14) — Alex test-fired the heads-up (delivered) and the
> manager recap to Stuart (delivered and reviewed — looked good).

> **Per-analyst preferences (v2.1, 2026-07-10):** who gets the heads-up, and how often the
> recap reaches each person, is now set **per analyst** in **Settings → Notifications** (the
> `L10_Notify` tab). `l10SendMondayHeadsup` skips anyone with Heads-up = NO;
> `l10SendTuesdayRecap` filters recipients by each person's recap cadence (Every / Every-other
> / Monthly / Off), while `RECAP_TO` addresses always send. Defaults preserve the old
> all-send behavior, so nothing changes until someone opts down. Chat pings stay a team-space
> broadcast (per-analyst chat would need personal webhooks — deferred). See CHANGELOG v2.1.

| Piece | Function | Trigger | What it does |
|-------|----------|---------|--------------|
| **Monday heads-up** | `l10SendMondayHeadsup` | day before `HUDDLE_DAY`, ~7am | One **personalized** email per person: their open to-dos due this week (overdue flagged), their priorities (status + next/this-week milestones), and the reply-with-issues ask |
| **Stuart's Monday ask** | `l10SendStuartHeadsup` | day before `HUDDLE_DAY`, ~7am | A manager-input email to Stuart: makes clear he's **not** in the meeting, invites him to reply with anything for the team to cover, explains it's fully automatic, and notes he'll get the recap after. Same subject Heads-up tag, so the sweep ingests his reply. |
| **Reply ingest** | `l10ProcessMailReplies` | hourly | Scans Gmail for replies to either heads-up and adds each item to the huddle with the sender's name (Stuart's replies attribute to "Stuart") + a "via email" flag. **Confirms back to the sender** (`l10MailConfirmSender_`) recapping exactly what was added, and emails Alex a digest of everything that landed. |
| **Recap** | `l10SendTuesdayRecap` | `HUDDLE_DAY`, ~5pm | Emails the team the meeting's recap (the text saved at Wrap-up, or an auto-summary of issues decided / new to-dos / off-track priorities + the by-the-numbers footer) |
| **Manager recap** | `l10SendStuartRecap` | `HUDDLE_DAY`, ~5pm | Emails Stuart a fuller "here's everything going on" view — full metrics (this week's captured values vs goal, on/off track, in Stuart-lens Sort order), all active priorities (off-track first), what we decided, open to-dos, recent headlines, BDay + FY/Q chips. **Real captured numbers only** — a metric not captured shows "—", never a guess. |
| **1:1 prep packs** | `l10SendOneOnOnePreps` | each 1:1 weekday, ~8am | Emails **Alex** a per-person agenda the morning of each 1:1: parked-for-that-1:1 issues, their open to-dos, their priorities/milestones, and issues they raised. Stuart's (manager) 1:1 gets a *report-up* pack instead: issues parked to Stuart, team off-track priorities, and Alex's own to-dos/priorities. Schedule baked into `L10_MAIL_ONE_ON_ONES_DEFAULT` (Courtney/CJ Wed, Scott Fri, Stuart Thu). |
| **Custom digests** | `l10RunDigests` | hourly | Sends each opt-in `L10_Digests` rule whose (Frequency, Weekday, Hour) matches the current clock-hour in the **sheet timezone**, deduped by a visible `Last Sent` stamp. Each rule picks its own content (to-dos / priorities / metrics / headlines) and schedule; an **empty digest is not sent**. See *Custom digests (v2.2)* below. |

## Custom digests (v2.2, 2026-07-10)

On top of the meeting-anchored heads-up/recap, each analyst can add **any number of
their own scheduled emails** from **Settings → Custom digests** — fully customizable
per person: **what** content, **how often**, and **what time of day**, mix-and-match.
Example: someone wants only a daily to-dos email at 8am → they leave heads-up/recap at
default and add one digest rule `{TODOS, Daily, 8:00 AM}`; another adds a Friday
`{Metrics + Headlines, Weekly, 9:00 AM}`; another adds nothing and is unaffected.

**How it works:**
- New **`L10_Digests`** tab — **one row per rule**, many per person. **Opt-in: no rows
  are seeded** (zero rules is the valid default). Rules are authored in the Settings card
  (`l10_getDigests` / `l10_saveDigests`, replace-all; the set rides in the core boot slice
  as `boot.digests`).
- An hourly trigger `l10RunDigests` fires each run: for every enabled rule, it sends when
  the rule's `Hour` equals the current clock-hour **in the spreadsheet timezone** and the
  `Frequency`/`Weekday` match today (`DAILY` = every day, `WEEKDAYS` = Mon–Fri, `WEEKLY`
  = the named day). The visible **`Last Sent`** stamp (`yyyy-MM-dd HH`) dedupes within the
  clock-hour, so a duplicate trigger run never double-sends. Content reuses the recap/
  heads-up mail kit (one source of truth — the to-do list and priority cards are shared with
  the heads-up); an **empty digest is skipped** (no send, no stamp).
- **No new OAuth scope** (send-only `MailApp` + `ScriptApp` triggers already in use).
- **Menu:** *Email ▸ Run custom digests now* (`l10RunDigests`) and *Test my digest (to me)*
  (`l10TestDigest`, force-sends **your own** rules to you — ignores the schedule + stamp).

**`L10_Digests` schema** (created by `l10Setup`; opt-in, seeds nothing):

| Column | Purpose |
|--------|---------|
| `ID` | Stable rule handle (`D-001`…). Lets a resave preserve `Last Sent` and the card edit/remove a specific rule. |
| `Person` | Rule owner; matches the Owner column / roster name. |
| `Label` | Optional subject label (blank = a label derived from the content, e.g. "To-dos + Metrics"). |
| `Content` | Compact token cell — any of `TODOS, ROCKS, SCORECARD, HEADLINES` (one cell, not four columns, so a new content type never widens the schema). |
| `Frequency` | `DAILY` / `WEEKDAYS` / `WEEKLY`. |
| `Weekday` | `Mon`…`Sun`, used only when `Frequency = WEEKLY` (blank otherwise). |
| `Hour` | `0`–`23` in the **sheet** timezone — the clock-hour the digest sends. |
| `Enabled` | `YES`/`NO` — off keeps the rule but never fires it. |
| `Last Sent` | `yyyy-MM-dd HH` idempotency stamp written by the runner (blank = never). |
| `Updated At` | Last save date. |

**Edge cases:** hour + stamp are computed in the sheet timezone, so DST is handled the
way the rest of the app handles it — a fall-back repeated local hour sends once (same
stamp); a spring-forward missing local hour simply doesn't fire that day (no catch-up).
An off-roster rule (owner removed from `TEAM`) or a rule whose owner has no email is
skipped (no stamp) and surfaced in the card for one-click removal. A rule left with no
valid content, or a non-numeric `Hour`, is rejected on save rather than silently never
firing.

**Reply contract (labeled lines).** Recipients reply with one item per line,
prefixed `Issue:`, `Headline:`, or `Rock:` (also `To-do:`). The script routes by
prefix; an **unlabeled** reply becomes a single **Issue**. The parser is tolerant of
pasted-template formatting — leading bullets (`- `, `* `, `1.`) and markdown bold
(`*Issue:*`, `**Rock** -`) all parse — and strips the quoted original (the
`On <date> … wrote:` header, `>` quotes, `From:`/`Original Message` dividers).
Attribution comes from the sender's address mapped through `TEAM_EMAILS` (falls back
to the email display name). The flag lands in the item's Notes ("Added via email
reply from … on …"); headlines (no Notes column) carry it in the `By` field as
"Name (via email)".

**Auto-add, flagged** (per Alex): items post straight into `L10_Issues` /
`L10_Headlines` / `L10_Rocks` immediately, so they're in the huddle without a
gate — the "via email" marker + the digest email to Alex are the audit trail for
trimming junk. Dedup is per-message (Gmail message ids in a Script Property), so
multiple replies in one thread across the week each get ingested once.

**Owner vs outbound (why a self-test needs a real reply):** the sweep skips the
script's *own outbound* heads-up (it contains example `Issue:`/`Headline:`/`Rock:`
lines that must NOT be ingested), identified as an owner-sent message that is *not*
a `Re:`. A genuine **reply is ingested even from the owner's own account** (subject
starts with `Re:`) — so Alex can email items in and self-test. A reply already seen
on a prior sweep is skipped (dedup), so to re-test, send a fresh reply.

**Replied and nothing landed? (checklist — the sweep is a *trigger*, not code, so
"my files match the repo" does not install it):** (1) **Email ▸ Process replies now**
(`l10ProcessMailReplies`) ingests pending replies on demand — the fastest fix *and*
the diagnostic; its toast reports how many items it added. (2) If that worked, install
the hourly sweep: **Email ▸ Install / refresh triggers**, then confirm an hourly
`l10ProcessMailReplies` row under **Apps Script ▸ Triggers**. (3) A self-reply must
keep the **`Re:`** subject — a non-`Re:` owner message is treated as the heads-up and
skipped by design. (4) A reply already swept once is dedup'd — send a fresh reply, or
clear the `L10_MAIL_PROCESSED` Script Property, to re-test.

**Config** (rows added to `L10_Config` by `l10Setup`):

| Key | Purpose |
|-----|---------|
| `HUDDLE_DAY` | Weekday of the huddle (default **Tuesday**). Drives both the email copy and the trigger days (heads-up = the day before). |
| `TEAM_EMAILS` | **Optional** override. The roster is baked into `L10Mail.gs` (`L10_MAIL_TEAM_DEFAULT` — Alex / Courtney / Scott / CJ at their `@bradycorp.com` addresses), so it works with this blank. Add/remove a teammate by editing that one line in the code; or set this `Name=email` cell to override (names must match the Owner column on priorities/to-dos). |
| `RECAP_TO` | Extra **team-recap** recipients; blank = team only. (Stuart gets the separate, fuller manager recap below — don't also add him here.) |
| `STUART_EMAIL` | **Optional** override of the manager-recap recipient. Baked into `L10Mail.gs` (`L10_MAIL_STUART_DEFAULT` = `stuart_mackay@bradycorp.com`), so it works blank. |
| `ONE_ON_ONES` | **Optional** override of the 1:1 schedule. Baked into `L10Mail.gs` (`L10_MAIL_ONE_ON_ONES_DEFAULT` — Courtney/CJ Wed, Scott Fri, Stuart Thu `:manager`), so it works blank. Format `Name:Weekday[:manager]`; names must match the Owner column. |
| `EMAIL_FROM_NAME` | Display name on the emails (default "Paid Media Momentum Huddle"). |

**Stuart's two-way loop.** Monday he gets the *ask* (reply with anything for the
huddle) → his reply is auto-added and he gets an instant *confirmation* of exactly
what landed → after the huddle he gets the *manager recap*. He's never in the room.
Menu has **send / test** for both his Monday ask and his recap.

**Testing safely.** The `Email ▸` submenu has **Test Stuart's Monday ask (to me)**
(`l10TestStuartHeadsup`) and **Test manager recap (to me)** (`l10TestStuartRecap`) —
both send the *exact* email to you, not Stuart. The matching **Send … now** items
fire to Stuart for real on demand. The recap uses the latest wrapped-up meeting, so
a discarded test huddle is enough to see real layout.

**Install / upgrade:** paste `L10Mail.gs` into the project, run `l10Setup` once
(adds the config rows), then run `l10InstallMailTriggers` (or **Momentum Huddle →
Email: install / refresh triggers**). The team roster is already baked into
`L10Mail.gs`, so there's nothing to fill in unless someone joins/leaves (edit
`L10_MAIL_TEAM_DEFAULT`) or you want to override it in `L10_Config`. First run
prompts for Gmail send + read authorization. Menu items also let you fire the heads-up, the
reply sweep, and the recap on demand. Emails send from — and replies return to —
the account that owns the triggers (Alex's). Sterile by design: no number is
invented, and nothing references this repo or any AI.

⚠️ **Quotas:** ~100 email recipients/day on a consumer `@gmail.com` account,
~1,500/day on Workspace — confirm which account owns the project before scaling
the recipient list.

# Jira sync (L10 → Jira) — added 2026-06-30

One-way push: huddle **To-Dos become Jira issues**, and completing a to-do closes
its Jira issue. The digital-marketing department tracks work in Jira (the **BNADM**
board in the "BNA - Digital Marketing" space), so this gives the wider org visibility
into what the paid team commits to each week — without anyone re-keying anything.
Lives in [`apps-script/L10Jira.gs`](./apps-script/L10Jira.gs) (+ 3 small edits to
`L10Setup.gs`: two `L10_Todos` columns, six `L10_Config` rows, a **Jira** submenu).

**How it works.** A batch sync (`l10JiraSyncTodos`) runs on a 10-minute time trigger
and on demand (menu **Sync now**):
- An **OPEN** to-do with no key → `POST /rest/api/3/issue` (type `JIRA_ISSUE_TYPE`,
  summary = the to-do text, `duedate` carried over, owner assigned when an accountId
  resolves). The returned key is written back to the new **`Jira Key`** column.
- A **DONE** to-do whose issue we created → transition to Done (prefers the
  `JIRA_DONE_TRANSITION` name, else any transition whose target is in the *done*
  status category) and stamp the **`Jira Done`** column so it's never re-processed.
- **Idempotent + safe:** the `Jira Key` column is the dedupe guard (a real key
  `^[A-Z][A-Z0-9]+-\d+$` is skipped; a failure writes `ERR: …` and retries next run).
  Historical already-DONE to-dos are **not** backfilled (no board spam); DROPPED
  to-dos are skipped. Chosen over hooking `l10_addTodo`/`l10_setTodoStatus` so it
  ships **without touching `L10Code.gs` or redeploying the web app**, and it also
  catches to-dos edited straight in the tab (which the chat hook can't).
- **Concurrency lock (2026-06-30):** `l10JiraSyncTodos` takes a `LockService`
  script lock (`tryLock(20000)`) so a manual **Sync now** can't run *at the same
  time* as the 10-min trigger (or a double-click). Without it, two runs both read
  the sheet before either writes keys back and the last rows get created twice —
  the exact dupes seen in first testing (BNADM-437/-438 with no due date, no key in
  the sheet). The `Jira Key` guard prevents dupes *across* runs; the lock prevents
  them *within overlapping* runs. **If a manual delete of a Jira issue leaves a
  stale key in the sheet**, clear that row's `Jira Key`/`Jira Done` cells to re-push
  (the sheet, not Jira, is the sync's memory). Stranded duplicates have no sheet key,
  so the sync never touches them — delete them in Jira by hand.

**No credentials in code or sheet.** The Atlassian API token lives in the
`L10_JIRA_API_TOKEN` **script property** (set via menu); the non-secret settings
(`JIRA_DOMAIN`, `JIRA_PROJECT_KEY`, `JIRA_EMAIL`, `JIRA_ISSUE_TYPE`,
`JIRA_DONE_TRANSITION`, optional `JIRA_USER_MAP`) live in `L10_Config`. Issues are
created as the token owner; the token inherits that user's Jira permissions. Uses the
current `/rest/api/3/search`-era endpoints (`POST /issue`, issue `/transitions`) — the
legacy `/rest/api/3/search` was removed 2025-05-01. Assignment is automatic: an owner
resolves to a Jira accountId via `JIRA_USER_MAP` first, else a one-time cached
user-search on the roster email (`TEAM_EMAILS` override if set, else the baked
`L10_MAIL_TEAM_DEFAULT` roster from `L10Mail.gs`), else the issue is left unassigned
(non-fatal). Assignment applies at **create time**; **Jira → Assign owners on existing
issues** (v2.9.1) retro-assigns keyed open to-dos without overwriting manual picks.

**Deploy (no web-app redeploy needed):**
1. Add file `L10Jira.gs`; re-paste `L10Setup.gs`. Reload the workbook (the menu rebuilds).
2. Run **L10 Huddle → Setup / repair tabs** once (adds the `Jira Key` / `Jira Done`
   columns + the six config rows).
3. In `L10_Config` set `JIRA_DOMAIN` (e.g. `bradycorp.atlassian.net`),
   `JIRA_PROJECT_KEY` (the BNADM project key), `JIRA_EMAIL`.
4. **L10 Huddle → Jira → Set API token…** (paste the token Alex already created).
5. **Jira → Test connection** (confirms auth + lists your project keys so you can
   verify `JIRA_PROJECT_KEY`), then **Sync now**, then **Turn on auto-sync**.

> Logic verified by 21 helper assertions (`node --check` + a stubbed harness,
> 2026-06-30). **✅ Confirmed live end-to-end (2026-06-30):** Alex set the token,
> `Test connection` returned "Connected as Alex Langton · BNADM ✓ found", and a real
> to-do (TD-030) created **BNADM-429** with the right title, description (`L10 ref:
> TD-030`), due date, and reporter (BNADM-429 came in **Unassigned** — see below).
>
> **Owner auto-assignment (2026-06-30):** assignment is now automatic with **zero
> config**. When `L10_Config!TEAM_EMAILS` is blank, `l10JiraTeamEmails_` falls back to
> the **same baked roster the email automation uses** (`L10_MAIL_TEAM_DEFAULT` in
> `L10Mail.gs` — Alex/Courtney/Scott/CJ at their `@bradycorp.com` addresses), so each
> to-do Owner resolves owner → email → Jira accountId (cached) and the new issue is
> assigned. `JIRA_USER_MAP` (explicit accountIds) still wins if set; an unresolvable
> owner just stays unassigned (non-fatal). **Caveats:** needs the token user to have
> "Browse users" permission for the `/user/search` call, the person's Atlassian email
> must match their `@bradycorp.com` address, and assignment is applied at **create
> time only** — new-issue assignment does not touch already-created issues. New
> issues land in the project's default status (**In Progress** on BNADM), which
> doesn't affect the done-close path.
>
> **⚠ REGRESSION (2026-07-10 → 2026-07-28, found via the board going all-Unassigned):**
> the **v2.0 rebase regenerated `L10Jira.gs` without the roster fallback** —
> `l10JiraTeamEmails_` went back to reading only `L10_Config!TEAM_EMAILS`, which is
> blank by design. Result: **every issue created from the v2.0 re-paste onward synced
> unassigned**, and the v2.7 open-predicate change (OPEN/WORKING/BLOCKED now all sync,
> not just OPEN) pushed the whole started/blocked backlog to the board in one burst
> (BNADM-479–492+, Jul 28 ~7:52 AM) — all unassigned, which is what made it visible.
> This doc described the fallback the whole time; the code didn't have it. **Restored
> v2.9.1 (2026-07-28)**, with a warning comment on the function so the next rebase
> doesn't drop it again, verified by a 19-assertion stub harness.
>
> **Retro-assignment (v2.9.1, was "optional upgrade (b)"):** **L10 Huddle → Jira →
> Assign owners on existing issues** (`l10JiraBackfillAssignees`) walks every open
> to-do with a real Jira key and sets the issue's assignee from the Owner column.
> It **never overwrites** an existing assignee (manual "Assign to me" picks survive),
> skips DONE/DROPPED rows (their issues are closed), and reports owners it couldn't
> resolve. Safe to re-run. **Deploy the fix:** re-paste `L10Jira.gs` + `L10Setup.gs`,
> reload the workbook, then run the menu item once — no web-app redeploy needed.
> **Remaining optional upgrades:** (a) create new to-dos into "To Do" via a
> post-create transition; (c) instant push by adding a fire-and-forget
> `l10JiraSyncTodos`-style call inside `l10_addTodo` / `l10_setTodoStatus` (mirrors
> the v1.11 chat hook) — needs an `L10Code.gs` re-paste + web-app redeploy, so it's
> deliberately left out.

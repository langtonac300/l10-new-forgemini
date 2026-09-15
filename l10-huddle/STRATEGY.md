# Strategy tab (v2.14) — cross-account initiatives

> The one page in L10 Huddle that is **not** part of the weekly meeting. It
> houses the team strategist's cross-account Google Ads initiatives ("we should test
> into X", "this worked on Brady US, port it to Seton"), tracks where each one stands
> per account, and spawns ordinary to-dos so the work rides every existing rail
> (To-dos page, huddle to-do review, Jira sync, chat pings, carry-over counter).
> Built 2026-09-15 after Courtney's promotion to strategist. Nothing on the huddle
> agenda changed.

## Why a new object

| Existing home | Holds | Why it wasn't enough |
|---|---|---|
| Rocks (`L10_Rocks`) | one owner, one due date, Shift + Accounts tags | A quarterly commitment. An idea that plays out across five accounts over two quarters doesn't fit one row |
| Experiment Hub (separate sheet) | Ideas backlog → live tests → verdicts | Per test, per account. No notion of "the same idea everywhere" or "proved here, port there" |
| Issues / IDS | this week's decisions | Transient |

The missing object is the **initiative**: a thesis that plays out across accounts,
with a rollout state per account and a learnings trail. The hub stays the record for
individual tests; Rocks stay the quarterly commitments; the initiative links to both.

## Data contract — three new `L10_*` tabs

All created by **Setup / repair tabs**. A pre-upgrade workbook (tabs missing) boots
with the page showing a "run Setup / repair tabs" notice; nothing else breaks.

### `L10_Initiatives` — one row per initiative (`SI-###`)

| Column | What |
|---|---|
| `ID` | `SI-001…` |
| `Initiative` | Title — the theme, e.g. "Demand Gen campaigns across Google accounts" |
| `Thesis` | One sentence: what we believe and why it should transfer |
| `Lead` | Roster name. Defaults to `INITIATIVE_LEAD` (Courtney) |
| `Shift` | FY27 four-shifts tag (`Shift 1`…`Shift 4`), same vocabulary as Rocks |
| `Stage` | `IDEA` → `SCOPING` → `PILOTING` → `ROLLING OUT` → `ADOPTED` / `KILLED` |
| `Origin` | Where it was first proven (free text or a hub `EXP-`/`IDEA-` ref) |
| `Target Quarter` | e.g. `FY27 Q2` — free text, optional |
| `Notes` | Free text, links allowed |
| `Created` | date |
| `Last Touched` | `yyyy-MM-dd HH:mm` — bumped by **every** write against the initiative (edit, stage, cell, log note, to-do added or completed). Drives the staleness flag |
| `Decided At` / `Decision` | Stamped when the stage lands on ADOPTED or KILLED; `Decision` is the one-line verdict |

### `L10_Initiative_Accounts` — the matrix cells (`SA-###`)

One row per (initiative, account). Upserted by the app — never two rows for the same pair.

| Column | What |
|---|---|
| `ID` | `SA-001…` |
| `Initiative ID` | `SI-###` |
| `Account` | One of `ACCOUNT_TAGS` (L10_Config) |
| `State` | `NOT STARTED` · `TESTING` · `ADOPTED` · `REJECTED` · `N/A` |
| `Hub Ref` | The Experiment Hub id this cell's test lives under (`IDEA-###` when sent from here) |
| `Rock ID` | The Rock created from this cell, if any |
| `Note` | One line — what's happening in this account |
| `Updated At` | `yyyy-MM-dd HH:mm` |

### `L10_Initiative_Log` — append-only trail (`SL-###`)

`ID`, `Initiative ID`, `At` (`yyyy-MM-dd HH:mm`), `Who`, `Note`. Same shape and rule as
`L10_Todo_Log`: posting a note never changes state; the trail is the story. The app
writes a line for every stage change, cell change, to-do added / completed, hub send
and rock promotion, plus whatever a person types.

### Config

| Key | Default | What |
|---|---|---|
| `INITIATIVE_LEAD` | `Courtney` | Preselected lead on the add form |
| `INITIATIVE_STALE_DAYS` | `14` | Days since `Last Touched` before an initiative is flagged stale |

`DIGEST_CONTENT` gains `INITIATIVES` (label **Strategy**) so any custom digest can carry it.

## To-dos out of the tab

- The initiative drawer has the same composer the To-dos page uses. A to-do created
  there lands in `L10_Todos` with `Source = SI-###`, so it is an ordinary to-do
  everywhere else: To-dos page, huddle to-do review, Jira BNADM sync, chat line,
  carry-over counter, team stats (new source bucket "From a strategy initiative").
- The drawer lists the initiative's open and done to-dos.
- `Source` on a to-do renders as a tappable **from SI-### ↗** reference that opens
  the initiative — the same convention as `IS-`/`RK-` references.
- A to-do completing against an initiative writes a trail line and touches the
  initiative. An initiative is **never** auto-closed by its to-dos: it ends on a
  decision, not a task count.

## "Not drop off" — the anti-decay rules

Computed the same way on the client (`initFlags_`) and the server (`l10InitiativeFlags_`).

| Flag | Rule | Where it shows |
|---|---|---|
| **No next action** | Stage is PILOTING or ROLLING OUT and the initiative has zero open to-dos | badge on the card (icon + words), matrix row, 1:1 page, digest |
| **Stale Nd** | `today − Last Touched ≥ INITIATIVE_STALE_DAYS` and stage is not ADOPTED/KILLED | same |

Surfaces, none of them the huddle:
- **Strategy page** summary strip: moving / stale / no next action counts.
- **1:1 page** — "Initiatives they lead" card for whoever is selected, flags first.
- **1:1 prep email** (Alex's morning pack) — same card.
- **Custom digest** — `INITIATIVES` section: active initiatives, flagged first, with
  a per-account state line.

Deliberately not built: nag to-dos (they train people to close the nag), a huddle
brief strip (Alex's call, off for v1), auto-pulling results from Google Ads.

## Page anatomy (`page-strategy`, nav **Strategy**)

1. Title + sub, summary strip.
2. View toggle **Board** / **Matrix** (client-only, remembered per browser).
3. **Board**: one column per live stage (Idea, Scoping, Piloting, Rolling out); a
   collapsed **Decided** list for Adopted / Killed. Card = title · lead · shift tag ·
   thesis · flags · account-state summary · stage pill (menu) · Open.
4. **Matrix**: rows = live initiatives, columns = `ACCOUNT_TAGS`. Each cell shows an
   icon + word (`— not started`, `◐ testing`, `✓ adopted`, `✕ rejected`, `n/a`);
   clicking opens a state picker. Colour is secondary to the glyph (Alex is colorblind).
5. **Add an initiative** card: title, lead, shift, accounts (multi-chip), thesis, origin.
6. **Drawer** (overlay, editable): thesis / origin / quarter / notes; per-account rows
   with state, note, **Make it a test** (→ hub Ideas with the initiative id in the
   note), **Promote to rock** (→ `L10_Rocks` with `Source = SI-###`); to-dos +
   composer; the trail + a note box; stage buttons incl. Adopt / Kill with a verdict line.

## Server endpoints (L10Code.gs)

| Function | Does |
|---|---|
| `l10_addInitiative(p)` | title, thesis, lead, shift, origin, quarter, notes, accounts[] → SI row + a NOT STARTED cell per account |
| `l10_editInitiative(id, p)` | title / thesis / lead / shift / origin / quarter / notes |
| `l10_setInitiativeStage(id, stage, decision)` | stage; ADOPTED/KILLED stamp `Decided At` + `Decision` |
| `l10_setInitiativeAccount(p)` | upsert one cell: state / hubRef / rockId / note |
| `l10_addInitiativeLog(p)` | a trail note |
| `l10_sendInitiativeToHub(id, account, hypothesis)` | appends an `IDEA-` row to the hub's Ideas tab (shared writer with the issue path), stores the id on the cell |
| `l10_promoteInitiativeToRock(id, account, p)` | creates a Rock via `l10_addRock` with `Source = SI-###`, stores the id on the cell |

Boot: the three tabs ride the **plan** slice (`initiatives`, `initiativeAccounts`,
`initiativeLog`, `initiativeTabsReady`). `l10_addTodo` / `l10_setTodoStatus` touch the
initiative when a to-do's Source is an `SI-` id (never throws: a missing tab is a no-op).

## Both copies

Same logic in `momentum-huddle/`; only the words differ (Rocks ↔ Priorities). The `L10_*`
names are identical by design — see the root `CLAUDE.md`.

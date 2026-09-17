# Forge — timed idea-generation module (spec, pre-build)

> **Status: specified 2026-09-17, not built.** Target: pasted and smoke-tested before the
> team's FY27 goal-setting day on **Thu 2026-09-24**. The meeting it serves is written up in
> the knowledge base: `general-brady-alex-knowledge-v2/goals/fy27-goal-setting-offsite-2026-09-24.md`.
> Same sterility rule as the rest of the app: the pasted copy carries neutral technical
> comments only.

## Why a new object

The huddle already has a clock (`startSegment` / `tickTimer`), a voting round
(`startVotingRound_`, 3 votes each, list frozen while voting) and doors out of a decision
(to-do, priority, Experiment Hub, Strategy initiative). What it does not have is a way for
**five people to type at the same time** into one shared, timed, phased exercise. The
huddle is deliberately single-screen: round state lives in the client and the room watches
one display. Idea generation needs the opposite: everyone on their own device, silently, in
parallel, with the room screen showing the pulse (timer, count, cards arriving) but not the
authorship.

Forge is that: a **server-authoritative, phased, timed session** with two views of the same
state, a **room screen** (projector) and a **player screen** (phone or laptop), and a data
trail in `L10_*` tabs like everything else. It is built for the goal-setting day, and it is
reusable for any quarterly priority-setting or "we need 40 ideas in 20 minutes" session.

## The two screens

| | Room screen (one, on the projector) | Player screen (one per person) |
|---|---|---|
| Opens from | Momentum Huddle nav → **Forge** → "Open room" (facilitator only) | The same web-app URL with `?forge=<session id>` (shown as a short link + QR on the room screen) |
| Shows | Phase name, prompt, big timer (digits + bar + glyph, colorblind-safe), live idea **count** (team total, never per person), cards flying in as they arrive (anonymous in diverge), the vote tally only after reveal, the shortlist, the goal cards at Commit | The current prompt, one big text box, **Submit** (Enter), "3 submitted this round", their own cards to edit, then vote buttons, then the goal form |
| Controls | Start / pause / next phase / add 60 s / end round early / cluster tools / reveal / lock | None over the phases. Only their own input. |
| Sync | Polls `l10_forgeState` every 3 s | Polls `l10_forgeState` every 3 s; submits write straight through |

Identity: the player picks their name from the roster (`TEAM` in `L10_Config`) once; the
choice is kept in `localStorage` with a device token so a refresh does not re-ask. Low
stakes, so no login. The facilitator's device is whichever one opened the room.

## Phases (the state machine)

One session runs these phases in order; the facilitator can skip or repeat any of them.
Each phase has a default length (seconds) in config; the room screen's timer is computed
from `Phase Started At` on the server, exactly the way `tickTimer` does it today, so every
device shows the same clock.

| # | Phase | Default | Player can | Room shows | Ends with |
|---|---|---:|---|---|---|
| 0 | **Lobby** | — | pick name, see who is in | roster with ✓ as people join, QR | facilitator presses Start |
| 1 | **Warm-up** | 180 s | type one personal-goal line | count only | auto → next when timer ends (facilitator can hold) |
| 2 | **Diverge** (× 4 rounds) | 300 s each | submit unlimited cards, edit own | cards arriving anonymous, team count vs target (`FORGE_IDEA_TARGET`), "quiet round" glyph | timer; facilitator Next |
| 3 | **Build** (× 2 rounds) | 240 s each | see one card dealt to them (not their own), add a "yes-and" line | the dealt pairs as they fill | timer |
| 4 | **Cluster** | 480 s | read-only | facilitator drags cards into themes; **Suggest themes** (Gemini, guarded) proposes 5–8 theme names + assignments as a starting point; every card also takes an Account / Shift / Lever tag | facilitator Next |
| 5 | **Vote** (blind) | 300 s | 5 dots (max 2 on one card) + 1 revenue super-vote ($) | "n of 5 voted", no tallies | timer → **Reveal** animation: cards re-sort by (super-votes, dots) |
| 6 | **Claim** | 300 s | tap Claim on a card in the top N (one owner per card; a second tap asks) | shortlist with owner chips; unclaimed top cards flagged | facilitator Next; unclaimed cards → parking lot |
| 7 | **Forge** (per person) | 2100 s | fill the goal form (below) for each claimed card, up to `FORGE_GOALS_PER_PERSON` | one card per person with a **SMART meter**: five checks lighting up as fields fill (word + glyph, never color alone) | facilitator Next |
| 8 | **Doctor** (pairs) | 900 s | see the partner's goal, answer the 6 yes/no checks, write one "what would Stuart ask?" line; author sees it and edits | pair chips, "n of 4 reviewed" | timer |
| 9 | **Commit** | 300 s | read-only | each person's goals read aloud; per goal the facilitator sets the scorecard **metric ID** and a **Q1/Q2 milestone** | facilitator presses **Lock** |
| 10 | **Locked** | — | rate the day 1–10 (same widget as Wrap-up) | ratings avg, parking lot count, "written to N goal tabs" | session `Status = LOCKED` |

Pairs for Doctor come from the roster in order with a rotation (Courtney↔CJ, Scott↔Allaina,
then shift by one); the facilitator can override.

### Ad-hoc phase: **Timed write** (any time, any phase)

The facilitator's "for the next 10 minutes, everyone write down…" button. A small sheet on
the room screen: **prompt** (free text, or pick one from the seeded thought-experiment deck
in `FORGE_PROMPTS.thought`), **minutes** (default 10, chips 3 · 5 · 7 · 10 · 15), **mode**
(silent write · write then one line each). Pressing **Go** pushes every player screen into
a write view with that prompt and the same server-anchored timer; cards land in
`L10_Forge_Ideas` with `Round = "T"` and `Prompt` = the text, anonymous by default, and
the current phase resumes where it was when the timer ends (the phase's own clock is
paused underneath, the same way `segPausedAt` works). Cards from a Timed write are ordinary
cards afterwards: they can be clustered, voted, claimed and parked.

### Always available: the **wheel** (random person picker)

A header button in Forge **and** in the huddle (`🎡 Pick someone`), because "who goes
first?" is a huddle problem too. It opens a full-screen overlay: a wheel of the roster's
**team photos** (`L10_Team`, already in the boot payload as `photos`; a name falls back to
its initial chip exactly like `who()` does), spins for ~3 s with easing, lands on one
person, says the name in large text and in the live region, and offers **Spin again** ·
**Take them out for the rest of this session** (fair rotation: excluded people are greyed
with a word, not just a colour) · **Everyone back in**. Client-side only (`Math.random`
over the not-excluded roster, the wheel animation is presentation); `prefers-reduced-motion`
gets a short shuffle of the chips and the reveal instead of the spin. The exclusion set is
per session (`localStorage`, cleared when the session locks or the huddle concludes).
Nothing is written to the sheet. Optional: the Solve segment's "random first voter" reuses
the same overlay so the pick is visible instead of a toast.

## The goal form (phase 7) — the revenue ladder

Stricter than plain SMART on purpose. Field names double as the `L10_Goals` columns.

| Field | Input | Validation (drives the SMART meter) |
|---|---|---|
| Title | text, ≤ 80 chars | non-empty, starts with a verb (soft check: warns) |
| Type | Business / Personal | one Personal per person required before Lock |
| Revenue Line | select from `FORGE_LINES` (config JSON: label → FY27 number string) | required for Business |
| Rung | Revenue/pacing · Leading indicator · Volume · Automation | required for Business |
| Lever | Spend allocation · Efficiency · Conversion · New channel/audience · Measurement · Automation | required for Business |
| Metric | text | required |
| Metric Source | text (tool + caveat) | required; the meter's **M** lights only when Metric, Source and Target are all present |
| Baseline | text or "size first" | required (the literal "size first" is accepted and flagged as milestone 1) |
| Target | text | required |
| Deadline | date, within FY27 | required; **T** lights |
| Done When | text (artifact + number + read-out) | required; **S** lights when Title + Done When present |
| Leading Indicator (Metric ID) | select from active `L10_Scorecard` rows | optional at Forge, required at Commit for Business |
| Dollars At Stake | text with source, or "unknown" | required; the literal "unknown" is accepted |
| Shift | 1–4 | required for Business |
| Milestone Q1 / Q2 | text + date | required at Commit; becomes the rock |

**A** (achievable) and **R** (relevant) light from the Doctor phase: the partner's checklist
answers, not the author's own fields.

## Data contract — four new `L10_*` tabs

Same rules as every other tab: header strings are internal identifiers, new columns only at
the end, rows are never deleted (status columns instead), the tabs are the database.

### `L10_Forge_Sessions` (`FS-###`)

`ID · Date · Title · Status (OPEN / LOCKED / DISCARDED) · Facilitator · Phase · Round ·
Phase Started At · Phase Seconds · Paused At · Prompt Deck (JSON) · Themes (JSON) ·
Ratings (JSON) · Participants · Created · Locked At · Notes · Timed Write (JSON)`

### `L10_Forge_Ideas` (`FI-###`)

`ID · Session ID · Round · Prompt · Idea · By · Anon (YES/NO) · Created · Build By · Build ·
Theme · Account · Shift · Lever · Dots · Super Votes · Status (RAW / BUILT / SHORTLIST /
CLAIMED / GOAL / PARKED / DROPPED) · Claimed By · Goal ID · Parked To (SI-### / hub id) ·
Updated At`

`By` is always stored (audit trail); `Anon = YES` hides it on every screen until Claim.
Dots and super votes are tallies maintained from the votes tab, never edited by hand.

### `L10_Forge_Votes` (`FV-###`)

`ID · Session ID · Idea ID · By · Kind (DOT / SUPER) · At`

One row per dot so blind voting is auditable and re-tallying is a pure function. The
player screen enforces 5 dots, max 2 per idea, 1 super; the server re-checks.

### `L10_Goals` (`G-###`)

`ID · Session ID · Person · FY · Goal No · Type · Title · Revenue Line · Rung · Lever ·
Metric · Metric Source · Baseline · Target · Deadline · Done When · Leading Indicator ·
Dollars At Stake · Shift · Milestone Q1 · Milestone Q1 Due · Milestone Q2 · Milestone Q2 Due
· Doctor By · Doctor Checks (JSON) · Doctor Note · Status (DRAFT / LOCKED / SUPERSEDED) ·
Idea ID · Rock ID · Written To Sheet At · Created · Updated At`

`L10_Goals` is the app's own record. The HR-facing view is the existing per-person
**`<Name> — FY27 Goals`** tab in the same workbook (Goal 1–5 blocks: label in column B,
value in C, shift in D, rows Title / Deadline / SMART / Done / Status). Lock writes each
goal into the next free block of that person's tab (SMART = the ladder fields joined into
one paragraph; Done = Done When; Status row left for the quarterly check-ins). **Verify the
block layout against the live sheet before wiring the writer**; the export used for this
spec shows the labels but the exact row offsets must be read from the tab, not assumed.

### Config (`L10_Config`, new keys)

| Key | Default | Meaning |
|---|---|---|
| `FORGE_ENABLED` | YES | Show the nav entry. |
| `FORGE_PHASES` | JSON `[["Warm-up",180],["Diverge",300,4],["Build",240,2],["Cluster",480],["Vote",300],["Claim",300],["Forge",2100],["Doctor",900],["Commit",300]]` | Phase name, seconds, optional round count. |
| `FORGE_PROMPTS` | JSON `{rounds:[…], wildcards:[…], build:"…", warmup:"…", thought:[{title, prompt, minutes}…]}` | Seeded with the deck from the knowledge-base guide §5 (rounds, wildcards drawn per person, build, warm-up) and §5b (the eight thought experiments for Timed write). |
| `FORGE_TIMED_WRITE_MIN` | 10 | Default minutes for an ad-hoc Timed write. |
| `WHEEL_ENABLED` | YES | Show the `🎡 Pick someone` header button in Forge and in the huddle. |
| `FORGE_IDEA_TARGET` | 40 | The team-count target shown in Diverge. |
| `FORGE_DOTS` | 5 | Dots per person in Vote. |
| `FORGE_DOT_MAX_PER_IDEA` | 2 | |
| `FORGE_SUPER_VOTES` | 1 | Revenue super-votes per person. |
| `FORGE_SHORTLIST` | 12 | Cards eligible to claim after reveal. |
| `FORGE_GOALS_PER_PERSON` | 5 | Hard cap; the Personal one counts. |
| `FORGE_LINES` | JSON, label → FY27 number string | Seeded from the knowledge-base guide §1 (numbers as text, so the app never computes with them). |
| `FORGE_POLL_SEC` | 3 | Player/room poll interval. |
| `FORGE_GOAL_SHEET_SUFFIX` | ` — FY27 Goals` | Per-person tab suffix the Lock writer targets. |

## Server endpoints (L10Code.gs or a new `L10Forge.gs`)

All `l10_forge*`, all returning `{ok, ...}`; every write bumps the session's cache version so
the next poll sees it. State is served from `CacheService` (write-through, 30 s TTL,
key = session id + version) so five clients polling every 3 s cost cache hits, not tab reads.

| Endpoint | Who | Does |
|---|---|---|
| `l10_forgeCreate(title)` | facilitator | new `FS-###` OPEN in Lobby; seeds prompt deck from config |
| `l10_forgeState(sessionId, sinceVersion)` | everyone | phase, round, timer anchor, roster joined, counts, the cards visible in this phase (anonymized per phase rules), tallies only if phase ≥ Reveal, goals if phase ≥ Forge; returns `{unchanged:true}` when the version matches |
| `l10_forgeJoin(sessionId, name, deviceToken)` | player | marks joined; rejects a name not on the roster |
| `l10_forgePhase(sessionId, action)` | facilitator | `start` / `pause` / `resume` / `next` / `back` / `add60` / `end` (`end` = end the timer early, keep the phase) |
| `l10_forgeTimedWrite(sessionId, prompt, seconds, mode)` | facilitator | sets `Timed Write (JSON)` on the session (`{prompt, seconds, mode, startedAt}`), pauses the phase clock; `l10_forgePhase(..., 'endWrite')` clears it and resumes the phase |
| `l10_forgeAddIdea(sessionId, text, round)` | player | appends `FI-###` RAW, Anon = YES in Diverge; `round = "T"` while a Timed write is live, with its prompt |
| `l10_forgeEditIdea(ideaId, text)` | owner only, same phase | |
| `l10_forgeDeal(sessionId)` | facilitator (auto on entering Build) | assigns each RAW/BUILT card a builder ≠ author, round-robin, at most `ceil(cards / people)` each |
| `l10_forgeBuild(ideaId, text)` | the dealt builder | writes Build By / Build, Status = BUILT |
| `l10_forgeCluster(sessionId, assignments)` | facilitator | Theme + Account/Shift/Lever tags in bulk |
| `l10_forgeSuggestThemes(sessionId)` | facilitator | Gemini: card texts in, 5–8 theme names + assignments out; passes `l10GeminiGuardNumbers_` (no figures may appear that were not in the cards); result is a proposal the facilitator applies or discards |
| `l10_forgeVote(sessionId, ideaId, kind)` / `l10_forgeUnvote` | player | enforces the per-person budget; tallies recomputed |
| `l10_forgeReveal(sessionId)` | facilitator | freezes tallies, marks top `FORGE_SHORTLIST` as SHORTLIST |
| `l10_forgeClaim(ideaId)` / `l10_forgeUnclaim` | player | CLAIMED / Claimed By; a second claimant gets `{ok:false, heldBy}` |
| `l10_forgeSaveGoal(goal)` | player (own) | upsert `G-###` DRAFT |
| `l10_forgeDoctor(goalId, checks, note)` | the paired reviewer | |
| `l10_forgeCommit(goalId, metricId, ms1, ms1Due, ms2, ms2Due)` | facilitator | |
| `l10_forgeLock(sessionId)` | facilitator | validates 4 + 1 per person (configurable), writes each goal to `<Name> — FY27 Goals`, creates a rock per Business goal from Milestone Q1 (`L10_Rocks` with `Source = G-###`, `Metric ID` = the leading indicator), parks unclaimed SHORTLIST cards to the Strategy tab as IDEA-stage initiatives (`Origin = FS-###`) or, when tagged "test", to the Experiment Hub ideas backlog, posts the recap to the chat webhook, sets Status = LOCKED |
| `l10_forgeRate(sessionId, name, rating, note)` | player | same shape as the huddle rating |
| `l10_forgeDiscard(sessionId)` | facilitator | DISCARDED (not shown in history) |

## Page anatomy

- **Nav:** `Forge` after `Strategy`. Not part of the meeting; opening it never starts a
  huddle. Hidden when `FORGE_ENABLED = NO`.
- **Forge home:** "New session" · open session card (Resume / Discard, same pattern as the
  huddle's resume card) · past sessions (date, ideas, goals, rating) → a read-only replay.
- **Room view** (`body.present` works as it does for the huddle): header = phase chip +
  prompt; center = the timer (digits, bar, and a glyph: ▶ running · ⏸ paused · ⚑ over time,
  never color alone); below = the phase body (card wall / theme columns / tally board /
  shortlist / goal cards / SMART meters); footer = facilitator controls and the QR + short
  link for players.
- **Player view:** a single-column, phone-first page. One prompt, one input, one button.
  The bottom dock shows "3 this round · 11 total" and the timer as text. On phase change the
  page announces it in a live region and re-renders; nothing typed is lost (a draft is held in
  `localStorage` per phase).
- **Cards:** text, theme pill, tag glyphs (account / shift / lever), dot count as digits,
  a `$` badge with a count for super-votes; author chip appears only from Claim onward.
- **SMART meter:** five tiles S · M · A · R · T, each "lit" = filled glyph + the word,
  "unlit" = hollow glyph + the word. A goal card cannot be Committed with an unlit tile.

## Engagement mechanics (what makes it not a form)

- **Silence is enforced by design, not by asking:** in Diverge the room screen shows a
  "quiet round" glyph and the player screen has nothing to read but the prompt.
- **"Next 10 minutes, everyone write…" is one button.** Timed write takes over every
  screen at once, so a thought experiment never depends on people hearing the instruction.
- **The wheel picks, not the manager.** Who presents first, who reads first, who demos:
  a spin with faces on it. It removes the "Courtney again" reflex and the volunteer pause.
- **Anonymous cards in Diverge.** The new hire's idea and the strategist's idea look the
  same on the wall. Names appear at Claim, when ownership is the point.
- **The wall moves.** Cards fly in as they land (a 300 ms transition, `prefers-reduced-
  motion` respected). The team count ticks toward the target; hitting it flashes the count
  once and chimes (`TIMER_CHIME` respected).
- **Dealt builds.** Nobody chooses which idea to build on; the app deals one to each
  person. Every idea gets at least one "yes-and".
- **Blind vote, then reveal.** Tallies stay hidden until the timer ends, then the wall
  re-sorts in one animation. No anchoring on the first dot.
- **The revenue super-vote.** One `$` per person, visibly heavier than a dot in the sort.
  It is the "is this about the number?" question, asked mechanically.
- **Claim is a tap, and it is public.** Ownership is chosen by the owner, in front of the
  room, in a timebox.
- **The SMART meter lights as you type.** A goal that is a to-do in disguise stays dark on
  M and T; the author sees that before Alex has to say it.
- **The Doctor is a peer, not the manager.** The checklist is answered by a colleague; the
  "what would Stuart ask?" line is the only free text.
- **Ratings at the end**, same widget as the huddle, so the day gets a number too.
- Team-level counts only. No per-person leaderboard: the huddle's to-do target is a team
  number for the same reason.

## Gemini (sanctioned, guarded)

Two uses, both optional and both behind `GEMINI_ENABLED`:

1. **Suggest themes** in Cluster (above). Proposal only; the facilitator applies it.
2. **Tighten this goal** on the goal form: rewrites the author's fields into one SMART
   sentence *using only the author's own words and numbers*; runs
   `l10GeminiGuardNumbers_` and discards a draft that introduces any figure. Shown as a
   suggestion beside the field, never written without a tap.

No Gemini call may invent a target, a baseline or a dollar figure. "size first" and
"unknown" stay as typed.

## Doors out of Forge (reuse, not new objects)

| From | To | How |
|---|---|---|
| Locked Business goal | `L10_Rocks` (priority) | Milestone Q1 → rock with `Source = G-###`, `Metric ID` = leading indicator; Q2 milestone → `L10_Rock_Milestones` |
| Locked goal | `<Name> — FY27 Goals` tab | Lock writer (above) |
| Unclaimed shortlist card | Strategy tab (`L10_Initiatives`, IDEA stage, `Origin = FS-###`) | `l10_forgeLock` |
| Card tagged "test" | Experiment Hub ideas backlog | existing hub door (same as Solve's "Make it a test") |
| Anything else | `Status = PARKED`, visible on the session replay | nothing lost |
| Session recap | team chat webhook | one message: n ideas · n goals locked · parking lot n · rating |

## Both copies

Logic ships in both `l10-huddle/` and `momentum-huddle/`. Vocabulary differs only where a
person reads it: the rock created at Lock is a "Rock" in one copy and a "Priority" in the
other; Solve/IDS wording follows each copy. Tab and column names are identical in both.

## Build plan (estimate, one session)

1. `L10Setup.gs`: four tabs + headers + config keys + seeds (prompt deck, lines). Repair-tabs
   must add them to an existing workbook without touching data.
2. `L10Forge.gs`: endpoints above, cache-backed state, tally function, deal function, Lock
   writer (verify the FY27 Goals block layout on the live sheet first), rock creation via
   the existing `l10_addRock` path, parking via the existing initiative/hub paths.
3. `L10Js.html`: nav entry, Forge home, room view, player view (URL param routes to it
   before the normal boot; player boot is one call, not the four-slice boot), poll loop,
   timer reuse, card wall, tally board, goal form + SMART meter, Doctor view, Commit view,
   the Timed write sheet, and the wheel overlay (also wired to the huddle header).
4. `L10Css.html`: card wall, meter tiles, phone-first player layout, reduced-motion rules.
5. `harness/`: stubs for every `l10_forge*` endpoint; a smoke that runs a session Lobby →
   Locked with two fake players, checks anonymity in Diverge, the dot budget, the reveal
   sort, the SMART meter gating, and that Lock produces one rock per Business goal.
6. Paste both copies, repair tabs, redeploy, dry-run with one colleague on a phone.

Rough size: comparable to the Strategy tab (v2.14: three tabs, one page, ~15 endpoints).
Forge is four tabs, two views, ~20 endpoints, plus the poll loop. Budget a full session and
a harness pass; the Lock writer is the only part that touches a sheet the app did not create.

## Open decisions for Alex (pick before building)

| Decision | Recommendation | Alternative |
|---|---|---|
| Name | **Forge** (nav), "Idea Forge" in copy | "Sprint", "Ideas" |
| Player identity | roster pick + device token (no login) | require the deploying-domain Google login (only if the web app is already deployed "anyone in domain") |
| Diverge anonymity | on by default, names at Claim | names always visible |
| Goals per person | 4 Business + 1 Personal, enforced at Lock | 3–5 with 1 Personal (the goal tabs' wording) |
| Where the Lock writes | `L10_Goals` **and** the `<Name> — FY27 Goals` tab | `L10_Goals` only; Alex copies to the tabs by hand |
| Allaina's frame | same form, `Deadline` may sit at Day 30/60/90 | a separate "ramp" type |
| Gemini theme suggestions | on, proposal only | off for the first run |
| Wheel in the huddle too | yes (header button, replaces the random-first-voter toast) | Forge only |
| Timed write anonymity | anonymous by default, like Diverge | named (useful for "swap seats" prompts where the author matters) |

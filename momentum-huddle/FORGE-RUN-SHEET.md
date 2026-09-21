# Forge — run sheet for the FY27 goals day (Thu 2026-09-24)

One page for the facilitator. The room screen is the projector; everyone else has the
player link open on their own laptop. Default timings come from `FORGE_PHASES` and can be
edited in `L10_Config` before the day; +60 s, Pause and "End the clock" are always there.

## The day before (Wed)

1. **Paste v2.18** into the Apps Script editor: `L10Setup.gs`, `L10Forge.gs`,
   `L10ForgeJs.html`, `L10ForgeCss.html`. Save.
2. **Momentum Huddle → Setup / repair tabs** once. This moves the `FORGE_*` config values
   to the goals-day defaults (only rows you never edited) and adds `FORGE_SEED_CARDS` and
   `FORGE_TIMED_WRITE`.
3. **Deploy → Manage deployments → New version** on the existing web app.
4. In `L10_Config` check:
   - `TEAM` lists everyone who will be in the room (the roster is the door — a name not on
     it cannot join). Add Allaina if she is in.
   - `FORGE_SEED_CARDS`: the 39 cards from Stuart's goals and the team backlog. Edit,
     add or delete rows if you want a different deck; `[]` means no seeds.
   - `FORGE_LINES`: the twelve FY27 goal areas a goal can serve. Seed cards' areas must
     match these labels.
   - `FORGE_PASSWORD` blank (no gate). `FORGE_TIMED_WRITE` NO.
5. Open **Forge** in the app, pick your name, **discard** any old open session, then
   **New session** → "FY27 goals day" → **Create and open the room**. The Lobby should
   show "The wall is seeded · 39". Copy the player link from the Lobby and paste it into
   the meeting invite. Open it once yourself on another browser to check it loads.

## In the room

| When | Facilitator clicks | Everyone does | Room screen shows |
|---|---|---|---|
| Arrive | nothing yet | opens the link, picks their name, **I'm in** | roster ticking ✓ |
| **Start** | ▶ Start: New ideas | — | the ideas prompt + a 10:00 clock |
| New ideas · 10 min | (Pause / +60 s if needed) | writes cards: what is missing from Stuart's list for *their* accounts; one idea per card, anonymous | new cards arriving, count vs target 15; a note that 39 seeded cards are waiting |
| **Next →** Claim · 10 min | Next phase → | claims the cards they will turn into goals (Claim / Release); can still add a card | the whole wall grouped: *New this session*, then each FY27 goal with its cards; who holds how many |
| **Next →** Write the goal · 40 min | Next phase → | on each claimed card: **Make it a goal** → the form (title and FY27 goal are prefilled; add metric, source, baseline, target, date, done-when; **More fields** for rung/lever/guardrail); **+ personal goal** for the personal one | one tile per person: cards written, SMART tiles lit |
| **Next →** Peer review · 10 min | Next phase → | reviews the next person's goals: four checks, one improvement, a verdict | who reviews whom; reviews in |
| **Next →** Commit · 10 min | for each business goal: leading indicator (optional), **Q1 milestone by 2026-10-31**, Q2 milestone → **Commit this goal** | reads along | every goal card with its milestones |
| **🔒 Lock the goals…** | reads the preview, fixes any warning it names, **Lock it** (click twice) | rates the day 1–10 from their screen | the locked summary |

Total: about 80 minutes of clock plus the talking between phases. The brief is **3 to 5
goals per person including one personal**; the Lock preview flags anyone under two
business goals and any business goal without a dated Q1 milestone.

**Wheel:** `🎡 Pick someone` in the room header whenever someone has to go first.
**Back:** ← steps back one phase. **Sessions:** ← Sessions leaves the room without ending it.

## What Lock writes

- Each person's `<Name> — FY27 Goals` tab: the Goal N blocks (title, deadline, the SMART
  sentence, done-when) — found by scanning column B, never assumed. No tab = the goals
  stay in `L10_Goals` only, and the preview says so.
- One **priority** per business goal with a dated Q1 milestone (the Q2 milestone under it).
- A one-line recap in the team chat. **Never a to-do.**
- Seeded cards nobody claimed stay on the wall (they are the brief); a claimed-then-released
  team card is parked as an IDEA initiative on the Strategy page.

## If something goes wrong

- **Someone cannot join:** their name is not in `TEAM`. Add it in `L10_Config`, they reload.
- **The link shows the old app or nothing:** the web app was not redeployed as a new version.
- **The wall is empty in the Lobby:** the session was created before the re-paste. Discard
  it and create a new one; the seeds load at creation.
- **The phase clock or a click does nothing:** open ← Sessions and reopen the room; state
  lives on the server, nothing is lost.
- **A phase you need is missing:** edit `FORGE_PHASES` in `L10_Config` (keys: OPENER
  DIVERGE RELAY CLUSTER VOTE COMMITTEE CLAIM HANDOFFS FORGE DOCTOR COMMIT; order matters),
  then reopen the room.
- **You want the passphrase curtain back:** set `FORGE_PASSWORD` to a word.

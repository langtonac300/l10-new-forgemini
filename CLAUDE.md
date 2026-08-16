# CLAUDE.md — L10 / Momentum Huddle app

> Context file for Claude Code. Read before editing anything here.

**This repo is the canonical home of the weekly-huddle Apps Script web app** that runs
Alex Langton's paid-media team meeting inside the **MTD Spend — Paid Channel FY26/27**
workbook. It ships the app twice, same code, different vocabulary.

## ⚠ Two things to know before you touch anything

**1. A second, older copy of this app exists in the knowledge base.**
`general-brady-alex-knowledge-v2/scripts/l10-huddle/` is a fork of `l10-huddle/` here.
As of 2026-08-16 **this repo is ahead** — v2.10 (2026-08-13) vs the hub's v2.9
(2026-07-30), with 11 files diverged. **Edit here, not there.** If you find yourself
editing the hub's copy, stop: you are working on a stale fork, and nothing reconciles the
two automatically. (Resolution of the duplicate — mirror-note vs. delete — is Alex's call
and is still open.)

**2. The sterility rule is absolute.** The copies pasted into the live workbook carry
**only neutral technical comments** — no reference to this repo, to Claude, or to any AI
tool. Gemini is Brady's sanctioned AI. All real documentation stays here. This applies to
`.gs`/`.html` comments, commit-message content that ends up pasted, and anything written
into a Google Sheet, Jira ticket, or email the app sends.

## What's in here

| Folder | What it is |
|--------|-----------|
| [`l10-huddle/`](./l10-huddle/) | The original app — EOS "Level 10" vocabulary (Rocks, IDS, Segue, Scorecard, Conclude) |
| [`momentum-huddle/`](./momentum-huddle/) | The same app rebranded **Momentum Huddle**, EOS terminology stripped from everything a person reads |

Each folder is self-contained and has its own `README.md` (slim index), plus deep-dive
docs: `CHANGELOG.md` (version history + current state), `EMAIL-AUTOMATION.md`,
`JIRA-SYNC.md`, `BRIEF-INTAKE.md` (the `doPost` contract), `CALENDAR.md`,
`DESIGN-ROADMAP.md`.

### The vocabulary mapping (user-facing only)

| EOS term | Momentum Huddle |
|----------|-----------------|
| Rocks | Priorities |
| IDS (Identify · Discuss · Solve) | Solve (Identify · Discuss · Decide) |
| Segue | Check-in |
| Scorecard | Metrics |
| Conclude | Wrap-up |
| "L10 Huddle" / "Level 10" / EOS / Traction | Momentum Huddle |

**Code identifiers, file names, and the `L10_*` Sheet tab/column names are deliberately
unchanged in both copies** so they deploy and store data identically. Only what a person
reads differs. When you change one copy's *logic*, the other almost always needs the same
change — when you change one copy's *wording*, it usually does not.

## The data contract: `L10_*` tabs

Everything the meeting produces is written back to `L10_*` tabs in the workbook as the
audit trail — meetings, issues, headlines, to-dos, metrics, config, digests, briefs,
carry-over, chat, events, experiments. **Never rename an `L10_*` tab or column** to match
the Momentum vocabulary; existing data is keyed on those names and both copies share the
schema.

## Cross-repo paths — read this before "fixing" a broken link

The `README.md` files contain relative links like `../../processes/level10-huddle.md` and
`../../goals/fy27-team-goals.md`. These are **not broken paths to a sibling folder** —
they are left over from when this app lived at `scripts/l10-huddle/` inside the knowledge
base, and they resolve into that repo:

| Link in the READMEs | Actually lives in |
|---|---|
| `../../processes/level10-huddle.md` | `general-brady-alex-knowledge-v2` — the sterile, shareable team SOP |
| `../../processes/l10-new-member-guide.html` | `general-brady-alex-knowledge-v2` — standalone onboarding one-pager, **byte-identical to `apps-script/L10Guide.html`; keep in sync** |
| `../../goals/fy27-team-goals.md` | `general-brady-alex-knowledge-v2` — FY27 team SMART goals |

Don't rewrite them to point at local files that don't exist, and don't create local copies
to satisfy them — that would fork those docs too.

## Related repos

**Pairs with [`general-brady-alex-knowledge-v2`](https://github.com/langtonac300/general-brady-alex-knowledge-v2)** —
Alex's knowledge base: who's on the team, Stuart's priorities, FY27 goals, the huddle SOP,
and the number caveats. Its `repos.md` carries the estate-wide pairing and firewall rules.
This file covers *the app*; that one covers *the business*.

**🚫 Firewalled from [`momentum-huddle-for-revenue`](https://github.com/langtonac300/momentum-huddle-for-revenue)** —
that repo is the **public-safe commercial** build of this same app, sold as a licensed
workbook template. Code patterns may flow outward; **Brady-internal material must never
reach it** — no account names, spend figures, team members, goals, or real fixtures. Treat
that repo as already public.

## Working conventions

- **Apps Script is not deployed from git.** Edits here are mirrored by pasting into the
  bound Apps Script editor. Follow each folder's `README.md` for the re-paste / repair-tabs
  / redeploy sequence — some versions need a one-time migration step.
- **The harness is the test.** `harness/` is a headless Chromium build that stitches the
  HTML pieces into a preview and smoke-tests them. Run it before pushing front-end changes.
- **Alex is colorblind.** Anywhere color carries meaning, pair it with a label, icon, or
  shape — never color alone.
- **Never invent a number.** The recap and cascade emails must only carry figures the app
  actually pulled. A blank source is skipped loudly, not filled with a plausible value.
- **Meta Monday cascade order is Stuart's, not ours:** revenue/pacing → leading indicators
  → volume → automation. Never lead with an efficiency cut.

# UX redesign canvas — 2026-09-25

Alex's Claude Design canvas for the Priorities page, exported from the same project as
[`../ux-2026-09-15/`](../ux-2026-09-15/README.md) and kept here as the source of truth for
the layout.

| File | What it is | Status |
|---|---|---|
| `Priorities Page Redesign v4.dc.html` | The Priorities page: a quarter card (day *n* of *N*, milestones due so far, status + owner filters), one table on a shared quarter axis with rows grouped by what needs attention, an inline milestone panel, an off-track "why", the "yes, still on track" answer to the milestone nudge, what moved this week, the linked metric as weekly bars, and a side-sheet composer | **Shipped as v2.19** (both copies) — see the v2.19 changelog entry |
| `support.js` | The canvas runtime the `.dc.html` file loads (generated; needs `window.React` — the file renders inside the Claude Design editor, not standalone). Byte-identical to the 09-15 copy | reference only |
| `github.md` | The canvas project's own sync notes | reference only |

Only **v4** is kept: the export also held v1–v3, which Alex set aside ("do the latest version").

Notes that shaped v2.19, same as the 09-15 pair: the canvas types in DM Sans and its accent is
navy; the live app keeps Inter and its own accent blue and pill system, and adopts the canvas's
semantic tones (red off track, amber needs a check / behind pace, green on track / done).
Glyph + word everywhere colour carries meaning — Alex is colorblind. Where the canvas and the
app's data model differ, the app's won:

- **"Since last huddle"** in the canvas is a stored snapshot; the app reads "the last 7 days"
  from dates it already keeps (a milestone's `Done At`, a late milestone's `Due`) plus the new
  `Previous Status` column, which is written only when the status actually changes.
- **The status group hint** says "take it to Solve" in this copy (the canvas's "IDS it" is the
  EOS copy's wording).
- **Shift** isn't drawn on the row (as in the canvas) but is kept: it sits in the composer's
  optional line, the edit form and the panel's id line.
- **Sample content only** in the canvas; no real figures.

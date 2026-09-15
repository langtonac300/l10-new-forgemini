# UX redesign canvas — 2026-09-15

Alex's Claude Design canvas for two pages, exported from the "Forgemini UX redesign"
project and kept here as the source of truth for the layouts.

| File | What it is | Status |
|---|---|---|
| `Strategy Page Redesign.dc.html` | The Strategy page: triage-first card, board/matrix merged into one row-per-initiative table with a dense Matrix view behind a toggle, sheet-based composer, compressed archive | **Shipped as v2.15** (both copies) — see `../../STRATEGY.md` and the v2.15 changelog entry |
| `To-dos Page Redesign.dc.html` | The To-dos page: week-progress + day-spine header, grouping by when it's owed, one compact row with a per-person filter, drawer for steps/trail, docked bulk bar | **Parked** — not built |
| `support.js` | The canvas runtime the `.dc.html` files load (generated; needs `window.React` — the files render inside the Claude Design editor, not standalone) | reference only |
| `github.md` | The canvas project's own sync notes | reference only |

Notes from the canvas that shaped v2.15: type in the canvas is DM Sans, the live app
keeps Inter; the app's own tokens (accent blue, pill system) are kept, and the canvas's
semantic tones for cell states and stages are adopted. Glyph + word everywhere colour
carries meaning — Alex is colorblind. Sample content only; no real figures.

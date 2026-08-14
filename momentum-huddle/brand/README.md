# Momentum Huddle — brand assets

## `logo-animation.html`

A self-contained **animated Momentum Huddle logo** (a brand "sting"): 30 particles
collapse inward under a damped-spring physics simulation, then the badge — three
rising bars representing momentum — and the wordmark form out of the collapse.
Intended as a loading/splash or brand-intro moment.

Built precisely to the design handoff: the exact particle-physics constants
(`N=30`, spring `K=70`, damping `C=2.8`, `2.0s` sim), the staged CSS reveal
timing (badge `1.35s`; bars `1.5/1.62/1.74s`; wordmark `2.0s`; sub-label `2.18s`),
the house reveal easing `cubic-bezier(.16,1,.3,1)`, and the Brady color/type
tokens (DM Sans, navy `#003087` / mid-navy `#3366a8` / orange `#FF6B00`).

- **Self-contained** — no external requests. DM Sans is embedded as a data-URI
  `@font-face`; all CSS/JS is inline. Open the file directly in any browser.
- **Two variants** — Navy (default, the signature look) and Light, via the
  top-right toggle.
- **One-shot** — plays once on load, then rests in its final state. Click the
  logo (or focus it and press Enter/Space) to replay.
- **Accessible** — keyboard-operable replay with a visible focus ring; honors
  `prefers-reduced-motion` (shows the settled mark instantly, no particle motion).

### Sub-label note
The handoff's sub-label read `L10 MEETING SOFTWARE`; per the Momentum Huddle
rebrand (EOS terms removed) it now reads **WEEKLY MEETING SOFTWARE**. Change it in
the `#sublabel` span.

### Where it's used in the app
This file is the standalone reference (mirrors the handoff's own `reference.html`).
The same animation is **wired into the app as a brand intro that plays on every open**:

- `L10Index.html` — a head gate sets `<html class="mh-intro-on">` *before first
  paint* (on every open; skipped only when the viewer prefers reduced motion), plus
  the overlay markup and the DM Sans font link.
- `L10Css.html` — the `.mh-intro*` overlay styles + keyframes.
- `L10Js.html` — the self-contained physics module (wrapped so it can never break
  boot); it plays over the boot fetch, then removes the overlay.

It never taxes the fast four-slice boot: the splash overlays the boot fetch rather
than delaying it. Regression-tested by `harness/run.js` (the intro mounts, plays,
dismisses, and replays on the next open).

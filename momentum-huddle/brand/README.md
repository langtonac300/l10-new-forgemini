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

### Using it inside the app
This is a standalone reference asset (mirrors the handoff's own `reference.html`
pattern). To make it the app's boot/splash or a brand-intro, port the `<style>`
block and the physics `<script>` into the app's files (`L10Css.html` /
`L10Js.html`) following their existing patterns — the physics loop has no
dependencies. It is **not** wired into the app boot yet: a one-shot ~2.7s splash
would sit in front of the deliberately-fast four-slice boot, so placement/trigger
is a product call (see the PR description).

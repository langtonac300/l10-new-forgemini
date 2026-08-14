# l10-new-forgemini

Two copies of the same weekly team-meeting web app (a Google Apps Script tool
bound to the paid-media team's workbook):

- **[`l10-huddle/`](./l10-huddle/)** — the original app, which uses EOS
  "Level 10" vocabulary (Rocks, IDS, Segue, Scorecard, Conclude).
- **[`momentum-huddle/`](./momentum-huddle/)** — a duplicate rebranded as
  **Momentum Huddle**, with the EOS terminology replaced throughout the
  user-facing UI, emails, and docs:

  | EOS term | Momentum Huddle |
  |----------|-----------------|
  | Rocks | Priorities |
  | IDS (Identify · Discuss · Solve) | Solve (Identify · Discuss · Decide) |
  | Segue | Check-in |
  | Scorecard | Metrics |
  | Conclude | Wrap-up |
  | "L10 Huddle" / "Level 10" / EOS / Traction | Momentum Huddle |

  Code identifiers, file names, and the `L10_*` Google-Sheet tab/column names are
  intentionally left unchanged, so this copy deploys and stores its data exactly
  like the original — only what a person reads changed.

Each folder is self-contained — see its own `README.md` to install and run.

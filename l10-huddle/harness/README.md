---
title: L10 Huddle rendering harness
summary: Assembles the real L10 web app with a stubbed google.script.run and drives it in headless Chromium — the regression gate for any front-end change.
status: live
domain: scripts
source_of_truth: false
---

# L10 Huddle — headless rendering harness

There is no Apps Script runtime here, so this harness does what `doGet()` does:
it splices `L10Index.html` + `L10Css.html` + `L10Js.html` into one standalone
page, stubs `google.script.run` with fixtures shaped exactly like the four boot
slices (`l10_bootCore/Work/Plan/Scorecard` — see `l10BootWork_` and friends in
`L10Code.gs`), and drives the result in headless Chromium. The v2.7.2 pass
built a throwaway version of this and it caught four defects invisible in
source review; v2.8 rebuilt it properly — **run it before pasting any front-end
change into the workbook.**

## Run it

```bash
cd scripts/l10-huddle/harness
npm init -y && npm i playwright-core   # once; browsers are NOT downloaded
node build.js                          # → preview.html
node run.js                            # smoke suite (exit 1 on any failure)
node run.js --shots                    # + full-page screenshots into shots/
node server-checks.js                  # node-only: the .gs logic behind capture + the Jira sync
```

`run.js` launches the system Chromium (`/opt/pw-browsers/chromium` in the
managed environment — edit `executablePath` for a local machine, or point it at
any Chrome). It fails on any console error, page error, or broken flow.

## What the smoke suite covers

- Boot: four slices resolve, the start screen replaces the spinner.
- Every nav page renders non-empty.
- Team photos: the fixture photo replaces one initial, an uploaded PNG is
  resized and sent as a JPEG data URI under the cell budget, Remove restores
  the initial.
- Team stats: lazy-fetched once, tiles match hand-computed fixture values at
  13 and 52 weeks, the repeats toggle and Refresh work, and the per-person
  table carries no % column.
- To-dos: composer expands on focus and survives a filter re-render; the steps
  drawer opens; select-mode shows checkboxes + the bulk bar; a ✓ done click
  persists through `l10_setTodoStatus` (the Jira-sync contract).
- Scorecard sparklines draw; the guide overlay mounts its iframe;
  a meeting starts.
- `#firstrun` (empty-workspace fixtures): the setup checklist renders with its
  three doors.
- Metrics capture: the "could not be read" notes appear under the capture button,
  survive the re-render a capture triggers, get replaced by the next capture,
  dismiss, and clear on a clean one.

## Server checks (no browser)

`server-checks.js` loads `L10Setup.gs` + `L10Code.gs` + `L10Jira.gs` into a node
`vm` with small stubs for the Apps Script services (Sheets, Properties, Lock,
UrlFetch, ScriptApp) and a tiny in-memory Jira, then runs the scenarios the
browser cannot reach: the tab reader's first-column rule for a duplicated
header, the range resolver's failure reasons, and the Jira sync's promise that
one to-do never becomes two issues — duplicate header, fresh create with the
`huddle-td-###` label, label rejected, a write-back that does not stick (one
create, halt, trigger off, nothing created on the next run), duplicate ids, a
failed duplicate check, and the duplicate report. Run it alongside `run.js`
before pasting `L10Code.gs` or `L10Jira.gs` into the workbook.

## Editing fixtures

`fixtures.js` holds one realistic mid-quarter dataset (WORKING/BLOCKED and
carried to-dos, steps + trail, IDS-linked issues, a killed headline, brief
docket, milestones, all scorecard source types). The stub **throws on any
server function without a fixture** — that's deliberate: a renamed endpoint
fails the run instead of passing silently. Add the fixture, don't loosen the
stub. Keep shapes in lockstep with the boot builders in `L10Code.gs`.

Generated files (`preview.html`, `shots/`, `node_modules/`) are gitignored —
only the four source scripts and this README are tracked.

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
```

`run.js` launches the system Chromium (`/opt/pw-browsers/chromium` in the
managed environment — edit `executablePath` for a local machine, or point it at
any Chrome). It fails on any console error, page error, or broken flow.

## What the smoke suite covers

- Boot: four slices resolve, the start screen replaces the spinner.
- Every nav page renders non-empty.
- To-dos: composer expands on focus and survives a filter re-render; the steps
  drawer opens; select-mode shows checkboxes + the bulk bar; a ✓ done click
  persists through `l10_setTodoStatus` (the Jira-sync contract).
- Scorecard sparklines draw; the guide overlay mounts its iframe;
  a meeting starts.
- `#firstrun` (empty-workspace fixtures): the setup checklist renders with its
  three doors.

## Editing fixtures

`fixtures.js` holds one realistic mid-quarter dataset (WORKING/BLOCKED and
carried to-dos, steps + trail, IDS-linked issues, a killed headline, brief
docket, milestones, all scorecard source types). The stub **throws on any
server function without a fixture** — that's deliberate: a renamed endpoint
fails the run instead of passing silently. Add the fixture, don't loosen the
stub. Keep shapes in lockstep with the boot builders in `L10Code.gs`.

Generated files (`preview.html`, `shots/`, `node_modules/`) are gitignored —
only the four source scripts and this README are tracked.

repo: langtonac300/l10-new-forgemini
branch: main
path: momentum-huddle

## Last sync
date: 2026-09-15T18:44:10Z
### Updated in this project
- Redesigned the **Strategy** page: triage-first card, board/matrix merged into one row-per-initiative table, plus a dense Matrix view behind a toggle, sheet-based composer, compressed archive.
- Redesigned the **To-dos** page: week-progress + day-spine header, grouping by when it's owed (Owner as a toggle), one compact row with a per-person filter, drawer for steps/trail, docked bulk bar.
- Copied `momentum-huddle/apps-script/L10Js.html` and `L10Css.html` as the source of truth for existing render logic and the app's real chrome metrics.

## Screen map
| Screen | Built from |
|---|---|
| Strategy Page Redesign.dc.html | momentum-huddle/STRATEGY.md; momentum-huddle/apps-script/L10Js.html (renderStrategy, initStripHtml_, initBoardHtml_, initMatrixHtml_, initArchiveHtml_, renderInitiativeDrawer_, openInitCellPicker_); L10Css.html |
| To-dos Page Redesign.dc.html | momentum-huddle/apps-script/L10Js.html (renderTodos, todoLine, addTodoCard, todoFilterHtml_, todoBulkBarHtml_, staleNudgeHtml_, drawerBtnHtml_, doneThisWeekCardHtml_, sortTodos_, todoMatches_); L10Css.html |

## Notes
- Both redesigns are design prototypes, not paste-ready Apps Script. Type is DM Sans (the project's bound design system); the live app uses Inter.
- Glyph + word everywhere colour carries meaning — Alex is colorblind.
- Sample content only; no real spend, account or performance figures.

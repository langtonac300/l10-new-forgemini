// Headless smoke run of the assembled Momentum Huddle app. Boots preview.html, walks every
// page, exercises the load-bearing flows, and fails on any console error,
// pageerror, or unhandled gs() rejection. Screenshots land in ./shots/.
// Usage: node run.js [--shots]
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const SHOTS = path.join(HERE, 'shots');
const wantShots = process.argv.includes('--shots');
if (wantShots && !fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS);

const errors = [];
let shotSeq = 0;

async function shot(page, name) {
  if (!wantShots) return;
  shotSeq++;
  await page.screenshot({ path: path.join(SHOTS, String(shotSeq).padStart(2, '0') + '-' + name + '.png'), fullPage: true });
}

async function clickNav(page, target) {
  await page.click(`nav button[data-page="${target}"]`);
  await page.waitForTimeout(120);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
  });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  // NOTE: browser.newPage() creates an ISOLATED context per page — localStorage
  // never leaks between the preview variants, so each starts snapshot-free.
  // Skip the brand intro in the functional flows (it has its own test below);
  // it now plays on EVERY open, so suppress it via reduced-motion (its only gate).
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.goto('file://' + path.join(HERE, 'preview.html'));
  // Boot: all four slices resolve → the huddle start screen replaces the spinner.
  await page.waitForFunction(() => {
    const el = document.querySelector('#page-huddle');
    return el && !el.querySelector('.spinner');
  }, { timeout: 10000 });
  await page.waitForTimeout(200);
  await shot(page, 'start-screen');

  // Every page renders without error.
  for (const p of ['scorecard', 'rocks', 'strategy', 'headlines', 'todos', 'issues', 'oneonone', 'history', 'teamstats', 'settings', 'how']) {
    await clickNav(page, p);
    const empty = await page.$eval('#page-' + p, (el) => el.innerHTML.trim().length);
    if (empty < 40) errors.push(`page-${p} rendered nearly empty (${empty} chars)`);
    await shot(page, 'page-' + p);
  }

  // --- To-dos page (v2.16 layout): week card + spine, quick add, sheet, rows, drawer, bulk ---
  await clickNav(page, 'todos');
  const tdw = await page.$eval('.tdw', (el) => el.textContent.replace(/\s+/g, ' '));
  if (!/%\s*done this week|—\s*done this week/.test(tdw)) errors.push('week card missing its percentage: ' + tdw.slice(0, 80));
  if (!/target 90% by the huddle/.test(tdw)) errors.push('week card caption missing the target line');
  const spine = await page.$$('.tdw-day');
  if (spine.length !== 10) errors.push('day spine should have Late + 7 days + Later + No date = 10 cells, got ' + spine.length);
  const groupsWhen = await page.$$eval('.tdg-h .tdg-l', (els) => els.map((e) => e.textContent.trim()));
  if (!groupsWhen.includes('Late')) errors.push('grouping by when should start with a Late group: ' + groupsWhen.join('|'));
  const rows0 = await page.$$('.tdr');
  if (rows0.length !== 5) errors.push('to-dos page should list the 5 open fixture to-dos, got ' + rows0.length);
  // The composer lives in a sheet: opens from the header button, the draft survives a page re-render, Enter adds and keeps it open.
  await page.click('[data-tdnew="1"]');
  await page.waitForTimeout(200);
  if (!(await page.$eval('#td-new', (el) => el.style.display !== 'none'))) errors.push('new-to-do sheet did not open');
  await page.fill('#td-new .js-td-text', 'Harness to-do survives re-render');
  await page.evaluate(() => renderTodos());
  await page.waitForTimeout(150);
  const keptText = await page.$eval('#td-new .js-td-text', (el) => el.value);
  if (keptText !== 'Harness to-do survives re-render') errors.push('sheet draft lost on re-render: "' + keptText + '"');
  await page.click('#td-new .js-td-owner[data-name="Courtney"]');
  const tdAddBefore = await page.evaluate(() => window.__GS_CALLS.length);
  await page.press('#td-new .js-td-text', 'Enter');
  await page.waitForTimeout(300);
  const tdAddCall = (await page.evaluate(() => window.__GS_CALLS.slice())).slice(tdAddBefore).find((c) => c.fn === 'l10_addTodoMulti');
  if (!tdAddCall) errors.push('sheet Enter did not add through l10_addTodoMulti');
  else if (tdAddCall.args[0].text !== 'Harness to-do survives re-render' || (tdAddCall.args[0].owners || []).join() !== 'Courtney') errors.push('sheet sent the wrong payload: ' + JSON.stringify(tdAddCall.args[0]).slice(0, 120));
  if (!(await page.$eval('#td-new', (el) => el.style.display !== 'none'))) errors.push('sheet closed after Enter — it should stay open for a burst');
  const clearedText = await page.$eval('#td-new .js-td-text', (el) => el.value);
  if (clearedText !== '') errors.push('sheet text not cleared after adding: "' + clearedText + '"');
  await page.click('#td-new [data-tdsheetclose]');
  await page.waitForTimeout(120);
  // Quick add never leaves the page: with no lens set, Enter opens the sheet with the text carried over.
  await page.fill('.js-tdq-text', 'Quick one');
  await page.press('.js-tdq-text', 'Enter');
  await page.waitForTimeout(200);
  const quickCarried = await page.$eval('#td-new .js-td-text', (el) => el.value).catch(() => null);
  if (quickCarried !== 'Quick one') errors.push('quick add did not carry the text into the sheet: ' + JSON.stringify(quickCarried));
  await page.click('#td-new [data-tdsheetclose]');
  await page.waitForTimeout(120);
  // Drawer: opens from the row, shows steps, adds a step through l10_addTodoStep.
  await page.click('.tdr [data-tdopen="TD-101"]');
  await page.waitForTimeout(200);
  if (!(await page.$eval('#td-overlay', (el) => el.style.display !== 'none'))) errors.push('to-do drawer did not open');
  const tdDrawerTxt = await page.$eval('#td-overlay', (el) => el.textContent);
  if (!/Export search terms/.test(tdDrawerTxt) || !/1 of 3 done/.test(tdDrawerTxt)) errors.push('drawer does not list the fixture steps');
  const stepBefore = await page.evaluate(() => window.__GS_CALLS.length);
  await page.fill('#td-overlay .js-tdstep-text', 'Harness step');
  await page.click('#td-overlay .js-tdstep-add');
  await page.waitForTimeout(250);
  const stepCalls = await page.evaluate(() => window.__GS_CALLS.map((c) => c.fn));
  if (!stepCalls.slice(stepBefore).includes('l10_addTodoStep')) errors.push('drawer step add did not call l10_addTodoStep');
  await page.click('#td-close');
  await page.waitForTimeout(120);
  // Select mode: checkboxes only in the mode; the bulk bar docks when something is ticked.
  await page.click('[data-tdselmode]');
  await page.waitForTimeout(150);
  const checks = await page.$$('.td-check');
  if (!checks.length) errors.push('select mode showed no checkboxes');
  else {
    await checks[0].click();
    await page.waitForTimeout(150);
    const bulk = await page.$('.td-bulkdock [data-tdbulk]');
    if (!bulk) errors.push('docked bulk bar missing after selection');
  }
  await page.click('[data-tdselmode]'); // leave the mode
  await page.waitForTimeout(120);
  // A status flip persists: the l10_setTodoStatus gs call must fire.
  const before = await page.evaluate(() => window.__GS_CALLS.length);
  const doneBtn = await page.$('.tdr [data-todo$="|DONE"]');
  if (doneBtn) {
    await doneBtn.click();
    await page.waitForTimeout(250);
    const calls = await page.evaluate(() => window.__GS_CALLS.map((c) => c.fn));
    if (!calls.slice(before).includes('l10_setTodoStatus')) {
      errors.push('todo DONE click did not persist via l10_setTodoStatus (Jira sync would miss it)');
    }
  } else errors.push('no ✓ Done button found on To-dos page');
  // Dropping (from the drawer footer) stamps Done At locally, the same as the server does, and closes the drawer.
  const firstOpen = await page.$('.tdr [data-tdopen]');
  if (firstOpen) {
    const dropId = await firstOpen.evaluate((el) => el.dataset.tdopen);
    await firstOpen.click();
    await page.waitForTimeout(200);
    await page.click('#td-overlay [data-todo$="|DROPPED"]');
    await page.waitForTimeout(250);
    const dropped = await page.evaluate((id) => {
      const t = (window.state && state.boot.todos || []).find((x) => String(x['ID']) === id);
      return t ? { s: t['Status'], d: t['Done At'] } : null;
    }, dropId);
    if (!dropped || dropped.s !== 'DROPPED') errors.push('drop click did not flip the row to DROPPED (' + JSON.stringify(dropped) + ')');
    else if (!/^\d{4}-\d{2}-\d{2}/.test(String(dropped.d))) errors.push('dropped to-do carries no Done At stamp locally ("' + dropped.d + '")');
    if (await page.$eval('#td-overlay', (el) => el.style.display !== 'none')) errors.push('drawer stayed open after dropping its to-do');
  } else errors.push('no row to open for the drop test');
  // Group by owner, then the day spine as a filter, then clear.
  await page.click('[data-tdgroup="owner"]');
  await page.waitForTimeout(150);
  const ownerGroups = await page.$$eval('.tdg-h', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  if (!ownerGroups.some((g) => /Courtney/.test(g))) errors.push('group-by-owner shows no Courtney group: ' + ownerGroups.join('|'));
  await page.click('[data-tdgroup="when"]');
  await page.waitForTimeout(120);
  await page.click('[data-tdday="late"]');
  await page.waitForTimeout(150);
  const lateOnly = await page.$$eval('.tdr .tdr-due', (els) => els.map((e) => e.textContent.trim()));
  if (!lateOnly.length || !lateOnly.every((t) => /late$/.test(t))) errors.push('Late spine filter shows non-late rows: ' + lateOnly.join('|'));
  await page.click('[data-tdfilter="clear"]');
  await page.waitForTimeout(120);
  // Done this week folds open, with reopen as the only action.
  await page.click('[data-tddonetoggle]');
  await page.waitForTimeout(150);
  const doneRows = await page.$$('.tdl-done-r');
  if (doneRows.length < 2) errors.push('Done this week should list the fixture done to-do plus the one just completed, got ' + doneRows.length);
  if (!(await page.$('.tdl-done-r [data-todo$="|OPEN"]'))) errors.push('done rows carry no Reopen action');
  await page.click('[data-tddonetoggle]');
  await page.waitForTimeout(100);
  await shot(page, 'todos-after-flows');

  // --- Metrics: capture grid opens; sparklines drew ---
  await clickNav(page, 'scorecard');
  const svgs = await page.$$('#page-scorecard svg');
  if (svgs.length < 3) errors.push('metrics sparklines missing (' + svgs.length + ' svg)');
  // Data health: strip shows the stale sources; the mapped metric is flagged.
  await page.waitForTimeout(300); // health fetch is deliberately post-boot
  const hlth = await page.$('#page-scorecard .hlth-strip');
  if (!hlth) errors.push('data-health strip missing on metrics');
  const hlthTxt = hlth ? await hlth.textContent() : '';
  if (hlth && !/Leads lifecycle/.test(hlthTxt)) errors.push('health strip does not surface the stale leads source');
  const srcWarns = await page.$$('#page-scorecard .sc-src-warn');
  if (!srcWarns.length) errors.push('no metric carries the source-stale warning line (HEALTH_MAP flag path dead)');
  // Capture: the "could not be read" notes must survive the re-render that
  // follows a capture, be replaced by the next capture, clear on a clean one,
  // and go away on dismiss. (v2.17.1 — they used to be written into the old
  // DOM and lost with it, leaving a toast that pointed at nothing.)
  const capNotesCount = () => page.$$eval('#page-scorecard .js-cap-notes .cap-note', (els) => els.length);
  await page.click('#page-scorecard .js-capture');
  await page.waitForTimeout(400);
  if ((await capNotesCount()) !== 2) errors.push('capture notes not shown under the capture button after a capture with 2 notes (' + (await capNotesCount()) + ')');
  const capTxt = await page.$eval('#page-scorecard .js-cap-notes', (el) => el.textContent);
  if (!/H8 is blank/.test(capTxt) || !/#REF!/.test(capTxt)) errors.push('capture notes miss the per-metric reasons');
  if (!/2 values could not be read/.test(capTxt)) errors.push('capture notes lack the count headline');
  const capBtn = await page.$eval('#page-scorecard .js-capture', (el) => el.disabled + '|' + el.textContent.trim());
  if (capBtn !== 'false|⟳ Capture') errors.push('capture button not restored after a capture: ' + capBtn);
  await page.click('#page-scorecard .js-capture'); // fixture: 1 note now → replaced, not appended
  await page.waitForTimeout(400);
  if ((await capNotesCount()) !== 1) errors.push('second capture did not replace the notes (' + (await capNotesCount()) + ' shown, want 1)');
  await page.click('#page-scorecard .js-cap-notes-dismiss');
  await page.waitForTimeout(200);
  if ((await capNotesCount()) !== 0) errors.push('dismiss did not clear the capture notes');
  await page.click('#page-scorecard .js-capture'); // fixture: clean capture → nothing to show
  await page.waitForTimeout(400);
  if ((await capNotesCount()) !== 0) errors.push('capture notes shown after a clean capture');
  if (!/97\.5/.test(await page.$eval('#page-scorecard', (el) => el.textContent))) errors.push('captured value (SC-002 = 97.5) not spliced into the Metrics page');

  // --- Team stats: lazy fetch, exact numbers against the fixture, controls ---
  await clickNav(page, 'teamstats');
  await page.waitForTimeout(300);
  const stCalls = await page.evaluate(() => window.__GS_CALLS.filter((c) => c.fn === 'l10_teamStats').length);
  if (stCalls !== 1) errors.push('team stats fetched ' + stCalls + ' times on first open (want exactly 1)');
  // Hand-computed from the l10_teamStats fixture at the default 13-week window,
  // repeats included. Window = 13 Mondays ending this week → created offsets
  // ≥ -84 days. Created in window: TD-101..105, 201..210 minus TD-201 (-70 is
  // in) … all fifteen live/history rows are ≥ -84 → 15 added. Done in window:
  // 104, 201, 202, 203, 204, 205, 207, 208, 209, 210 = 10; dropped: 206 = 1.
  // Completion 10/11 = 91%. Zero-carry among done: 104,201,203,205,207,208,210
  // = 7/10 = 70%. On-time (due present): 104(7≤7) 201(4≤5) 203(3≤7) 205(no due)
  // 207(6≤7) 208(5≤7) 210(2≤3) on time; 202(9>7) 204(16>7) 209(21>7) late →
  // 6/9 = 67%. Cycle days sorted: 2,2,3,4,5,6,7,9,13,16 → median 5.5. Open now: 101,102,103,105 = 4.
  const TEAM_STATS_EXPECT = [
    [/completion rate/, '91%'], [/done by the next huddle/, '70%'],
    [/on or before due date/, '67%'], [/median days to done/, '5.5'],
    [/open right now/, '4']
  ];
  const tiles = await page.$$eval('#page-teamstats .st-tile', (els) => els.map((el) => ({
    v: el.querySelector('.v').textContent.trim(), l: el.querySelector('.l').textContent.trim()
  })));
  TEAM_STATS_EXPECT.forEach(([re, want]) => {
    const t = tiles.find((x) => re.test(x.l));
    if (!t) errors.push('team stats tile missing: ' + re);
    else if (t.v.replace(/[✓✕]/g, '').trim() !== want) errors.push('team stats tile ' + re + ' shows "' + t.v + '" (want ' + want + ')');
  });
  // The pre-window rows must not leak: the 52-week window sees them, 13 doesn't.
  const bars13 = await page.$$('#page-teamstats .st-bars rect.st-b-done');
  if (bars13.length !== 9) errors.push('13-week chart drew ' + bars13.length + ' done bars (want 9 weeks with ≥1 done)');
  await page.click('[data-stwin="52"]');
  await page.waitForTimeout(150);
  const tiles52 = await page.$$eval('#page-teamstats .st-tile', (els) => els.map((el) => el.querySelector('.l').textContent.trim() + '=' + el.querySelector('.v').textContent.replace(/[✓✕]/g, '').trim()));
  if (!tiles52.some((s) => /^completion rate=85%$/.test(s))) errors.push('52-week completion should be 11/13 = 85%, got ' + tiles52.filter((s) => /completion/.test(s)));
  // Repeats toggle removes the weekly row from every count (done 10 → 9 at 13 wk).
  await page.click('[data-stwin="13"]');
  await page.waitForTimeout(150);
  await page.click('#st-repeats');
  await page.waitForTimeout(150);
  const noRep = await page.$eval('#page-teamstats', (el) => el.textContent);
  if (!/9 done · 1 dropped · of 10 closed/.test(noRep)) errors.push('repeats toggle did not drop the ↻ weekly to-do from the closed count');
  await page.click('#st-repeats'); // restore
  await page.waitForTimeout(150);
  // Per-person table: counts only, no completion % column.
  const peopleHdr = await page.$eval('.st-people tr', (tr) => tr.textContent);
  if (/%/.test(peopleHdr)) errors.push('per-person table carries a % column — the completion score must stay team-level');
  const peopleRows = await page.$$('.st-people tr');
  if (peopleRows.length !== 6) errors.push('per-person table has ' + peopleRows.length + ' rows (want header + 4 people + team total)');
  // Refresh re-reads the tab exactly once more.
  await page.click('#st-refresh');
  await page.waitForTimeout(300);
  const stCalls2 = await page.evaluate(() => window.__GS_CALLS.filter((c) => c.fn === 'l10_teamStats').length);
  if (stCalls2 !== 2) errors.push('refresh fetched l10_teamStats ' + (stCalls2 - stCalls) + ' times (want 1)');
  await shot(page, 'team-stats');

  // --- Issues: Solve overlay opens (dialog semantics land in the a11y wave) ---
  await clickNav(page, 'issues');
  await shot(page, 'issues');

  // --- Cascade regressions the adversarial review caught ---
  // Width utilities must actually beat `.row > .field` (computed, not classes).
  const flexOK = await page.$eval('.row > .field.f-3', (el) => getComputedStyle(el).flexGrow);
  if (flexOK !== '3') errors.push('composer f-3 field computes flex-grow ' + flexOK + ' (want 3) — .row > .field is winning again');
  // The skip link must not inherit <base target="_top">.
  const skipTarget = await page.$eval('.skip-link', (el) => el.getAttribute('target'));
  if (skipTarget !== '_self') errors.push('skip-link target is ' + skipTarget + ' — base target=_top would navigate the top window');
  await clickNav(page, 'settings');
  // --- Team photos: rows render, the fixture photo replaces one initial, upload + remove round-trip ---
  const tmRows = await page.$$('.tm-row');
  if (tmRows.length !== 4) errors.push('Settings team card has ' + tmRows.length + ' photo rows (want 4)');
  const imgs0 = await page.$$eval('#page-huddle .person-chip .avatar--img', (els) => els.length);
  if (imgs0 !== 1) errors.push('start screen shows ' + imgs0 + ' photo avatars (want 1 — CJ from the fixture)');
  const letters0 = await page.$$eval('#page-huddle .person-chip .avatar:not(.avatar--img)', (els) => els.length);
  if (letters0 !== 3) errors.push('start screen shows ' + letters0 + ' initial avatars (want 3)');
  // Upload: a generated PNG goes through the canvas resize and out as a small JPEG data URI.
  const png1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const beforeUp = await page.evaluate(() => window.__GS_CALLS.length);
  await page.setInputFiles('input.tm-file[data-tmfile="Alex"]', { name: 'alex.png', mimeType: 'image/png', buffer: png1 });
  await page.waitForTimeout(700);
  const upCall = await page.evaluate((n) => window.__GS_CALLS.slice(n).find((c) => c.fn === 'l10_setTeamPhoto'), beforeUp);
  if (!upCall) errors.push('photo upload never called l10_setTeamPhoto');
  else if (upCall.args[0] !== 'Alex' || !/^data:image\/jpeg;base64,/.test(String(upCall.args[1]))) errors.push('l10_setTeamPhoto got unexpected args: ' + JSON.stringify(upCall.args).slice(0, 80));
  else if (String(upCall.args[1]).length > 45000) errors.push('resized photo is ' + upCall.args[1].length + ' chars — over the cell budget');
  if (!(await page.$('.tm-row[data-tmrow="Alex"] .avatar--img'))) errors.push('uploaded photo did not appear on the Settings row');
  const imgs1 = await page.$$eval('#page-huddle .person-chip .avatar--img', (els) => els.length);
  if (imgs1 !== 2) errors.push('after upload the start screen shows ' + imgs1 + ' photo avatars (want 2)');
  // Remove: CJ's photo goes and the initial comes back everywhere.
  await page.click('[data-tmremove="CJ"]');
  await page.waitForTimeout(300);
  if (!(await page.evaluate(() => window.__GS_CALLS.some((c) => c.fn === 'l10_removeTeamPhoto')))) errors.push('remove photo never called l10_removeTeamPhoto');
  const imgs2 = await page.$$eval('#page-huddle .person-chip .avatar--img', (els) => els.length);
  if (imgs2 !== 1) errors.push('after remove the start screen shows ' + imgs2 + ' photo avatars (want 1 — Alex)');

  // --- Strategy page (v2.15 layout): triage, table + inline matrix, dense matrix, archive, sheets ---
  await clickNav(page, 'strategy');
  // Triage: SI-002 (rolling out, no open to-do, untouched 20 days, no check-in) needs a nudge; the reasons are words.
  const triage = await page.$eval('.si-triage', (el) => el.textContent);
  if (!/Needs you/.test(triage)) errors.push('triage card should read "Needs you" with a drifting initiative');
  if (!/nothing queued against it/.test(triage) || !/no touch in 2\d days and no check-in date/.test(triage)) errors.push('triage row does not spell out both reasons for SI-002');
  // The untouched 40-day-old Idea (SI-003) must NOT be in triage — ideas parked during goal-setting are never nagged.
  if (/Broad match \+ tROAS on brand/.test(triage)) errors.push('triage lists an untouched Idea — the timer must only apply while piloting / rolling out');
  // Table: one row per live initiative, four stage lanes (reverse order), cells = rows × accounts.
  const siRows = await page.$$('.si-row');
  if (siRows.length !== 3) errors.push('table should show 3 live initiatives, got ' + siRows.length);
  const laneLabels = await page.$$eval('.si-lane .si-lane-l', (els) => els.map((e) => e.textContent.trim()));
  if (laneLabels.join('|') !== 'Rolling out|Piloting|Scoping|Idea') errors.push('stage lanes wrong: ' + laneLabels.join('|'));
  const siCells = await page.$$eval('.si-row .sa-cell', (els) => els.map((e) => e.getAttribute('title')));
  if (siCells.length !== 12) errors.push('table should carry 3 × 4 = 12 cells, got ' + siCells.length);
  if (!siCells.some((t) => /adopted/.test(t)) || !siCells.some((t) => /testing/.test(t))) errors.push('cell titles do not carry the state word: ' + JSON.stringify(siCells.slice(0, 4)));
  const headAbbr = await page.$$eval('.si-grid-h .si-th--c', (els) => els.map((e) => e.textContent.trim()));
  if (headAbbr.join('|') !== 'BUS|SUS|EMD|AMZ') errors.push('matrix header abbreviations wrong: ' + headAbbr.join('|'));
  const siText = await page.$eval('#page-strategy', (el) => el.textContent);
  if (!/M effort/.test(siText) || !/−15% CPL on Seton US/.test(siText)) errors.push('row does not show effort / expected impact');
  if (!/no next action/.test(siText)) errors.push('flag badge missing on the drifting row');
  // A cell flip persists through l10_setInitiativeAccount (popover lists glyph + word).
  const cellBefore = await page.evaluate(() => window.__GS_CALLS.length);
  await page.click('.si-row .sa-cell.sa-none');
  await page.waitForTimeout(120);
  const pick = await page.$('.l10pop-item[data-v="TESTING"]');
  if (!pick) errors.push('cell picker did not open with a TESTING option');
  else {
    const pickTxt = await pick.evaluate((el) => el.textContent);
    if (!/◐ testing/.test(pickTxt)) errors.push('cell picker option is not glyph + word: "' + pickTxt + '"');
    await pick.click();
    await page.waitForTimeout(250);
    const cellCalls = await page.evaluate(() => window.__GS_CALLS.map((c) => c.fn));
    if (!cellCalls.slice(cellBefore).includes('l10_setInitiativeAccount')) errors.push('cell flip did not persist via l10_setInitiativeAccount');
  }
  // Group by shift: one lane per distinct shift (Shift 1, Shift 2).
  await page.click('[data-sigroup="shift"]');
  await page.waitForTimeout(150);
  const shiftLanes = await page.$$eval('.si-lane .si-lane-l', (els) => els.map((e) => e.textContent.trim()));
  if (shiftLanes.join('|') !== 'Shift 1|Shift 2') errors.push('group-by-shift lanes wrong: ' + shiftLanes.join('|'));
  await page.click('[data-sigroup="stage"]');
  await page.waitForTimeout(120);
  // Dense matrix behind the toggle: 32px rows + an "Adopted here" footer.
  await page.click('[data-siview="matrix"]');
  await page.waitForTimeout(150);
  const mrows = await page.$$('.si-mrow');
  if (mrows.length !== 3) errors.push('matrix view should list 3 live initiatives, got ' + mrows.length);
  const mfoot = await page.$eval('.si-mfoot', (el) => el.textContent.replace(/\s+/g, ' '));
  if (!/Adopted here/.test(mfoot)) errors.push('matrix footer missing');
  if (!(await page.$('.si-mrow .si-mflag.flag-red'))) errors.push('matrix view does not flag the drifting row');
  await page.click('[data-siview="table"]');
  await page.waitForTimeout(120);
  // Archive: "Decided" card underneath, fiscal-month strip, grouped by month, filters.
  const arch = await page.$eval('.si-archive', (el) => el.textContent.replace(/\s+/g, ' '));
  if (!/Decided\s*2 decided/.test(arch)) errors.push('archive header wrong: ' + arch.slice(0, 80));
  if (!/Apple Ads for the catalog brands/.test(arch) || !/Brand tROAS on Seton/.test(arch)) errors.push('archive is missing a decided initiative');
  if (!/No volume outside Brady US/.test(arch)) errors.push('archive entry does not carry its verdict');
  const months = await page.$$('.si-archive .si-month');
  if (months.length !== 12) errors.push('archive strip should have 12 month cells, got ' + months.length);
  const groupHeads = await page.$$eval('.si-archive .si-arch-gh', (els) => els.map((e) => e.textContent.trim()));
  if (groupHeads.length !== 2 || !groupHeads.every((h) => /^FY\d\d · [A-Z][a-z]+ \d{4}$/.test(h))) errors.push('archive month groups wrong: ' + JSON.stringify(groupHeads));
  const hasMonth = await page.$('.si-archive .si-month--has');
  if (!hasMonth) errors.push('archive strip has no month with a count');
  else {
    await hasMonth.click();
    await page.waitForTimeout(150);
    const filtered = await page.$$eval('.si-archive .si-arch-gh', (els) => els.length);
    if (filtered !== 1) errors.push('clicking a month in the strip should filter the list to that month, got ' + filtered + ' groups');
    await page.click('.si-archive .si-month.on');
    await page.waitForTimeout(120);
  }
  await page.click('[data-siarch="KILLED"]');
  await page.waitForTimeout(150);
  const killedOnly = await page.$eval('.si-archive', (el) => el.textContent);
  if (/Brand tROAS on Seton/.test(killedOnly) || !/Apple Ads/.test(killedOnly)) errors.push('archive Killed filter did not hide the adopted one');
  await page.click('[data-siarch="ALL"]');
  await page.waitForTimeout(120);
  const order = await page.$eval('#page-strategy', (el) => { const h = el.innerHTML; return h.indexOf('si-triage') < h.indexOf('si-live') && h.indexOf('si-live') < h.indexOf('si-archive'); });
  if (!order) errors.push('page sections out of order (triage, live, archive)');
  // Drawer: opens from the row, tabs Accounts / To-dos / Trail, composer sourced to the initiative.
  await page.click('.si-row [data-siopen="SI-001"]');
  await page.waitForTimeout(200);
  const drawerOn = await page.$eval('#si-overlay', (el) => el.style.display !== 'none');
  if (!drawerOn) errors.push('initiative drawer did not open');
  const drawerTxt = await page.$eval('#si-overlay', (el) => el.textContent);
  if (!/IDEA-051/.test(drawerTxt)) errors.push('drawer accounts tab does not show the hub ref on the Seton US cell');
  if (!/Proven at/.test(drawerTxt) || !/Expected impact/.test(drawerTxt)) errors.push('drawer summary band missing');
  await page.click('#si-overlay [data-sitab="todos"]');
  await page.waitForTimeout(150);
  const todosTxt = await page.$eval('#si-overlay', (el) => el.textContent);
  if (!/Build the Seton US Demand Gen campaign shell/.test(todosTxt)) errors.push('drawer To-dos tab does not list the to-do sourced from SI-001');
  const siSource = await page.$eval('#si-overlay .js-td-add', (el) => el.dataset.source);
  if (siSource !== 'SI-001') errors.push('drawer composer is not sourced to the initiative (data-source="' + siSource + '")');
  const addBefore = await page.evaluate(() => window.__GS_CALLS.length);
  await page.click('#si-overlay .js-td-text');
  await page.fill('#si-overlay .js-td-text', 'Harness to-do from the initiative');
  // Owner chips persist across composers by design (state.todoCompose) — make sure she is ON, don't blindly toggle.
  const cChip = await page.$('#si-overlay .js-td-owner[data-name="Courtney"]');
  if (!(await cChip.evaluate((el) => el.classList.contains('on')))) await cChip.click();
  await page.click('#si-overlay .js-td-add');
  await page.waitForTimeout(300);
  const addCalls = await page.evaluate(() => window.__GS_CALLS.slice());
  const addCall = addCalls.slice(addBefore).find((c) => c.fn === 'l10_addTodoMulti');
  if (!addCall) errors.push('drawer composer did not add through l10_addTodoMulti');
  else if (!addCall.args[0] || addCall.args[0].source !== 'SI-001') errors.push('drawer composer sent the wrong source: ' + JSON.stringify(addCall.args[0] && addCall.args[0].source));
  await page.click('#si-overlay [data-sitab="trail"]');
  await page.waitForTimeout(150);
  await page.fill('#si-overlay .js-silog-text', 'Harness trail note');
  await page.click('#si-overlay .js-silog-add');
  await page.waitForTimeout(250);
  const trailTxt = await page.$eval('#si-overlay', (el) => el.textContent);
  if (!/Harness trail note/.test(trailTxt)) errors.push('trail note did not appear in the drawer after posting');
  await page.click('#si-close');
  await page.waitForTimeout(120);
  // Triage "Add a to-do" lands on the drawer's To-dos tab.
  await page.click('[data-sifix="SI-002|todos"]');
  await page.waitForTimeout(200);
  const fixTab = await page.$eval('#si-overlay [data-sitab="todos"]', (el) => el.classList.contains('on'));
  if (!fixTab) errors.push('triage fix button did not open the To-dos tab');
  await page.click('#si-close');
  await page.waitForTimeout(120);
  // New-initiative sheet: opens from the header button, adds through l10_addInitiative, closes.
  await page.click('[data-sinew]');
  await page.waitForTimeout(200);
  const sheetOn = await page.$eval('#si-new', (el) => el.style.display !== 'none');
  if (!sheetOn) errors.push('new-initiative sheet did not open');
  const sheetTxt = await page.$eval('#si-new', (el) => el.textContent);
  if (!/1 · The idea/.test(sheetTxt) || !/4 · Accounts in scope/.test(sheetTxt)) errors.push('new-initiative sheet is missing its steps');
  const shiftOpts = await page.$$eval('#si-new #si-shift-list option', (o) => o.map((x) => x.value));
  if (shiftOpts.indexOf('Shift 1') === -1) errors.push('shift datalist missing in the sheet');
  await page.fill('#si-new .js-si-title', 'Harness initiative');
  await page.click('#si-new .js-si-acct[data-acct="Amazon"]');
  const newBefore = await page.evaluate(() => window.__GS_CALLS.length);
  await page.click('#si-new .js-si-add');
  await page.waitForTimeout(300);
  const newCall = (await page.evaluate(() => window.__GS_CALLS.slice())).slice(newBefore).find((c) => c.fn === 'l10_addInitiative');
  if (!newCall) errors.push('sheet did not add through l10_addInitiative');
  else if (newCall.args[0].title !== 'Harness initiative' || (newCall.args[0].accounts || []).indexOf('Amazon') === -1) errors.push('sheet sent the wrong payload: ' + JSON.stringify(newCall.args[0]).slice(0, 120));
  const sheetOff = await page.$eval('#si-new', (el) => el.style.display === 'none');
  if (!sheetOff) errors.push('sheet stayed open after adding');
  const rowsAfter = await page.$$('.si-row');
  if (rowsAfter.length !== 4) errors.push('new initiative did not appear in the table (rows: ' + rowsAfter.length + ')');
  // The 1:1 page carries the lead's initiatives, flagged first.
  await clickNav(page, 'oneonone');
  const o11Chip = await page.$('[data-o11="Courtney"]');
  if (o11Chip) { await o11Chip.click(); await page.waitForTimeout(150); }
  const o11Txt = await page.$eval('#page-oneonone', (el) => el.textContent);
  // Two from the fixture plus the one the sheet just added with her as the default lead.
  if (!/Initiatives they lead \(3\)/.test(o11Txt)) errors.push('1:1 page for Courtney should list 3 live initiatives she leads (2 fixture + 1 added)');
  // A to-do's "from SI-###" reference opens the drawer.
  await clickNav(page, 'todos');
  // Scoped to the To-dos page: priorities carry SI references too (RK-007), on a hidden page.
  const siRef = await page.$('#page-todos [data-initref="SI-001"]');
  if (!siRef) errors.push('to-do sourced from SI-001 carries no tappable reference');
  else {
    await siRef.click();
    await page.waitForTimeout(150);
    const refOpen = await page.$eval('#si-overlay', (el) => el.style.display !== 'none');
    if (!refOpen) errors.push('SI reference on a to-do did not open the drawer');
    await page.click('#si-close');
    await page.waitForTimeout(100);
  }
  await shot(page, 'strategy');

  // --- Priorities page (v2.19 layout): quarter card, shared axis, buckets, panel, status, sheet ---
  {
    await clickNav(page, 'rocks');
    const gsSince = (n) => page.evaluate((k) => window.__GS_CALLS.slice(k), n);
    const gsN = () => page.evaluate(() => window.__GS_CALLS.length);
    const rkCounts = () => page.$$eval('[data-rkfilter]', (els) => els.map((e) => e.dataset.rkfilter + '=' + e.querySelector('b').textContent).join(' '));
    const rkq = await page.$eval('.rkq', (el) => el.textContent.replace(/\s+/g, ' '));
    if (!/Day \d+ of \d+/.test(rkq) || !/days left in Q\d/.test(rkq)) errors.push('quarter card missing "Day n of N · days left": ' + rkq.slice(0, 80));
    if (!/milestones due so far are done/.test(rkq)) errors.push('quarter card caption missing the milestones-due line: ' + rkq.slice(0, 120));
    const c0 = await rkCounts();
    if (c0 !== 'off=2 check=1 plan=1 on=4') errors.push('status chips should count off=2 check=1 plan=1 on=4, got ' + c0);
    const groupsSt = await page.$$eval('.rkg-h .rkg-l', (els) => els.map((e) => e.textContent.trim()));
    if (groupsSt.join('|') !== 'Off track|Needs a check|No plan yet|On track') errors.push('status groups should lead with attention: ' + groupsSt.join('|'));
    if ((await page.$$('.rkr')).length !== 8) errors.push('priorities page should list the 8 active fixture priorities, got ' + (await page.$$('.rkr')).length);
    if ((await page.$$eval('.rkt-ticklab', (els) => els.length)) !== 3) errors.push('quarter axis should carry three month ticks');
    if (!(await page.$('.rkt-today'))) errors.push('quarter axis missing the Today marker');
    if (!(await page.$('.qturn [data-qsplit="RK-011"]'))) errors.push('the past-quarter priority should keep its quarter-turn card');
    const r3 = await page.$eval('[data-rkid="RK-003"]', (el) => el.textContent.replace(/\s+/g, ' '));
    if (!/Why · Implementation needs a dev sprint/.test(r3)) errors.push('off-track row missing its why line: ' + r3.slice(0, 160));
    if (!/Next · Solution ideation complete — today/.test(r3)) errors.push('RK-003 should lead with the milestone due today: ' + r3.slice(0, 160));
    if (!(await page.$('[data-rkid="RK-003"] .rk-early-n'))) errors.push('RK-003 should show the earlier-than-the-quarter gutter');
    if (!(await page.$('[data-rkid="RK-003"] .rk-dotw--multi'))) errors.push('RK-003 today + tomorrow milestones should merge into one cluster dot');
    if (!/was on track/.test(await page.$eval('[data-rkid="RK-002"] .rk-st', (el) => el.textContent))) errors.push('RK-002 went off track 3 days ago — its status cell should say "was on track"');
    const r4 = await page.$eval('[data-rkid="RK-004"]', (el) => el.textContent.replace(/\s+/g, ' '));
    if (!/25d past due/.test(r4) || !/still on track\?/.test(r4) || !/1 slipped this week/.test(r4) || !/\+1 more late/.test(r4)) errors.push('needs-a-check row missing past due / nudge / slipped / more late: ' + r4.slice(0, 200));
    if (!(await page.$('[data-rkid="RK-004"] .rk-cv'))) errors.push('RK-004 caveat marker missing on the title');
    if (!/Confirmed on track today/.test(await page.$eval('[data-rkid="RK-007"]', (el) => el.textContent))) errors.push('RK-007 should read "Confirmed on track today"');
    // Hover tooltip on a single dot names the milestone and what a click does.
    const tip = await page.$eval('[data-rkid="RK-006"] .rk-dotw:not(.rk-dotw--multi) .rk-tip', (el) => el.textContent);
    if (!/click to (reopen|tick off)/.test(tip)) errors.push('dot tooltip should say what a click does: ' + tip);
    // Filters: a status chip narrows, a person narrows further, Clear restores.
    await page.click('[data-rkfilter="off"]');
    await page.waitForTimeout(120);
    if ((await page.$$('.rkr')).length !== 2) errors.push('off-track filter should leave 2 rows');
    await page.click('[data-rkperson="CJ"]');
    await page.waitForTimeout(120);
    const cjOff = await page.$$eval('.rkr', (els) => els.map((e) => e.dataset.rkid).join(','));
    if (cjOff !== 'RK-002') errors.push('off track + CJ should leave RK-002 only, got ' + cjOff);
    if (!/2 priorities of 8|1 priority of 8/.test(await page.$eval('.rkt-count', (el) => el.textContent))) errors.push('count label should say "of 8" while filtered');
    await page.click('[data-rkclear]');
    await page.waitForTimeout(120);
    if ((await page.$$('.rkr')).length !== 8) errors.push('Clear filters did not bring back all 8 rows');
    // Group by owner, then back (the choice is remembered per browser).
    await page.click('[data-rkgroup="owner"]');
    await page.waitForTimeout(120);
    const ownerGroups = await page.$$eval('.rkg-h .rkg-name', (els) => els.map((e) => e.textContent.trim()).sort().join('|'));
    if (ownerGroups !== 'Alex|CJ|Courtney|Scott') errors.push('owner grouping should give Alex|CJ|Courtney|Scott, got ' + ownerGroups);
    await page.click('[data-rkgroup="status"]');
    await page.waitForTimeout(120);
    // The panel: milestones, definition of done, the linked metric's 13 bars.
    await page.click('[data-rkrow="RK-006"]');
    await page.waitForTimeout(150);
    if (!(await page.$('[data-rkid="RK-006"] .rk-panel'))) errors.push('opening RK-006 did not show its panel');
    else {
      if ((await page.$$('[data-rkid="RK-006"] .rkm')).length !== 5) errors.push('RK-006 panel should list 5 milestones');
      if ((await page.$$('[data-rkid="RK-006"] .rk-bar')).length !== 13) errors.push('the linked metric should draw 13 weekly bars');
      const pt = await page.$eval('[data-rkid="RK-006"] .rk-panel', (el) => el.textContent);
      if (!/One shared negative list attached/.test(pt)) errors.push('panel missing the definition of done');
      if (!/Brady utilization/.test(pt)) errors.push('panel missing the linked metric name');
      if (!/\+1 done this week/.test(await page.$eval('[data-rkid="RK-006"] .rk-st', (el) => el.textContent))) errors.push('RK-006 should show "+1 done this week"');
      let n0 = await gsN();
      await page.click('[data-rkid="RK-006"] .rkm-ck[data-ms^="MS-017|"]');
      await page.waitForTimeout(200);
      let calls = await gsSince(n0);
      if (!calls.some((c) => c.fn === 'l10_setMilestoneStatus' && c.args[0] === 'MS-017' && c.args[1] === 'DONE')) errors.push('ticking a milestone in the panel did not call l10_setMilestoneStatus(MS-017, DONE)');
      if (!(await page.$('[data-rkid="RK-006"] .rk-panel'))) errors.push('panel closed after ticking a milestone');
      const due18 = await page.evaluate(() => findRow(state.boot.milestones, 'ID', 'MS-018')['Due']);
      n0 = await gsN();
      await page.click('[data-rkms7="MS-018"]');
      await page.waitForTimeout(150);
      calls = await gsSince(n0);
      const want18 = await page.evaluate((d) => addDays_(d, 7), due18);
      const mv = calls.find((c) => c.fn === 'l10_editMilestone' && c.args[0] === 'MS-018');
      if (!mv || mv.args[1].due !== want18) errors.push('+7d should move MS-018 to ' + want18 + ', sent ' + JSON.stringify(mv && mv.args[1]));
      const newDue = await page.evaluate(() => addDays_(localToday(), 9));
      await page.fill('[data-rkmsdraft="RK-006"]', 'Harness milestone');
      await page.fill('[data-rkmsdraftdue="RK-006"]', newDue);
      n0 = await gsN();
      await page.press('[data-rkmsdraft="RK-006"]', 'Enter');
      await page.waitForTimeout(200);
      calls = await gsSince(n0);
      const addMs = calls.find((c) => c.fn === 'l10_addMilestone');
      if (!addMs || addMs.args[0].rockId !== 'RK-006' || addMs.args[0].text !== 'Harness milestone' || addMs.args[0].due !== newDue) errors.push('add milestone sent the wrong payload: ' + JSON.stringify(addMs && addMs.args[0]));
      if ((await page.$$('[data-rkid="RK-006"] .rkm')).length !== 6) errors.push('the added milestone did not appear in the panel');
      if ((await page.$eval('[data-rkmsdraft="RK-006"]', (el) => el.value)) !== '') errors.push('the add-milestone line did not clear after adding');
    }
    await shot(page, 'priorities-panel');
    // The nudge's "Yes, still on track" confirms and moves RK-004 out of "Needs a check".
    let nC = await gsN();
    await page.click('[data-rkconfirm="RK-004"]');
    await page.waitForTimeout(150);
    if (!(await gsSince(nC)).some((c) => c.fn === 'l10_confirmRock' && c.args[0] === 'RK-004')) errors.push('"Yes, still on track" did not call l10_confirmRock(RK-004)');
    const c1 = await rkCounts();
    if (c1 !== 'off=2 check=0 plan=1 on=5') errors.push('after confirming RK-004 the chips should read off=2 check=0 plan=1 on=5, got ' + c1);
    // Status menu → off track needs a why: empty is refused, a line goes through with it.
    await page.click('[data-rkstatus="RK-001"]');
    await page.waitForTimeout(120);
    const menu = await page.$$eval('.l10pop .l10pop-item', (els) => els.map((e) => e.dataset.v).join(','));
    if (menu !== 'OFF TRACK,DONE') errors.push('on-track status menu should offer OFF TRACK,DONE, got ' + menu);
    await page.click('.l10pop .l10pop-item[data-v="OFF TRACK"]');
    await page.waitForTimeout(120);
    nC = await gsN();
    await page.click('.l10pop .l10pop-ok');
    await page.waitForTimeout(120);
    if ((await gsSince(nC)).some((c) => c.fn === 'l10_setRockStatus')) errors.push('an empty why must not mark the priority off track');
    if (!(await page.$('.l10pop textarea'))) errors.push('the why prompt closed on an empty answer');
    await page.fill('.l10pop textarea', 'Waiting on MCC access');
    await page.click('.l10pop .l10pop-ok');
    await page.waitForTimeout(200);
    const off1 = (await gsSince(nC)).find((c) => c.fn === 'l10_setRockStatus');
    if (!off1 || off1.args[0] !== 'RK-001' || off1.args[1] !== 'OFF TRACK' || !off1.args[2] || off1.args[2].reason !== 'Waiting on MCC access') errors.push('mark off track sent the wrong call: ' + JSON.stringify(off1 && off1.args));
    const r1 = await page.$eval('[data-rkid="RK-001"]', (el) => el.textContent.replace(/\s+/g, ' '));
    if (!/Why · Waiting on MCC access/.test(r1) || !/was on track/.test(r1)) errors.push('RK-001 should now show its why and "was on track": ' + r1.slice(0, 200));
    // Undo restores the exact prior fields through l10_restoreRockStatus.
    nC = await gsN();
    await page.click('#notify-stack .notif:last-child .undo');
    await page.waitForTimeout(200);
    const rest = (await gsSince(nC)).find((c) => c.fn === 'l10_restoreRockStatus');
    if (!rest || rest.args[0] !== 'RK-001' || rest.args[1].status !== 'ON TRACK' || rest.args[1].reason !== '') errors.push('undo should restore RK-001 to on track via l10_restoreRockStatus: ' + JSON.stringify(rest && rest.args));
    if (/was on track/.test(await page.$eval('[data-rkid="RK-001"]', (el) => el.textContent))) errors.push('after undo RK-001 must not claim a status change');
    // Done this quarter: RK-008 only (RK-009 finished before the quarter; RK-010 was dropped).
    await page.click('[data-rkdonetoggle]');
    await page.waitForTimeout(120);
    const doneQ = await page.$$eval('.rkd .tdl-done-r', (els) => els.map((e) => e.textContent));
    if (doneQ.length !== 1 || !/FY27 budgets loaded/.test(doneQ[0])) errors.push('done this quarter should list RK-008 only: ' + JSON.stringify(doneQ));
    // Split on the quarter-turn card prefills the New priority sheet.
    await page.click('[data-qsplit="RK-011"]');
    await page.waitForTimeout(150);
    if (!(await page.$eval('#rk-new', (el) => el.style.display === 'block'))) errors.push('split did not open the New priority sheet');
    else {
      if ((await page.$eval('#rk-new .js-rkn-title', (el) => el.value)) !== 'Last quarter feed audit, still open') errors.push('split did not prefill the title');
      if (!(await page.$('#rk-new [data-rknowner="CJ"].on'))) errors.push('split did not prefill the owner');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(120);
      if (await page.$eval('#rk-new', (el) => el.style.display !== 'none')) errors.push('Escape did not close the New priority sheet');
    }
    // New priority sheet: title, owner, account; due defaults to the end of the quarter; the new row opens.
    await page.click('[data-rknew]');
    await page.waitForTimeout(150);
    await page.fill('#rk-new .js-rkn-title', 'Harness priority');
    await page.click('#rk-new [data-rknowner="Courtney"]');
    await page.click('#rk-new [data-rknacct="Amazon"]');
    nC = await gsN();
    await page.click('#rk-new .js-rkn-add');
    await page.waitForTimeout(250);
    const qEnd = await page.evaluate(() => rkQuarter_().end);
    const addRk = (await gsSince(nC)).find((c) => c.fn === 'l10_addRock');
    if (!addRk || addRk.args[0].title !== 'Harness priority' || addRk.args[0].owner !== 'Courtney' || addRk.args[0].accounts !== 'Amazon' || addRk.args[0].due !== qEnd) {
      errors.push('New priority sent the wrong payload: ' + JSON.stringify(addRk && addRk.args[0]));
    }
    if (await page.$eval('#rk-new', (el) => el.style.display !== 'none')) errors.push('New priority sheet stayed open after adding');
    const openRow = await page.$eval('.rkr--open', (el) => el.dataset.rkid).catch(() => '');
    if (!/^RK-\d+$/.test(openRow) || openRow === 'RK-006') errors.push('the new priority should open with its milestone line ready, open row: ' + openRow);
    // Edit in the panel: the caveat, accounts and shift ride l10_editRock.
    await page.click('[data-rkrow="RK-005"]');
    await page.waitForTimeout(120);
    await page.click('[data-rkedit="RK-005"]');
    await page.waitForTimeout(120);
    await page.fill('.rk-ed [data-rkef="caveat"]', 'Harness caveat');
    nC = await gsN();
    await page.click('[data-rkedsave="RK-005"]');
    await page.waitForTimeout(200);
    const ed = (await gsSince(nC)).find((c) => c.fn === 'l10_editRock');
    if (!ed || ed.args[0] !== 'RK-005' || ed.args[1].caveat !== 'Harness caveat' || ed.args[1].accounts !== 'Amazon, PDC/Wristbands' || ed.args[1].shift !== 'Shift 3') errors.push('panel edit sent the wrong payload: ' + JSON.stringify(ed && ed.args));
    if (!(await page.$('[data-rkid="RK-005"] .rk-cv'))) errors.push('the saved caveat should mark the title');
    // Send to Issues carries the priority id in the notes.
    nC = await gsN();
    await page.click('[data-rkissue="RK-005"]');
    await page.waitForTimeout(200);
    const iss = (await gsSince(nC)).find((c) => c.fn === 'l10_addIssue');
    if (!iss || !/^from RK-005/.test(iss.args[0].notes)) errors.push('Send to Issues should note "from RK-005": ' + JSON.stringify(iss && iss.args[0]));
    // The room view clears personal filters.
    await page.click('[data-rkfilter="on"]');
    await page.waitForTimeout(100);
    await page.evaluate(() => { applyPresent_(true); applyPresent_(false); });
    await page.waitForTimeout(100);
    if (await page.evaluate(() => !!state.rkFilter.status)) errors.push('the room view should clear the priorities filter');
    // An off-track row without a why asks for one; the answer only updates the why.
    await page.evaluate(() => { findRow(state.boot.rocks, 'ID', 'RK-002')['Off Track Reason'] = ''; renderRocks(); });
    await page.waitForTimeout(100);
    if (!(await page.$('[data-rkwhy="RK-002"]'))) errors.push('an off-track row with no why should offer to add one');
    else {
      await page.click('[data-rkwhy="RK-002"]');
      await page.waitForTimeout(120);
      await page.fill('.l10pop textarea', 'Feed lag');
      const nW = await gsN();
      await page.press('.l10pop textarea', 'Enter');
      await page.waitForTimeout(150);
      const w = (await gsSince(nW)).find((c) => c.fn === 'l10_setRockStatus');
      if (!w || w.args[0] !== 'RK-002' || w.args[1] !== 'OFF TRACK' || w.args[2].reason !== 'Feed lag') errors.push('adding a why sent the wrong call: ' + JSON.stringify(w && w.args));
      if (!/Why · Feed lag/.test(await page.$eval('[data-rkid="RK-002"]', (el) => el.textContent))) errors.push('the added why did not show on the row');
    }
    // A workbook that hasn't run Setup / repair tabs: one banner, no confirm button, off track without a why.
    await page.evaluate(() => { state.boot.rockColsReady = false; findRow(state.boot.rocks, 'ID', 'RK-001')['Status'] = 'ON TRACK'; renderRocks(); });
    await page.waitForTimeout(100);
    if (!/One setup step left/.test(await page.$eval('#page-rocks', (el) => el.textContent))) errors.push('pre-repair workbook should show the setup banner');
    if (await page.$('[data-rkconfirm]')) errors.push('pre-repair workbook must not offer "Yes, still on track" (nowhere to save it)');
    await page.click('[data-rkstatus="RK-001"]');
    await page.waitForTimeout(100);
    const nP = await gsN();
    await page.click('.l10pop .l10pop-item[data-v="OFF TRACK"]');
    await page.waitForTimeout(150);
    const pr = (await gsSince(nP)).find((c) => c.fn === 'l10_setRockStatus');
    if (!pr || pr.args[1] !== 'OFF TRACK' || (pr.args[2] && pr.args[2].reason !== undefined)) errors.push('pre-repair off track should flip without a why: ' + JSON.stringify(pr && pr.args));
    await page.evaluate(() => { state.boot.rockColsReady = true; renderRocks(); });
    await shot(page, 'priorities');
  }

  // --- In-app guide: nav ? opens the iframe modal ---
  await page.click('#btn-guide');
  await page.waitForTimeout(300);
  const guideFrame = await page.$('.guide-frame');
  if (!guideFrame) errors.push('guide overlay did not mount its iframe');
  // The Tab trap must let focus reach the iframe (it's the content).
  if (guideFrame) {
    await page.keyboard.press('Tab');
    const focusedTag = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
    if (focusedTag !== 'IFRAME') errors.push('Tab from guide Close landed on ' + focusedTag + ' (want IFRAME) — trap excludes the guide content');
    const gw = await page.$eval('.guide-card', (el) => getComputedStyle(el).maxWidth);
    if (gw !== '1040px') errors.push('.guide-card max-width computes ' + gw + ' (want 1040px)');
  }
  await shot(page, 'guide-overlay');
  await page.click('#guide-close');
  await page.waitForTimeout(120);

  // --- Brief docket: promote must splice locally, not reload the app ---
  await clickNav(page, 'huddle');
  const promoteBtn = await page.$('[data-promote]');
  if (!promoteBtn) errors.push('docket promote button missing on the start screen');
  else {
    const beforeP = await page.evaluate(() => window.__GS_CALLS.map((c) => c.fn));
    await promoteBtn.click();
    await page.waitForTimeout(300);
    const afterP = await page.evaluate(() => window.__GS_CALLS.map((c) => c.fn));
    if (!afterP.includes('l10_promoteBriefItem')) errors.push('promote did not call l10_promoteBriefItem');
    const reload = (fn) => afterP.filter((f) => f === fn).length > beforeP.filter((f) => f === fn).length;
    if (reload('l10_bootstrap') || reload('l10_bootCore')) errors.push('promote fell back to a full reload despite hydrated state');
    const flipped = await page.$eval('#page-huddle', (el) => /→ IS-/.test(el.textContent));
    if (!flipped) errors.push('promoted docket card did not flip to its issue id');
  }

  // --- Meeting: start splice → segment rail; wrap-up + discard splices ---
  await clickNav(page, 'huddle');
  const startBtn = await page.$('#btn-start');
  if (!startBtn) errors.push('start screen missing #btn-start');
  else {
    const beforeStart = await page.evaluate(() => window.__GS_CALLS.length);
    await startBtn.click();
    await page.waitForTimeout(400);
    const startCalls = await page.evaluate((n) => window.__GS_CALLS.slice(n).map((c) => c.fn), beforeStart);
    if (!startCalls.includes('l10_startMeeting')) errors.push('Start did not call l10_startMeeting');
    if (startCalls.includes('l10_bootCore')) errors.push('start splice regressed to a full reboot (l10_bootCore refetched)');
    if (!(await page.$('.segrail'))) errors.push('start splice did not paint the segment rail');
    await shot(page, 'meeting-started');

    // Wrap-up: jump to the last segment, two clicks through the armed confirm,
    // and the start screen must come back via the local splice.
    await page.click('#btn-jump-conclude');
    await page.waitForTimeout(250);
    const conc = await page.$('.js-conclude');
    if (!conc) errors.push('Wrap-up segment missing its wrap-up button');
    else {
      await conc.click();
      await page.waitForTimeout(150);
      await conc.click();
      await page.waitForTimeout(600);
      const concCalls = await page.evaluate(() => window.__GS_CALLS.map((c) => c.fn));
      if (!concCalls.includes('l10_concludeMeeting')) errors.push('wrap-up never called l10_concludeMeeting');
      if (!(await page.$('#btn-start'))) errors.push('wrap-up splice did not return to the start screen');
      await shot(page, 'after-conclude');
    }

    // Discard: start another huddle and leave through the other splice.
    const start2 = await page.$('#btn-start');
    if (start2) {
      await start2.click();
      await page.waitForTimeout(400);
      await page.click('#btn-jump-conclude');
      await page.waitForTimeout(250);
      const disc = await page.$('.js-discard');
      if (!disc) errors.push('discard button missing in the Wrap-up segment');
      else {
        await disc.click();
        await page.waitForTimeout(150);
        await disc.click();
        await page.waitForTimeout(400);
        if (!(await page.$('#btn-start'))) errors.push('discard splice did not return to the start screen');
      }
    }
  }

  // --- Embed path: the production-primary boot (core inline in the page) ---
  // The core slice must come from window.__L10_BOOT — no l10_bootCore call —
  // and the app still hydrates fully from the three remaining slices.
  const pageE = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  pageE.on('console', (m) => { if (m.type() === 'error') errors.push('embed console.error: ' + m.text()); });
  pageE.on('pageerror', (e) => errors.push('embed pageerror: ' + e.message));
  // Record snapshot reads so the reload below can PROVE the snapshot path ran
  // (a fresh page in a fresh context would silently skip it — that made the
  // first version of this test vacuous).
  await pageE.emulateMedia({ reducedMotion: 'reduce' });   // suppress the every-open brand intro
  await pageE.addInitScript(() => {
    window.__SNAP_READS = [];
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) {
      const v = orig.call(this, k);
      try { if (String(k).indexOf('l10Snap1:') === 0) window.__SNAP_READS.push({ key: String(k), hit: v !== null }); } catch (e) {}
      return v;
    };
  });
  await pageE.goto('file://' + path.join(HERE, 'preview-embed.html'));
  await pageE.waitForFunction(() => {
    const el = document.querySelector('#page-huddle');
    return el && !el.querySelector('.spinner');
  }, { timeout: 10000 });
  await pageE.waitForTimeout(250);
  const embedCalls = await pageE.evaluate(() => window.__GS_CALLS.map((c) => c.fn));
  if (embedCalls.includes('l10_bootCore')) errors.push('embed path still fetched l10_bootCore — the inline payload was not consumed');
  for (const fn of ['l10_bootWork', 'l10_bootPlan', 'l10_bootScorecard']) {
    if (!embedCalls.includes(fn)) errors.push('embed path never fetched ' + fn + ' — lists would go stale');
  }
  const embedHdr = await pageE.$eval('#hdr-sub', (el) => el.textContent);
  if (!/Week of/.test(embedHdr)) errors.push('embed path header did not hydrate (hdr-sub: "' + embedHdr + '")');
  const embedStart = await pageE.$('text=Start');
  if (!embedStart) errors.push('embed path start screen missing its Start button');
  // The boot snapshot must have been saved once all slices hydrated.
  const snapRaw = await pageE.evaluate(() => { try { return localStorage.getItem('l10Snap1:fixture-ss'); } catch (e) { return null; } });
  let snapOK = false;
  try { const s = JSON.parse(snapRaw); snapOK = !!(s && s.v === 1 && s.data && s.data.todos && s.data.todos.length); } catch (e) {}
  if (!snapOK) errors.push('boot snapshot was not saved after hydration (stale-while-revalidate dead)');
  await shot(pageE, 'embed-boot');

  // --- Snapshot path: a RELOAD in the same context consumes the snapshot ---
  await pageE.reload();
  await pageE.waitForFunction(() => {
    const el = document.querySelector('#page-huddle');
    return el && !el.querySelector('.spinner');
  }, { timeout: 10000 });
  await pageE.waitForTimeout(250);
  // The boot must have READ the stored snapshot (instrumented above)…
  const snapReads = await pageE.evaluate(() => window.__SNAP_READS || []);
  if (!snapReads.some((r) => r.key === 'l10Snap1:fixture-ss' && r.hit)) {
    errors.push('repeat load never read the boot snapshot (stale-while-revalidate not consumed)');
  }
  // …and still fetch the live slices to reconcile, with the lists rendered.
  const snapCalls = await pageE.evaluate(() => window.__GS_CALLS.map((c) => c.fn));
  for (const fn of ['l10_bootWork', 'l10_bootPlan', 'l10_bootScorecard']) {
    if (!snapCalls.includes(fn)) errors.push('snapshot path skipped the live ' + fn + ' reconcile');
  }
  const snapTodos = await pageE.$eval('#page-todos', (el) => el.innerHTML.trim().length);
  if (snapTodos < 40) errors.push('snapshot path left the To-dos page empty');
  await pageE.close();

  // --- First-run: empty workspace shows the setup checklist ---
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page2.on('console', (m) => { if (m.type() === 'error') errors.push('firstrun console.error: ' + m.text()); });
  page2.on('pageerror', (e) => errors.push('firstrun pageerror: ' + e.message));
  await page2.emulateMedia({ reducedMotion: 'reduce' });
  await page2.goto('file://' + path.join(HERE, 'preview.html') + '#firstrun');
  await page2.waitForFunction(() => {
    const el = document.querySelector('#page-huddle');
    return el && !el.querySelector('.spinner');
  }, { timeout: 10000 });
  await page2.waitForTimeout(250);
  const frCard = await page2.$('.fr-card');
  if (!frCard) errors.push('first-run checklist card missing on empty workspace');
  const frBtns = await page2.$$('[data-fr]');
  if (frBtns.length < 3) errors.push('first-run checklist rows incomplete (' + frBtns.length + ' doors)');
  await shot(page2, 'first-run');
  await page2.close();

  // --- Brand intro: plays on every open, and again after a reload ---
  const pageI = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  pageI.on('console', (m) => { if (m.type() === 'error') errors.push('intro console.error: ' + m.text()); });
  pageI.on('pageerror', (e) => errors.push('intro pageerror: ' + e.message));
  await pageI.goto('file://' + path.join(HERE, 'preview.html'));
  await pageI.waitForTimeout(200);
  if (!(await pageI.$('#mh-intro'))) errors.push('brand intro overlay did not mount on open');
  const introPlaying = await pageI.evaluate(() => document.documentElement.className.indexOf('mh-intro-play') !== -1);
  if (!introPlaying) errors.push('brand intro did not enter its play state');
  const introParts = await pageI.$$eval('#mh-intro .mh-particle', (els) => els.length).catch(() => 0);
  if (introParts !== 30) errors.push('brand intro rendered ' + introParts + ' particles (want 30)');
  // Boot still proceeds underneath the overlay…
  await pageI.waitForFunction(() => {
    const el = document.querySelector('#page-huddle');
    return el && !el.querySelector('.spinner');
  }, { timeout: 10000 });
  // …and the overlay removes itself once the reveal has settled.
  await pageI.waitForTimeout(4200);
  if (await pageI.$('#mh-intro')) errors.push('brand intro overlay did not dismiss after playing');
  // A reload plays it AGAIN (every open now, not once-per-session).
  await pageI.reload();
  await pageI.waitForTimeout(200);
  if (!(await pageI.evaluate(() => document.documentElement.className.indexOf('mh-intro-on') !== -1)))
    errors.push('brand intro did not replay on reload (should play on every open)');
  if (!(await pageI.$('#mh-intro'))) errors.push('brand intro overlay missing on reload');
  await pageI.close();

  // --- Forge (v2.18): no gate by default; the room screen walks Lobby → Locked on
  // the goals-day flow (one ideas round on a seeded wall → claim → write → one
  // review → commit); then the player view, on a laptop, claims a seed card and
  // writes it up with the trimmed form. ---
  const pageF = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  pageF.on('console', (m) => { if (m.type() === 'error') errors.push('forge console.error: ' + m.text()); });
  pageF.on('pageerror', (e) => errors.push('forge pageerror: ' + e.message));
  await pageF.emulateMedia({ reducedMotion: 'reduce' });
  await pageF.goto('file://' + path.join(HERE, 'preview.html'));
  await pageF.waitForFunction(() => { const el = document.querySelector('#page-huddle'); return el && !el.querySelector('.spinner'); }, { timeout: 10000 });
  await clickNav(pageF, 'forge');
  await pageF.waitForSelector('[data-fg-me="Alex"]', { timeout: 5000 }).catch(() => errors.push('forge home did not offer the roster pick'));
  if (await pageF.$('#forge-gate')) errors.push('the passphrase curtain rose although no FORGE_PASSWORD is set');
  await pageF.click('[data-fg-me="Alex"]');
  await pageF.waitForSelector('.js-fg-create', { timeout: 5000 }).catch(() => errors.push('forge home did not render the create form'));
  const howTxt = await pageF.$eval('#page-forge', (el) => el.textContent);
  if (!/Lobby → New ideas → Claim → Write the goal → Peer review → Commit → Lock/.test(howTxt)) errors.push('forge home "How it runs" does not follow the configured phases');
  if (!/4 cards already on the wall/.test(howTxt)) errors.push('forge home does not mention the seeded wall');
  if (!(await pageF.$('.resume-card [data-fg-open="FS-001"]'))) errors.push('forge home did not list the open fixture session FS-001');
  await pageF.fill('.js-fg-title', 'Harness goals day');
  await pageF.click('.js-fg-create');
  await pageF.waitForSelector('[data-fg-act="start"]', { timeout: 5000 }).catch(() => errors.push('creating a session did not open the Lobby'));
  const lobbyRoster = await pageF.$$('.fg-roster .who');
  if (lobbyRoster.length !== 4) errors.push('forge lobby roster should list 4 names, got ' + lobbyRoster.length);
  const startTxt = await pageF.$eval('[data-fg-act="start"]', (el) => el.textContent).catch(() => '');
  if (!/Start: New ideas/.test(startTxt)) errors.push('Lobby start button should name the first configured phase: "' + startTxt + '"');
  if (!/The wall is seeded/.test(await pageF.$eval('#page-forge', (el) => el.textContent))) errors.push('Lobby does not show the seeded-wall tile');
  const rail = await pageF.$$eval('.fg-rail .fg-ph .n', (els) => els.map((e) => e.textContent));
  if (rail.join('|') !== 'New ideas|Claim|Write the goal|Peer review|Commit|Locked') errors.push('phase rail does not match the configured day: ' + rail.join('|'));
  if (await pageF.$('[data-fg-tw]')) errors.push('Timed write button shown although FORGE_TIMED_WRITE is NO');
  const fgAct = async (action) => { await pageF.click(`[data-fg-act="${action}"]`); await pageF.waitForTimeout(260); };
  const fgPhase = async () => pageF.evaluate(() => state.forge.s.session.phase + '/' + state.forge.s.session.round);
  await fgAct('start');
  if ((await fgPhase()) !== 'DIVERGE/1') errors.push('forge start did not enter DIVERGE: ' + (await fgPhase()));
  const wall = await pageF.$$('.fg-wall .fg-card');
  if (wall.length !== 3) errors.push('ideas-round wall should show only the 3 new cards, not the seeds (' + wall.length + ')');
  if (!/4 seeded cards/.test(await pageF.$eval('#fg-body', (el) => el.textContent))) errors.push('ideas round does not mention the seeded cards');
  const leaked = await pageF.$$eval('.fg-wall .fg-card .fg-cm', (els) => els.filter((e) => /Courtney|CJ|Scott/.test(e.textContent)).length);
  if (leaked) errors.push('ideas-round cards leaked author names before Claim');
  const clock = await pageF.$eval('.fg-clock [data-fg-clock]', (el) => el.textContent);
  if (!/^\+?\d+:\d\d$/.test(clock)) errors.push('phase clock not showing a time: ' + clock);
  await fgAct('pause');
  if (!(await pageF.$('[data-fg-act="resume"]'))) errors.push('pause did not flip the control to Resume');
  await fgAct('resume');
  await fgAct('next');
  if ((await fgPhase()) !== 'CLAIM/1') errors.push('one ideas round should lead straight to CLAIM, got ' + (await fgPhase()));
  const groups = await pageF.$$eval('.fg-group h3', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  if (groups.length < 3 || !/^New this session/.test(groups[0])) errors.push('claim wall should group new cards first, then the FY27 goals: ' + groups.join(' | '));
  if (!/^Direct revenue/.test(groups[1] || '')) errors.push('claim wall groups should follow FORGE_LINES order: ' + groups.join(' | '));
  const claimCards = await pageF.$$('.fg-wall .fg-card');
  if (claimCards.length !== 7) errors.push('claim wall should show all 7 live cards with no vote configured, got ' + claimCards.length);
  const namesNow = await pageF.$$eval('.fg-wall .fg-card .fg-cm', (els) => els.filter((e) => /Courtney|CJ|Scott/.test(e.textContent)).length);
  if (!namesNow) errors.push('author names should show from Claim on');
  const seedTags = await pageF.$$eval('.fg-card .tag', (els) => els.filter((e) => /FY27 goals|team backlog/.test(e.textContent)).length);
  if (seedTags !== 4) errors.push('seed cards should carry their source tag (got ' + seedTags + ' of 4)');
  await fgAct('next');
  if ((await fgPhase()) !== 'FORGE/1') errors.push('expected FORGE/1, got ' + (await fgPhase()));
  if (!(await pageF.$('.fg-people'))) errors.push('write-the-goal progress tiles missing');
  await fgAct('next');
  if ((await fgPhase()) !== 'DOCTOR/1') errors.push('expected DOCTOR/1, got ' + (await fgPhase()));
  const docTxt = await pageF.$eval('#fg-body', (el) => el.textContent);
  if (!/Peer review/.test(docTxt) || /round 1/.test(docTxt)) errors.push('a single peer-review round should not be numbered: ' + docTxt.slice(0, 80));
  await fgAct('next');
  if ((await fgPhase()) !== 'COMMIT/1') errors.push('one review round should lead straight to COMMIT, got ' + (await fgPhase()));
  const cf = await pageF.$('[data-fg-commitform]');
  if (!cf) errors.push('commit form missing for the seeded goal');
  else {
    await cf.$eval('[data-cf="ms1"]', (el) => { el.value = 'Tiers live on Seton US'; });
    await cf.$eval('[data-cf="ms1Due"]', (el) => { el.value = '2026-10-30'; });
    await pageF.click('[data-fg-commit]'); await pageF.waitForTimeout(350);
    const commitCall = await pageF.evaluate(() => window.__GS_CALLS.filter((c) => c.fn === 'l10_forgeCommit').pop());
    if (!commitCall || commitCall.args[2].ms1 !== 'Tiers live on Seton US') errors.push('commit did not send the Q1 milestone');
    if (!(await pageF.$('.fg-goal .tag.shift'))) errors.push('committed goal not marked on its card');
  }
  // The wheel: opens, spins (reduced motion = instant), lands on a roster name.
  await pageF.click('[data-fg-wheel]'); await pageF.waitForTimeout(150);
  await pageF.click('#wheel-overlay .js-wh-spin'); await pageF.waitForTimeout(250);
  const winner = await pageF.$eval('#wheel-overlay .wheel-win', (el) => el.textContent.trim());
  if (!['Alex', 'Courtney', 'CJ', 'Scott'].includes(winner)) errors.push('wheel did not land on a roster name: "' + winner + '"');
  await pageF.click('#wheel-overlay .js-wh-out'); await pageF.waitForTimeout(120);
  const outSeats = await pageF.$$eval('#wheel-overlay .wheel-seat.out', (els) => els.length);
  if (outSeats !== 1) errors.push('taking the winner out did not grey exactly one seat');
  await pageF.click('#wheel-overlay .wheel-card [data-wh-close]'); await pageF.waitForTimeout(100);
  // Lock: preview, then the armed confirm, then the locked summary.
  await pageF.click('[data-fg-lock]');
  await pageF.waitForSelector('#forge-lock-overlay .js-lk-go', { timeout: 4000 }).catch(() => errors.push('lock preview did not render'));
  const planTxt = await pageF.$eval('#forge-lock-overlay .ids-card', (el) => el.textContent).catch(() => '');
  if (!/priorit|rock/i.test(planTxt) || !/No to-dos/.test(planTxt)) errors.push('lock preview should name priorities/rocks and say no to-dos');
  await pageF.click('#forge-lock-overlay .js-lk-go'); await pageF.waitForTimeout(150);
  await pageF.click('#forge-lock-overlay .js-lk-go'); await pageF.waitForTimeout(500);
  if (!(await pageF.evaluate(() => window.__GS_CALLS.some((c) => c.fn === 'l10_forgeLock')))) errors.push('lock confirm did not call l10_forgeLock');
  if (!/^LOCKED/.test(await fgPhase())) errors.push('session did not read LOCKED after lock: ' + (await fgPhase()));
  if (!(await pageF.$('.tiles'))) errors.push('locked summary tiles missing');
  const todoCalls = await pageF.evaluate(() => window.__GS_CALLS.map((c) => c.fn).filter((f) => /l10_addTodo|l10_setTodoStatus/.test(f)));
  if (todoCalls.length) errors.push('Forge touched to-dos: ' + todoCalls.join(','));
  await shot(pageF, 'forge-locked');
  await pageF.close();

  // Player view (?forge=FS-001) on a laptop: no gate, name pick, a card in the ideas
  // round, then claim a seed card and write it up with the trimmed goal form.
  const pageP = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  pageP.on('console', (m) => { if (m.type() === 'error') errors.push('player console.error: ' + m.text()); });
  pageP.on('pageerror', (e) => errors.push('player pageerror: ' + e.message));
  await pageP.emulateMedia({ reducedMotion: 'reduce' });
  await pageP.goto('file://' + path.join(HERE, 'preview-player.html'));
  await pageP.waitForSelector('[data-fg-me="CJ"]', { timeout: 6000 }).catch(() => errors.push('player view did not offer the roster pick'));
  if (await pageP.$('#forge-gate')) errors.push('player: the passphrase curtain rose although no FORGE_PASSWORD is set');
  if (!(await pageP.evaluate(() => document.body.classList.contains('forge-player')))) errors.push('player route did not set body.forge-player');
  const hdrShown = await pageP.$eval('header', (el) => getComputedStyle(el).display);
  if (hdrShown !== 'none') errors.push('player view still shows the app header');
  await pageP.click('[data-fg-me="CJ"]');
  await pageP.waitForSelector('.js-fg-text', { timeout: 4000 }).catch(() => errors.push('player did not reach the card input (CJ is already in the seeded session)'));
  if (!(await pageP.$('.fg-dock'))) errors.push('player dock missing');
  await pageP.fill('.js-fg-text', 'For Seton CA, fix the Bing identity because ads are dark, so that spend resumes.');
  await pageP.press('.js-fg-text', 'Enter');
  await pageP.waitForTimeout(500);
  const plAddCall = await pageP.evaluate(() => window.__GS_CALLS.filter((c) => c.fn === 'l10_forgeAddIdea').pop());
  if (!plAddCall || plAddCall.args[1] !== 'CJ') errors.push('player Enter did not add the card as CJ');
  if (!(await pageP.$$('.fg-card.mine')).length) errors.push('player did not show the new card as "yours" after the poll');
  if ((await pageP.$eval('.js-fg-text', (el) => el.value)) !== '') errors.push('player input not cleared after adding');
  // The facilitator moves the fixture session on; the player polls it in.
  const plGoto = async (key) => { await pageP.evaluate((k) => { window.__FIXTURES.l10_forgePhase('FS-001', 'goto', k); forgePollNow_(true); }, key); await pageP.waitForTimeout(450); };
  await plGoto('CLAIM');
  const plGroups = await pageP.$$('.fg-group');
  if (plGroups.length < 3) errors.push('player claim wall should be grouped (' + plGroups.length + ' groups)');
  const seedClaim = plGroups.length > 1 ? await plGroups[1].$('[data-fg-claim]') : null;
  if (!seedClaim) errors.push('player: no Claim button on a seed card');
  else {
    await seedClaim.click(); await pageP.waitForTimeout(450);
    const claimCall = await pageP.evaluate(() => window.__GS_CALLS.filter((c) => c.fn === 'l10_forgeClaim').pop());
    if (!claimCall || claimCall.args[1] !== 'CJ') errors.push('player claim did not call l10_forgeClaim as CJ');
    if (!(await pageP.$('[data-fg-unclaim]'))) errors.push('claimed seed card does not offer Release');
  }
  if (!(await pageP.$('.js-fg-text'))) errors.push('player claim view should still allow adding a card');
  await plGoto('FORGE');
  const mk = await pageP.$('[data-fg-newgoal^="Business|FI-"]');
  if (!mk) errors.push('player write-the-goal view has no "Make it a goal" for the claimed seed card');
  else {
    await mk.click(); await pageP.waitForTimeout(500);
    // The new goal's form is the last one (CJ's fixture goal G-001 comes first,
    // and it already carries ladder fields, so it opens with More expanded).
    const forms = await pageP.$$('[data-fg-goalform]');
    const form = forms.length ? forms[forms.length - 1] : null;
    const formId = form ? await form.evaluate((el) => el.dataset.fgGoalform) : '';
    if (!form || formId === 'G-001') errors.push('goal form for the card-made goal did not open after Make it a goal');
    else {
      const sel = (s) => `[data-fg-goalform="${formId}"] ${s}`;
      const title = await form.$eval('[data-gf="title"]', (el) => el.value);
      if (!/direct revenue|new-customer/i.test(title)) errors.push('goal title should prefill from the claimed card: "' + title + '"');
      if (!(await form.$eval('[data-gf="line"]', (el) => el.value))) errors.push('the FY27 goal select should prefill from the card area');
      const labels = await pageP.$$eval(sel('label'), (els) => els.map((e) => e.textContent.trim()));
      if (!labels.some((l) => /Which FY27 goal/.test(l))) errors.push('goal form lacks the "Which FY27 goal" field');
      if (labels.some((l) => l === 'Rung')) errors.push('ladder fields should be hidden until More is opened');
      await pageP.click(sel('[data-fg-goalmore]')); await pageP.waitForTimeout(300);
      const labels2 = await pageP.$$eval(sel('label'), (els) => els.map((e) => e.textContent.trim()));
      if (!labels2.some((l) => l === 'Rung')) errors.push('More did not reveal the ladder fields');
      // The meter sits in the goal card's header, a sibling of the form.
      const lit = await pageP.evaluate((id) => Array.from(document.querySelector('[data-fg-goalform="' + id + '"]').closest('.fg-goal').querySelectorAll('.fg-meter .t.on')).map((e) => e.textContent.trim()), formId);
      if (!lit.some((t) => /R/.test(t))) errors.push('SMART meter should light R (Relevant) once the FY27 goal is named, lit: ' + lit.join(','));
    }
  }
  await shot(pageP, 'forge-player');
  await pageP.close();

  await browser.close();

  if (errors.length) {
    console.error('\nSMOKE FAILURES (' + errors.length + '):');
    errors.forEach((e) => console.error('  ✗ ' + e));
    process.exit(1);
  }
  console.log('smoke: all green');
})();

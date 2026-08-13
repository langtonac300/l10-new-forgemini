// Headless smoke run of the assembled L10 app. Boots preview.html, walks every
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
  // All preview variants share the file:// origin's storage — clear it so the
  // boot snapshot (stale-while-revalidate) can't leak between runs/pages.
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });

  await page.goto('file://' + path.join(HERE, 'preview.html'));
  // Boot: all four slices resolve → the huddle start screen replaces the spinner.
  await page.waitForFunction(() => {
    const el = document.querySelector('#page-huddle');
    return el && !el.querySelector('.spinner');
  }, { timeout: 10000 });
  await page.waitForTimeout(200);
  await shot(page, 'start-screen');

  // Every page renders without error.
  for (const p of ['scorecard', 'rocks', 'headlines', 'todos', 'issues', 'oneonone', 'history', 'settings', 'how']) {
    await clickNav(page, p);
    const empty = await page.$eval('#page-' + p, (el) => el.innerHTML.trim().length);
    if (empty < 40) errors.push(`page-${p} rendered nearly empty (${empty} chars)`);
    await shot(page, 'page-' + p);
  }

  // --- To-dos flows (the daily work surface) ---
  await clickNav(page, 'todos');
  // Composer expands on focus, and the typed text survives a filter re-render.
  await page.click('.js-td-text');
  const composerOpen = await page.$eval('.td-compose', (el) => el.classList.contains('td-open'));
  if (!composerOpen) errors.push('composer did not expand on focus');
  await page.fill('.js-td-text', 'Harness to-do survives re-render');
  await page.click('[data-tdfilter="mine"]');
  await page.waitForTimeout(250);
  await page.click('[data-tdfilter="mine"]');
  await page.waitForTimeout(250);
  const keptText = await page.$eval('.js-td-text', (el) => el.value);
  if (keptText !== 'Harness to-do survives re-render') errors.push('composer text lost on re-render: "' + keptText + '"');
  // Steps drawer opens from the page.
  const drawerBtn = await page.$('[data-tddrawer]');
  if (drawerBtn) {
    await drawerBtn.click();
    await page.waitForTimeout(150);
    const drawer = await page.$('.td-drawer, .todo-drawer, [data-tddrawer][aria-expanded="true"]');
    if (!drawer) errors.push('steps drawer did not open');
  } else errors.push('no [data-tddrawer] button found');
  // Select mode: checkboxes only in the mode; bulk bar counts visible rows.
  await page.click('[data-tdselmode]');
  await page.waitForTimeout(150);
  const checks = await page.$$('.td-check');
  if (!checks.length) errors.push('select mode showed no checkboxes');
  else {
    await checks[0].click();
    await page.waitForTimeout(150);
    const bulk = await page.$('[data-tdbulk]');
    if (!bulk) errors.push('bulk bar missing after selection');
  }
  await page.click('[data-tdselmode]'); // leave the mode
  await page.waitForTimeout(120);
  // A status flip persists: the l10_setTodoStatus gs call must fire.
  const before = await page.evaluate(() => window.__GS_CALLS.length);
  const doneBtn = await page.$('[data-todo$="|DONE"]');
  if (doneBtn) {
    await doneBtn.click();
    await page.waitForTimeout(250);
    const calls = await page.evaluate(() => window.__GS_CALLS.map((c) => c.fn));
    if (!calls.slice(before).includes('l10_setTodoStatus')) {
      errors.push('todo DONE click did not persist via l10_setTodoStatus (Jira sync would miss it)');
    }
  } else errors.push('no ✓ done button found on To-dos page');
  await shot(page, 'todos-after-flows');

  // --- Scorecard: capture grid opens; sparklines drew ---
  await clickNav(page, 'scorecard');
  const svgs = await page.$$('#page-scorecard svg');
  if (svgs.length < 3) errors.push('scorecard sparklines missing (' + svgs.length + ' svg)');
  // Data health: strip shows the stale sources; the mapped metric is flagged.
  await page.waitForTimeout(300); // health fetch is deliberately post-boot
  const hlth = await page.$('#page-scorecard .hlth-strip');
  if (!hlth) errors.push('data-health strip missing on scorecard');
  const hlthTxt = hlth ? await hlth.textContent() : '';
  if (hlth && !/Leads lifecycle/.test(hlthTxt)) errors.push('health strip does not surface the stale leads source');
  const srcWarns = await page.$$('#page-scorecard .sc-src-warn');
  if (!srcWarns.length) errors.push('no metric carries the source-stale warning line (HEALTH_MAP flag path dead)');

  // --- Issues: IDS overlay opens (dialog semantics land in the a11y wave) ---
  await clickNav(page, 'issues');
  await shot(page, 'issues');

  // --- Cascade regressions the adversarial review caught ---
  // Width utilities must actually beat `.row > .field` (computed, not classes).
  const flexOK = await page.$eval('.td-compose .js-td-text', (el) => {
    return getComputedStyle(el.closest('.field')).flexGrow;
  });
  if (flexOK !== '3') errors.push('composer f-3 field computes flex-grow ' + flexOK + ' (want 3) — .row > .field is winning again');
  // The skip link must not inherit <base target="_top">.
  const skipTarget = await page.$eval('.skip-link', (el) => el.getAttribute('target'));
  if (skipTarget !== '_self') errors.push('skip-link target is ' + skipTarget + ' — base target=_top would navigate the top window');
  // Settings roster chips must not look clickable.
  await clickNav(page, 'settings');
  const cur = await page.$eval('.person-chip.is-static', (el) => getComputedStyle(el).cursor).catch(() => null);
  if (cur && cur !== 'default') errors.push('.is-static loses the cursor fight (' + cur + ')');

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

  // --- Meeting: start → segment rail renders → timer runs ---
  await clickNav(page, 'huddle');
  const startBtn = await page.$('text=Start');
  if (startBtn) {
    await startBtn.click();
    await page.waitForTimeout(400);
    await shot(page, 'meeting-started');
  }

  // --- Embed path: the production-primary boot (core inline in the page) ---
  // The core slice must come from window.__L10_BOOT — no l10_bootCore call —
  // and the app still hydrates fully from the three remaining slices.
  const pageE = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  pageE.on('console', (m) => { if (m.type() === 'error') errors.push('embed console.error: ' + m.text()); });
  pageE.on('pageerror', (e) => errors.push('embed pageerror: ' + e.message));
  await pageE.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
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
  await pageE.close();

  // --- Snapshot path: a repeat load paints from the stored snapshot ---
  // (no localStorage clear on this page — it must inherit the save above).
  const pageS = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  pageS.on('console', (m) => { if (m.type() === 'error') errors.push('snapshot console.error: ' + m.text()); });
  pageS.on('pageerror', (e) => errors.push('snapshot pageerror: ' + e.message));
  await pageS.goto('file://' + path.join(HERE, 'preview-embed.html'));
  await pageS.waitForFunction(() => {
    const el = document.querySelector('#page-huddle');
    return el && !el.querySelector('.spinner');
  }, { timeout: 10000 });
  await pageS.waitForTimeout(250);
  // Snapshot-hydrated pages must render real content, and the live slices must
  // still be fetched to reconcile.
  const snapCalls = await pageS.evaluate(() => window.__GS_CALLS.map((c) => c.fn));
  for (const fn of ['l10_bootWork', 'l10_bootPlan', 'l10_bootScorecard']) {
    if (!snapCalls.includes(fn)) errors.push('snapshot path skipped the live ' + fn + ' reconcile');
  }
  const snapTodos = await pageS.$eval('#page-todos', (el) => el.innerHTML.trim().length);
  if (snapTodos < 40) errors.push('snapshot path left the To-dos page empty');
  await pageS.close();

  // --- First-run: empty workspace shows the setup checklist ---
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page2.on('console', (m) => { if (m.type() === 'error') errors.push('firstrun console.error: ' + m.text()); });
  page2.on('pageerror', (e) => errors.push('firstrun pageerror: ' + e.message));
  await page2.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
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

  await browser.close();

  if (errors.length) {
    console.error('\nSMOKE FAILURES (' + errors.length + '):');
    errors.forEach((e) => console.error('  ✗ ' + e));
    process.exit(1);
  }
  console.log('smoke: all green');
})();

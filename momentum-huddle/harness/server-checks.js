// Node-only checks of the server helpers behind metric capture and the Jira
// sync, run against small stubs of the Apps Script services (no browser, no
// network). Complements run.js: the browser suite covers the client; this
// covers the .gs logic the client cannot reach — above all the sync's promise
// that one to-do never becomes two Jira issues, whatever the sheet does, and
// the range resolver's fallbacks and reasons.
//   node server-checks.js      (exit 1 on any failure)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APPS = path.resolve(__dirname, '..', 'apps-script');
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

// --- Sheets stub -------------------------------------------------------------
function colNum(letters) { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function makeRange(sheet, row, col, nrows, ncols) {
  const cell = (r, c) => { const line = sheet.grid[r - 1]; return line && line[c - 1] !== undefined ? line[c - 1] : ''; };
  const rng = {
    getValues() { const out = []; for (let r = 0; r < nrows; r++) { const line = []; for (let c = 0; c < ncols; c++) line.push(cell(row + r, col + c)); out.push(line); } return out; },
    getValue() { return cell(row, col); },
    getDisplayValue() { return String(cell(row, col)); },
    getDisplayValues() { return rng.getValues().map((r) => r.map(String)); },
    getFormulas() { return rng.getValues().map((r) => r.map(() => '')); },
    setValues(vals) {
      for (let r = 0; r < vals.length; r++) {
        const line = sheet.grid[row + r - 1] || (sheet.grid[row + r - 1] = []);
        for (let c = 0; c < vals[r].length; c++) {
          if (sheet.writeFilter && !sheet.writeFilter(row + r, col + c)) continue; // simulates a cell that will not take the write
          line[col + c - 1] = vals[r][c];
        }
      }
      return rng;
    },
    setValue(v) { return rng.setValues([[v]]); },
    setFontWeight() { return rng; }, setBackground() { return rng; }, setFontColor() { return rng; },
    setNumberFormat() { return rng; }, setDataValidation() { return rng; }, clearDataValidations() { return rng; },
  };
  return rng;
}
function makeSheet(name, grid) {
  const sheet = {
    grid,
    getName: () => name,
    getLastRow: () => grid.length,
    getLastColumn: () => grid.reduce((m, r) => Math.max(m, r.length), 0),
    getMaxColumns: () => grid.reduce((m, r) => Math.max(m, r.length), 0),
    getDataRange: () => makeRange(sheet, 1, 1, grid.length, sheet.getLastColumn()),
    getRange(a, b, c, d) {
      if (typeof a === 'string') {
        const m = a.match(/^([A-Z]+)(\d+)$/);
        if (!m) throw new Error('Range not found: ' + a);
        return makeRange(sheet, Number(m[2]), colNum(m[1]), 1, 1);
      }
      return makeRange(sheet, a, b, c || 1, d || 1);
    },
    appendRow(arr) { grid.push(arr.slice()); return sheet; },
    setColumnWidth() {}, setFrozenRows() {}, insertColumnsAfter() {}, insertRowBefore() {},
    getConditionalFormatRules: () => [], setConditionalFormatRules() {},
  };
  return sheet;
}
function fmtDate(d, pattern) {
  const p2 = (n) => String(n).padStart(2, '0');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return pattern.replace(/yyyy|MMM|MM|dd|d|HH|mm|EEE/g, (t) => ({
    yyyy: d.getFullYear(), MMM: MON[d.getMonth()], MM: p2(d.getMonth() + 1), dd: p2(d.getDate()), d: d.getDate(),
    HH: p2(d.getHours()), mm: p2(d.getMinutes()), EEE: DAY[d.getDay()],
  })[t]);
}

// --- Jira stub ---------------------------------------------------------------
function adfText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  let out = node.type === 'text' ? String(node.text || '') : '';
  (node.content || []).forEach((c) => { out += ' ' + adfText(c); });
  return out;
}
function mkStore(issues) {
  return { issues: issues || [], creates: [], searches: [], seq: 600, rejectLabels: false, searchFail: false };
}
// A tiny Jira: enhanced JQL search (labels = / description ~ / statusCategory),
// issue create (optionally rejecting the Labels field the way a project whose
// create screen lacks it does), transitions.
function fakeJira(store) {
  return function (method, p, payload) {
    if (method === 'get' && p.startsWith('/search/jql')) {
      const jql = decodeURIComponent(p.match(/jql=([^&]*)/)[1]);
      store.searches.push(jql);
      if (store.searchFail) return { code: 500, body: { errorMessages: ['search backend unavailable'] } };
      const lab = jql.match(/labels = "([^"]+)"/);
      const txt = jql.match(/description ~ "([^"]+)"/);
      const issues = store.issues.filter((is) => !is.done &&
        ((lab && (is.fields.labels || []).indexOf(lab[1]) !== -1) || (txt && adfText(is.fields.description).indexOf(txt[1]) !== -1)));
      return { code: 200, body: { issues: issues.map((is) => ({ key: is.key, fields: is.fields })), isLast: true } };
    }
    if (method === 'post' && p === '/issue') {
      store.creates.push(payload);
      if (store.rejectLabels && payload.fields.labels) {
        return { code: 400, body: { errors: { labels: "Field 'labels' cannot be set. It is not on the appropriate screen, or unknown." } } };
      }
      const key = 'BNADM-' + (++store.seq);
      store.issues.push({ key, fields: { labels: payload.fields.labels || [], description: payload.fields.description, summary: payload.fields.summary, created: '2026-09-21T10:00:00.000-0500' } });
      return { code: 201, body: { id: String(store.seq), key, self: '' } };
    }
    if (method === 'get' && /\/issue\/[^/]+\/transitions$/.test(p)) return { code: 200, body: { transitions: [{ id: '31', name: 'Done', to: { statusCategory: { key: 'done' } } }] } };
    if (method === 'post' && /\/issue\/[^/]+\/transitions$/.test(p)) return { code: 204, body: '' };
    return { code: 404, body: { errorMessages: ['unexpected ' + method + ' ' + p] } };
  };
}

// --- The Apps Script environment ------------------------------------------------
function makeEnv(o) {
  const sheets = {};
  const addSheet = (name, grid) => (sheets[name] = makeSheet(name, grid));
  addSheet('L10_Config', [['Key', 'Value', 'Notes'],
    ['JIRA_DOMAIN', 'example.atlassian.net', ''], ['JIRA_PROJECT_KEY', 'BNADM', ''], ['JIRA_EMAIL', 'owner@example.com', ''],
    ['CHAT_WEBHOOK_URL', 'https://chat.example.test/webhook', '']]);
  addSheet('L10_Todos', o.todos);
  Object.keys(o.extraSheets || {}).forEach((n) => addSheet(n, o.extraSheets[n]));
  if (o.writeFilter) sheets['L10_Todos'].writeFilter = o.writeFilter;
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => addSheet(n, []),
    getRange(a1) { throw new Error('Range not found: ' + a1); },
    getSpreadsheetTimeZone: () => 'America/Chicago',
    toast() {},
  };
  const log = { chat: [], deletedTriggers: 0 };
  const triggers = [{ getHandlerFunction: () => 'l10JiraSyncTodos' }];
  const props = { L10_JIRA_API_TOKEN: 'token' };
  const resp = (code, body) => { const text = typeof body === 'string' ? body : JSON.stringify(body); return { getResponseCode: () => code, getContentText: () => text }; };
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getActive: () => ss },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: (k) => { delete props[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    UrlFetchApp: { fetch(url, opt) {
      if (url.indexOf('https://chat.example.test/') === 0) { log.chat.push(JSON.parse(opt.payload).text); return resp(200, ''); }
      const m = url.match(/\/rest\/api\/3(\/.*)$/);
      const r = o.jira(String(opt.method).toLowerCase(), m ? m[1] : url, opt.payload ? JSON.parse(opt.payload) : null);
      return resp(r.code, r.body);
    } },
    Utilities: { sleep() {}, base64Encode: (s) => Buffer.from(s).toString('base64'), formatDate: (d, tz, p) => fmtDate(d, p) },
    Logger: { log() {} },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger(t) { const i = triggers.indexOf(t); if (i !== -1) triggers.splice(i, 1); log.deletedTriggers++; },
      newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() { triggers.push({ getHandlerFunction: () => 'l10JiraSyncTodos' }); } }) }) }),
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
    Session: { getScriptTimeZone: () => 'America/Chicago', getActiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    HtmlService: {},
  };
  vm.createContext(ctx);
  ['L10Setup.gs', 'L10Code.gs', 'L10Jira.gs'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(APPS, f), 'utf8'), ctx, { filename: f }));
  return { ctx, sheets, log, triggers };
}
// Each Apps Script execution starts with empty per-execution memos; a "next run"
// of the trigger must not see this run's cache.
function freshExecution(env) {
  env.ctx.L10_TAB_CACHE_ = {};
  env.ctx.L10_CONFIG_CACHE_ = null;
  env.ctx.L10_NEXTID_CACHE_ = {};
}

// --- Fixtures ------------------------------------------------------------------
const TODO_HEADERS = ['ID', 'To-Do', 'Owner', 'Due', 'Status', 'Created', 'Done At', 'Carried Over', 'Source', 'Notes',
  'Jira Key', 'Jira Done', 'Repeat', 'Blocked On', 'Last Carried Week'];
const KEY_COL = TODO_HEADERS.indexOf('Jira Key'); // 0-based → column K
const todo = (id, text, owner, status, key, tail) =>
  [id, text, owner, '2026-09-28', status, '2026-09-14', '', 0, '', '', key || '', '', '', '', ''].concat(tail || []);
const adf = (t) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const desc = (id) => adf('Created from the huddle.  •  Owner: Courtney  •  Huddle ref: ' + id);
const issue = (key, id, labels, created) => ({ key, fields: { labels: labels || [], description: desc(id), summary: 'x', created: created || '2026-09-18T10:00:00.000-0500' } });

// --- Scenarios ------------------------------------------------------------------
function scenarioDuplicateHeader() {
  // Legacy layout: an early sync appended 'Jira Key'/'Jira Done' at P/Q, then a
  // header repair wrote the canonical K/L on top. The row's key sits in P.
  const headers = TODO_HEADERS.concat(['Jira Key', 'Jira Done']);
  const store = mkStore([issue('BNADM-401', 'TD-001')]);
  const env = makeEnv({ todos: [headers, todo('TD-001', 'Fix the feed', 'Courtney', 'OPEN', '', ['BNADM-401', ''])], jira: fakeJira(store) });
  const rows = env.ctx.l10ReadTab_('L10_Todos').rows;
  check(rows[0]['Jira Key'] === '', 'dup header: l10ReadTab_ must read the FIRST Jira Key column (K), got ' + JSON.stringify(rows[0]['Jira Key']));
  freshExecution(env);
  const res = env.ctx.l10JiraSyncTodos();
  check(res.ok === true, 'dup header: sync should complete, got ' + JSON.stringify(res));
  check(store.creates.length === 0, 'dup header: must not create — the issue exists (creates=' + store.creates.length + ')');
  check(res.adopted === 1, 'dup header: expected 1 linked, got ' + res.adopted);
  check(env.sheets['L10_Todos'].grid[1][KEY_COL] === 'BNADM-401', 'dup header: key not recorded in column K: ' + JSON.stringify(env.sheets['L10_Todos'].grid[1][KEY_COL]));
  check(/K, P/.test(res.headerWarn || ''), 'dup header: warning should name columns K and P, got ' + JSON.stringify(res.headerWarn));
  freshExecution(env);
  const res2 = env.ctx.l10JiraSyncTodos();
  check(res2.ok && res2.created === 0 && res2.adopted === 0 && store.creates.length === 0, 'dup header: second run should be a no-op, got ' + JSON.stringify(res2));
}

function scenarioCreate() {
  const store = mkStore([]);
  const env = makeEnv({ todos: [TODO_HEADERS, todo('TD-002', 'Pull the PDC export', 'Scott', 'WORKING', '')], jira: fakeJira(store) });
  const res = env.ctx.l10JiraSyncTodos();
  check(res.ok && res.created === 1 && res.adopted === 0, 'create: expected 1 created, got ' + JSON.stringify(res));
  check(store.searches.length === 1, 'create: the duplicate check must run before creating (searches=' + store.searches.length + ')');
  check(/labels = "huddle-td-002"/.test(store.searches[0] || '') && /description ~ "TD-002"/.test(store.searches[0] || '') && /statusCategory != "Done"/.test(store.searches[0] || ''),
    'create: duplicate-check JQL missing a clause: ' + store.searches[0]);
  check(store.creates.length === 1 && JSON.stringify(store.creates[0].fields.labels) === '["huddle-td-002"]',
    'create: label missing on the created issue: ' + JSON.stringify(store.creates[0] && store.creates[0].fields.labels));
  check(env.sheets['L10_Todos'].grid[1][KEY_COL] === 'BNADM-601', 'create: key not recorded: ' + JSON.stringify(env.sheets['L10_Todos'].grid[1][KEY_COL]));
  freshExecution(env);
  const res2 = env.ctx.l10JiraSyncTodos();
  check(res2.ok && store.creates.length === 1 && store.searches.length === 1, 'create: second run must neither search nor create again: ' + JSON.stringify(res2));
}

function scenarioLabelsRejected() {
  const store = mkStore([]);
  store.rejectLabels = true;
  const env = makeEnv({ todos: [TODO_HEADERS, todo('TD-004', 'Refresh the PMax asset groups', 'CJ', 'OPEN', '')], jira: fakeJira(store) });
  const res = env.ctx.l10JiraSyncTodos();
  check(res.ok && res.created === 1, 'labels rejected: should still create once, got ' + JSON.stringify(res));
  check(store.creates.length === 2 && store.creates[0].fields.labels && !store.creates[1].fields.labels,
    'labels rejected: expected one attempt with labels then one without, got ' + store.creates.length + ' attempts');
  check(env.sheets['L10_Todos'].grid[1][KEY_COL] === 'BNADM-601', 'labels rejected: key not recorded');
}

function scenarioWriteBackBlocked() {
  // The cell will not take the write (column protected / moved) — the runaway case.
  const store = mkStore([]);
  const env = makeEnv({ todos: [TODO_HEADERS, todo('TD-003', 'Chase IT on the GTM filter', 'Courtney', 'BLOCKED', '')], jira: fakeJira(store),
    writeFilter: (row, col) => col !== KEY_COL + 1 });
  const res = env.ctx.l10JiraSyncTodos();
  check(res.ok === false && res.halted === true, 'blocked write-back: sync must halt, got ' + JSON.stringify(res));
  check(/reads back as ""/.test(res.error || ''), 'blocked write-back: the reason should say the key did not read back: ' + res.error);
  check(store.creates.length === 1, 'blocked write-back: exactly one create (got ' + store.creates.length + ')');
  check(env.log.deletedTriggers === 1 && env.triggers.length === 0, 'blocked write-back: the auto-sync trigger must be removed');
  check(env.log.chat.length === 1 && /stopped itself/.test(env.log.chat[0]), 'blocked write-back: one chat line expected, got ' + JSON.stringify(env.log.chat));
  // The next run — where the old code created the same issue again.
  freshExecution(env);
  const res2 = env.ctx.l10JiraSyncTodos();
  check(store.creates.length === 1, 'blocked write-back: the next run created again (creates=' + store.creates.length + ') — this is the runaway');
  check(res2.ok === false && res2.halted === true, 'blocked write-back: the next run should halt again, got ' + JSON.stringify(res2));
}

function scenarioDuplicateIds() {
  const store = mkStore([]);
  const env = makeEnv({ todos: [TODO_HEADERS,
    todo('TD-005', 'Build the Demand Gen shell', 'Courtney', 'OPEN', ''),
    todo('TD-005', 'Build the Demand Gen shell', 'Courtney', 'OPEN', '')], jira: fakeJira(store) });
  const res = env.ctx.l10JiraSyncTodos();
  check(res.ok && res.created === 1 && store.creates.length === 1, 'dup ids: exactly one create, got ' + JSON.stringify(res) + ' creates=' + store.creates.length);
  check(JSON.stringify(res.dupIds) === '["TD-005"]', 'dup ids: the second row should be reported, got ' + JSON.stringify(res.dupIds));
  check(env.sheets['L10_Todos'].grid[1][KEY_COL] === 'BNADM-601' && env.sheets['L10_Todos'].grid[2][KEY_COL] === '', 'dup ids: key on the first row only');
  freshExecution(env);
  env.ctx.l10JiraSyncTodos();
  check(store.creates.length === 1, 'dup ids: the next run must not create for the second row (creates=' + store.creates.length + ')');
}

function scenarioSearchFails() {
  const store = mkStore([]);
  store.searchFail = true;
  const env = makeEnv({ todos: [TODO_HEADERS, todo('TD-006', 'Tag the Seton CA feed', 'Scott', 'OPEN', '')], jira: fakeJira(store) });
  const res = env.ctx.l10JiraSyncTodos();
  check(res.ok && res.errors === 1 && res.created === 0 && store.creates.length === 0, 'search fails: must not create, got ' + JSON.stringify(res));
  check(/^ERR: duplicate check failed/.test(String(env.sheets['L10_Todos'].grid[1][KEY_COL])), 'search fails: ERR reason not written: ' + env.sheets['L10_Todos'].grid[1][KEY_COL]);
}

function scenarioDuplicateReport() {
  const store = mkStore([
    issue('BNADM-701', 'TD-009', ['huddle-td-009'], '2026-09-18T10:00:00.000-0500'),
    issue('BNADM-702', 'TD-009', [], '2026-09-18T10:10:00.000-0500'),
    issue('BNADM-703', 'TD-010', [], '2026-09-18T10:20:00.000-0500'),
    issue('BNADM-704', 'TD-011', [], '2026-09-18T10:30:00.000-0500'),
    issue('BNADM-705', 'TD-011', [], '2026-09-18T10:40:00.000-0500'),
  ]);
  const env = makeEnv({ todos: [TODO_HEADERS,
    todo('TD-009', 'a', 'Courtney', 'OPEN', 'BNADM-702'), todo('TD-010', 'b', 'Scott', 'OPEN', 'BNADM-703'), todo('TD-011', 'c', 'CJ', 'OPEN', '')],
    jira: fakeJira(store) });
  const r = env.ctx.l10JiraDuplicateReport();
  check(r.ok && r.groups.length === 2, 'report: expected 2 duplicate groups, got ' + JSON.stringify(r));
  const g9 = r.groups.find((g) => g.ref === 'TD-009'), g11 = r.groups.find((g) => g.ref === 'TD-011');
  check(g9 && g9.keep === 'BNADM-702' && JSON.stringify(g9.extras) === '["BNADM-701"]', 'report: TD-009 should keep the sheet key and list BNADM-701 as extra: ' + JSON.stringify(g9));
  check(g11 && g11.linked === '' && g11.keep === 'BNADM-704' && JSON.stringify(g11.extras) === '["BNADM-705"]', 'report: TD-011 should keep the oldest: ' + JSON.stringify(g11));
  check(store.creates.length === 0, 'report: must not write to Jira');
}

function scenarioRangeReasons() {
  const dash = []; for (let i = 0; i < 9; i++) dash.push(['', '', '', '', '', '', '', '']);
  dash[6][7] = '109.0%'; dash[7][7] = ''; dash[8][7] = '#N/A';
  const env = makeEnv({ todos: [TODO_HEADERS], jira: fakeJira(mkStore()), extraSheets: { 'Financial Dashboard v2': dash } });
  const pr = env.ctx.l10PullRange_, rr = env.ctx.l10ResolveRef_;
  check(pr('Financial Dashboard v2!H7').value === 109, 'range: H7 should read 109, got ' + JSON.stringify(pr('Financial Dashboard v2!H7')));
  check(pr("'Financial Dashboard v2'!H7").value === 109, 'range: quoted sheet name should resolve');
  check(/H8 is blank/.test(pr('Financial Dashboard v2!H8').why || ''), 'range: blank cell reason, got ' + JSON.stringify(pr('Financial Dashboard v2!H8')));
  const na = pr('Financial Dashboard v2!H9');
  check(/shows "#N\/A"/.test(na.why || '') && /formula error/.test(na.why || ''), 'range: error-cell reason, got ' + JSON.stringify(na));
  check(/no tab named "Nope"/.test(pr('Nope!A1').why || ''), 'range: missing tab reason, got ' + JSON.stringify(pr('Nope!A1')));
  check(/not a cell address/.test(pr('Financial Dashboard v2!ZZ').why || ''), 'range: bad address reason, got ' + JSON.stringify(pr('Financial Dashboard v2!ZZ')));
  check(rr({ text: 'Financial Dashboard v2!H7', formula: '', display: '' }).value === 109, 'resolve: text ref');
  check(/allow access/.test(rr({ text: '', formula: '=IMPORTRANGE("id","Weekly!B3")', display: '#REF!' }).why || ''), 'resolve: #REF! formula should hint at IMPORTRANGE access');
  check(/blank result/.test(rr({ text: '', formula: '=X!A1', display: '' }).why || ''), 'resolve: blank formula result reason');
  check(rr({ text: '', formula: '=X!A1', display: '$1,234' }).value === 1234, 'resolve: formula display parses');
  check(/plain number/.test(rr({ text: '42', formula: '', display: '' }).why || ''), 'resolve: plain number reason');
  check(/Source Ref cell is empty/.test(rr({ text: '', formula: '', display: '' }).why || ''), 'resolve: empty ref reason');
}

function scenarioFormulaRefFallback() {
  // The 2026-09-21 case: Source Ref cells hold ='Financial Dashboard v2'!H7 … and
  // display #REF!, while H7 … themselves hold good numbers. The reference text
  // is read directly; a target that is genuinely blank still fails, loudly.
  const dash = []; for (let i = 0; i < 12; i++) dash.push(['', '', '', '', '', '', '', '']);
  dash[6][7] = '90.6%'; dash[7][7] = ''; dash[10][7] = '81.7%';
  const env = makeEnv({ todos: [TODO_HEADERS], jira: fakeJira(mkStore()), extraSheets: { 'Financial Dashboard v2': dash } });
  const rr = env.ctx.l10ResolveRef_, tgt = env.ctx.l10FormulaRefTarget_;
  check(tgt("='Financial Dashboard v2'!H7") === 'Financial Dashboard v2!H7', 'ref target: quoted sheet, got ' + tgt("='Financial Dashboard v2'!H7"));
  check(tgt('=Metrics!$H$7') === 'Metrics!H7', 'ref target: unquoted sheet with $ anchors, got ' + tgt('=Metrics!$H$7'));
  check(tgt("='Financial Dashboard v2'!H7*100") === '', 'ref target: an expression must not be treated as a plain reference');
  check(tgt('=IMPORTRANGE("id","Weekly!B3")') === '', 'ref target: a function is not a plain reference');
  check(tgt("='Financial Dashboard v2'!#REF!") === '', 'ref target: a deleted-cell reference is not a plain reference');
  const ok = rr({ text: '#REF!', formula: "='Financial Dashboard v2'!H7", display: '#REF!' });
  check(ok.value === 90.6 && /read directly/.test(ok.how || '') && /#REF!/.test(ok.how || ''), 'fallback: stale #REF! formula should read H7 directly, got ' + JSON.stringify(ok));
  const ok2 = rr({ text: '#REF!', formula: "='Financial Dashboard v2'!H11", display: '#REF!' });
  check(ok2.value === 81.7, 'fallback: H11 should read 81.7, got ' + JSON.stringify(ok2));
  const blank = rr({ text: '#REF!', formula: "='Financial Dashboard v2'!H8", display: '#REF!' });
  check(blank.value === null && /shows "#REF!"/.test(blank.why || '') && /H8 is blank/.test(blank.why || ''), 'fallback: a blank target must still fail and say so, got ' + JSON.stringify(blank));
  const imp = rr({ text: '', formula: '=IMPORTRANGE("id","Weekly!B3")', display: '#REF!' });
  check(imp.value === null && /allow access/.test(imp.why || '') && !/read directly/.test(imp.why || ''), 'fallback: IMPORTRANGE errors keep the access hint and no direct read, got ' + JSON.stringify(imp));
  const live = rr({ text: '', formula: "='Financial Dashboard v2'!H7", display: '90.6%' });
  check(live.value === 90.6 && live.how === "='Financial Dashboard v2'!H7", 'fallback: a working formula is untouched, got ' + JSON.stringify(live));
}

[scenarioDuplicateHeader, scenarioCreate, scenarioLabelsRejected, scenarioWriteBackBlocked, scenarioDuplicateIds,
  scenarioSearchFails, scenarioDuplicateReport, scenarioRangeReasons, scenarioFormulaRefFallback].forEach((fn) => {
  try { fn(); } catch (e) { failures.push(fn.name + ' threw: ' + (e && e.stack || e)); }
});

if (failures.length) {
  console.error('\nSERVER CHECK FAILURES (' + failures.length + '):');
  failures.forEach((f) => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('server-checks: all green (' + APPS + ')');

// Momentum Huddle — server API for the web app (called via google.script.run).
// All globals carry the l10 prefix so nothing collides in the global namespace.

// The add-on always operates on the active spreadsheet (currentonly scope).
function l10Ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

// All dates are formatted in the SPREADSHEET's timezone, not the script's —
// the two can differ, and week keys / due dates must match what the sheet shows.
var L10_TZ_ = null;
function l10Tz_() {
  if (!L10_TZ_) {
    try { L10_TZ_ = l10Ss_().getSpreadsheetTimeZone(); }
    catch (e) { L10_TZ_ = Session.getScriptTimeZone(); }
  }
  return L10_TZ_;
}

// Memoized per (pattern, timestamp): Utilities.formatDate crosses the V8→Java
// service bridge (~0.5-1.5ms per call) and the boot builders format every Date
// cell of every tab — same-day cells share a midnight timestamp, so the hit
// rate is high and a year-old workbook saves hundreds of ms per boot.
var L10_FMT_CACHE_ = {};
function l10Fmt_(d, pattern) {
  var key = pattern + '|' + d.getTime();
  var hit = L10_FMT_CACHE_[key];
  if (hit !== undefined) return hit;
  return (L10_FMT_CACHE_[key] = Utilities.formatDate(d, l10Tz_(), pattern));
}

// Session.getActiveUser also crosses the service bridge (~50-150ms) — one call
// per execution is plenty (the user can't change mid-request).
var L10_USER_CACHE_ = null;
function l10User_() {
  if (L10_USER_CACHE_ === null) {
    try { L10_USER_CACHE_ = Session.getActiveUser().getEmail() || ''; } catch (e) { L10_USER_CACHE_ = ''; }
  }
  return L10_USER_CACHE_;
}

function l10Today_() { return l10Fmt_(new Date(), 'yyyy-MM-dd'); }
function l10Now_() { return l10Fmt_(new Date(), 'yyyy-MM-dd HH:mm'); }

// Cells written as 'yyyy-MM-dd' strings come back from Sheets as Date objects —
// never compare them as raw strings.
function l10DateStr_(v) {
  if (v instanceof Date) return l10Fmt_(v, 'yyyy-MM-dd');
  return String(v === undefined || v === null ? '' : v).slice(0, 10);
}

function l10ReadTab_(tabName) {
  if (L10_TAB_CACHE_[tabName]) return L10_TAB_CACHE_[tabName];
  var sheet = l10Ss_().getSheetByName(tabName);
  if (!sheet || sheet.getLastRow() < 1) return { headers: [], rows: [] };
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(String);
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === '') continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) obj[headers[j]] = values[i][j];
    obj._row = i + 1;
    rows.push(obj);
  }
  var out = { headers: headers, rows: rows };
  L10_TAB_CACHE_[tabName] = out;
  return out;
}

function l10Sanitize_(obj) {
  var out = {};
  Object.keys(obj).forEach(function (k) {
    if (k === '_row') return; // internal bookkeeping — never ships to the client
    var v = obj[k];
    out[k] = v instanceof Date ? l10Fmt_(v, 'yyyy-MM-dd') : v;
  });
  return out;
}

// Per-execution tab cache: server calls routinely read the same tab several
// times in one request (next-id, row lookup, write-back). Executions are
// per-call and stateless, so a plain global memo is safe; every write path
// marks its tab dirty so a later read in the same execution stays correct.
var L10_TAB_CACHE_ = {};
function l10TabDirty_(tabName) { delete L10_TAB_CACHE_[tabName]; }

// Zip an appendRow array into a {header: value} object (the same shape the
// bootstrap sends) so add-endpoints can return the created row and the client
// can splice it into local state instead of re-downloading everything.
function l10RowFromArray_(tabName, arr) {
  var headers = L10.HEADERS[tabName] || [];
  var o = {};
  for (var i = 0; i < headers.length; i++) {
    var v = i < arr.length ? arr[i] : '';
    o[headers[i]] = v instanceof Date ? l10Fmt_(v, 'yyyy-MM-dd') : v;
  }
  return o;
}

// Append + cache-invalidate + return the row object, in one place.
function l10Append_(tabName, arr) {
  l10Ss_().getSheetByName(tabName).appendRow(arr);
  l10TabDirty_(tabName);
  return l10RowFromArray_(tabName, arr);
}

var L10_CONFIG_CACHE_ = null;
function l10Config_() {
  if (L10_CONFIG_CACHE_) return L10_CONFIG_CACHE_;
  var out = {};
  l10ReadTab_(L10.TABS.CONFIG).rows.forEach(function (r) {
    var v = r['Value'];
    if (v instanceof Date) v = l10Fmt_(v, 'yyyy-MM-dd');
    out[String(r['Key']).trim()] = v;
  });
  L10_CONFIG_CACHE_ = out;
  return out;
}

// Per-execution max-id memo: a bulk action that mints several ids from the same
// tab (10 status flips → 10 trail rows) pays ONE tab scan instead of one per id.
// Safe because every id this execution mints goes through the memo, and ids
// only ever grow — a concurrent execution appending the same id was already a
// race under the read-every-time version.
var L10_NEXTID_CACHE_ = {};
function l10NextId_(tabName, prefix) {
  var key = tabName + '|' + prefix;
  var max = L10_NEXTID_CACHE_[key];
  if (max === undefined) {
    var tab = l10ReadTab_(tabName);
    var first = tab.headers[0];
    var re = new RegExp('^' + prefix + '-(\\d+)$');
    max = 0;
    tab.rows.forEach(function (r) {
      var m = String(r[first]).match(re);
      if (m) max = Math.max(max, Number(m[1]));
    });
  }
  var n = max + 1;
  L10_NEXTID_CACHE_[key] = n;
  return prefix + '-' + (n < 1000 ? ('000' + n).slice(-3) : String(n));
}

// Write ONLY the updated cells of one row, coalescing adjacent columns into
// ranged setValues. No read-before-write and no rewrite of untouched columns —
// which both drops a ~50ms round trip from every write path AND means a
// concurrent edit to another column of the same row can never be clobbered
// (the old full-row rewrite had a read→write race window).
function l10WriteRowCells_(sheet, headers, rowIdx, updates) {
  var cols = [];
  Object.keys(updates).forEach(function (h) {
    var c = headers.indexOf(h);
    if (c !== -1) cols.push(c);
  });
  if (!cols.length) return false;
  cols.sort(function (a, b) { return a - b; });
  var run = [cols[0]];
  var flush = function () {
    var vals = run.map(function (c) { return updates[headers[c]]; });
    sheet.getRange(rowIdx, run[0] + 1, 1, run.length).setValues([vals]);
  };
  for (var i = 1; i < cols.length; i++) {
    if (cols[i] === run[run.length - 1] + 1) { run.push(cols[i]); continue; }
    flush();
    run = [cols[i]];
  }
  flush();
  return true;
}

// Set several fields on one row — row lookup by id, then updated-columns-only writes.
function l10SetCells_(tabName, id, updates) {
  var tab = l10ReadTab_(tabName);
  for (var i = 0; i < tab.rows.length; i++) {
    if (String(tab.rows[i][tab.headers[0]]).trim() === String(id).trim()) {
      var sheet = l10Ss_().getSheetByName(tabName);
      l10WriteRowCells_(sheet, tab.headers, tab.rows[i]._row, updates);
      l10TabDirty_(tabName);
      return true;
    }
  }
  return false;
}

function l10SetCell_(tabName, id, header, value) {
  var u = {};
  u[header] = value;
  return l10SetCells_(tabName, id, u);
}

// Monday of the current week (the huddle's week key).
function l10WeekOf_() {
  var d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return l10Fmt_(d, 'yyyy-MM-dd');
}

// Business day n of total for the current month. Weekday count unless a
// BDAYS_OVERRIDE entry ("YYYY-MM=NN") pins the total.
function l10BdayInfo_(config) {
  var now = new Date();
  var y = now.getFullYear(), m = now.getMonth();
  var dim = new Date(y, m + 1, 0).getDate();
  var total = 0, n = 0;
  for (var d = 1; d <= dim; d++) {
    var dow = new Date(y, m, d).getDay();
    if (dow > 0 && dow < 6) {
      total++;
      if (d <= now.getDate()) n++;
    }
  }
  var key = l10Fmt_(now, 'yyyy-MM');
  String(config.BDAYS_OVERRIDE || '').split(',').forEach(function (pair) {
    var kv = pair.split('=');
    if (kv.length === 2 && kv[0].trim() === key && Number(kv[1]) > 0) total = Number(kv[1]);
  });
  return { n: Math.min(n, total), total: total };
}

// Fiscal year start month comes from config (FISCAL_START_MONTH; default 1 =
// calendar year, set 8 for an Aug–Jul fiscal year). Cached per execution.
var L10_FY_START_ = null;
function l10FiscalStartMonth_() {
  if (L10_FY_START_ === null) {
    var m = 1;
    try { m = Number(l10Config_().FISCAL_START_MONTH) || 1; } catch (e) {}
    if (!(m >= 1 && m <= 12)) m = 1;
    L10_FY_START_ = m;
  }
  return L10_FY_START_;
}

// {fy:'FY26', q:'Q1'} for a calendar year + month under the configured start.
function l10FiscalParts_(y, mo) {
  var s = l10FiscalStartMonth_();
  var fy = y + (s > 1 && mo >= s ? 1 : 0);
  var q = Math.floor(((mo - s + 12) % 12) / 3) + 1;
  return { fy: 'FY' + String(fy).slice(-2), q: 'Q' + q };
}

function l10Fiscal_() {
  var now = new Date();
  return l10FiscalParts_(now.getFullYear(), now.getMonth() + 1);
}

function l10FiscalQuarterOf_(dateStr) {
  var m = String(dateStr || '').match(/^(\d{4})-(\d{2})/);
  if (!m) return '';
  var f = l10FiscalParts_(Number(m[1]), Number(m[2]));
  return f.fy + ' ' + f.q;
}

// Parse a display value like "$1,234", "109.0%", "2.4x" to a number.
function l10ParseDisplay_(s) {
  var raw = String(s === undefined || s === null ? '' : s).trim();
  if (raw === '') return null;
  var n = Number(raw.replace(/[$,%xX\s]/g, '').replace(/,/g, ''));
  return isFinite(n) ? n : null;
}

// Resolve "Sheet Name!H7" ourselves. Beware: Sheets STRIPS a leading
// apostrophe from stored cell text, so a seeded "'Sheet Name'!H7" comes back
// as "Sheet Name'!H7" — strip all apostrophes, then split on the last '!'.
function l10PullRange_(ref) {
  try {
    var s = String(ref).replace(/'/g, '').trim();
    var bang = s.lastIndexOf('!');
    var range;
    if (bang > 0) {
      var sheet = l10Ss_().getSheetByName(s.slice(0, bang).trim());
      if (!sheet) return null;
      range = sheet.getRange(s.slice(bang + 1).trim());
    } else {
      range = l10Ss_().getRange(s);
    }
    return l10ParseDisplay_(range.getDisplayValue());
  } catch (e) {
    return null;
  }
}

// Resolve a Source Ref cell ({text, formula, display}) to a number. Accepts:
//   • a text reference  — "Metrics!H7" → read that cell;
//   • a live formula    — ='Metrics'!H7 → the cell already computes the
//     number, so its own displayed value IS the value;
//   • anything else (typed constant, formula error) → {value:null, why}.
function l10ResolveRef_(cell) {
  if (cell.formula) {
    var v = l10ParseDisplay_(cell.display);
    return v === null
        ? { value: null, why: 'the formula result "' + cell.display + '" is not a number' }
        : { value: v, how: cell.formula };
  }
  if (!cell.text) return { value: null, why: 'the cell is empty' };
  if (l10ParseDisplay_(cell.text) !== null) {
    return { value: null, why: '"' + cell.text + '" is a plain number, not a cell reference or formula' };
  }
  var v2 = l10PullRange_(cell.text);
  return v2 === null
      ? { value: null, why: '"' + cell.text + '" did not resolve — re-point it at a cell like SheetName!A1' }
      : { value: v2, how: cell.text };
}

// Experiment Hub pulls (read-only). Cached 5 minutes — openByUrl on another
// workbook costs seconds, and these two counts feed two metrics tiles.
// Failure returns {error} — never throws. Errors are cached briefly too, so a
// misconfigured hub URL can't make every boot pay the full openByUrl failure.
// cacheOnly: return the cached value or {pending:true} — NEVER openByUrl. The
// boot path uses this so a 5-minute cache miss (the normal case for a weekly
// app) can't block first paint for seconds; the client fetches the live count
// lazily via l10_hubCounts, the same pattern as the data-health strip.
function l10HubCounts_(config, forceFresh, cacheOnly) {
  var url = String(config.EXPERIMENT_HUB_URL || '').trim();
  if (!url) return null;
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) {}
  if (cache && !forceFresh) {
    var hit = cache.get('l10_hub_counts');
    if (hit) {
      try { return JSON.parse(hit); } catch (e) {}
    }
  }
  if (cacheOnly) return { pending: true };
  var result;
  try {
    var sheet = SpreadsheetApp.openByUrl(url).getSheetByName('Experiments');
    if (!sheet || sheet.getLastRow() < 2) {
      result = { running: 0, needDecision: 0 };
    } else {
      var values = sheet.getDataRange().getValues();
      var headers = values[0].map(String);
      var iStatus = headers.indexOf('Status'), iDecision = headers.indexOf('Decision');
      if (iStatus === -1 || iDecision === -1) {
        result = { error: 'Hub Experiments tab is missing Status/Decision headers' };
      } else {
        var live = ['RUNNING', 'LAUNCHING', 'QUEUED', 'STOP_REQUESTED', 'APPLY_REQUESTED', 'GRADUATE_REQUESTED'];
        var running = 0, needDecision = 0;
        for (var i = 1; i < values.length; i++) {
          var status = String(values[i][iStatus] || '').toUpperCase();
          if (live.indexOf(status) !== -1) running++;
          if (status === 'ENDED' && !String(values[i][iDecision] || '').trim()) needDecision++;
        }
        result = { running: running, needDecision: needDecision };
      }
    }
  } catch (e) {
    result = { error: String(e).slice(0, 120) };
  }
  if (cache) {
    // Failures cache shorter, so a transient outage recovers in minutes while
    // still absorbing the boot-storm at meeting start. Permission-flavored
    // failures are PER-USER (one analyst without hub access must not paint
    // "hub unreachable" for the whole team) — never share those.
    var perUser = result.error && /permission|access|denied|sign in|auth/i.test(result.error);
    try { if (!perUser) cache.put('l10_hub_counts', JSON.stringify(result), result.error ? 120 : 300); } catch (e) {}
  }
  return result;
}

// Client-callable: the lazy hub fetch fired after first paint when the boot
// payload said {pending:true}. Uses the cache when warm; fills it when cold.
function l10_hubCounts() {
  return l10HubCounts_(l10Config_(), false);
}

// Outcome review on a SOLVED issue ("did the fix hold?"), asked by the Wrap-up
// segment once Review On comes due. LATER pushes the review out two weeks and
// stores nothing — an outcome is only ever a deliberate verdict.
function l10_setIssueOutcome(id, verdict) {
  verdict = String(verdict || '').toUpperCase();
  if (verdict === 'LATER') {
    var issue = null;
    l10ReadTab_(L10.TABS.ISSUES).rows.forEach(function (r) {
      if (String(r['ID']).trim() === String(id).trim()) issue = r;
    });
    if (!issue) return { ok: false, error: 'Issue ' + id + ' not found.' };
    var base = l10DateStr_(issue['Review On']) || l10Today_();
    var d = new Date(base + 'T12:00:00');
    d.setDate(d.getDate() + 14);
    var next = l10Fmt_(d, 'yyyy-MM-dd');
    var wrote = l10SetCells_(L10.TABS.ISSUES, id, { 'Review On': next });
    return wrote ? { ok: true, reviewOn: next } : { ok: false, error: 'Issue ' + id + ' not found.' };
  }
  if (L10.ISSUE_OUTCOMES.indexOf(verdict) === -1) return { ok: false, error: 'Bad outcome' };
  var ok = l10SetCells_(L10.TABS.ISSUES, id, { 'Outcome': verdict, 'Outcome At': l10Today_() });
  return ok ? { ok: true, outcome: verdict } : { ok: false, error: 'Issue ' + id + ' not found.' };
}

// ---------------------------------------------------------------------------
// Pre-huddle brief intake (doPost) + promote plumbing.
//
// The brief is pushed in from outside as JSON — ranked Solve candidates with the
// evidence and caveats already attached — and rendered on the start screen and
// in Solve. This is the ONLY doPost in the shared project (doGet lives in
// L10Setup.gs); if another module ever needs POST, multiplex inside this one.
//
// Contract (POST to the /exec web-app URL, JSON body):
//   {
//     "token":  "<must match the L10_BRIEF_TOKEN script property>",
//     "weekOf": "2026-07-06",              // optional; defaults to this week's Monday
//     "brief":  [{ "section": "DOCKET",    // DOCKET | WATCHLIST | EXPERIMENTS | NEGATIVES
//                  "rank": 1, "title": "…", "body": "…",
//                  "dollarsAtStake": 12000, // optional, directional
//                  "accounts": "Brady US",  // optional, matches ACCOUNT_TAGS
//                  "caveat": "…", "playbookRef": "PB-001" }],
//     "playbook": [{ "id": "PB-006", "name": "…", "keywords": "…", "accounts": "…",
//                    "answers": "…", "howToRun": "…", "caveat": "…" }]   // optional upserts
//   }
// Semantics: brief rows REPLACE that week's rows (idempotent re-posts); playbook
// rows upsert by id. All-or-nothing under a lock; a bad payload writes NOTHING.
// Response: JSON {ok:true, briefRows, playbookRows} or {ok:false, error}.
// ---------------------------------------------------------------------------

function doPost(e) {
  var out = function (obj, code) {
    return ContentService.createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
  };
  var lock;
  try {
    var body = {};
    try { body = JSON.parse(e && e.postData && e.postData.contents || '{}'); }
    catch (pe) { return out({ ok: false, error: 'Body is not valid JSON.' }); }
    var want = '';
    try { want = PropertiesService.getScriptProperties().getProperty('L10_BRIEF_TOKEN') || ''; } catch (te) {}
    if (!want) return out({ ok: false, error: 'Intake is not enabled — set the token first (Momentum Huddle → Brief → Set intake token).' });
    if (String(body.token || '') !== want) return out({ ok: false, error: 'Bad token.' });

    var weekOf = /^\d{4}-\d{2}-\d{2}$/.test(String(body.weekOf || '')) ? String(body.weekOf) : l10WeekOf_();
    var brief = body.brief === undefined ? [] : body.brief;
    var playbook = body.playbook === undefined ? [] : body.playbook;
    if (!Array.isArray(brief) || !Array.isArray(playbook)) {
      return out({ ok: false, error: 'brief and playbook must be arrays.' });
    }
    if (brief.length > 40) return out({ ok: false, error: 'Too many brief rows (' + brief.length + ' > 40) — trim the payload.' });

    // Validate EVERYTHING before writing anything.
    var now = l10Now_();
    var briefRows = [];
    for (var i = 0; i < brief.length; i++) {
      var b = brief[i] || {};
      var section = String(b.section || '').toUpperCase().trim();
      if (L10.BRIEF_SECTIONS.indexOf(section) === -1) {
        return out({ ok: false, error: 'brief[' + i + '].section "' + section + '" is not one of ' + L10.BRIEF_SECTIONS.join('/') + '.' });
      }
      var title = String(b.title || '').trim();
      if (!title) return out({ ok: false, error: 'brief[' + i + '] has no title.' });
      var dollars = (b.dollarsAtStake === undefined || b.dollarsAtStake === null || b.dollarsAtStake === '')
          ? '' : Number(b.dollarsAtStake);
      if (dollars !== '' && !isFinite(dollars)) return out({ ok: false, error: 'brief[' + i + '].dollarsAtStake is not a number.' });
      briefRows.push([
        weekOf, section, Number(b.rank) || (i + 1), title.slice(0, 300),
        String(b.body || '').slice(0, 1500), dollars,
        String(b.accounts || '').slice(0, 120), String(b.caveat || '').slice(0, 500),
        String(b.playbookRef || '').slice(0, 20), '', now
      ]);
    }
    var pbRows = [];
    for (var j = 0; j < playbook.length; j++) {
      var p = playbook[j] || {};
      var pid = String(p.id || '').trim();
      if (!/^PB-\d+$/.test(pid)) return out({ ok: false, error: 'playbook[' + j + '].id "' + pid + '" must look like PB-001.' });
      if (!String(p.name || '').trim()) return out({ ok: false, error: 'playbook[' + j + '] has no name.' });
      pbRows.push([pid, String(p.name).slice(0, 120), String(p.keywords || '').slice(0, 400),
        String(p.accounts || '').slice(0, 120), String(p.answers || '').slice(0, 500),
        String(p.howToRun || '').slice(0, 800), String(p.caveat || '').slice(0, 500), now]);
    }

    lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return out({ ok: false, error: 'Busy — another write holds the lock. Retry.' });
    if (briefRows.length) l10BriefReplaceWeek_(weekOf, briefRows);
    if (pbRows.length) l10PlaybookUpsert_(pbRows);
    return out({ ok: true, weekOf: weekOf, briefRows: briefRows.length, playbookRows: pbRows.length });
  } catch (err) {
    return out({ ok: false, error: String(err).slice(0, 200) });
  } finally {
    if (lock) try { lock.releaseLock(); } catch (le) {}
  }
}

// Replace one week's brief rows in a single rewrite (the tab stays small: rows
// older than 10 weeks are dropped in the same pass). Never touches the header.
function l10BriefReplaceWeek_(weekOf, newRows) {
  var ss = l10Ss_();
  var sheet = ss.getSheetByName(L10.TABS.BRIEF);
  if (!sheet) throw new Error('No ' + L10.TABS.BRIEF + ' tab — run Setup / repair tabs first.');
  var nCols = L10.HEADERS[L10.TABS.BRIEF].length;
  var cutoff = new Date(weekOf + 'T12:00:00');
  cutoff.setDate(cutoff.getDate() - 70);
  var cutoffStr = l10Fmt_(cutoff, 'yyyy-MM-dd');
  var keep = [];
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, nCols).getValues().forEach(function (r) {
      var wk = l10DateStr_(r[0]);
      if (wk && wk !== weekOf && wk >= cutoffStr) keep.push(r);
    });
    sheet.getRange(2, 1, sheet.getLastRow() - 1, nCols).clearContent();
  }
  var all = keep.concat(newRows);
  if (all.length) sheet.getRange(2, 1, all.length, nCols).setValues(all);
}

function l10PlaybookUpsert_(rows) {
  var sheet = l10Ss_().getSheetByName(L10.TABS.PLAYBOOK);
  if (!sheet) throw new Error('No ' + L10.TABS.PLAYBOOK + ' tab — run Setup / repair tabs first.');
  var tab = l10ReadTab_(L10.TABS.PLAYBOOK);
  var rowById = {};
  tab.rows.forEach(function (r) { rowById[String(r['Playbook ID']).trim()] = r._row; });
  rows.forEach(function (row) {
    var at = rowById[row[0]];
    if (at) sheet.getRange(at, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
  });
}

// This week's brief rows for the client, DOCKET first by rank.
function l10BriefFor_(weekOf) {
  var rows = l10ReadTab_(L10.TABS.BRIEF).rows.filter(function (r) {
    return l10DateStr_(r['Week Of']) === weekOf;
  }).map(l10Sanitize_);
  rows.sort(function (a, b) {
    var s = (a['Section'] === 'DOCKET' ? 0 : 1) - (b['Section'] === 'DOCKET' ? 0 : 1);
    return s || ((Number(a['Rank']) || 99) - (Number(b['Rank']) || 99));
  });
  return rows;
}

// One tap on a docket item makes it a real issue, evidence pre-filled into the
// Solve Identify notes. Idempotent: a docket row already promoted returns the
// existing issue instead of minting a duplicate.
function l10_promoteBriefItem(weekOf, rank) {
  var tab = l10ReadTab_(L10.TABS.BRIEF);
  var row = null;
  tab.rows.forEach(function (r) {
    if (l10DateStr_(r['Week Of']) === String(weekOf) && String(r['Section']) === 'DOCKET'
        && Number(r['Rank']) === Number(rank)) row = r;
  });
  if (!row) return { ok: false, error: 'Docket item ' + rank + ' for ' + weekOf + ' not found.' };
  var already = String(row['Promoted To'] || '').trim();
  if (already) return { ok: true, id: already, already: true };
  var identified = String(row['Body'] || '').trim();
  var caveat = String(row['Caveat'] || '').trim();
  if (caveat) identified += (identified ? '\n' : '') + 'Caveat: ' + caveat;
  var pbRef = String(row['Playbook Ref'] || '').trim();
  if (pbRef) {
    var pb = null;
    l10ReadTab_(L10.TABS.PLAYBOOK).rows.forEach(function (p) {
      if (String(p['Playbook ID']).trim() === pbRef) pb = p;
    });
    if (pb) identified += (identified ? '\n' : '') + 'Applicable analysis: ' + pb['Name'] + ' — ' + pb['How To Run'];
  }
  var dollars = row['Dollars At Stake'];
  var text = String(row['Title']).trim() +
      (dollars !== '' && isFinite(Number(dollars)) ? ' (~$' + Math.round(Number(dollars)).toLocaleString('en-US') + ' at stake)' : '');
  var res = l10_addIssue({
    text: text, by: 'Alex', accounts: String(row['Accounts'] || ''),
    category: '', notes: 'from pre-brief ' + weekOf
  });
  if (!res.ok) return res;
  if (identified) l10SetCells_(L10.TABS.ISSUES, res.id, { 'Identified': identified });
  // Write-back so the docket card flips to "promoted" and re-taps dedupe.
  var sheet = l10Ss_().getSheetByName(L10.TABS.BRIEF);
  sheet.getRange(row._row, tab.headers.indexOf('Promoted To') + 1).setValue(res.id);
  // Ship the created issue row (with the Identified patch) so the client can
  // splice it locally instead of paying a full bootstrap reload mid-segment.
  var issueRow = res.row || null;
  if (issueRow && identified) issueRow['Identified'] = identified;
  return { ok: true, id: res.id, row: issueRow };
}

// Brief menu wrappers (menu built in L10Setup.gs).
function l10MenuSetBriefToken() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt(
    'Pre-huddle brief intake',
    'Paste the intake token. Posts to the web-app URL must carry this exact token or they are rejected.\n' +
    'Leave blank to turn intake OFF. The token lives in a script property — never in a sheet cell.',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var tok = String(resp.getResponseText() || '').trim();
  var props = PropertiesService.getScriptProperties();
  if (tok) props.setProperty('L10_BRIEF_TOKEN', tok);
  else props.deleteProperty('L10_BRIEF_TOKEN');
  ui.alert(tok ? 'Token saved — intake is live at the web-app URL (POST).' : 'Token cleared — intake is off.');
}

// The URL the intake tooling talks to. ScriptApp.getService().getUrl() lies in
// menu/editor context when a project carries several deployments — it can
// report a stale or /dev URL, which reads as a login page and fails the
// self-test even when the real deployment is fine (bit us live, 2026-07-02).
// So the brief tooling prefers an explicitly pasted /exec URL (script property
// L10_BRIEF_URL, set via Brief → Set web app URL…), falling back to auto-detect.
function l10BriefEndpointUrl_() {
  var prop = '';
  try { prop = PropertiesService.getScriptProperties().getProperty('L10_BRIEF_URL') || ''; } catch (e) {}
  if (prop.trim()) return prop.trim();
  return l10WebAppUrl_();
}

function l10MenuSetBriefUrl() {
  var ui = SpreadsheetApp.getUi();
  var cur = '';
  try { cur = PropertiesService.getScriptProperties().getProperty('L10_BRIEF_URL') || ''; } catch (e) {}
  var resp = ui.prompt(
    'Intake endpoint URL',
    'Paste the web app URL: Deploy → Manage deployments → copy the URL that ends in /exec\n' +
    '(the one that loads the huddle app in a browser).\n\n' +
    'Why: with several deployments the editor can misreport its own URL, so the self-test\n' +
    'and the intake status use this pasted one. Leave blank to go back to auto-detect.' +
    (cur ? '\n\nCurrent: ' + cur : ''),
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var url = String(resp.getResponseText() || '').trim();
  if (url && !/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
    ui.alert('That doesn\'t look like a web-app URL — it must start with https://script.google.com/ and end in /exec (not /dev). Nothing saved.');
    return;
  }
  var props = PropertiesService.getScriptProperties();
  if (url) props.setProperty('L10_BRIEF_URL', url);
  else props.deleteProperty('L10_BRIEF_URL');
  ui.alert(url ? 'Saved — the self-test, intake status, and any posts now target this URL.' : 'Cleared — back to auto-detect.');
}

// One-click end-to-end test of the intake — no terminal needed. POSTs two
// clearly-marked TEST rows to the deployed /exec URL with the stored token,
// proving the deployment version, the access setting, the token, and the
// write path in one shot. The rows land in the CURRENT week's brief and are
// replaced wholesale by the next real post (or delete them in L10_Brief).
function l10BriefSelfTest() {
  var url = l10BriefEndpointUrl_();
  if (!url) return { ok: false, error: 'No web app URL — deploy first, then Brief → Set web app URL… and paste the /exec link.' };
  var tok = '';
  try { tok = PropertiesService.getScriptProperties().getProperty('L10_BRIEF_TOKEN') || ''; } catch (e) {}
  if (!tok) return { ok: false, error: 'No intake token set — Momentum Huddle → Brief → Set intake token… first.' };
  var payload = {
    token: tok,
    brief: [
      { section: 'DOCKET', rank: 1,
        title: 'TEST — delete me: sample docket item',
        body: 'Posted by the built-in intake self-test to prove the endpoint works. Try promoting me, then kill the issue.',
        dollarsAtStake: 46000, accounts: 'Amazon',
        caveat: 'test row — not real data' },
      { section: 'WATCHLIST', rank: 1,
        title: 'TEST — delete me: sample watchlist line',
        body: 'Also from the self-test.' }
    ]
  };
  var res;
  try {
    // Default followRedirects handles the /exec 302 → stored-JSON-response hop.
    res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
  var text = String(res.getContentText() || '');
  try { Logger.log('Intake self-test — POST ' + url + ' — HTTP ' + res.getResponseCode() + ': ' + text.slice(0, 300)); } catch (e) {}
  var body = null;
  try { body = JSON.parse(text); } catch (e) {}
  if (body && body.ok) return { ok: true, briefRows: body.briefRows, url: url };
  // A web page instead of JSON — sniff WHICH page so the fix is named precisely.
  if (text.charAt(0) === '<') {
    var hint;
    if (/script function not found/i.test(text)) {
      hint = 'the deployment at that URL runs OLD code (no intake yet) — Deploy → Manage deployments → ✏️ on THAT deployment → New version.';
    } else if (/accounts\.google\.com|ServiceLogin|sign in/i.test(text)) {
      hint = 'that URL wants a Google login. Either its "Who has access" isn\'t plain "Anyone", or the tooling auto-detected a stale/dev URL — use Brief → Set web app URL… and paste the /exec link that loads the app in an incognito window.';
    } else {
      hint = 'unexpected page — check the execution log for the response, and confirm the URL via Brief → Set web app URL…';
    }
    return { ok: false, error: 'Got a web page instead of JSON: ' + hint + '\n\nTested: ' + url };
  }
  return { ok: false, error: ((body && body.error) || ('HTTP ' + res.getResponseCode() + ' — see the execution log.')) + '\n\nTested: ' + url };
}

function l10MenuBriefSelfTest() {
  var ui = SpreadsheetApp.getUi();
  var r = l10BriefSelfTest();
  ui.alert(r.ok
    ? 'Intake works ✓ — ' + r.briefRows + ' sample rows landed in L10_Brief for this week. Reload the huddle app: the "This week" docket card should be on the start screen. The rows are marked TEST and get replaced by the next real post.'
    : 'Intake test failed: ' + r.error);
}

function l10MenuBriefStatus() {
  var ui = SpreadsheetApp.getUi();
  var props = null;
  try { props = PropertiesService.getScriptProperties(); } catch (e) {}
  var hasTok = !!(props && props.getProperty('L10_BRIEF_TOKEN'));
  var pinned = !!(props && props.getProperty('L10_BRIEF_URL'));
  var url = l10BriefEndpointUrl_();
  var wk = l10WeekOf_();
  var rows = l10BriefFor_(wk);
  var last = '';
  rows.forEach(function (r) { if (String(r['Received At']) > last) last = String(r['Received At']); });
  ui.alert('Brief intake status',
    'Token: ' + (hasTok ? 'set' : 'NOT set (intake off)') + '\n' +
    'Endpoint: ' + (url ? url : 'none — deploy, then Brief → Set web app URL…') +
    (url ? (pinned ? '  (pasted)' : '  (auto-detected — can be wrong with several deployments; prefer Set web app URL…)') : '') + '\n' +
    'This week (' + wk + '): ' + rows.length + ' row(s)' + (last ? ', last received ' + last : '') + '\n\n' +
    'Use Brief → Send test brief to prove the endpoint end-to-end.',
    ui.ButtonSet.OK);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Boot. Split into four independent slices so the client fetches them in
// PARALLEL — wall-clock is the slowest slice (~3 tab reads), not the sum of
// ten sequential reads. l10_bootstrap() composes the same slices, so refresh
// (the error-reconcile path) keeps a single source of truth for the payload.
// ---------------------------------------------------------------------------

// Core: everything the first paint needs — config/team/segments, the meeting
// state, the events strip, metric packs + GA4 catalog, the (cached) hub
// counts, and this week's pre-huddle brief. Three tab reads; the Settings-only
// notify/digests tables moved to l10_settingsData (fetched when that page is
// actually opened), and the hub pull is cache-only here.
function l10BootCore_() {
  var config = l10Config_();
  var team = String(config.TEAM || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  var segments;
  try { segments = JSON.parse(config.SEGMENTS); } catch (e) {
    segments = [['Check-in', 5], ['Metrics', 5], ['Priority review', 5], ['Headlines', 5], ['To-do list', 5], ['IDS', 60], ['Wrap-up', 5]];
  }
  var meetings = l10ReadTab_(L10.TABS.MEETINGS).rows.map(l10Sanitize_);
  var open = meetings.filter(function (m) { return String(m['Status']) === 'OPEN'; });
  var concluded = meetings.filter(function (m) { return String(m['Status']) === 'CONCLUDED'; });
  var today = l10Today_();
  var soon = new Date(); soon.setDate(soon.getDate() + 45);
  var soonStr = l10Fmt_(soon, 'yyyy-MM-dd');
  var events = l10ReadTab_(L10.TABS.EVENTS).rows.map(l10Sanitize_).filter(function (e) {
    var start = String(e['Start Date']).slice(0, 10);
    var end = String(e['End Date'] || '').slice(0, 10) || start;
    return end >= today && start <= soonStr;
  });
  return {
    config: config,
    team: team,
    segments: segments,
    weekOf: l10WeekOf_(),
    today: today,
    bday: l10BdayInfo_(config),
    fiscal: l10Fiscal_(),
    events: events,
    openMeeting: open.length ? open[open.length - 1] : null,
    lastMeeting: concluded.length ? concluded[concluded.length - 1] : null,
    history: concluded.slice(-12),
    packs: l10_metricPacks(),
    ga4: l10Ga4Catalog_(),
    // Cache-only: a cold hub cache returns {pending:true} and the client
    // fetches the live counts AFTER first paint (l10_hubCounts) — openByUrl on
    // the foreign workbook costs seconds and must never gate the first render.
    hub: l10HubCounts_(config, false, true),
    // Pre-huddle brief + analysis playbook. Both read as zero rows on a
    // pre-upgrade workbook (missing tab), so old deployments keep working.
    brief: l10BriefFor_(l10WeekOf_()),
    user: l10User_()
  };
}

// Settings-page data (the L10_Notify + L10_Digests tables). Fetched lazily the
// first time the Settings page is opened — two tab reads that used to ride the
// first-paint core slice on every boot for a page most sessions never visit.
function l10_settingsData() {
  return { notify: l10_getNotifyPrefs(), digests: l10_getDigests() };
}

// Work: the week-to-week lists. Five tab reads.
function l10BootWork_() {
  // Once per calendar week, the first boot advances the carry counters (see
  // l10SweepCarriesIfDue_). Every other boot pays one script-property read.
  // It runs BEFORE the reads below so the payload carries the fresh counts.
  l10SweepCarriesIfDue_();
  var cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 21);
  var cutoffStr = l10Fmt_(cutoff, 'yyyy-MM-dd');
  // The To-dos page is where this team spends its week, so its payload can't
  // grow forever. Every still-owed to-do ships regardless of age (an ancient
  // open commitment is exactly what must stay visible); finished ones ship only
  // while they're recent enough to matter — the "Done this week" card needs 7
  // days, the history views a bit more. TODO_KEEP_DAYS in L10_Config tunes it.
  var keepDays = Number(l10Config_().TODO_KEEP_DAYS) || 60;
  var tdCut = new Date(); tdCut.setDate(tdCut.getDate() - keepDays);
  var tdCutStr = l10Fmt_(tdCut, 'yyyy-MM-dd');
  var todos = l10ReadTab_(L10.TABS.TODOS).rows.map(l10Sanitize_).filter(function (t) {
    if (l10TodoOpen_(t['Status'])) return true;
    // Fall back to Created for a row with no completion stamp (a DROPPED one),
    // so an undated terminal row ages out instead of living forever.
    var stamp = String(t['Done At'] || t['Created'] || '').slice(0, 10);
    return !stamp || stamp >= tdCutStr;
  });
  // Steps and the trail are scoped to the to-dos that actually shipped, so an
  // aged-out to-do doesn't drag its children along.
  var live = {};
  todos.forEach(function (t) { live[String(t['ID']).trim()] = 1; });
  var scoped = function (rows) {
    return rows.map(l10Sanitize_).filter(function (r) { return live[String(r['Todo ID']).trim()]; });
  };
  // The trail is ordered by 'At', and l10Sanitize_ formats every Date as
  // 'yyyy-MM-dd' — which silently drops the HH:mm that l10Now_ wrote (Sheets
  // hands those cells back as Dates; see the note on l10DateStr_). Date-only
  // stamps make every entry from the same day compare equal, so the newest-first
  // sort on the client scrambles them. Keep the time on this tab.
  var scopedLog = function (rows) {
    return rows.filter(function (r) { return live[String(r['Todo ID']).trim()]; }).map(function (r) {
      var o = l10Sanitize_(r);
      o['At'] = r['At'] instanceof Date ? l10Fmt_(r['At'], 'yyyy-MM-dd HH:mm') : String(r['At'] || '');
      return o;
    });
  };
  // Both tabs read as zero rows on a pre-upgrade workbook (missing tab), so an
  // un-repaired deployment keeps working with the features simply absent. But
  // "simply absent" reads as "broken" to whoever is hunting for the feature, so
  // say it out loud: this flag lets the UI show "run Setup / repair tabs" instead
  // of an innocent-looking empty list that silently refuses to save.
  var tdHeaders = l10ReadTab_(L10.TABS.TODOS).headers;
  var ss = l10Ss_();
  var ready = !!ss.getSheetByName(L10.TABS.TODO_STEPS) && !!ss.getSheetByName(L10.TABS.TODO_LOG) &&
      tdHeaders.indexOf('Blocked On') !== -1 && tdHeaders.indexOf('Last Carried Week') !== -1;
  return {
    todoTabsReady: ready,
    todos: todos,
    todoSteps: scoped(l10ReadTab_(L10.TABS.TODO_STEPS).rows),
    todoLog: scopedLog(l10ReadTab_(L10.TABS.TODO_LOG).rows),
    issues: l10ReadTab_(L10.TABS.ISSUES).rows.map(l10Sanitize_),
    headlines: l10ReadTab_(L10.TABS.HEADLINES).rows.map(l10Sanitize_).filter(function (h) {
      return String(h['Date']).slice(0, 10) >= cutoffStr && l10HeadlineLive_(h);
    })
  };
}

// Plan: priorities + their milestones + the playbook. Three tab reads;
// missing tabs (pre-setup) read as zero rows.
function l10BootPlan_() {
  return {
    rocks: l10ReadTab_(L10.TABS.ROCKS).rows.map(function (r) {
      var o = l10Sanitize_(r);
      o.fq = l10FiscalQuarterOf_(o['Due']);
      return o;
    }),
    milestones: l10ReadTab_(L10.TABS.MILESTONES).rows.map(l10Sanitize_),
    playbook: l10ReadTab_(L10.TABS.PLAYBOOK).rows.map(l10Sanitize_)
  };
}

// Metrics: definitions + the visible window of weekly values. History
// outside the trailing window stays in the tab (the payload stays flat no
// matter how many years a team captures). Two tab reads.
function l10BootScorecard_() {
  var config = l10Config_();
  var weeks = [];
  var nWeeks = Number(config.SCORECARD_WEEKS) || 13;
  var monday = new Date(l10WeekOf_() + 'T12:00:00');
  for (var i = nWeeks - 1; i >= 0; i--) {
    var d = new Date(monday);
    d.setDate(d.getDate() - i * 7);
    weeks.push(l10Fmt_(d, 'yyyy-MM-dd'));
  }
  var values = {};
  l10ReadTab_(L10.TABS.DATA).rows.forEach(function (r) {
    var w = l10DateStr_(r['Week Of']);
    if (w < weeks[0]) return; // outside the visible window
    var id = String(r['Metric ID']);
    var v = r['Value'];
    // A stray date-typed cell must not poison the whole payload.
    if (v instanceof Date) v = l10Fmt_(v, 'yyyy-MM-dd');
    if (!values[id]) values[id] = {};
    values[id][w] = v;
  });
  return {
    scorecard: {
      defs: l10ReadTab_(L10.TABS.SCORECARD).rows.map(l10Sanitize_),
      weeks: weeks,
      values: values
    }
  };
}

// Client-callable slice endpoints (fired in parallel by boot()).
function l10_bootCore() { return l10BootCore_(); }
function l10_bootWork() { return l10BootWork_(); }
function l10_bootPlan() { return l10BootPlan_(); }
function l10_bootScorecard() { return l10BootScorecard_(); }

// The composed payload — used by refresh() (error reconcile) and anything
// that wants everything in one call.
function l10_bootstrap() {
  var out = l10BootCore_();
  [l10BootWork_(), l10BootPlan_(), l10BootScorecard_()].forEach(function (part) {
    Object.keys(part).forEach(function (k) { out[k] = part[k]; });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

function l10_startMeeting(attendees) {
  var today = l10Today_();
  var open = l10ReadTab_(L10.TABS.MEETINGS).rows.filter(function (m) {
    return String(m['Status']) === 'OPEN';
  });
  var sameDay = null;
  open.forEach(function (m) {
    if (l10DateStr_(m['Date']) === today) {
      sameDay = m;
    } else {
      // A meeting left OPEN from a previous day must not hijack today's huddle.
      l10SetCells_(L10.TABS.MEETINGS, String(m['ID']), {
        'Status': 'CONCLUDED',
        'Concluded At': l10Now_(),
        'Notes': (String(m['Notes'] || '') + ' [auto-closed — never wrapped up]').trim()
      });
    }
  });
  if (sameDay) {
    l10SetCells_(L10.TABS.MEETINGS, String(sameDay['ID']), {
      'Attendees': (attendees || []).join(', ')
    });
    // Ship the (sanitized) row back so the client can splice it into local
    // state and paint the first segment immediately — no full re-boot.
    var row = l10Sanitize_(sameDay);
    row['Attendees'] = (attendees || []).join(', ');
    return { ok: true, id: String(sameDay['ID']), resumed: true, row: row };
  }
  var id = l10NextId_(L10.TABS.MEETINGS, 'M');
  var fresh = l10Append_(L10.TABS.MEETINGS, [
    id, today, 'OPEN', (attendees || []).join(', '), l10Now_(),
    '', '', '', '', '', '', '', '', '', '', ''
  ]);
  return { ok: true, id: id, row: fresh };
}

// Discard a meeting started by mistake / while testing. CANCELLED rows are
// excluded from both the open-meeting check and History.
function l10_cancelMeeting(meetingId) {
  var wrote = l10SetCells_(L10.TABS.MEETINGS, meetingId, {
    'Status': 'CANCELLED',
    'Concluded At': l10Now_(),
    'Notes': '[discarded — not a real huddle]'
  });
  return wrote ? { ok: true } : { ok: false, error: 'Meeting ' + meetingId + ' not found.' };
}

function l10_saveSegue(meetingId, segueJson) {
  l10SetCell_(L10.TABS.MEETINGS, meetingId, 'Segue (JSON)', segueJson || '');
  return { ok: true };
}

function l10_concludeMeeting(meetingId, payload) {
  payload = payload || {};
  // Validate the meeting row BEFORE any side effects.
  var meeting = null;
  l10ReadTab_(L10.TABS.MEETINGS).rows.forEach(function (m) {
    if (String(m['ID']).trim() === String(meetingId).trim()) meeting = m;
  });
  if (!meeting) return { ok: false, error: 'Meeting ' + meetingId + ' not found in ' + L10.TABS.MEETINGS + ' — reload and try again.' };
  if (String(meeting['Status']) !== 'OPEN') return { ok: false, error: 'This meeting is already wrapped up.' };

  var meetingDate = l10Today_();
  var weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  var weekAgoStr = l10Fmt_(weekAgo, 'yyyy-MM-dd');
  // Advance the carry counters before reading the list, so a huddle wrapped up
  // in a week the sweep hadn't reached yet still shows the true carry count.
  // The sweep owns the increment now (l10SweepCarries_) — wrapping up no longer
  // does it inline, so skipping Wrap-up no longer freezes the staleness signal.
  l10SweepCarriesIfDue_();
  var todos = l10ReadTab_(L10.TABS.TODOS);
  var done = 0, openOverdue = 0;
  // The week's list = items completed in the last 7 days + items still owed
  // and due by today. Old completions don't re-count week after week.
  // ⚠ "Still owed" is l10TodoOpen_, NOT Status === 'OPEN': WORKING and BLOCKED
  // are open states, and dropping them here would shrink the denominator and
  // silently inflate the team's completion score. Client twin: weekTodos_
  // (Js.html) renders the identical split live on the To-dos page and segment —
  // change one definition, change both.
  todos.rows.forEach(function (t) {
    var due = l10DateStr_(t['Due']);
    var status = String(t['Status']).toUpperCase();
    if (status === 'DONE') {
      if (l10DateStr_(t['Done At']) >= weekAgoStr) done++;
    } else if (l10TodoOpen_(status) && due && due <= meetingDate) {
      openOverdue++;
    }
  });
  var pct = (done + openOverdue) ? Math.round(done / (done + openOverdue) * 100) : '';
  var ratings = payload.ratings || {};
  var vals = Object.keys(ratings).map(function (k) { return Number(ratings[k]); }).filter(isFinite);
  var avg = vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length * 10) / 10 : '';
  var solved = l10ReadTab_(L10.TABS.ISSUES).rows.filter(function (i) {
    return String(i['Solved In']) === String(meetingId);
  }).length;
  var wrote = l10SetCells_(L10.TABS.MEETINGS, meetingId, {
    'Status': 'CONCLUDED',
    'Concluded At': l10Now_(),
    'Todo Done %': pct,
    'Todos Done': done,
    'Todos Open': openOverdue,
    'Issues Solved': solved,
    'Rating Avg': avg,
    'Ratings (JSON)': JSON.stringify(ratings),
    'Cascade': payload.cascade || '',
    'Recap': payload.recap || '',
    'Notes': payload.notes || ''
  });
  if (!wrote) return { ok: false, error: 'Could not write the meeting row — check the ' + L10.TABS.MEETINGS + ' tab.' };
  return { ok: true, todoPct: pct, ratingAvg: avg, issuesSolved: solved };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

// Captures one week's column: auto-pulls RANGE metrics, takes manual values
// from the client, upserts into the metrics data tab. Returns what was
// written plus notes for anything that could not be read or parsed.
function l10_captureWeek(weekOf, manual) {
  manual = manual || {};
  var scTab = l10ReadTab_(L10.TABS.SCORECARD);
  var defs = scTab.rows.filter(function (d) {
    return String(d['Active']).toUpperCase() === 'YES';
  });
  var isCurrentWeek = weekOf === l10WeekOf_();
  // Live Experiment Hub counts — pulled ONLY when a HUB_RUNNING/HUB_DECISIONS
  // metric will actually consume them (current week only; backfills are
  // manual-only). The unconditional force-pull used to pay openByUrl on the
  // foreign workbook — seconds — on every capture, hub metrics or not.
  var needsHub = isCurrentWeek && defs.some(function (d) {
    var s = String(d['Source']).toUpperCase();
    return s === 'HUB_RUNNING' || s === 'HUB_DECISIONS';
  });
  var hub = needsHub ? l10HubCounts_(l10Config_(), true) : null;
  // GA4 metrics resolve as ONE parallel fetchAll instead of a serial HTTP
  // round trip per metric — see l10Ga4ResolveMany_.
  var ga4Ids = [], ga4Refs = [];
  if (isCurrentWeek) {
    defs.forEach(function (d) {
      if (String(d['Source']).toUpperCase() !== 'GA4') return;
      if (manual[String(d['ID'])] !== undefined && String(manual[String(d['ID'])]).trim() !== '') return; // manual override wins
      ga4Ids.push(String(d['ID']));
      ga4Refs.push(String(d['Source Ref'] === undefined || d['Source Ref'] === null ? '' : d['Source Ref']).trim());
    });
  }
  var ga4ByMetric = {};
  if (ga4Refs.length) {
    var ga4Res = l10Ga4ResolveMany_(ga4Refs);
    ga4Ids.forEach(function (id, i) { ga4ByMetric[id] = ga4Res[i]; });
  }
  // Source Ref cells may hold live formulas (='Metrics'!H7) — getValues()
  // then returns the computed NUMBER, not the reference text — so formulas
  // and display text are read separately and resolved per row.
  var scSheet = l10Ss_().getSheetByName(L10.TABS.SCORECARD);
  var refCol = scTab.headers.indexOf('Source Ref') + 1;
  var refFormulas = [], refDisplays = [];
  if (refCol > 0 && scSheet.getLastRow() > 1) {
    var refRange = scSheet.getRange(2, refCol, scSheet.getLastRow() - 1, 1);
    refFormulas = refRange.getFormulas();
    refDisplays = refRange.getDisplayValues();
  }
  function refCell(d) {
    var i = d._row - 2;
    return {
      text: String(d['Source Ref'] === undefined || d['Source Ref'] === null ? '' : d['Source Ref']).trim(),
      formula: String(refFormulas[i] ? refFormulas[i][0] : '').trim(),
      display: String(refDisplays[i] ? refDisplays[i][0] : '')
    };
  }
  var written = {}, notes = [], updates = [];
  var data = l10ReadTab_(L10.TABS.DATA);
  var index = {};
  data.rows.forEach(function (r) {
    index[l10DateStr_(r['Week Of']) + '|' + String(r['Metric ID'])] = r._row;
  });
  var sheet = l10Ss_().getSheetByName(L10.TABS.DATA);
  defs.forEach(function (d) {
    var id = String(d['ID']);
    var source = String(d['Source']).toUpperCase();
    var value = null, note = '';
    if (manual[id] !== undefined && String(manual[id]).trim() !== '') {
      value = l10ParseDisplay_(manual[id]);
      note = 'manual';
      if (value === null) {
        notes.push(id + ': could not read "' + String(manual[id]) + '" as a number — not saved.');
        return;
      }
    } else if (source === 'RANGE') {
      if (!isCurrentWeek) return; // backfill is manual-only: the source cell holds TODAY's value, not that week's
      var res = l10ResolveRef_(refCell(d));
      value = res.value;
      note = 'auto: ' + (res.how || '');
      if (value === null) notes.push(id + ': could not capture — ' + res.why + '.');
    } else if (source === 'GA4') {
      if (!isCurrentWeek) return; // same rule as RANGE: a trailing window resolved today is not that past week's number
      var ga = ga4ByMetric[id] || { value: null, why: 'the Google Analytics batch skipped this ref — retry the capture' };
      value = ga.value;
      note = 'auto: ' + (ga.how || '');
      if (value === null) notes.push(id + ': could not capture — ' + ga.why + '.');
    } else if (source === 'HUB_RUNNING' || source === 'HUB_DECISIONS') {
      if (!isCurrentWeek) return; // hub count is a "now" value like RANGE/GA4 — never backfilled
      var hubVal = (hub && !hub.error)
          ? (source === 'HUB_RUNNING' ? hub.running : hub.needDecision) : null;
      var cell = refCell(d);
      if (cell.formula || cell.text) {
        // A filled Source Ref on a hub metric overrides the auto-count — it
        // was re-pointed on purpose. A cell that doesn't resolve falls back
        // to the hub count, loudly.
        var ovr = l10ResolveRef_(cell);
        if (ovr.value !== null) {
          value = ovr.value; note = 'override: ' + ovr.how;
        } else {
          value = hubVal; note = 'auto: hub';
          notes.push(id + ': Source Ref ignored (' + ovr.why + ') — ' + (hubVal === null
              ? 'and the hub is unreachable, so nothing was saved.'
              : 'captured the live hub count (' + hubVal + ') instead. Clear the cell to silence this.'));
        }
      } else {
        value = hubVal; note = 'auto: hub';
      }
    }
    if (value === null || value === undefined || !isFinite(value)) return;
    var key = weekOf + '|' + id;
    if (index[key]) {
      updates.push({ row: index[key], vals: [value, l10Now_(), note] });
    } else {
      // appendRow (not getLastRow math) so concurrent captures can't overwrite
      // each other's freshly written rows.
      sheet.appendRow([weekOf, id, value, l10Now_(), note]);
    }
    written[id] = value;
  });
  // Re-captures of an existing week update scattered rows — but a week's rows
  // were appended together, so they're usually contiguous: coalesce runs and
  // write each with one setValues instead of one round trip per metric.
  if (updates.length) {
    updates.sort(function (a, b) { return a.row - b.row; });
    var run = [updates[0]];
    var flushRun = function () {
      sheet.getRange(run[0].row, 3, run.length, 3).setValues(run.map(function (u) { return u.vals; }));
    };
    for (var ui = 1; ui < updates.length; ui++) {
      if (updates[ui].row === run[run.length - 1].row + 1) { run.push(updates[ui]); continue; }
      flushRun();
      run = [updates[ui]];
    }
    flushRun();
  }
  if (hub && hub.error) notes.push('Experiment Hub unreachable: ' + hub.error);
  l10TabDirty_(L10.TABS.DATA);
  return { ok: true, written: written, notes: notes };
}

// ---------------------------------------------------------------------------
// Metrics builder — metrics are created/edited from the app, never by hand
// in the tab. Columns: ID, Metric, Owner, Format, Rule, Goal, Goal 2, Source,
// Source Ref, Caveat, Active, Sort.
// ---------------------------------------------------------------------------

// Validate + normalize builder input. Returns {ok, fields} or {ok:false, error}.
function l10MetricFields_(p) {
  p = p || {};
  var metric = String(p.metric || '').trim();
  if (!metric) return { ok: false, error: 'Give the metric a name.' };
  var format = String(p.format || 'num').toLowerCase();
  if (L10.FORMATS.indexOf(format) === -1) format = 'num';
  var rule = String(p.rule || 'none');
  if (L10.RULES.indexOf(rule) === -1) rule = 'none';
  var goal = '', goal2 = '';
  function num(v) { var n = Number(String(v).replace(/[$,%\s]/g, '')); return isFinite(n) ? n : null; }
  if (rule === '>=' || rule === '<=') {
    goal = num(p.goal);
    if (goal === null) return { ok: false, error: 'That rule needs a goal number.' };
  } else if (rule === 'between') {
    goal = num(p.goal); goal2 = num(p.goal2);
    if (goal === null || goal2 === null) return { ok: false, error: '"Between" needs both numbers.' };
    if (goal2 < goal) { var t = goal; goal = goal2; goal2 = t; }
  }
  var source = String(p.source || 'MANUAL').toUpperCase();
  if (L10.SOURCES.indexOf(source) === -1) source = 'MANUAL';
  var ref = String(p.sourceRef || '').trim().replace(/^=/, '');
  if (source === 'RANGE' && !ref) {
    return { ok: false, error: 'Auto-pull needs a cell reference like SheetName!A1.' };
  }
  if (source === 'GA4') {
    var ga = l10Ga4ParseRef_(ref);
    if (!ga.ok) return { ok: false, error: 'Google Analytics source: ' + ga.why + '.' };
    ref = ga.ref; // normalized "metric:window"
  }
  if (source === 'MANUAL') ref = '';
  return { ok: true, fields: {
    'Metric': metric, 'Owner': String(p.owner || '').trim(),
    'Format': format, 'Rule': rule, 'Goal': goal, 'Goal 2': goal2,
    'Source': source, 'Source Ref': ref, 'Caveat': String(p.caveat || '').trim()
  } };
}

function l10_addMetric(p) {
  var v = l10MetricFields_(p);
  if (!v.ok) return v;
  var rows = l10ReadTab_(L10.TABS.SCORECARD).rows;
  var sort = 0;
  rows.forEach(function (r) { sort = Math.max(sort, Number(r['Sort']) || 0); });
  var id = l10NextId_(L10.TABS.SCORECARD, 'SC');
  var f = v.fields;
  var row = l10Append_(L10.TABS.SCORECARD, [
    id, f['Metric'], f['Owner'], f['Format'], f['Rule'], f['Goal'], f['Goal 2'],
    f['Source'], f['Source Ref'], f['Caveat'], 'YES', sort + 1
  ]);
  return { ok: true, id: id, row: row };
}

function l10_editMetric(id, p) {
  var v = l10MetricFields_(p);
  if (!v.ok) return v;
  var wrote = l10SetCells_(L10.TABS.SCORECARD, id, v.fields);
  return wrote ? { ok: true, id: String(id), fields: v.fields } : { ok: false, error: 'Metric ' + id + ' not found.' };
}

// Retire (Active NO) / reactivate. History in L10_Scorecard_Data stays.
function l10_setMetricActive(id, on) {
  var wrote = l10SetCell_(L10.TABS.SCORECARD, id, 'Active', on ? 'YES' : 'NO');
  return wrote ? { ok: true } : { ok: false, error: 'Metric ' + id + ' not found.' };
}

// Live "test it" for the builder's auto-pull field — resolves the reference NOW
// so a typo surfaces at setup time, not silently at next week's capture.
function l10_testRangeRef(ref) {
  var cell = { text: String(ref || '').trim().replace(/^=/, ''), formula: '', display: '' };
  if (!cell.text) return { ok: false, why: 'Type a reference like SheetName!A1 first.' };
  var res = l10ResolveRef_(cell);
  return res.value === null ? { ok: false, why: res.why } : { ok: true, value: res.value };
}

// Starter metric packs — one click on an empty Metrics page (or from the setup
// wizard) seeds a working set of metrics; owners round-robin the roster.
var L10_METRIC_PACKS = [
  { id: 'sales', name: 'Sales', icon: '💼', metrics: [
    ['Pipeline created ($)', 'usd', '>=', 50000, ''],
    ['Deals won', 'num', '>=', 3, ''],
    ['Win rate (%)', 'pct', '>=', 25, ''],
    ['Average deal size ($)', 'usd', 'none', '', '']
  ] },
  { id: 'marketing', name: 'Marketing', icon: '📣', metrics: [
    ['New leads', 'num', '>=', 50, ''],
    ['Website sessions', 'num', '>=', 2000, ''],
    ['Cost per lead ($)', 'usd', '<=', 50, ''],
    ['Lead-to-customer rate (%)', 'pct', 'none', '', '']
  ] },
  { id: 'support', name: 'Customer support', icon: '🎧', metrics: [
    ['Tickets closed', 'num', '>=', 40, ''],
    ['First response time (hrs)', 'num', '<=', 4, ''],
    ['CSAT (%)', 'pct', '>=', 90, ''],
    ['Open backlog', 'num', '<=', 25, '']
  ] },
  { id: 'ops', name: 'Operations', icon: '⚙️', metrics: [
    ['On-time delivery (%)', 'pct', '>=', 95, ''],
    ['Open defects', 'num', '<=', 10, ''],
    ['Cycle time (days)', 'num', '<=', 5, ''],
    ['Units shipped', 'num', 'none', '', '']
  ] },
  { id: 'agency', name: 'Agency / services', icon: '🎨', metrics: [
    ['Billable hours', 'num', '>=', 120, ''],
    ['Proposals sent', 'num', '>=', 3, ''],
    ['Clients healthy (%)', 'pct', '>=', 80, ''],
    ['New revenue booked ($)', 'usd', 'none', '', '']
  ] }
];

// Pack catalog for the empty-state gallery / wizard (names only, no rows read).
function l10_metricPacks() {
  return L10_METRIC_PACKS.map(function (p) {
    return { id: p.id, name: p.name, icon: p.icon,
      metrics: p.metrics.map(function (m) { return m[0]; }) };
  });
}

// Seed a pack. teamNames personalizes owners (round-robin); falls back to the
// configured roster. Rows append AFTER existing metrics — never a wipe.
function l10SeedMetricPack_(packId, teamNames) {
  var pack = null;
  L10_METRIC_PACKS.forEach(function (p) { if (p.id === String(packId)) pack = p; });
  if (!pack) return { ok: false, error: 'Unknown pack "' + packId + '".' };
  var team = (teamNames && teamNames.length) ? teamNames
      : String(l10Config_().TEAM || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  var added = 0, rows = [];
  pack.metrics.forEach(function (m, i) {
    var r = l10_addMetric({
      metric: m[0], owner: team.length ? team[i % team.length] : '',
      format: m[1], rule: m[2], goal: m[3], goal2: m[4], source: 'MANUAL'
    });
    if (r.ok) { added++; rows.push(r.row); }
  });
  return { ok: true, added: added, pack: pack.name, rows: rows };
}

function l10_addMetricPack(packId) {
  return l10SeedMetricPack_(packId, null);
}

// ---------------------------------------------------------------------------
// Priorities
// ---------------------------------------------------------------------------

function l10_setRockStatus(id, status) {
  if (L10.ROCK_STATUSES.indexOf(status) === -1) return { ok: false, error: 'Bad status' };
  var wrote = l10SetCells_(L10.TABS.ROCKS, id, { 'Status': status, 'Status Updated': l10Today_() });
  return wrote ? { ok: true, status: status } : { ok: false, error: 'Priority ' + id + ' not found.' };
}

// ---------------------------------------------------------------------------
// Inline edits — fix a typo'd text / wrong owner / wrong date in the module
// instead of hunting the row down in the sheet tabs.
// ---------------------------------------------------------------------------

function l10Edit_(tab, id, updates) {
  var wrote = l10SetCells_(tab, id, updates);
  return wrote ? { ok: true } : { ok: false, error: id + ' not found in ' + tab + '.' };
}

function l10DueOk_(due) {
  return !due || /^\d{4}-\d{2}-\d{2}$/.test(String(due));
}

function l10_editTodo(id, p) {
  p = p || {};
  if (!String(p.text || '').trim()) return { ok: false, error: 'To-do needs text.' };
  if (!l10DueOk_(p.due)) return { ok: false, error: 'Bad due date.' };
  var updates = { 'To-Do': p.text, 'Owner': p.owner || '', 'Due': p.due || '' };
  // Only written when the client sends it — an older edit form can't blank a
  // note it never showed (same guard as l10_editMilestone / l10_editRock).
  if (p.notes !== undefined) updates['Notes'] = String(p.notes);
  // Same guard: the ↻ checkbox in the inline edit is how a weekly chain ends
  // without dropping the open copy.
  if (p.repeat !== undefined) updates['Repeat'] = p.repeat ? 'WEEKLY' : '';
  return l10Edit_(L10.TABS.TODOS, id, updates);
}

function l10_editRock(id, p) {
  p = p || {};
  if (!String(p.text || '').trim()) return { ok: false, error: 'Priority needs a title.' };
  if (!l10DueOk_(p.due)) return { ok: false, error: 'Bad due date.' };
  var updates = { 'Rock': p.text, 'Owner': p.owner || '', 'Due': p.due || '' };
  // Only fields the client sent are written — an older edit form must never
  // blank a definition of done or metric link it didn't show.
  if (p.done !== undefined) updates['Definition of Done'] = String(p.done || '');
  if (p.metricId !== undefined) {
    var metricId = String(p.metricId || '').trim();
    // l10SetCells_ skips headers the sheet doesn't have, which would make
    // linking a metric a silent no-op on a pre-repair tab — fail loudly instead.
    if (metricId && l10ReadTab_(L10.TABS.ROCKS).headers.indexOf('Metric ID') === -1) {
      return { ok: false, error: 'L10_Rocks has no Metric ID column yet — run Momentum Huddle → Setup / repair tabs once, then retry.' };
    }
    if (metricId && !l10RockMetricOk_(metricId)) {
      return { ok: false, error: 'Metric ' + metricId + ' is not on the metrics list.' };
    }
    updates['Metric ID'] = metricId;
  }
  var r = l10Edit_(L10.TABS.ROCKS, id, updates);
  if (r && r.ok) r.fq = l10FiscalQuarterOf_(p.due || '');
  return r;
}

function l10_editMilestone(id, p) {
  p = p || {};
  if (!String(p.text || '').trim()) return { ok: false, error: 'Milestone needs a name.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.due || ''))) return { ok: false, error: 'Milestone needs a due date.' };
  var updates = { 'Milestone': p.text, 'Due': p.due };
  // Only written when the client sends it — an older form can't blank a note.
  if (p.notes !== undefined) updates['Notes'] = String(p.notes);
  return l10Edit_(L10.TABS.MILESTONES, id, updates);
}

function l10_editIssue(id, p) {
  p = p || {};
  if (!String(p.text || '').trim()) return { ok: false, error: 'Issue needs text.' };
  return l10Edit_(L10.TABS.ISSUES, id, {
    'Issue': p.text, 'Raised By': p.by || '',
    'Accounts': p.accounts || '', 'Category': p.category || ''
  });
}

// The Metric ID a priority points at must be a real metrics row — a typo'd link
// would just render nothing forever, so it's rejected at write time.
function l10RockMetricOk_(metricId) {
  return l10ReadTab_(L10.TABS.SCORECARD).rows.some(function (d) {
    return String(d['ID']).trim() === metricId;
  });
}

function l10_addRock(p) {
  if (!p || !p.title) return { ok: false, error: 'Priority needs a title.' };
  var headers = l10ReadTab_(L10.TABS.ROCKS).headers;
  var metricId = String(p.metricId || '').trim();
  var source = String(p.source || '').trim();
  // The appended columns are optional on the way in, but writing into them
  // needs the repaired tab — fail loudly, never a silent drop (rule: see
  // l10_issueNeedsData).
  if (metricId && headers.indexOf('Metric ID') === -1) {
    return { ok: false, error: 'L10_Rocks has no Metric ID column yet — run Momentum Huddle → Setup / repair tabs once, then retry.' };
  }
  if (source && headers.indexOf('Source') === -1) {
    return { ok: false, error: 'L10_Rocks has no Source column yet — run Momentum Huddle → Setup / repair tabs once, then retry.' };
  }
  if (metricId && !l10RockMetricOk_(metricId)) {
    return { ok: false, error: 'Metric ' + metricId + ' is not on the metrics list.' };
  }
  var id = l10NextId_(L10.TABS.ROCKS, 'RK');
  // p.shift is the four-shift strategic tag from the add-priority form (Shift 1–4);
  // it writes into the Shift column and renders as a tag on the priority card.
  var arr = [
    id, p.title, p.owner || '', p.due || '', p.shift || '', p.accounts || '',
    'ON TRACK', p.done || '', p.notes || '', l10Today_(), l10Today_()
  ];
  // Fill the appended columns by the sheet's OWN headers so a pre-repair tab
  // (11 columns) still gets a row exactly as wide as it is.
  for (var i = arr.length; i < headers.length; i++) {
    arr.push(headers[i] === 'Metric ID' ? metricId : headers[i] === 'Source' ? source : '');
  }
  var row = l10Append_(L10.TABS.ROCKS, arr);
  row.fq = l10FiscalQuarterOf_(p.due || '');
  return { ok: true, id: id, row: row };
}

// ---------------------------------------------------------------------------
// Priority milestones
// ---------------------------------------------------------------------------

// Add a milestone to a priority. Due is required — the timeline places each
// milestone by date, so an undated milestone has nowhere to live.
function l10_addMilestone(p) {
  if (!p || !p.rockId) return { ok: false, error: 'Milestone needs a priority.' };
  if (!p.text) return { ok: false, error: 'Milestone needs a name.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.due || ''))) return { ok: false, error: 'Milestone needs a due date.' };
  var found = l10ReadTab_(L10.TABS.ROCKS).rows.some(function (r) {
    return String(r['ID']).trim() === String(p.rockId).trim();
  });
  if (!found) return { ok: false, error: 'Priority ' + p.rockId + ' not found.' };
  var sheet = l10Ss_().getSheetByName(L10.TABS.MILESTONES);
  if (!sheet) return { ok: false, error: 'No L10_Rock_Milestones tab — run Momentum Huddle → Setup / repair tabs first.' };
  var id = l10NextId_(L10.TABS.MILESTONES, 'MS');
  var row = l10Append_(L10.TABS.MILESTONES, [id, String(p.rockId), p.text, p.due, 'OPEN', '', l10Today_(), p.notes || '']);
  return { ok: true, id: id, row: row };
}

// Flip a milestone OPEN/DONE. Completing the LAST open milestone marks the
// priority itself DONE (the priority is the sum of its milestones). Reopening one
// does NOT silently reopen a DONE priority — that stays a deliberate call on
// the priority's own buttons.
function l10_setMilestoneStatus(id, status) {
  if (L10.MILESTONE_STATUSES.indexOf(status) === -1) return { ok: false, error: 'Bad status' };
  var wrote = l10SetCells_(L10.TABS.MILESTONES, id, {
    'Status': status,
    'Done At': status === 'DONE' ? l10Today_() : ''
  });
  if (!wrote) return { ok: false, error: 'Milestone ' + id + ' not found.' };
  var out = { ok: true, status: status };
  if (status === 'DONE') {
    var ms = l10ReadTab_(L10.TABS.MILESTONES).rows;
    var rockId = '';
    ms.forEach(function (m) {
      if (String(m['ID']).trim() === String(id).trim()) rockId = String(m['Rock ID']).trim();
    });
    var stillOpen = ms.some(function (m) {
      return String(m['Rock ID']).trim() === rockId && String(m['Status']).toUpperCase() !== 'DONE';
    });
    if (rockId && !stillOpen) {
      var rock = null;
      l10ReadTab_(L10.TABS.ROCKS).rows.forEach(function (r) {
        if (String(r['ID']).trim() === rockId) rock = r;
      });
      if (rock && ['DONE', 'DROPPED'].indexOf(String(rock['Status'])) === -1) {
        l10SetCells_(L10.TABS.ROCKS, rockId, { 'Status': 'DONE', 'Status Updated': l10Today_() });
        out.rockDone = rockId;
      }
    }
  }
  return out;
}

// Delete re-evaluates the parent priority the same way completing does
// (l10_setMilestoneStatus): removing the LAST open milestone leaves the plan
// fully done, so the priority flips DONE too — but only when milestones remain;
// a priority whose only milestone was deleted is unplanned, not done.
function l10_deleteMilestone(id) {
  var tab = l10ReadTab_(L10.TABS.MILESTONES);
  for (var i = 0; i < tab.rows.length; i++) {
    if (String(tab.rows[i]['ID']).trim() === String(id).trim()) {
      var rockId = String(tab.rows[i]['Rock ID']).trim();
      l10Ss_().getSheetByName(L10.TABS.MILESTONES).deleteRow(tab.rows[i]._row);
      l10TabDirty_(L10.TABS.MILESTONES);
      var out = { ok: true };
      var rest = l10ReadTab_(L10.TABS.MILESTONES).rows.filter(function (m) {
        return String(m['Rock ID']).trim() === rockId;
      });
      var stillOpen = rest.some(function (m) {
        return String(m['Status']).toUpperCase() !== 'DONE';
      });
      if (rockId && rest.length && !stillOpen) {
        var rock = null;
        l10ReadTab_(L10.TABS.ROCKS).rows.forEach(function (r) {
          if (String(r['ID']).trim() === rockId) rock = r;
        });
        if (rock && ['DONE', 'DROPPED'].indexOf(String(rock['Status'])) === -1) {
          l10SetCells_(L10.TABS.ROCKS, rockId, { 'Status': 'DONE', 'Status Updated': l10Today_() });
          out.rockDone = rockId;
        }
      }
      return out;
    }
  }
  return { ok: false, error: 'Milestone ' + id + ' not found.' };
}

// ---------------------------------------------------------------------------
// Chat notifications — post a line to a team space via an incoming webhook.
// Opt-in: set CHAT_WEBHOOK_URL in L10_Config (or the L10_CHAT_WEBHOOK_URL
// script property, which wins when both are set). Blank = silent. Posting is
// fire-and-forget and NEVER throws — a chat hiccup must never block a to-do
// write — and nothing here names the source of the message.
// ---------------------------------------------------------------------------

function l10ChatWebhookUrl_(config) {
  var prop = '';
  try { prop = PropertiesService.getScriptProperties().getProperty('L10_CHAT_WEBHOOK_URL') || ''; }
  catch (e) {}
  if (prop.trim()) return prop.trim();
  var cfg = config || l10Config_();
  return String(cfg.CHAT_WEBHOOK_URL || '').trim();
}

// POST one line of text to the space. Returns a small status object for the
// test menu item; the to-do hooks ignore the result on purpose.
function l10NotifyChat_(text, config) {
  var url = l10ChatWebhookUrl_(config);
  if (!url) return { ok: false, skipped: 'no webhook' };
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    return (code >= 200 && code < 300)
        ? { ok: true }
        : { ok: false, error: 'HTTP ' + code + ': ' + String(res.getContentText()).slice(0, 140) };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 140) };
  }
}

// "Jun 30" from a 'yyyy-MM-dd' string (the friendly due-date suffix on adds).
function l10PrettyDate_(ymd) {
  var s = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return l10Fmt_(new Date(s + 'T12:00:00'), 'MMM d');
}

// One consistent chat line for a to-do event, e.g.
//   ✅ *Momentum Huddle To-Do - Complete* - Ana - Fix the weekly report
//   📝 *Momentum Huddle To-Do - Added* - Ben - Draft the survey questions  _(due Jun 30)_
function l10TodoChatLine_(action, owner, task, due) {
  var icon = action === 'Complete' ? '✅' : action === 'Blocked' ? '⛔' : '📝';
  var who = String(owner || '').trim() || 'Unassigned';
  var line = icon + ' *Momentum Huddle To-Do - ' + action + '* - ' + who + ' - ' + String(task || '').trim();
  if (action === 'Added' && due) line += '  _(due ' + l10PrettyDate_(due) + ')_';
  return line;
}

// Menu/test entry: post a sample line so the webhook can be verified end-to-end.
function l10SendTodoChatTest_() {
  var config = l10Config_();
  if (!l10ChatWebhookUrl_(config)) {
    return { ok: false, error: 'No webhook URL set — add CHAT_WEBHOOK_URL in L10_Config (or the L10_CHAT_WEBHOOK_URL script property).' };
  }
  return l10NotifyChat_(
      l10TodoChatLine_('Complete', 'Test', 'Webhook test from Momentum Huddle — safe to ignore.'),
      config);
}

// Upsert one L10_Config key's Value (used by the chat-webhook menu setter).
function l10SetConfigValue_(key, value) {
  var sheet = l10Ss_().getSheetByName(L10.TABS.CONFIG);
  var tab = l10ReadTab_(L10.TABS.CONFIG);
  var wrote = false;
  for (var i = 0; i < tab.rows.length && !wrote; i++) {
    if (String(tab.rows[i]['Key']).trim() === String(key).trim()) {
      sheet.getRange(tab.rows[i]._row, tab.headers.indexOf('Value') + 1).setValue(value);
      wrote = true;
    }
  }
  if (!wrote) sheet.appendRow([key, value, '']);
  l10TabDirty_(L10.TABS.CONFIG);
  L10_CONFIG_CACHE_ = null;   // config changed mid-execution
  L10_FY_START_ = null;       // FISCAL_START_MONTH may be the changed key
  return true;
}

// ---------------------------------------------------------------------------
// Per-analyst notification preferences (L10_Notify tab, edited from Settings →
// Notifications). Email only: Heads-up = the day-before personal email (on/off),
// Recap = how often the post-huddle team recap reaches this person. Chat pings
// stay a team-space broadcast. A missing person or a pre-upgrade workbook with no
// L10_Notify tab falls back to the prior defaults (heads-up on, every recap), so
// nothing changes until someone opts down.
// ---------------------------------------------------------------------------

function l10NotifyDefaults_() { return { headsup: true, recap: 'EVERY' }; }

// name(lowercased) -> {headsup:bool, recap:'EVERY'|'BIWEEKLY'|'MONTHLY'|'OFF'}
function l10NotifyPrefs_() {
  var map = {};
  var sheet = l10Ss_().getSheetByName(L10.TABS.NOTIFY);
  if (!sheet || sheet.getLastRow() < 2) return map;
  l10ReadTab_(L10.TABS.NOTIFY).rows.forEach(function (r) {
    var name = String(r['Person'] || '').trim();
    if (!name) return;
    var recap = String(r['Recap'] || 'EVERY').toUpperCase();
    if (L10.RECAP_CADENCES.indexOf(recap) === -1) recap = 'EVERY';
    map[name.toLowerCase()] = {
      headsup: String(r['Heads-up'] || 'YES').toUpperCase() !== 'NO',
      recap: recap
    };
  });
  return map;
}

// One person's prefs, defaulted. `prefs` is an optional pre-read map.
function l10NotifyPrefFor_(name, prefs) {
  prefs = prefs || l10NotifyPrefs_();
  return prefs[String(name || '').trim().toLowerCase()] || l10NotifyDefaults_();
}

// Should this person get the recap for a huddle wrapped up on huddleDate?
// EVERY always; OFF never; BIWEEKLY on even week-of-epoch huddles; MONTHLY only on
// the first wrapped-up huddle of that calendar month. A pure function of the date +
// the meeting history — no per-person "already sent" bookkeeping needed.
function l10RecapDueFor_(recap, huddleDate, meetings) {
  recap = String(recap || 'EVERY').toUpperCase();
  if (recap === 'EVERY') return true;
  if (recap === 'OFF') return false;
  var ymd = String(huddleDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return true; // undated huddle: never silently drop
  if (recap === 'BIWEEKLY') {
    var days = Math.floor(new Date(ymd + 'T12:00:00').getTime() / 86400000);
    return (Math.floor(days / 7) % 2) === 0;
  }
  if (recap === 'MONTHLY') {
    var mon = ymd.slice(0, 7); // yyyy-MM
    var isFirst = true;
    (meetings || []).forEach(function (m) {
      if (String(m['Status']).toUpperCase() !== 'CONCLUDED') return;
      var d = l10DateStr_(m['Concluded At']) || l10DateStr_(m['Date']);
      if (d && d.slice(0, 7) === mon && d < ymd) isFirst = false;
    });
    return isFirst;
  }
  return true;
}

// Client: the prefs for EVERY current team member (config TEAM order), merged with
// saved rows and defaulted — so the Settings card always lists the whole roster.
function l10_getNotifyPrefs() {
  var prefs = l10NotifyPrefs_();
  var team = String(l10Config_().TEAM || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  var seen = {};
  var out = team.map(function (name) {
    seen[name.toLowerCase()] = 1;
    var p = l10NotifyPrefFor_(name, prefs);
    return { person: name, headsup: p.headsup, recap: p.recap };
  });
  // Anyone with a saved row who is no longer on the roster rides at the end, flagged.
  l10ReadTab_(L10.TABS.NOTIFY).rows.forEach(function (r) {
    var name = String(r['Person'] || '').trim();
    if (name && !seen[name.toLowerCase()]) {
      seen[name.toLowerCase()] = 1;
      var p = l10NotifyPrefFor_(name, prefs);
      out.push({ person: name, headsup: p.headsup, recap: p.recap, offRoster: true });
    }
  });
  return out;
}

// Client: save the prefs table (upsert by Person). rows = [{person, headsup:bool, recap}].
function l10_saveNotifyPrefs(rows) {
  if (!Array.isArray(rows)) return { ok: false, error: 'Bad payload.' };
  var sheet = l10Ss_().getSheetByName(L10.TABS.NOTIFY);
  if (!sheet) return { ok: false, error: 'No L10_Notify tab — run Momentum Huddle → Setup / repair tabs once, then retry.' };
  var tab = l10ReadTab_(L10.TABS.NOTIFY);
  var rowByName = {};
  tab.rows.forEach(function (r) { rowByName[String(r['Person']).trim().toLowerCase()] = r._row; });
  var today = l10Today_(), saved = 0;
  rows.forEach(function (p) {
    var name = String((p && p.person) || '').trim();
    if (!name) return;
    var recap = String(p.recap || 'EVERY').toUpperCase();
    if (L10.RECAP_CADENCES.indexOf(recap) === -1) recap = 'EVERY';
    var arr = [name, p.headsup === false ? 'NO' : 'YES', recap, today];
    var at = rowByName[name.toLowerCase()];
    if (at) sheet.getRange(at, 1, 1, arr.length).setValues([arr]);
    else sheet.appendRow(arr);
    saved++;
  });
  l10TabDirty_(L10.TABS.NOTIFY);
  return { ok: true, saved: saved };
}

// ---------------------------------------------------------------------------
// Custom digests (v2.2) — a free-schedule layer on top of the meeting-anchored
// heads-up/recap. One L10_Digests row per RULE (many per person); each rule is
// {what content, how often, which day if weekly, time of day, on/off}. Opt-in:
// no rows are seeded, and zero rules is a valid state. The hourly runner lives
// in L10Mail.gs (l10RunDigests); these endpoints feed and persist the Settings
// card. A pre-upgrade workbook (no tab) reads as zero rules, so old deployments
// keep working — same guarantee as the notify block above.
// ---------------------------------------------------------------------------

// "TODOS, ROCKS" (any comma/space separators) -> ['TODOS','ROCKS'], known tokens
// only, de-duplicated, order preserved. The compact cell keeps the schema fixed.
function l10DigestContentOut_(str) {
  var seen = {}, out = [];
  String(str === undefined || str === null ? '' : str).split(/[,\s]+/).forEach(function (tok) {
    var t = tok.trim().toUpperCase();
    if (t && L10.DIGEST_CONTENT.indexOf(t) !== -1 && !seen[t]) { seen[t] = 1; out.push(t); }
  });
  return out;
}

// ['TODOS','ROCKS'] -> "TODOS, ROCKS" (known tokens only, comma-joined) for the cell.
function l10DigestContentIn_(arr) {
  var seen = {}, out = [];
  (arr || []).forEach(function (t) {
    var u = String(t).toUpperCase();
    if (L10.DIGEST_CONTENT.indexOf(u) !== -1 && !seen[u]) { seen[u] = 1; out.push(u); }
  });
  return out.join(', ');
}

// Normalize a weekday to the canonical 3-letter label ('Mon'..'Sun'); '' if unknown.
function l10DigestWeekdayNorm_(w) {
  var s = String(w || '').trim().toLowerCase().slice(0, 3);
  var found = '';
  L10.DIGEST_WEEKDAYS.forEach(function (d) { if (d.toLowerCase() === s) found = d; });
  return found;
}

function l10DigestPadId_(n) {
  var s = String(n);
  while (s.length < 3) s = '0' + s;
  return 'D-' + s;
}

// The saved rules as normalized objects, in sheet order. Does NOT synthesize a
// row per member (zero rules is valid) — only real rows come back.
function l10DigestRows_() {
  var sheet = l10Ss_().getSheetByName(L10.TABS.DIGESTS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return l10ReadTab_(L10.TABS.DIGESTS).rows.map(function (r) {
    var freq = String(r['Frequency'] || 'DAILY').toUpperCase();
    if (L10.DIGEST_FREQS.indexOf(freq) === -1) freq = 'DAILY';
    var h = parseInt(r['Hour'], 10);
    return {
      id: String(r['ID'] || '').trim(),
      person: String(r['Person'] || '').trim(),
      label: String(r['Label'] || '').trim(),
      content: l10DigestContentOut_(r['Content']),
      freq: freq,
      weekday: l10DigestWeekdayNorm_(r['Weekday']),
      hour: (isFinite(h) && h >= 0 && h <= 23) ? h : 8,
      enabled: String(r['Enabled'] || 'YES').toUpperCase() !== 'NO'
    };
  }).filter(function (o) { return o.person; });
}

// Client: every saved rule, ordered by config TEAM (a person's rules kept in sheet
// order), then rules whose person is off the roster, each flagged offRoster so the
// card can surface them for one-click removal. Mirrors l10_getNotifyPrefs' ordering
// but never invents a row — someone with no rules simply has none.
function l10_getDigests() {
  var rows = l10DigestRows_();
  var team = String(l10Config_().TEAM || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  var teamIdx = {};
  team.forEach(function (name, i) { teamIdx[name.toLowerCase()] = i; });
  var onRoster = [], offRoster = [];
  rows.forEach(function (o, i) {
    var key = o.person.toLowerCase();
    if (teamIdx[key] !== undefined) onRoster.push({ o: o, i: i, t: teamIdx[key] });
    else { o.offRoster = true; offRoster.push({ o: o, i: i }); }
  });
  onRoster.sort(function (a, b) { return a.t !== b.t ? a.t - b.t : a.i - b.i; });
  offRoster.sort(function (a, b) { return a.i - b.i; });
  return onRoster.concat(offRoster).map(function (x) { return x.o; });
}

// Client: replace-all save of the whole rule set. rules = [{id?, person, label,
// content:[tokens], freq, weekday, hour, enabled:bool}]. Preserves Last Sent for a
// kept id (so a resave never re-fires today), mints D-### ids for new rules, and
// validates each rule — a bad hour is REJECTED (dropped) rather than silently
// meaning "never fires". Writes the block in one setValues; the row-2..999
// validations survive a content-only clear.
function l10_saveDigests(rules) {
  if (!Array.isArray(rules)) return { ok: false, error: 'Bad payload.' };
  var sheet = l10Ss_().getSheetByName(L10.TABS.DIGESTS);
  if (!sheet) return { ok: false, error: 'No L10_Digests tab — run Momentum Huddle → Setup / repair tabs once, then retry.' };
  var headers = L10.HEADERS.L10_Digests, nCols = headers.length;

  // Preserve Last Sent for kept ids; track the max existing D-### to mint new ones.
  var lastSentById = {}, maxNum = 0;
  l10ReadTab_(L10.TABS.DIGESTS).rows.forEach(function (r) {
    var id = String(r['ID'] || '').trim();
    // Normalize a possibly-Date-coerced cell back to the 'yyyy-MM-dd HH' stamp so a
    // resave preserves the real Last Sent (not a stringified Date) — see l10DigestStampOf_.
    if (id) lastSentById[id] = l10DigestStampOf_(r['Last Sent']);
    var m = /^D-(\d+)$/.exec(id);
    if (m) maxNum = Math.max(maxNum, Number(m[1]));
  });

  var today = l10Today_(), out = [], saved = 0;
  rules.forEach(function (p) {
    if (!p) return;
    var person = String(p.person || '').trim();
    if (!person) return;
    var content = l10DigestContentOut_(Array.isArray(p.content) ? p.content.join(',') : p.content);
    if (!content.length) return; // no valid content -> drop the rule
    var freq = String(p.freq || 'DAILY').toUpperCase();
    if (L10.DIGEST_FREQS.indexOf(freq) === -1) freq = 'DAILY';
    var weekday = '';
    if (freq === 'WEEKLY') { weekday = l10DigestWeekdayNorm_(p.weekday) || 'Mon'; }
    var hour = parseInt(p.hour, 10);
    if (!(isFinite(hour) && hour >= 0 && hour <= 23)) return; // reject a bad hour
    var id = String((p && p.id) || '').trim();
    if (!/^D-\d+$/.test(id)) { maxNum++; id = l10DigestPadId_(maxNum); }
    var lastSent = lastSentById.hasOwnProperty(id) ? lastSentById[id] : '';
    out.push([id, person, String(p.label || '').trim(), l10DigestContentIn_(content),
      freq, weekday, hour, (p.enabled === false ? 'NO' : 'YES'), lastSent, today]);
    saved++;
  });

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, nCols).clearContent();
  if (out.length) sheet.getRange(2, 1, out.length, nCols).setValues(out);
  l10TabDirty_(L10.TABS.DIGESTS);
  return { ok: true, saved: saved, digests: l10_getDigests() };
}

// ---------------------------------------------------------------------------
// To-dos
// ---------------------------------------------------------------------------

// The one "is this still owed?" test. WORKING and BLOCKED are open states, so
// every denominator, sweep and sync question routes through here instead of
// comparing against 'OPEN' — see the TODO_OPEN_STATUSES note in L10Setup.gs.
// Client twin: todoOpen_ (Js.html). Change one, change both.
function l10TodoOpen_(status) {
  return L10.TODO_OPEN_STATUSES.indexOf(String(status || '').trim().toUpperCase()) !== -1;
}

// Normalized form used ONLY to warn about a near-duplicate add — never to block
// one. Lowercase, punctuation out, filler words out, so "Fix the PDC feed" and
// "fix PDC feed" collapse to the same key.
function l10TodoKey_(text) {
  return String(text || '').toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\b(the|a|an|to|for|of|on|in|and|is|it|this|that|we|our)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
}

// Two keys count as the same work when they share ≥70% of their words. Cheap
// and predictable — the point is a "did you mean this one?" prompt, not search.
function l10TodoSimilar_(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  var ta = a.split(' '), tb = b.split(' ');
  if (ta.length < 2 || tb.length < 2) return false;
  var seen = {};
  tb.forEach(function (w) { seen[w] = 1; });
  var hit = 0;
  ta.forEach(function (w) { if (seen[w]) hit++; });
  return hit / Math.max(ta.length, tb.length) >= 0.7;
}

// Still-owed to-dos that look like this one. Scoped to the same owner when one
// is given — two people deliberately doing the same thing on different accounts
// is normal here and must not be nagged.
function l10TodoDupes_(text, owner) {
  var key = l10TodoKey_(text);
  if (!key) return [];
  var own = String(owner || '').trim();
  return l10ReadTab_(L10.TABS.TODOS).rows.filter(function (t) {
    if (!l10TodoOpen_(t['Status'])) return false;
    if (own && String(t['Owner']).trim() !== own) return false;
    return l10TodoSimilar_(key, l10TodoKey_(t['To-Do']));
  }).map(function (t) {
    return {
      id: String(t['ID']), text: String(t['To-Do']),
      owner: String(t['Owner'] || ''), due: l10DateStr_(t['Due'])
    };
  });
}

// Carry counting used to live inside l10_concludeMeeting, so a week where nobody
// pressed Wrap-up never advanced it — the staleness signal the To-dos page leans
// on silently under-reported. It's now an idempotent weekly sweep: each still-owed,
// past-due to-do advances at most once per calendar week, stamped in
// 'Last Carried Week'. Re-running in the same week is a no-op.
function l10SweepCarries_() {
  var tab = l10ReadTab_(L10.TABS.TODOS);
  if (!tab.rows.length) return 0;
  var iCarry = tab.headers.indexOf('Carried Over') + 1;
  var iWeek = tab.headers.indexOf('Last Carried Week') + 1;
  // Pre-upgrade workbook (columns not appended yet) — leave it entirely alone
  // rather than half-counting. Setup / repair tabs adds them.
  // ⚠ Returns null, NOT 0, so the caller can tell "nothing needed doing" from
  // "couldn't run". Stamping the week on a couldn't-run would mean that running
  // Setup / repair tabs afterwards has no visible effect until the NEXT calendar
  // week — the exact upgrade path every workbook takes.
  if (!iCarry || !iWeek) return null;
  var week = l10WeekOf_();
  var today = l10Today_();
  var sheet = l10Ss_().getSheetByName(L10.TABS.TODOS);
  // Collect the rows to advance, then write them as contiguous-run batches —
  // one setValues per run per column instead of two setValue round trips per
  // row (the week's first boot used to pay ~100-300ms per carried to-do).
  var dirty = []; // [{row, carry}] keyed to _row, ascending sheet order
  tab.rows.forEach(function (t) {
    if (!l10TodoOpen_(t['Status'])) return;
    var due = l10DateStr_(t['Due']);
    if (!due || due >= today) return;                      // not past due yet
    if (l10DateStr_(t['Last Carried Week']) === week) return;  // already counted this week
    dirty.push({ row: t._row, carry: (Number(t['Carried Over']) || 0) + 1 });
  });
  if (!dirty.length) return 0;
  dirty.sort(function (a, b) { return a.row - b.row; });
  var run = [dirty[0]];
  var flush = function () {
    var top = run[0].row;
    sheet.getRange(top, iCarry, run.length, 1).setValues(run.map(function (d) { return [d.carry]; }));
    sheet.getRange(top, iWeek, run.length, 1).setValues(run.map(function () { return [week]; }));
  };
  for (var i = 1; i < dirty.length; i++) {
    // A gap in _row (a clean or blank intervening row) ends the run — untouched
    // rows are never rewritten.
    if (dirty[i].row === run[run.length - 1].row + 1) { run.push(dirty[i]); continue; }
    flush();
    run = [dirty[i]];
  }
  flush();
  l10TabDirty_(L10.TABS.TODOS);
  return dirty.length;
}

// Boot-path guard for the sweep: at most one sweep per calendar week per
// workbook, and never two at once. Every boot after the first in a week costs a
// single script-property read. Failures leave the stamp unset so the next boot
// retries — under-counting a carry is recoverable, double-counting isn't.
function l10SweepCarriesIfDue_() {
  var week = l10WeekOf_();
  var props, lock;
  try { props = PropertiesService.getScriptProperties(); } catch (e) { return 0; }
  try {
    if (props.getProperty('L10_CARRY_SWEPT_WEEK') === week) return 0;
    lock = LockService.getScriptLock();
    if (!lock.tryLock(0)) return 0;                        // another boot has it
    if (props.getProperty('L10_CARRY_SWEPT_WEEK') === week) return 0;
    var n = l10SweepCarries_();
    // Only claim the week when the sweep could actually run. A null means the
    // columns aren't there yet; stamping anyway would silently skip the first
    // real sweep after the tabs are repaired.
    if (n === null) return 0;
    props.setProperty('L10_CARRY_SWEPT_WEEK', week);
    return n;
  } catch (e) {
    return 0;
  } finally {
    if (lock) try { lock.releaseLock(); } catch (le) {}
  }
}

function l10_addTodo(p) {
  if (!p || !p.text) return { ok: false, error: 'To-do needs text.' };
  // Duplicate warning is opt-in per call site: the composer and the quick-add
  // dialogs ask for it, the machine-driven paths (Solve, weekly respawn,
  // "bring the data") never do — a prompt there would stall a save mid-huddle.
  if (p.checkDupe && !p.allowDupe) {
    var dupes = l10TodoDupes_(p.text, p.owner);
    if (dupes.length) return { ok: false, needsConfirm: true, dupes: dupes };
  }
  var id = l10NextId_(L10.TABS.TODOS, 'TD');
  var due = p.due;
  if (!due) {
    var d = new Date(l10WeekOf_() + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    due = l10Fmt_(d, 'yyyy-MM-dd');
  }
  var row = l10Append_(L10.TABS.TODOS, [
    id, p.text, p.owner || '', due, 'OPEN', l10Today_(), '', 0, p.source || '', p.notes || '',
    '', '', p.repeat ? 'WEEKLY' : '', '', ''
  ]);
  // Announce the new to-do to the team space. _silent lets l10_addTodoMulti
  // suppress the per-owner pings and send one grouped line instead.
  if (!p._silent) l10NotifyChat_(l10TodoChatLine_('Added', p.owner, p.text, due));
  return { ok: true, id: id, due: due, row: row };
}

// Assign one to-do to several people at once. The method keeps a single accountable
// owner per to-do, and the To-dos page groups by Owner while the heads-up email
// filters per person — so N owners means N rows, never one row with a name list.
// Reuses l10_addTodo per owner so id minting, the next-Monday due default, and
// the row shape stay defined in exactly one place. No owners → one unassigned row.
function l10_addTodoMulti(p) {
  if (!p || !p.text) return { ok: false, error: 'To-do needs text.' };
  var owners = (p.owners && p.owners.length) ? p.owners : [p.owner || ''];
  // Check EVERY owner before writing ANY row — a per-owner check inside the loop
  // would half-create the fan-out and then stop to ask a question.
  if (p.checkDupe && !p.allowDupe) {
    var found = [];
    owners.forEach(function (o) {
      l10TodoDupes_(p.text, o).forEach(function (d) { found.push(d); });
    });
    if (found.length) return { ok: false, needsConfirm: true, dupes: found };
  }
  var items = [];
  for (var i = 0; i < owners.length; i++) {
    var res = l10_addTodo({ text: p.text, owner: owners[i], due: p.due, source: p.source, notes: p.notes, repeat: p.repeat, _silent: true });
    if (!res || !res.ok) return res || { ok: false, error: 'Add failed.' };
    items.push({ id: res.id, owner: owners[i], due: res.due, row: res.row });
  }
  // One grouped chat line for the whole fan-out, not one ping per owner.
  var names = owners.map(function (o) { return String(o || '').trim(); }).filter(String);
  l10NotifyChat_(l10TodoChatLine_('Added', names.join(', '), p.text, items.length ? items[0].due : p.due));
  return { ok: true, items: items, count: items.length };
}

function l10_setTodoStatus(id, status, opts) {
  if (L10.TODO_STATUSES.indexOf(status) === -1) return { ok: false, error: 'Bad status' };
  opts = opts || {};
  // Read the row first: we need its Owner + text for the chat line, and the
  // prior status so re-confirming an already-DONE to-do doesn't double-post.
  // A bulk caller pre-resolves every row from ONE tab read (opts._bulkCtx) —
  // without it, each iteration's write dirties the tab cache and the next
  // lookup re-reads the whole tab (N full reads for an N-item flip).
  var ctx = opts._bulkCtx || null;
  var todo = null;
  if (ctx) {
    todo = ctx.byId[String(id).trim()] || null;
  } else {
    l10ReadTab_(L10.TABS.TODOS).rows.forEach(function (t) {
      if (String(t['ID']).trim() === String(id).trim()) todo = t;
    });
  }
  if (!todo) return { ok: false, error: 'To-do ' + id + ' not found.' };
  var was = String(todo['Status']).toUpperCase();
  var wasDone = was === 'DONE';
  var updates = {
    'Status': status,
    'Done At': status === 'DONE' ? l10Now_() : ''
  };
  // 'Blocked On' only means something while BLOCKED — leaving that state clears
  // it, so a row can never show a stale blocker next to a live status.
  // ⚠ Re-entering BLOCKED with no reason supplied KEEPS the existing text. Undo
  // and the bulk endpoint both call this with no opts, so overwriting with ''
  // here would mean undoing a mis-click permanently destroyed the one piece of
  // information that made the blocked state useful.
  if (status === 'BLOCKED') {
    if (opts.blockedOn !== undefined) updates['Blocked On'] = String(opts.blockedOn || '').slice(0, 300);
  } else if (was === 'BLOCKED') {
    updates['Blocked On'] = '';
  }
  var wrote;
  if (ctx) {
    // Row + headers already resolved — write directly, skip the per-call tab
    // lookup. Appends during the batch (weekly respawns, trail rows) never
    // shift existing _row indices, so the pre-resolved index stays valid.
    wrote = l10WriteRowCells_(ctx.sheet, ctx.headers, todo._row, updates) || true;
    l10TabDirty_(L10.TABS.TODOS);
  } else {
    wrote = l10SetCells_(L10.TABS.TODOS, id, updates);
  }
  if (!wrote) return { ok: false, error: 'To-do ' + id + ' not found.' };
  // opts._silent suppresses the per-item ping so a bulk flip posts ONE grouped
  // line instead of ten — same rule l10_addTodoMulti follows for a fan-out.
  if (status === 'DONE' && !wasDone && !opts._silent) {
    l10NotifyChat_(l10TodoChatLine_('Complete', todo['Owner'], todo['To-Do']));
  }
  // BLOCKED is the one non-terminal state worth interrupting the room for: it's
  // the case where someone else has to move before the owner can. WORKING stays
  // silent on purpose — a ping per started task is noise.
  if (status === 'BLOCKED' && was !== 'BLOCKED' && !opts._silent) {
    l10NotifyChat_(l10TodoChatLine_('Blocked', todo['Owner'], todo['To-Do'] +
        (opts.blockedOn ? ' — waiting on ' + String(opts.blockedOn).slice(0, 120) : '')));
  }
  // Every state change lands in the trail, so the story of a to-do survives the
  // week without anyone writing it up.
  l10TodoLogAppend_(id, was + ' → ' + status +
      (status === 'BLOCKED' && opts.blockedOn ? ' (waiting on ' + String(opts.blockedOn).slice(0, 200) + ')' : ''));
  // A weekly to-do completes into next week's copy — typed once, never again.
  var nextRow = null;
  if (status === 'DONE' && !wasDone && String(todo['Repeat'] || '').toUpperCase() === 'WEEKLY') {
    var prevDue = l10DateStr_(todo['Due']);
    var nextDue = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(prevDue)) {
      // Re-anchor to the huddle rhythm: due + 7 or next Monday, whichever is
      // later. A weekly completed three weeks late must not respawn already
      // overdue (and instantly "carried") — the chain picks back up at the
      // next huddle. An on-time completion still lands exactly a week out.
      var nd = new Date(prevDue + 'T12:00:00');
      nd.setDate(nd.getDate() + 7);
      var plus7 = l10Fmt_(nd, 'yyyy-MM-dd');
      var mon = new Date(l10WeekOf_() + 'T12:00:00');
      mon.setDate(mon.getDate() + 7);
      var nextMonday = l10Fmt_(mon, 'yyyy-MM-dd');
      nextDue = plus7 >= nextMonday ? plus7 : nextMonday;
    }
    var again = l10_addTodo({
      text: todo['To-Do'], owner: todo['Owner'], due: nextDue,
      source: todo['Source'], repeat: true, _silent: true
    });
    if (again && again.ok) nextRow = again.row;
  }
  // owner rides back so l10_setTodoStatusBulk can name the people in its single
  // grouped chat line without re-reading the tab per row.
  return {
    ok: true, status: status, nextRow: nextRow,
    blockedOn: updates['Blocked On'], owner: String(todo['Owner'] || '')
  };
}

// Flip several to-dos in one call. The page's bulk bar sends one request instead
// of N, so five completions cost one round-trip and one Undo instead of five of
// each. Per-row failures are collected, never thrown — a bad id in the middle
// must not strand the rows after it.
//
// Chat gets ONE grouped line for the whole batch (per-item pings are suppressed
// via _silent) — ten completions must not become ten messages in the team space.
function l10_setTodoStatusBulk(ids, status, opts) {
  if (L10.TODO_STATUSES.indexOf(status) === -1) return { ok: false, error: 'Bad status' };
  ids = ids || [];
  var each = {};
  Object.keys(opts || {}).forEach(function (k) { each[k] = opts[k]; });
  each._silent = true;
  // Resolve every row from ONE read up front — see the _bulkCtx note in
  // l10_setTodoStatus. Trail-row ids and the author email are memoized
  // per-execution (l10NextId_ / l10User_), so a 10-item flip costs one tab
  // scan and one Session call instead of ten of each.
  var tab = l10ReadTab_(L10.TABS.TODOS);
  var byId = {};
  tab.rows.forEach(function (t) { byId[String(t['ID']).trim()] = t; });
  each._bulkCtx = { byId: byId, headers: tab.headers, sheet: l10Ss_().getSheetByName(L10.TABS.TODOS) };
  var done = [], failed = [], nextRows = [], owners = {};
  for (var i = 0; i < ids.length; i++) {
    var res = l10_setTodoStatus(ids[i], status, each);
    if (res && res.ok) {
      done.push(ids[i]);
      if (res.owner) owners[res.owner] = 1;
      if (res.nextRow) nextRows.push(res.nextRow);
    } else {
      failed.push({ id: ids[i], error: (res && res.error) || 'failed' });
    }
  }
  if (done.length && (status === 'DONE' || status === 'BLOCKED')) {
    var names = Object.keys(owners).filter(String).join(', ');
    l10NotifyChat_(l10TodoChatLine_(status === 'DONE' ? 'Complete' : 'Blocked', names,
        done.length + ' to-do' + (done.length === 1 ? '' : 's')));
  }
  return { ok: true, done: done, failed: failed, nextRows: nextRows, status: status };
}

// Move ONE due date and nothing else. Deliberately not routed through
// l10_editTodo: that endpoint rewrites To-Do/Owner from the payload, so a snooze
// sent from a row whose text had drifted would quietly overwrite the text. A
// date-only write can't do that.
function l10_setTodoDue(id, due) {
  if (!l10DueOk_(due)) return { ok: false, error: 'Bad due date.' };
  var wrote = l10SetCells_(L10.TABS.TODOS, id, { 'Due': due || '' });
  if (!wrote) return { ok: false, error: 'To-do ' + id + ' not found.' };
  l10TodoLogAppend_(id, 'Due moved to ' + (due || 'next huddle'));
  return { ok: true, due: due };
}

// Push several due dates out by N days in one call ("push +7d" on the bulk bar).
// Undated rows are skipped rather than guessed at — a blank due date is a
// deliberate "next huddle", not a date to do arithmetic on.
function l10_pushTodoDue(ids, days) {
  ids = ids || [];
  var n = Number(days) || 7;
  var byId = {};
  l10ReadTab_(L10.TABS.TODOS).rows.forEach(function (t) { byId[String(t['ID']).trim()] = t; });
  var moved = [], skipped = [];
  ids.forEach(function (id) {
    var t = byId[String(id).trim()];
    var due = t ? l10DateStr_(t['Due']) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) { skipped.push(id); return; }
    var d = new Date(due + 'T12:00:00');
    d.setDate(d.getDate() + n);
    var next = l10Fmt_(d, 'yyyy-MM-dd');
    if (l10SetCells_(L10.TABS.TODOS, id, { 'Due': next })) {
      // Same trail entry the single-row move writes — a date that moved in a
      // batch is no less part of the story than one moved on its own.
      l10TodoLogAppend_(id, 'Due moved to ' + next);
      moved.push({ id: id, due: next });
    } else skipped.push(id);
  });
  return { ok: true, moved: moved, skipped: skipped };
}

// ---------------------------------------------------------------------------
// To-do sub-steps + activity trail
//
// Steps are the milestone pattern one level down: same parent/child shape as
// L10_Rock_Milestones, same roll-up rule (the last step to close carries the
// parent with it). A to-do that needs steps is usually a to-do that was really
// three — this keeps it one commitment with visible progress instead of three
// rows nobody groups.
// ---------------------------------------------------------------------------

function l10TodoExists_(todoId) {
  return l10ReadTab_(L10.TABS.TODOS).rows.some(function (t) {
    return String(t['ID']).trim() === String(todoId).trim();
  });
}

// Append-only. Never throws into a caller's happy path: the trail is bookkeeping,
// and a missing tab (workbook not repaired yet) must not fail a status flip.
function l10TodoLogAppend_(todoId, note, who) {
  try {
    if (!note) return null;
    var id = l10NextId_(L10.TABS.TODO_LOG, 'TL');
    var author = who || l10User_();
    return l10Append_(L10.TABS.TODO_LOG, [
      id, String(todoId), l10Now_(), author, String(note).slice(0, 1000)
    ]);
  } catch (e) {
    return null;
  }
}

function l10_addTodoLog(p) {
  if (!p || !p.todoId) return { ok: false, error: 'Note needs a to-do.' };
  if (!p.note) return { ok: false, error: 'Note needs text.' };
  if (!l10TodoExists_(p.todoId)) return { ok: false, error: 'To-do ' + p.todoId + ' not found.' };
  var row = l10TodoLogAppend_(p.todoId, p.note, p.who);
  if (!row) return { ok: false, error: 'No L10_Todo_Log tab — run Momentum Huddle → Setup / repair tabs first.' };
  return { ok: true, row: row };
}

function l10_addTodoStep(p) {
  if (!p || !p.todoId) return { ok: false, error: 'Step needs a to-do.' };
  if (!p.text) return { ok: false, error: 'Step needs a name.' };
  if (!l10TodoExists_(p.todoId)) return { ok: false, error: 'To-do ' + p.todoId + ' not found.' };
  var sheet = l10Ss_().getSheetByName(L10.TABS.TODO_STEPS);
  if (!sheet) return { ok: false, error: 'No L10_Todo_Steps tab — run Momentum Huddle → Setup / repair tabs first.' };
  var id = l10NextId_(L10.TABS.TODO_STEPS, 'TS');
  var row = l10Append_(L10.TABS.TODO_STEPS, [
    id, String(p.todoId), String(p.text).slice(0, 300), 'OPEN', '', l10Today_()
  ]);
  return { ok: true, id: id, row: row };
}

// Completing the LAST open step marks the to-do DONE — the same roll-up
// l10_setMilestoneStatus applies to a priority. Reopening a step does NOT reopen a
// DONE to-do; that stays a deliberate call on the to-do's own buttons.
function l10_setTodoStepStatus(id, status) {
  if (L10.TODO_STEP_STATUSES.indexOf(status) === -1) return { ok: false, error: 'Bad status' };
  var wrote = l10SetCells_(L10.TABS.TODO_STEPS, id, {
    'Status': status,
    'Done At': status === 'DONE' ? l10Today_() : ''
  });
  if (!wrote) return { ok: false, error: 'Step ' + id + ' not found.' };
  var out = { ok: true, status: status };
  if (status !== 'DONE') return out;
  var steps = l10ReadTab_(L10.TABS.TODO_STEPS).rows;
  var todoId = '';
  steps.forEach(function (s) {
    if (String(s['ID']).trim() === String(id).trim()) todoId = String(s['Todo ID']).trim();
  });
  if (!todoId) return out;
  var stillOpen = steps.some(function (s) {
    return String(s['Todo ID']).trim() === todoId && String(s['Status']).toUpperCase() !== 'DONE';
  });
  if (stillOpen) return out;
  var todo = null;
  l10ReadTab_(L10.TABS.TODOS).rows.forEach(function (t) {
    if (String(t['ID']).trim() === todoId) todo = t;
  });
  // Route through the real status endpoint so the chat ping, the weekly respawn
  // and the trail all fire exactly as they would on a manual completion.
  if (todo && l10TodoOpen_(todo['Status'])) {
    var res = l10_setTodoStatus(todoId, 'DONE');
    out.todoDone = todoId;
    if (res && res.nextRow) out.nextRow = res.nextRow;
  }
  return out;
}

// Delete re-evaluates the parent the same way completing does: removing the last
// open step leaves the plan fully done, so the to-do closes too — but only while
// steps remain. A to-do whose only step was deleted is unplanned, not done.
function l10_deleteTodoStep(id) {
  var tab = l10ReadTab_(L10.TABS.TODO_STEPS);
  for (var i = 0; i < tab.rows.length; i++) {
    if (String(tab.rows[i]['ID']).trim() !== String(id).trim()) continue;
    var todoId = String(tab.rows[i]['Todo ID']).trim();
    // ⚠ Only an OPEN step being removed can complete the plan. Without this,
    // deleting an ALREADY-DONE step from a to-do whose other steps are done
    // rolls the parent to DONE — which posts to the team chat, spawns the next
    // weekly copy, and swings the completion metric, all from a click that only
    // tidied up a step. Worst case: it silently re-closes a to-do somebody had
    // deliberately reopened.
    var wasOpen = String(tab.rows[i]['Status']).toUpperCase() !== 'DONE';
    l10Ss_().getSheetByName(L10.TABS.TODO_STEPS).deleteRow(tab.rows[i]._row);
    l10TabDirty_(L10.TABS.TODO_STEPS);
    var out = { ok: true };
    var rest = l10ReadTab_(L10.TABS.TODO_STEPS).rows.filter(function (s) {
      return String(s['Todo ID']).trim() === todoId;
    });
    var stillOpen = rest.some(function (s) { return String(s['Status']).toUpperCase() !== 'DONE'; });
    if (todoId && wasOpen && rest.length && !stillOpen) {
      var todo = null;
      l10ReadTab_(L10.TABS.TODOS).rows.forEach(function (t) {
        if (String(t['ID']).trim() === todoId) todo = t;
      });
      if (todo && l10TodoOpen_(todo['Status'])) {
        var res = l10_setTodoStatus(todoId, 'DONE');
        out.todoDone = todoId;
        if (res && res.nextRow) out.nextRow = res.nextRow;
      }
    }
    return out;
  }
  return { ok: false, error: 'Step ' + id + ' not found.' };
}

// ---------------------------------------------------------------------------
// Issues (Solve)
// ---------------------------------------------------------------------------

function l10_addIssue(p) {
  if (!p || !p.text) return { ok: false, error: 'Issue needs text.' };
  var id = l10NextId_(L10.TABS.ISSUES, 'IS');
  var row = l10Append_(L10.TABS.ISSUES, [
    id, p.text, p.by || '', l10Today_(), p.accounts || '', p.category || '',
    0, 'OPEN', '', '', '', p.notes || '', '', ''
  ]);
  return { ok: true, id: id, row: row };
}

// Fold Identify/Discuss notes into an updates object. Only provided
// fields are written — and l10SetCells_ skips headers the sheet doesn't
// have yet, so an un-repaired L10_Issues tab degrades gracefully.
function l10IssueNotes_(updates, notes) {
  if (notes && notes.identified !== undefined) updates['Identified'] = String(notes.identified);
  if (notes && notes.discussed !== undefined) updates['Discussed'] = String(notes.discussed);
  return updates;
}

// Saves the Identify/Discuss notes on their own — typed thinking must survive
// even when the issue gets no outcome this huddle.
function l10_saveIssueNotes(id, notes) {
  var u = l10IssueNotes_({}, notes);
  if (!Object.keys(u).length) return { ok: true };
  var wrote = l10SetCells_(L10.TABS.ISSUES, id, u);
  return wrote ? { ok: true } : { ok: false, error: 'Issue ' + id + ' not found.' };
}

function l10_voteIssue(id, delta) {
  var tab = l10ReadTab_(L10.TABS.ISSUES);
  for (var i = 0; i < tab.rows.length; i++) {
    if (String(tab.rows[i]['ID']) === String(id)) {
      var v = Math.max(0, (Number(tab.rows[i]['Votes']) || 0) + (Number(delta) || 1));
      l10Ss_().getSheetByName(L10.TABS.ISSUES)
          .getRange(tab.rows[i]._row, tab.headers.indexOf('Votes') + 1).setValue(v);
      l10TabDirty_(L10.TABS.ISSUES);
      return { ok: true, votes: v };
    }
  }
  return { ok: false, error: 'Not found' };
}

function l10_resetVotes() {
  var tab = l10ReadTab_(L10.TABS.ISSUES);
  var sheet = l10Ss_().getSheetByName(L10.TABS.ISSUES);
  var col = tab.headers.indexOf('Votes') + 1;
  tab.rows.forEach(function (r) {
    if (String(r['Status']).toUpperCase() === 'OPEN' && Number(r['Votes'])) {
      sheet.getRange(r._row, col).setValue(0);
    }
  });
  l10TabDirty_(L10.TABS.ISSUES);
  return { ok: true };
}

// Solve: record the resolution (+ solving notes), optionally spawn to-dos from it.
// Also stamps Review On (today + OUTCOME_REVIEW_WEEKS) so the Wrap-up segment
// circles back and asks whether the fix actually held — l10SetCells_ skips the
// header on a pre-upgrade tab, so this degrades gracefully.
function l10_solveIssue(id, meetingId, solution, todos, notes) {
  var weeks = Number(l10Config_().OUTCOME_REVIEW_WEEKS);
  if (!isFinite(weeks) || weeks <= 0) weeks = 4;
  var rv = new Date();
  rv.setDate(rv.getDate() + weeks * 7);
  var wrote = l10SetCells_(L10.TABS.ISSUES, id, l10IssueNotes_({
    'Status': 'SOLVED',
    'Resolution': solution || '',
    'Solved In': meetingId || '',
    'Review On': l10Fmt_(rv, 'yyyy-MM-dd')
  }, notes));
  if (!wrote) return { ok: false, error: 'Issue ' + id + ' not found.' };
  var created = [];
  (todos || []).forEach(function (t) {
    if (!t.text) return;
    var res = l10_addTodo({ text: t.text, owner: t.owner, due: t.due, source: id });
    if (res.ok) created.push(res.row);
  });
  return { ok: true, todos: created.length, todoRows: created };
}

function l10_parkIssue(id, parkWith, notes) {
  var wrote = l10SetCells_(L10.TABS.ISSUES, id,
      l10IssueNotes_({ 'Status': 'PARKED', 'Park With': parkWith || '' }, notes));
  return wrote ? { ok: true } : { ok: false, error: 'Issue ' + id + ' not found.' };
}

function l10_killIssue(id, notes) {
  var wrote = l10SetCells_(L10.TABS.ISSUES, id, l10IssueNotes_({ 'Status': 'KILLED' }, notes));
  return wrote ? { ok: true } : { ok: false, error: 'Issue ' + id + ' not found.' };
}

function l10_reopenIssue(id) {
  var wrote = l10SetCells_(L10.TABS.ISSUES, id, { 'Status': 'OPEN', 'Park With': '' });
  return wrote ? { ok: true } : { ok: false, error: 'Issue ' + id + ' not found.' };
}

// Promote: the issue is bigger than a to-do — it becomes a quarter priority
// with an owner and a due date. The issue closes as solved with a "Promoted
// to priority RK-xxx" resolution and the new priority's Source column holds
// the issue id (the same convention to-dos use, rendered as a tappable
// reference), so the link reads in both directions. No Review On is stamped:
// the priority's own status tracking replaces the outcome review.
function l10_promoteIssue(id, p) {
  p = p || {};
  // Validate the Source column BEFORE any side effects — otherwise the issue
  // could close as promoted while the priority loses its back-link.
  if (l10ReadTab_(L10.TABS.ROCKS).headers.indexOf('Source') === -1) {
    return { ok: false, error: 'L10_Rocks has no Source column yet — run Momentum Huddle → Setup / repair tabs once, then retry.' };
  }
  var issue = null;
  l10ReadTab_(L10.TABS.ISSUES).rows.forEach(function (r) {
    if (String(r['ID']).trim() === String(id).trim()) issue = r;
  });
  if (!issue) return { ok: false, error: 'Issue ' + id + ' not found.' };
  if (String(issue['Status']).toUpperCase() !== 'OPEN') return { ok: false, error: 'Only an open issue can be promoted.' };
  var title = String(p.title || issue['Issue'] || '').trim();
  if (!title) return { ok: false, error: 'The priority needs a name.' };
  if (!l10DueOk_(p.due)) return { ok: false, error: 'Bad due date.' };
  var rock = l10_addRock({
    title: title, owner: String(p.owner || issue['Raised By'] || '').trim(),
    due: p.due || '', accounts: issue['Accounts'] || '', source: String(id)
  });
  if (!rock || !rock.ok) return rock || { ok: false, error: 'Could not create the priority.' };
  var resolution = 'Promoted to priority ' + rock.id;
  l10SetCells_(L10.TABS.ISSUES, id, l10IssueNotes_({
    'Status': 'SOLVED', 'Resolution': resolution, 'Solved In': p.meetingId || ''
  }, p.notes));
  return { ok: true, rockId: rock.id, rock: rock.row, resolution: resolution };
}

// The honest fourth outcome: the room can't solve without the numbers. One
// person takes a homework to-do (Source = this issue); the issue stays OPEN
// with Waiting On = that to-do's id, and the client surfaces it back to the
// top of the list once the homework completes.
function l10_issueNeedsData(id, p) {
  p = p || {};
  var text = String(p.text || '').trim();
  if (!text) return { ok: false, error: 'Say what data is needed.' };
  var tab = l10ReadTab_(L10.TABS.ISSUES);
  if (tab.headers.indexOf('Waiting On') === -1) {
    return { ok: false, error: 'L10_Issues has no Waiting On column yet — run Momentum Huddle → Setup / repair tabs once, then retry.' };
  }
  var issue = null;
  tab.rows.forEach(function (r) {
    if (String(r['ID']).trim() === String(id).trim()) issue = r;
  });
  if (!issue) return { ok: false, error: 'Issue ' + id + ' not found.' };
  var td = l10_addTodo({ text: text, owner: String(p.owner || '').trim(), source: String(id) });
  if (!td || !td.ok) return td || { ok: false, error: 'Could not create the to-do.' };
  l10SetCells_(L10.TABS.ISSUES, id, l10IssueNotes_({ 'Waiting On': td.id }, p.notes));
  return { ok: true, todoId: td.id, due: td.due, todoRow: td.row };
}

// Send an issue to the Experiment Hub's Ideas backlog as an IDEA-### row, then
// stamp the issue's Notes with the created idea id. The hub is Alex's own sheet
// (EXPERIMENT_HUB_URL); failure returns {error}, never throws.
function l10_sendIssueToHub(id, hypothesis, notes) {
  var config = l10Config_();
  var url = String(config.EXPERIMENT_HUB_URL || '').trim();
  if (!url) return { ok: false, error: 'EXPERIMENT_HUB_URL is not set in L10_Config.' };
  var tab = l10ReadTab_(L10.TABS.ISSUES);
  var issue = null;
  tab.rows.forEach(function (r) { if (String(r['ID']) === String(id)) issue = r; });
  if (!issue) return { ok: false, error: 'Issue not found.' };
  try {
    var sheet = SpreadsheetApp.openByUrl(url).getSheetByName('Ideas');
    if (!sheet) return { ok: false, error: 'Hub has no Ideas tab — run its setup first.' };
    var max = 0;
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
        var m = String(r[0]).match(/^IDEA-(\d+)$/);
        if (m) max = Math.max(max, Number(m[1]));
      });
    }
    var n = max + 1;
    var ideaId = 'IDEA-' + (n < 1000 ? ('000' + n).slice(-3) : String(n));
    sheet.appendRow([
      ideaId, l10Today_(), String(issue['Raised By'] || ''),
      String(issue['Issue']).slice(0, 90), hypothesis || '', 'OTHER',
      String(issue['Accounts'] || ''), '', '', '', '', '', '', 'NEW', '',
      'From huddle issue ' + id
    ]);
    l10SetCells_(L10.TABS.ISSUES, id, l10IssueNotes_({
      'Notes': (String(issue['Notes'] || '') + ' → hub ' + ideaId).trim()
    }, notes));
    return { ok: true, ideaId: ideaId };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }
}

// ---------------------------------------------------------------------------
// Headlines
// ---------------------------------------------------------------------------

function l10_addHeadline(p) {
  if (!p || !p.text) return { ok: false, error: 'Headline needs text.' };
  var id = l10NextId_(L10.TABS.HEADLINES, 'HL');
  var row = l10Append_(L10.TABS.HEADLINES, [
    id, l10Today_(), p.type || 'FYI', p.text, p.by || '',
    p.cascade ? 'YES' : '', p.meetingId || ''
  ]);
  return { ok: true, id: id, row: row };
}

function l10_toggleCascade(id, on) {
  var wrote = l10SetCell_(L10.TABS.HEADLINES, id, 'Cascade', on ? 'YES' : '');
  return wrote ? { ok: true } : { ok: false, error: 'Headline ' + id + ' not found.' };
}

// A headline is live unless its Status column (appended v1.21) says KILLED.
// Shared by the bootstrap and every Mail.gs read so a killed headline leaves
// the app lists, the recaps, and the cascade in one move.
function l10HeadlineLive_(h) {
  return String(h['Status'] || '').toUpperCase() !== 'KILLED';
}

// Kill / revive a headline (the huddle's "that's old news" button). KILLED rows
// stay in the tab as the audit trail but leave every render. Fails loudly —
// never a silent no-op — when the Status column hasn't been added yet.
function l10SetHeadlineStatus_(id, status) {
  if (l10ReadTab_(L10.TABS.HEADLINES).headers.indexOf('Status') === -1) {
    return { ok: false, error: 'L10_Headlines has no Status column yet — run Momentum Huddle → Setup / repair tabs once, then retry.' };
  }
  var wrote = l10SetCell_(L10.TABS.HEADLINES, id, 'Status', status);
  return wrote ? { ok: true, status: status } : { ok: false, error: 'Headline ' + id + ' not found.' };
}

function l10_killHeadline(id) { return l10SetHeadlineStatus_(id, 'KILLED'); }
function l10_reviveHeadline(id) { return l10SetHeadlineStatus_(id, ''); }

// ---------------------------------------------------------------------------
// Quick add (menu dialogs) — add headlines / issues / to-dos / priorities, or
// capture the metrics week, straight from the Momentum Huddle menu without
// opening the full app. One templated dialog (QuickAdd.html) per mode;
// every row funnels through the SAME single-add functions the app uses
// (l10_addHeadline / l10_addIssue / l10_addTodoMulti / l10_addRock /
// l10_captureWeek) so ids, defaults, and the chat pings stay defined in
// exactly one place.
// ---------------------------------------------------------------------------

var L10_QUICK_TITLES = {
  headline: 'Add headlines',
  issue: 'Add issues',
  todo: 'Add to-dos',
  rock: 'Add priorities',
  scorecard: 'Update metrics'
};

function l10QuickAddHeadlines() { l10QuickAddDialog_('headline'); }
function l10QuickAddIssues() { l10QuickAddDialog_('issue'); }
function l10QuickAddTodos() { l10QuickAddDialog_('todo'); }
function l10QuickAddRocks() { l10QuickAddDialog_('rock'); }
function l10QuickAddScorecard() { l10QuickAddDialog_('scorecard'); }

function l10QuickAddDialog_(mode) {
  var t = HtmlService.createTemplateFromFile('L10QuickAdd');
  // Emitted as raw JS literals inside the dialog's <script>; <-escape so
  // sheet-sourced text can never break out of the script block.
  t.modeJson = JSON.stringify(String(mode));
  t.bootJson = JSON.stringify(l10QuickBoot_(mode)).replace(/</g, '\\u003c');
  var html = t.evaluate().setWidth(900).setHeight(620);
  SpreadsheetApp.getUi().showModalDialog(html, L10_QUICK_TITLES[mode] || 'Quick add');
}

// The little the dialog needs: roster + tag lists, and for metrics mode the
// active metric defs plus this week's already-captured values.
function l10QuickBoot_(mode) {
  var config = l10Config_();
  function csv(key) {
    return String(config[key] || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  }
  var boot = {
    mode: mode,
    weekOf: l10WeekOf_(),
    team: String(config.TEAM || '').split(',').map(function (s) { return s.trim(); }).filter(String),
    accounts: csv('ACCOUNT_TAGS'),
    categories: csv('ISSUE_CATEGORIES'),
    types: L10.HEADLINE_TYPES
  };
  if (mode === 'scorecard') {
    boot.defs = l10ReadTab_(L10.TABS.SCORECARD).rows.map(l10Sanitize_).filter(function (d) {
      return String(d['Active']).toUpperCase() === 'YES';
    }).sort(function (a, b) { return (Number(a['Sort']) || 99) - (Number(b['Sort']) || 99); });
    var values = {};
    l10ReadTab_(L10.TABS.DATA).rows.forEach(function (r) {
      if (l10DateStr_(r['Week Of']) !== boot.weekOf) return;
      var v = r['Value'];
      values[String(r['Metric ID'])] = v instanceof Date ? l10Fmt_(v, 'yyyy-MM-dd') : v;
    });
    boot.values = values;
  }
  return boot;
}

// One call per dialog Save: adds every filled row and reports PER-ROW results
// (aligned to the input order) so the dialog can drop what landed, keep what
// failed still editable, and say exactly why each failure failed.
function l10_quickAdd(kind, rows) {
  rows = (rows || []).slice(0, 30);
  var out = { ok: true, added: 0, ids: [], rows: [] };
  rows.forEach(function (r) {
    r = r || {};
    var res;
    try {
      if (kind === 'headline') {
        res = l10_addHeadline({ type: r.type, text: r.text, by: r.by, cascade: !!r.cascade });
      } else if (kind === 'issue') {
        res = l10_addIssue({ text: r.text, by: r.by, accounts: r.accounts, category: r.category });
      } else if (kind === 'todo') {
        res = l10_addTodoMulti({ text: r.text, owners: r.owners || [], due: r.due });
      } else if (kind === 'rock') {
        res = l10_addRock({ title: r.text, owner: r.owner, due: r.due, accounts: r.accounts });
      } else {
        res = { ok: false, error: 'Unknown kind "' + kind + '".' };
      }
    } catch (e) {
      res = { ok: false, error: String(e).slice(0, 140) };
    }
    if (res && res.ok) {
      // A multi-owner to-do fans out to one id per owner (l10_addTodoMulti.items).
      var ids = res.items ? res.items.map(function (it) { return it.id; }) : [res.id];
      out.rows.push({ ok: true, ids: ids });
      out.ids = out.ids.concat(ids);
      out.added += ids.length;
    } else {
      out.ok = false;
      out.rows.push({ ok: false, error: (res && res.error) || 'failed' });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Settings page API — every post-wizard knob in the app, so nobody edits the
// config tab (or hunts menu submenus) for day-to-day changes.
// ---------------------------------------------------------------------------

var L10_SETTINGS_KEYS = ['MEETING_NAME', 'HUDDLE_DAY', 'SEGMENTS', 'TIMER_CHIME',
  'STUART_EMAIL', 'RECAP_TO', 'CHAT_WEBHOOK_URL', 'GA4_PROPERTY_ID',
  'JIRA_DOMAIN', 'JIRA_PROJECT_KEY', 'JIRA_EMAIL'];

// The new-member guide, served into the web app (it was menu-only before —
// invisible from the page a new analyst actually opens). The file is a
// complete standalone document with its own styles, so the client mounts it
// in an iframe rather than splicing it into the app's DOM. The guide file is
// an optional paste; a project without it gets '' and the client says so.
function l10_getGuideHtml() {
  try {
    return HtmlService.createHtmlOutputFromFile('L10Guide').getContent();
  } catch (e) {
    return '';
  }
}

function l10_getSettings() {
  var config = l10Config_();
  var out = { config: {} };
  L10_SETTINGS_KEYS.forEach(function (k) { out.config[k] = String(config[k] === undefined ? '' : config[k]); });
  out.team = String(config.TEAM || '');
  out.webAppUrl = l10WebAppUrl_();
  out.jiraTokenSet = (typeof l10JiraToken_ === 'function') ? !!l10JiraToken_() : false;
  var mailHandlers = ['l10SendMondayHeadsup', 'l10SendTuesdayRecap', 'l10SendManagerRecap'];
  var triggersOn = false;
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (mailHandlers.indexOf(t.getHandlerFunction()) !== -1) triggersOn = true;
    });
  } catch (e) {}
  out.mailTriggersOn = triggersOn;
  return out;
}

// p.segments arrives as [[name, minutes], ...]; everything else is a string.
function l10_saveSettings(p) {
  p = p || {};
  if (p.segments !== undefined) {
    if (!p.segments || !p.segments.length) return { ok: false, error: 'The agenda needs at least one segment.' };
    for (var i = 0; i < p.segments.length; i++) {
      var name = String((p.segments[i] && p.segments[i][0]) || '').trim();
      var mins = Number(p.segments[i] && p.segments[i][1]);
      if (!name) return { ok: false, error: 'Every segment needs a name.' };
      if (!isFinite(mins) || mins < 1 || mins > 180) return { ok: false, error: '"' + name + '" needs 1\u2013180 minutes.' };
      p.segments[i] = [name, Math.round(mins)];
    }
    l10SetConfigValue_('SEGMENTS', JSON.stringify(p.segments));
  }
  var strings = { meetingName: 'MEETING_NAME', huddleDay: 'HUDDLE_DAY', timerChime: 'TIMER_CHIME',
    managerEmail: 'STUART_EMAIL', recapTo: 'RECAP_TO', chatWebhookUrl: 'CHAT_WEBHOOK_URL',
    ga4PropertyId: 'GA4_PROPERTY_ID',
    jiraDomain: 'JIRA_DOMAIN', jiraProjectKey: 'JIRA_PROJECT_KEY', jiraEmail: 'JIRA_EMAIL' };
  var emailish = { managerEmail: 1, jiraEmail: 1 };
  for (var k in strings) {
    if (p[k] === undefined) continue;
    var v = String(p[k]).trim();
    if (emailish[k] && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      return { ok: false, error: '"' + v + '" doesn\'t look like an email address.' };
    }
    if (k === 'timerChime') v = (v.toUpperCase() === 'NO') ? 'NO' : 'YES';
    if (k === 'ga4PropertyId' && v) {
      // Normalize to the bare digits: a pasted "properties/123456" works, and
      // stray separators are dropped. Blank stays blank (= feature off).
      var digits = v.replace(/^properties\//i, '').replace(/\D/g, '');
      if (!digits) {
        return { ok: false, error: '"' + v + '" doesn\'t look like a GA4 property ID — it\'s the digits shown in Google Analytics under Admin → Property settings.' };
      }
      v = digits;
    }
    l10SetConfigValue_(strings[k], v);
  }
  return { ok: true, config: l10_getSettings().config };
}

// Settings-page wrapper for the mail-trigger installer (the menu item alerts;
// this returns a message the dialog can toast instead).
function l10_installMailTriggers() {
  try {
    if (typeof l10InstallMailTriggers !== 'function') {
      return { ok: false, error: 'Email automation (Mail.gs) isn\'t installed in this project.' };
    }
    var msg = l10InstallMailTriggers();
    return { ok: true, msg: String(msg || 'Email triggers installed.') };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 200) };
  }
}

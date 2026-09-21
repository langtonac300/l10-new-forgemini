// Momentum Huddle — Jira sync (one-way: huddle to-dos -> Jira).
// Pushes huddle To-Dos into a Jira project as issues, and closes the Jira issue
// when the To-Do is completed. Idempotent two ways: the created issue key is
// written back to the To-Do row (Jira Key column) and read back to confirm it
// landed, and before any create the sync asks Jira whether an unresolved issue
// already carries this to-do's ref (label huddle-td-###, or the "Huddle ref:"
// line every issue's description has) and links that one instead. A key that
// will not record stops the run and switches auto-sync off rather than creating
// the same issue again on the next run.
//
// All globals are l10-prefixed (this script project is shared). No credentials
// live in code: the API token is read from the L10_JIRA_API_TOKEN script
// property; the non-secret settings live in L10_Config (JIRA_DOMAIN /
// JIRA_PROJECT_KEY / JIRA_EMAIL / JIRA_ISSUE_TYPE / JIRA_DONE_TRANSITION /
// JIRA_USER_MAP). Dormant until all four required settings + the token are set.
//
// Setup (one-time):
//   1. L10_Config: JIRA_DOMAIN (e.g. yourco.atlassian.net, no https://),
//      JIRA_PROJECT_KEY (e.g. OPS), JIRA_EMAIL (the account that owns the token).
//   2. Momentum Huddle -> Jira -> Set API token…    (stored in script properties)
//   3. Momentum Huddle -> Jira -> Test connection     (verifies + lists project keys)
//   4. Momentum Huddle -> Jira -> Sync now, then Turn on auto-sync (10-min trigger).
//
// Mapping: each OPEN To-Do becomes one Jira issue (issue type = JIRA_ISSUE_TYPE),
// summary = the to-do text, due date carried across, owner assigned when an
// accountId can be resolved (JIRA_USER_MAP, else a TEAM_EMAILS lookup). When the
// to-do is marked DONE in the huddle, the next sync transitions its Jira issue to
// Done and stamps the Jira Done column so it is never re-processed. Historical
// already-DONE to-dos are left alone (no backfill spam); DROPPED to-dos are skipped.

var L10_JIRA_TOKEN_PROP = 'L10_JIRA_API_TOKEN';
var L10_JIRA_KEY_COL = 'Jira Key';
var L10_JIRA_DONE_COL = 'Jira Done';
var L10_JIRA_KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/;

function l10JiraToken_() {
  return String(PropertiesService.getScriptProperties().getProperty(L10_JIRA_TOKEN_PROP) || '').trim();
}

function l10JiraParseMap_(s) {
  var out = {};
  String(s || '').split(/[;,\n]/).forEach(function (pair) {
    var i = String(pair).indexOf('=');
    if (i > 0) out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  });
  return out;
}

function l10JiraSettings_(cfg) {
  cfg = cfg || l10Config_();
  return {
    // Domain normalization is mirrored client-side by todoJiraHtml_ (Js.html),
    // which builds the tappable browse link — keep the two chains identical.
    domain: String(cfg.JIRA_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
    project: String(cfg.JIRA_PROJECT_KEY || '').trim(),
    email: String(cfg.JIRA_EMAIL || '').trim(),
    issueType: String(cfg.JIRA_ISSUE_TYPE || 'Task').trim() || 'Task',
    doneName: String(cfg.JIRA_DONE_TRANSITION || 'Done').trim() || 'Done',
    userMap: l10JiraParseMap_(cfg.JIRA_USER_MAP),
    emailMap: l10JiraParseMap_(l10JiraTeamEmails_(cfg)),
    token: l10JiraToken_()
  };
}

// Owner→email roster used to resolve assignees: the L10_Config TEAM_EMAILS
// override if set, otherwise the same baked roster the email automation uses
// (L10_MAIL_TEAM_DEFAULT in L10Mail.gs) so assignment works with zero config.
// Guarded so L10Jira.gs still loads if the optional L10Mail.gs isn't present.
// ⚠ Regression history: this fallback shipped 2026-06-30, was silently dropped
// by the v2.0 rebase (which regenerated this file without it — every issue
// created since synced unassigned), restored v2.9.1. Don't remove it again.
function l10JiraTeamEmails_(cfg) {
  var fromCfg = String((cfg && cfg.TEAM_EMAILS) || '').trim();
  if (fromCfg) return fromCfg;
  if (typeof L10_MAIL_TEAM_DEFAULT !== 'undefined') return L10_MAIL_TEAM_DEFAULT;
  return '';
}

function l10JiraEnabled_(s) {
  s = s || l10JiraSettings_();
  return !!(s.domain && s.project && s.email && s.token);
}

function l10JiraBase_(s) { return 'https://' + s.domain + '/rest/api/3'; }
function l10JiraAuth_(s) { return 'Basic ' + Utilities.base64Encode(s.email + ':' + s.token); }

// One HTTP call. Never throws — returns {code, json, text}.
function l10JiraFetch_(s, method, path, payload) {
  var opt = {
    method: method,
    contentType: 'application/json',
    headers: { Authorization: l10JiraAuth_(s), Accept: 'application/json' },
    muteHttpExceptions: true
  };
  if (payload !== undefined && payload !== null) opt.payload = JSON.stringify(payload);
  try {
    var res = UrlFetchApp.fetch(l10JiraBase_(s) + path, opt);
    var text = res.getContentText();
    var json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) {}
    return { code: res.getResponseCode(), json: json, text: text };
  } catch (e) {
    return { code: 0, json: null, text: String(e) };
  }
}

function l10JiraErr_(r) {
  var msg = '';
  if (r && r.json) {
    if (r.json.errorMessages && r.json.errorMessages.length) msg = r.json.errorMessages.join('; ');
    else if (r.json.errors) {
      msg = Object.keys(r.json.errors).map(function (k) { return k + ': ' + r.json.errors[k]; }).join('; ');
    }
  }
  if (!msg && r) msg = String(r.text || '').slice(0, 120);
  return (r ? ('HTTP ' + r.code + ' ') : '') + msg;
}

// Resolve a to-do Owner (a first name) to a Jira accountId. Optional + non-fatal:
// JIRA_USER_MAP wins; otherwise a TEAM_EMAILS address is searched once and cached.
function l10JiraAccountId_(s, owner) {
  var name = String(owner || '').trim();
  if (!name) return '';
  if (s.userMap[name]) return s.userMap[name];
  var email = s.emailMap[name];
  if (!email) return '';
  var props = PropertiesService.getScriptProperties();
  var cacheKey = 'L10_JIRA_ACCT_' + email.toLowerCase();
  var cached = props.getProperty(cacheKey);
  if (cached) return cached;
  var r = l10JiraFetch_(s, 'get', '/user/search?query=' + encodeURIComponent(email));
  if (r.code >= 200 && r.code < 300 && r.json && r.json.length && r.json[0].accountId) {
    props.setProperty(cacheKey, r.json[0].accountId);
    return r.json[0].accountId;
  }
  return '';
}

// Minimal valid Atlassian Document Format paragraph (v3 rich-text fields need ADF).
function l10JiraAdf_(text) {
  return { type: 'doc', version: 1, content: [
    { type: 'paragraph', content: [{ type: 'text', text: String(text) }] }
  ] };
}

function l10JiraTodoFields_(s, todo) {
  var summary = String(todo['To-Do'] || '').trim().slice(0, 250) || '(no description)';
  var owner = String(todo['Owner'] || '').trim();
  var fields = {
    project: { key: s.project },
    summary: summary,
    issuetype: { name: s.issueType }
  };
  var due = l10DateStr_(todo['Due']);
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) fields.duedate = due;
  var parts = ['Created from the Paid Media Momentum Huddle.'];
  if (owner) parts.push('Owner: ' + owner);
  parts.push('Huddle ref: ' + String(todo['ID'] || '').trim());
  if (String(todo['Source'] || '').trim()) parts.push('Source: ' + String(todo['Source']).trim());
  fields.description = l10JiraAdf_(parts.join('  •  '));
  var acct = l10JiraAccountId_(s, owner);
  if (acct) fields.assignee = { id: acct };
  return fields;
}

// Transition a Jira issue into the Done state. Prefers the JIRA_DONE_TRANSITION
// name; falls back to any transition whose target status is in the "done"
// category. No matching transition (e.g. already closed) is treated as success.
function l10JiraCloseIssue_(s, key) {
  var tr = l10JiraFetch_(s, 'get', '/issue/' + encodeURIComponent(key) + '/transitions');
  if (!(tr.code >= 200 && tr.code < 300) || !tr.json || !tr.json.transitions) {
    return { ok: false, error: 'transitions ' + l10JiraErr_(tr) };
  }
  var list = tr.json.transitions, pick = null, i;
  for (i = 0; i < list.length; i++) {
    if (String(list[i].name).toLowerCase() === s.doneName.toLowerCase()) { pick = list[i]; break; }
  }
  if (!pick) {
    for (i = 0; i < list.length; i++) {
      var cat = list[i].to && list[i].to.statusCategory && list[i].to.statusCategory.key;
      if (cat === 'done') { pick = list[i]; break; }
    }
  }
  if (!pick) return { ok: true, note: 'no done transition offered (already closed?)' };
  var r = l10JiraFetch_(s, 'post', '/issue/' + encodeURIComponent(key) + '/transitions', { transition: { id: pick.id } });
  return (r.code >= 200 && r.code < 300) ? { ok: true } : { ok: false, error: l10JiraErr_(r) };
}

// Make sure the two bookkeeping columns exist on L10_Todos (appended at the end
// so existing rows keep their column mapping). Safe to call every sync.
function l10JiraEnsureColumns_() {
  var sheet = l10Ss_().getSheetByName(L10.TABS.TODOS);
  if (!sheet) return null;
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var need = [];
  if (headers.indexOf(L10_JIRA_KEY_COL) === -1) need.push(L10_JIRA_KEY_COL);
  if (headers.indexOf(L10_JIRA_DONE_COL) === -1) need.push(L10_JIRA_DONE_COL);
  if (need.length) {
    sheet.getRange(1, lastCol + 1, 1, need.length).setValues([need])
        .setFontWeight('bold').setBackground('#06316b').setFontColor('#ffffff');
  }
  return sheet;
}

function l10JiraKv_(k, v) { var o = {}; o[k] = v; return o; }

// A header that appears twice on L10_Todos (one copy appended by an early sync,
// another written by a later header repair) once made the sync's read and
// write disagree about which column holds the key — so every run re-created
// the same issue. Reads and writes now both resolve to the FIRST copy
// (l10ReadTab_ / l10WriteRowCells_), but the tab is still malformed and the
// extra column should be deleted by hand. Returns a warning string or ''.
function l10JiraHeaderWarnings_() {
  var sheet = l10Ss_().getSheetByName(L10.TABS.TODOS);
  if (!sheet || sheet.getLastColumn() < 1) return '';
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  var warn = [];
  [L10_JIRA_KEY_COL, L10_JIRA_DONE_COL].forEach(function (h) {
    var cols = [];
    headers.forEach(function (x, i) { if (x === h) cols.push(l10JiraColLetter_(i + 1)); });
    if (cols.length > 1) {
      warn.push('"' + h + '" appears ' + cols.length + ' times (columns ' + cols.join(', ') +
          ') — only ' + cols[0] + ' is used; delete the other copy');
    }
  });
  return warn.join('; ');
}

function l10JiraColLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// The huddle id as a Jira label ("huddle-td-030"): exact, searchable, and it
// survives a lost sheet key. Labels are case-sensitive in JQL, so always lower.
function l10JiraLabel_(id) { return 'huddle-' + String(id || '').trim().toLowerCase(); }

// Flatten an Atlassian Document Format tree to its text (for the ref check).
function l10JiraAdfText_(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  var out = node.type === 'text' ? String(node.text || '') : '';
  (node.content || []).forEach(function (c) { out += ' ' + l10JiraAdfText_(c); });
  return out;
}

// Before creating an issue for a keyless to-do, ask Jira whether one already
// exists for this huddle id — by label (issues created from v2.17.1 on) or by
// the "Huddle ref: TD-###" line every issue's description has carried since
// day one. The sheet is the sync's memory, but a key that failed to land there
// (wrong column, duplicated header, a row copied by hand) used to mean a new
// issue for the same to-do every ten minutes. Only unresolved issues count: a
// to-do reopened after its issue was closed rightly gets a fresh one.
// Returns {ok: true, key} (key '' = none found) or {ok: false, error}.
function l10JiraFindExisting_(s, id) {
  var label = l10JiraLabel_(id);
  var jql = 'project = "' + s.project + '" AND statusCategory != "Done" AND (labels = "' + label +
      '" OR description ~ "' + id + '") ORDER BY created ASC';
  var r = l10JiraFetch_(s, 'get', '/search/jql?jql=' + encodeURIComponent(jql) + '&maxResults=10&fields=' +
      encodeURIComponent('labels,description'));
  if (!(r.code >= 200 && r.code < 300) || !r.json || !r.json.issues) {
    return { ok: false, error: 'duplicate check failed — ' + l10JiraErr_(r) };
  }
  var re = new RegExp('ref:\\s*' + id.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '(?![0-9])', 'i');
  for (var i = 0; i < r.json.issues.length; i++) {
    var iss = r.json.issues[i], f = iss.fields || {};
    if ((f.labels || []).indexOf(label) !== -1) return { ok: true, key: iss.key };
    if (re.test(l10JiraAdfText_(f.description))) return { ok: true, key: iss.key };
  }
  return { ok: true, key: '' };
}

// Create the issue, tagged with the huddle label. A project whose create screen
// lacks the Labels field rejects the label with a 400 naming it — retry once
// without (the description ref still lets the duplicate check find the issue).
function l10JiraCreateIssue_(s, todo) {
  var fields = l10JiraTodoFields_(s, todo);
  fields.labels = [l10JiraLabel_(todo['ID'])];
  var r = l10JiraFetch_(s, 'post', '/issue', { fields: fields });
  if (r.code === 400 && r.json && r.json.errors && r.json.errors.labels) {
    delete fields.labels;
    r = l10JiraFetch_(s, 'post', '/issue', { fields: fields });
  }
  return r;
}

// Write the key to the row, then read the tab back the way the NEXT run will
// and confirm the key is there. A key that does not read back means the sheet
// is not recording keys (column moved, header duplicated, row copied) — and a
// sync that cannot remember what it created must stop, not keep creating.
function l10JiraRecordKey_(id, key) {
  var wrote = l10SetCells_(L10.TABS.TODOS, id, l10JiraKv_(L10_JIRA_KEY_COL, key));
  if (!wrote) return { ok: false, error: 'row ' + id + ' was not found in ' + L10.TABS.TODOS + ' to record ' + key };
  var rows = l10ReadTab_(L10.TABS.TODOS).rows; // fresh read: l10SetCells_ dropped the cache
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['ID'] || '').trim() !== id) continue;
    var back = String(rows[i][L10_JIRA_KEY_COL] || '').trim();
    if (back === key) return { ok: true };
    return { ok: false, error: key + ' was written to row ' + id + ' but reads back as "' + back +
        '" — the "' + L10_JIRA_KEY_COL + '" column is not recording (check the ' + L10.TABS.TODOS + ' header row)' };
  }
  return { ok: false, error: 'row ' + id + ' disappeared while recording ' + key };
}

function l10JiraToast_(msg) {
  try { SpreadsheetApp.getActive().toast(msg, 'Jira', 8); } catch (e) {}
  try { Logger.log(msg); } catch (e) {}
}

// The sync engine — menu "Sync now" and the time trigger both call this.
function l10JiraSyncTodos() {
  var s = l10JiraSettings_();
  if (!l10JiraEnabled_(s)) {
    l10JiraToast_('Jira sync is off — set JIRA_DOMAIN, JIRA_PROJECT_KEY, JIRA_EMAIL in L10_Config and the API token (Momentum Huddle ▸ Jira ▸ Set API token).');
    return { ok: false, error: 'not configured' };
  }
  // Concurrency guard. Creating an issue is NOT idempotent in the window between
  // reading the sheet and writing the new key back, so a manual "Sync now" that
  // overlaps the 10-min trigger (or a double-click) could create duplicates.
  // Hold an exclusive lock; a second run waits briefly, then bails rather than
  // double-creating. LockService is available in this bound Apps Script project.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    l10JiraToast_('Another Jira sync is already running — skipped this overlap.');
    return { ok: false, error: 'busy' };
  }
  try {
    l10JiraEnsureColumns_();
    var headerWarn = l10JiraHeaderWarnings_();
    var tab = l10ReadTab_(L10.TABS.TODOS);
    var created = 0, adopted = 0, closed = 0, errors = 0, skipped = 0;
    var seen = {}, dupIds = [], halt = '';
    for (var i = 0; i < tab.rows.length; i++) {
      var todo = tab.rows[i];
      var id = String(todo['ID'] || '').trim();
      if (!id) continue;
      // Two rows with one id (a row copied by hand, a double submit): the key
      // can only be recorded on the first, so the second would be created anew
      // every run. Sync the first, report the rest.
      if (seen[id]) { dupIds.push(id); continue; }
      seen[id] = true;
      var status = String(todo['Status'] || '').trim().toUpperCase();
      var key = String(todo[L10_JIRA_KEY_COL] || '').trim();
      var doneMark = String(todo[L10_JIRA_DONE_COL] || '').trim();
      var hasKey = L10_JIRA_KEY_RE.test(key);

      // 1) a still-owed to-do with no valid key: link the issue Jira already has
      // for it, else create one — and only count it once the key reads back.
      // ⚠ This tests the whole open set (OPEN/WORKING/BLOCKED), not Status ===
      // 'OPEN'. A bare 'OPEN' comparison would leave every started or blocked
      // to-do off the board entirely — the rows the team most wants tracked.
      if (!hasKey && l10TodoOpen_(status)) {
        var found = l10JiraFindExisting_(s, id);
        if (!found.ok) {
          // Cannot tell whether an issue exists → creating could duplicate.
          // Record the reason and retry next run, exactly like a failed create.
          l10SetCells_(L10.TABS.TODOS, id, l10JiraKv_(L10_JIRA_KEY_COL, 'ERR: ' + found.error));
          errors++;
          Utilities.sleep(200);
          continue;
        }
        var newKey = found.key, how = 'adopted';
        if (!newKey) {
          var r = l10JiraCreateIssue_(s, todo);
          if (r.code >= 200 && r.code < 300 && r.json && r.json.key) {
            newKey = r.json.key;
            how = 'created';
          } else {
            l10SetCells_(L10.TABS.TODOS, id, l10JiraKv_(L10_JIRA_KEY_COL, 'ERR: ' + l10JiraErr_(r)));
            errors++;
            Utilities.sleep(200);
            continue;
          }
        }
        var rec = l10JiraRecordKey_(id, newKey);
        if (!rec.ok) { halt = rec.error + ' (' + newKey + ' exists in Jira)'; break; }
        if (how === 'created') created++; else adopted++;
        Utilities.sleep(200);
        continue;
      }

      // 2) close the linked issue when its to-do is completed (once).
      if (hasKey && status === 'DONE' && !doneMark) {
        var d = l10JiraCloseIssue_(s, key);
        if (d.ok) {
          l10SetCells_(L10.TABS.TODOS, id, l10JiraKv_(L10_JIRA_DONE_COL, l10Now_()));
          closed++;
        } else {
          errors++;
        }
        Utilities.sleep(200);
        continue;
      }
      skipped++;
    }
    if (halt) {
      // Circuit breaker. Every further run would create or re-link the same
      // issue and never remember it, so auto-sync goes off until a person has
      // looked at the tab. One line to the team chat so it is not silent.
      l10RemoveJiraTrigger();
      var stop = 'Jira sync stopped itself: ' + halt + '. Auto-sync is OFF — fix the ' + L10.TABS.TODOS +
          ' tab, run Jira ▸ Sync now, then turn auto-sync back on.';
      l10JiraToast_(stop);
      try { l10NotifyChat_('⚠️ ' + stop); } catch (e) {}
      return { ok: false, halted: true, error: stop, created: created, adopted: adopted, closed: closed, errors: errors };
    }
    l10JiraToast_('Jira sync: ' + created + ' created, ' + adopted + ' linked to existing, ' + closed + ' closed' +
        (errors ? ', ' + errors + ' error(s)' : '') + '.' +
        (dupIds.length ? ' Duplicate to-do id(s) skipped: ' + dupIds.join(', ') + '.' : '') +
        (headerWarn ? ' Header check: ' + headerWarn + '.' : ''));
    return { ok: true, created: created, adopted: adopted, closed: closed, errors: errors, skipped: skipped,
             dupIds: dupIds, headerWarn: headerWarn };
  } finally {
    lock.releaseLock();
  }
}

// Retro-assignment pass: assignment normally happens at create time only, so
// issues created while the roster fallback was missing (or before it existed)
// sit on the board unassigned forever. This walks every open to-do that already
// has a real Jira key and sets the issue's assignee from the Owner column.
// Never overwrites: an issue that already has ANY assignee is left alone, so
// manual "Assign to me" clicks survive. DONE/DROPPED rows are skipped (their
// issues are closed — churning them adds noise, not signal).
function l10JiraBackfillAssignees() {
  var s = l10JiraSettings_();
  if (!l10JiraEnabled_(s)) {
    l10JiraToast_('Jira sync is off — configure it first (see Set API token / L10_Config).');
    return { ok: false, error: 'not configured' };
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    l10JiraToast_('Another Jira sync is already running — try again in a minute.');
    return { ok: false, error: 'busy' };
  }
  try {
    var tab = l10ReadTab_(L10.TABS.TODOS);
    var assigned = 0, already = 0, closedSkip = 0, errors = 0;
    var acctByOwner = {}, unresolved = {};
    for (var i = 0; i < tab.rows.length; i++) {
      var todo = tab.rows[i];
      var key = String(todo[L10_JIRA_KEY_COL] || '').trim();
      if (!L10_JIRA_KEY_RE.test(key)) continue;
      var status = String(todo['Status'] || '').trim().toUpperCase();
      if (!l10TodoOpen_(status)) { closedSkip++; continue; }
      var owner = String(todo['Owner'] || '').trim();
      if (!(owner in acctByOwner)) acctByOwner[owner] = l10JiraAccountId_(s, owner);
      var acct = acctByOwner[owner];
      if (!acct) { if (owner) unresolved[owner] = true; continue; }
      var cur = l10JiraFetch_(s, 'get', '/issue/' + encodeURIComponent(key) + '?fields=assignee');
      if (!(cur.code >= 200 && cur.code < 300) || !cur.json) { errors++; continue; }
      if (cur.json.fields && cur.json.fields.assignee) { already++; continue; }
      var r = l10JiraFetch_(s, 'put', '/issue/' + encodeURIComponent(key) + '/assignee', { accountId: acct });
      if (r.code >= 200 && r.code < 300) assigned++; else errors++;
      Utilities.sleep(150);
    }
    var names = Object.keys(unresolved);
    l10JiraToast_('Jira assignees: ' + assigned + ' set, ' + already + ' already assigned' +
        (errors ? ', ' + errors + ' error(s)' : '') + '.');
    return { ok: true, assigned: assigned, already: already, closedSkipped: closedSkip,
             errors: errors, unresolvedOwners: names };
  } finally {
    lock.releaseLock();
  }
}

// Verify auth + surface the accessible project keys so JIRA_PROJECT_KEY is easy
// to confirm. Returns a status object for the menu wrapper.
function l10JiraTestConnection_() {
  var s = l10JiraSettings_();
  if (!s.domain || !s.email || !s.token) {
    return { ok: false, error: 'Set JIRA_DOMAIN + JIRA_EMAIL in L10_Config and the API token first.' };
  }
  var me = l10JiraFetch_(s, 'get', '/myself');
  if (!(me.code >= 200 && me.code < 300) || !me.json) {
    return { ok: false, error: 'Auth failed (' + me.code + '). Check JIRA_DOMAIN, JIRA_EMAIL and the token.\n' + String(me.text).slice(0, 180) };
  }
  var proj = l10JiraFetch_(s, 'get', '/project/search?maxResults=50');
  var keys = [];
  if (proj.json && proj.json.values) {
    keys = proj.json.values.map(function (p) { return p.key + ' (' + p.name + ')'; });
  }
  return { ok: true, user: me.json.displayName || me.json.emailAddress, projects: keys, project: s.project };
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

function l10InstallJiraTrigger() {
  l10RemoveJiraTrigger();
  ScriptApp.newTrigger('l10JiraSyncTodos').timeBased().everyMinutes(10).create();
}

function l10RemoveJiraTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'l10JiraSyncTodos') ScriptApp.deleteTrigger(t);
  });
}

// ---------------------------------------------------------------------------
// Menu wrappers (referenced by name from l10BuildMenu in L10Setup.gs)
// ---------------------------------------------------------------------------

function l10MenuSetJiraToken() {
  var ui = SpreadsheetApp.getUi();
  var has = !!l10JiraToken_();
  var who = String(l10Config_().JIRA_EMAIL || '').trim() || 'your Jira account';
  var resp = ui.prompt('Jira API token',
    'Paste the Atlassian API token for ' + who + '.\n' +
    'Create one at id.atlassian.com → Security → API tokens.\n' +
    'Stored in script properties, never in the sheet.' +
    (has ? '\n\n(A token is already set — paste to replace, or leave blank to clear.)' : ''),
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var tok = String(resp.getResponseText() || '').trim();
  PropertiesService.getScriptProperties().setProperty(L10_JIRA_TOKEN_PROP, tok);
  ui.alert(tok ? 'Token saved. Now run Jira → Test connection.' : 'Token cleared — Jira sync is now off.');
}

function l10MenuTestJira() {
  var ui = SpreadsheetApp.getUi();
  var r = l10JiraTestConnection_();
  if (!r.ok) { ui.alert('Jira test failed:\n\n' + r.error); return; }
  var inList = r.projects && r.projects.some(function (p) { return p.indexOf(r.project + ' (') === 0; });
  ui.alert('Connected as ' + r.user + '.\n\n' +
    'Configured project key: ' + (r.project || '(none — set JIRA_PROJECT_KEY)') +
    (r.project ? (inList ? '  ✓ found' : '  ⚠ not in your accessible list below') : '') + '\n\n' +
    'Accessible projects:\n' + (r.projects && r.projects.length ? r.projects.join('\n') : '(none returned)'));
}

function l10MenuSyncJiraNow() {
  var ui = SpreadsheetApp.getUi();
  var r = l10JiraSyncTodos();
  if (!r.ok) { ui.alert((r.halted ? 'Sync stopped: ' : 'Sync not run: ') + (r.error || 'unknown')); return; }
  ui.alert('Jira sync complete.\n\nCreated: ' + r.created + '\nLinked to existing issues: ' + r.adopted +
    '\nClosed: ' + r.closed + '\nErrors: ' + r.errors +
    (r.errors ? '\n\nRows with errors show "ERR: …" in the Jira Key column — they retry next sync.' : '') +
    (r.dupIds && r.dupIds.length
      ? '\n\nDuplicate to-do id(s) in ' + L10.TABS.TODOS + ' (only the first row of each is synced): ' + r.dupIds.join(', ')
      : '') +
    (r.headerWarn ? '\n\nHeader check: ' + r.headerWarn : ''));
}

function l10MenuJiraBackfillAssignees() {
  var ui = SpreadsheetApp.getUi();
  var r = l10JiraBackfillAssignees();
  if (!r.ok) { ui.alert('Backfill not run: ' + (r.error || 'unknown')); return; }
  ui.alert('Assignee backfill complete.\n\n' +
    'Assigned: ' + r.assigned + '\n' +
    'Already assigned (left alone): ' + r.already + '\n' +
    'Closed to-dos skipped: ' + r.closedSkipped + '\n' +
    'Errors: ' + r.errors +
    (r.unresolvedOwners && r.unresolvedOwners.length
      ? '\n\nOwners with no Jira match (still unassigned): ' + r.unresolvedOwners.join(', ') +
        '\nFix via TEAM_EMAILS or JIRA_USER_MAP in L10_Config, then run this again.'
      : ''));
}

// Read-only audit of the board: every unresolved issue in the project that
// carries a huddle ref (label or the description line), grouped by to-do id.
// A ref on more than one issue is a duplicate set; the sheet's key (or, when
// the sheet holds none, the oldest — the one the next sync will link) is the
// keeper and the rest are listed for a person to delete or close in Jira.
// Nothing is changed anywhere. Menu: Jira ▸ Find duplicate issues.
function l10JiraDuplicateReport() {
  var s = l10JiraSettings_();
  if (!l10JiraEnabled_(s)) return { ok: false, error: 'not configured' };
  var jql = 'project = "' + s.project + '" AND statusCategory != "Done" AND description ~ "Huddle ref" ORDER BY created ASC';
  var byRef = {}, token = '', pages = 0;
  do {
    var path = '/search/jql?jql=' + encodeURIComponent(jql) + '&maxResults=100&fields=' +
        encodeURIComponent('summary,description,labels,created') + (token ? '&nextPageToken=' + encodeURIComponent(token) : '');
    var r = l10JiraFetch_(s, 'get', path);
    if (!(r.code >= 200 && r.code < 300) || !r.json || !r.json.issues) return { ok: false, error: 'search ' + l10JiraErr_(r) };
    r.json.issues.forEach(function (iss) {
      var f = iss.fields || {}, ref = '';
      (f.labels || []).forEach(function (l) {
        var m = String(l).match(/^huddle-(td-\d+)$/i);
        if (m) ref = m[1].toUpperCase();
      });
      if (!ref) {
        var m2 = l10JiraAdfText_(f.description).match(/ref:\s*(TD-\d+)/i);
        if (m2) ref = m2[1].toUpperCase();
      }
      if (!ref) return;
      (byRef[ref] = byRef[ref] || []).push({ key: iss.key, created: String(f.created || '').slice(0, 19) });
    });
    token = r.json.nextPageToken || '';
    pages++;
  } while (token && pages < 10);
  var sheetKey = {};
  l10ReadTab_(L10.TABS.TODOS).rows.forEach(function (t) {
    var k = String(t[L10_JIRA_KEY_COL] || '').trim();
    if (L10_JIRA_KEY_RE.test(k)) sheetKey[String(t['ID'] || '').trim()] = k;
  });
  var groups = [];
  Object.keys(byRef).sort().forEach(function (ref) {
    var list = byRef[ref];
    if (list.length < 2) return;
    list.sort(function (a, b) { return a.created < b.created ? -1 : a.created > b.created ? 1 : 0; });
    var linked = sheetKey[ref] || '';
    var keep = linked || list[0].key;
    groups.push({ ref: ref, linked: linked, keep: keep,
      extras: list.filter(function (x) { return x.key !== keep; }).map(function (x) { return x.key; }) });
  });
  try { Logger.log(JSON.stringify({ refs: Object.keys(byRef).length, groups: groups })); } catch (e) {}
  return { ok: true, groups: groups, refs: Object.keys(byRef).length };
}

function l10MenuJiraDuplicateReport() {
  var ui = SpreadsheetApp.getUi();
  var r = l10JiraDuplicateReport();
  if (!r.ok) { ui.alert('Duplicate check not run: ' + (r.error || 'unknown')); return; }
  if (!r.groups.length) {
    ui.alert('No duplicate Jira issues found — each of the ' + r.refs + ' huddle ref(s) on the board is on one unresolved issue.');
    return;
  }
  var lines = r.groups.slice(0, 40).map(function (g) {
    return g.ref + ': keep ' + g.keep + (g.linked ? ' (the sheet\'s key)' : ' (oldest; the sheet holds no key — the next sync links it)') +
        ' · extra: ' + g.extras.join(', ');
  });
  ui.alert('Duplicate Jira issues — ' + r.groups.length + ' to-do' + (r.groups.length === 1 ? '' : 's') + ' affected\n\n' +
    lines.join('\n') + (r.groups.length > 40 ? '\n… +' + (r.groups.length - 40) + ' more (see the execution log)' : '') +
    '\n\nNothing was changed. Delete or close the extra issues in Jira by hand; the kept key is the one the huddle keeps updating.');
}

function l10MenuInstallJiraTrigger() {
  l10InstallJiraTrigger();
  SpreadsheetApp.getUi().alert('Auto-sync on: open to-dos push to Jira every 10 minutes, and completing one closes its Jira issue on the next run.');
}

function l10MenuRemoveJiraTrigger() {
  l10RemoveJiraTrigger();
  SpreadsheetApp.getUi().alert('Auto-sync off. Use Jira → Sync now to push manually.');
}

// Settings-page token setter (the menu item uses ui.prompt; the dialog posts
// here instead). Blank clears. The token only ever lives in script properties.
function l10_setJiraToken(token) {
  var t = String(token || '').trim();
  var props = PropertiesService.getScriptProperties();
  if (t) props.setProperty(L10_JIRA_TOKEN_PROP, t);
  else props.deleteProperty(L10_JIRA_TOKEN_PROP);
  return { ok: true, set: !!t };
}

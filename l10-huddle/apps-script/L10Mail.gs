// Level 10 Huddle — email automation. Three pieces:
//   1. l10SendMondayHeadsup()  — a personalized "heads-up for tomorrow" to each
//      team member the day before the huddle: their open to-dos + rocks due, and
//      an ask to reply with issues/headlines/rocks for the agenda.
//   2. l10ProcessMailReplies() — scans Gmail for replies to that email and adds
//      each labeled line to the huddle (Issue:/Headline:/Rock:, unlabeled reply
//      => one Issue), with the sender's name and a "via email" flag.
//   3. l10SendTuesdayRecap()   — emails the team the recap after the huddle.
//
// All globals are l10-prefixed: this project is shared with other bound scripts.
// Reuses the helpers in L10Code.gs (l10Config_, l10ReadTab_, date helpers,
// l10_addIssue/_addHeadline/_addRock/_addTodo) and the schema in L10Setup.gs.
//
// SETUP (one time):
//   1. Run l10Setup() (adds the email config rows to L10_Config).
//   2. In L10_Config, fill TEAM_EMAILS with "Name=email" pairs (the owner names
//      must match the Owner column used on rocks/to-dos, e.g. Alex/Courtney/Scott/CJ).
//   3. Run l10InstallMailTriggers() once (or menu: L10 Huddle -> Email: install).
//      That schedules: heads-up the day before HUDDLE_DAY (~7am), recap on
//      HUDDLE_DAY (~5pm), and an hourly reply sweep.
// Quotas: ~100 recipients/day on a consumer account, ~1,500/day on Workspace.

var L10_MAIL = {
  HEADSUP_SUBJECT: '[L10] Heads-up — reply with issues, headlines & rocks',
  HEADSUP_SUBJECT_STUART: '[L10] Heads-up — anything you’d like the team to cover Tuesday?',
  HEADSUP_TAG: 'Heads-up',          // subject token the reply sweep matches on (both subjects carry it)
  PROCESSED_PROP: 'L10_MAIL_PROCESSED',   // CSV of Gmail message ids already ingested
  LAST_RECAP_PROP: 'L10_MAIL_LAST_RECAP', // meeting id of the last emailed team recap
  LAST_STUART_PROP: 'L10_MAIL_LAST_STUART', // meeting id of the last emailed manager recap
  // Brand + semantic palette — the same values the app and the new-member guide
  // use, so the recap, the app, and the guide read as one product.
  BLUE: '#0a58c4', DEEP: '#043f8d', TINT: '#eaf1fb',
  INK: '#101828', MUTED: '#475467', LINE: '#eaecf0',
  GOOD: '#15803d', GOOD_BG: '#ecfdf3', BAD: '#dc2626', BAD_BG: '#fef3f2'
};

// Built-in team roster — used when TEAM_EMAILS in L10_Config is blank, so the
// emails work with zero sheet setup. The name on each pair must match the Owner
// column on rocks/to-dos (Alex / Courtney / Scott / CJ). When someone joins or
// leaves, edit THIS line (or set TEAM_EMAILS in L10_Config to override it).
var L10_MAIL_TEAM_DEFAULT =
  'Alex=alex_langton@bradycorp.com, ' +
  'Courtney=courtney_hamilton@bradycorp.com, ' +
  'Scott=scott_palmersheim@bradycorp.com, ' +
  'CJ=conrad_weissenberger@bradycorp.com';

// Manager-recap recipient (Stuart) — used when STUART_EMAIL in L10_Config is blank.
var L10_MAIL_STUART_DEFAULT = 'stuart_mackay@bradycorp.com';

// Built-in weekly 1:1 schedule — "Name:Weekday[:manager]". Each pack is emailed to
// Alex the morning of that 1:1. "manager" marks an upward 1:1 (Stuart is Alex's
// boss) which gets a prep-to-report-up pack. Overridable via ONE_ON_ONES in L10_Config.
var L10_MAIL_ONE_ON_ONES_DEFAULT = 'Courtney:Wed, CJ:Wed, Scott:Fri, Stuart:Thu:manager';

// ---------------------------------------------------------------------------
// Roster / small helpers
// ---------------------------------------------------------------------------

// Roster lookups. Uses TEAM_EMAILS from L10_Config if set, else the built-in
// L10_MAIL_TEAM_DEFAULT — so the emails work out of the box.
function l10MailRoster_(config) {
  var byEmail = {}, list = [], byName = {};
  var raw = String((config && config.TEAM_EMAILS) || '').trim() || L10_MAIL_TEAM_DEFAULT;
  raw.split(',').forEach(function (pair) {
    var kv = pair.split('=');
    if (kv.length === 2) {
      var name = kv[0].trim(), email = kv[1].trim().toLowerCase();
      if (name && email) {
        var p = { name: name, email: email };
        list.push(p); byEmail[email] = name; byName[name.toLowerCase()] = p;
      }
    }
  });
  return { list: list, byEmail: byEmail, byName: byName };
}

function l10MailParseFrom_(from) {
  var m = String(from || '').match(/<([^>]+)>/);
  var email = (m ? m[1] : String(from || '')).trim().toLowerCase();
  var name = String(from || '').replace(/<[^>]*>/, '').replace(/"/g, '').trim();
  return { email: email, name: name };
}

function l10MailEsc_(s) {
  return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Map a HUDDLE_DAY name to the trigger weekday + the day before it (for the
// heads-up) plus display labels. Defaults to Tuesday.
function l10MailDay_(name) {
  var W = ScriptApp.WeekDay;
  var order = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  var wd = [W.SUNDAY, W.MONDAY, W.TUESDAY, W.WEDNESDAY, W.THURSDAY, W.FRIDAY, W.SATURDAY];
  var key = String(name || 'tuesday').trim().toLowerCase();
  var idx = order.indexOf(key);
  if (idx === -1) { key = 'tuesday'; idx = 2; }
  var prev = (idx + 6) % 7;
  var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
  return { day: wd[idx], dayLabel: cap(key), prev: wd[prev], prevLabel: cap(order[prev]) };
}

function l10MailToast_(msg, title) {
  try { SpreadsheetApp.getActive().toast(msg, title || 'L10 Email', 6); }
  catch (e) { Logger.log((title || 'L10 Email') + ': ' + msg); }
}
function l10MailWarn_(msg) { l10MailToast_(msg, 'L10 Email — check'); Logger.log('L10 Email: ' + msg); }

// ---------------------------------------------------------------------------
// 1) Monday heads-up (personalized per person)
// ---------------------------------------------------------------------------

function l10MailContext_() {
  var today = l10Today_();
  var c = new Date(today + 'T12:00:00'); c.setDate(c.getDate() + 7);
  return {
    today: today,
    dueCutoff: l10Fmt_(c, 'yyyy-MM-dd'),          // this week + overdue
    todos: l10ReadTab_(L10.TABS.TODOS).rows,
    rocks: l10ReadTab_(L10.TABS.ROCKS).rows,
    milestones: l10ReadTab_(L10.TABS.MILESTONES).rows
  };
}

function l10MailDueFor_(person, ctx) {
  var nameLc = person.name.toLowerCase();

  // l10TodoOpen_ (Code.gs), not Status === 'OPEN' — a to-do someone has started
  // or is blocked on is still due, and must not drop out of their heads-up.
  var todos = ctx.todos.filter(function (t) {
    return String(t['Owner']).trim().toLowerCase() === nameLc
        && l10TodoOpen_(t['Status']);
  }).map(function (t) {
    return { id: String(t['ID']), text: String(t['To-Do']), due: l10DateStr_(t['Due']) };
  }).filter(function (t) { return t.due && t.due <= ctx.dueCutoff; })
    .sort(function (a, b) { return a.due < b.due ? -1 : 1; });

  var rocks = ctx.rocks.filter(function (r) {
    return String(r['Owner']).trim().toLowerCase() === nameLc
        && ['ON TRACK', 'OFF TRACK'].indexOf(String(r['Status']).toUpperCase()) !== -1;
  }).map(function (r) {
    var id = String(r['ID']);
    var openMs = ctx.milestones.filter(function (m) {
      return String(m['Rock ID']).trim() === id && String(m['Status']).toUpperCase() === 'OPEN';
    }).map(function (m) { return { text: String(m['Milestone']), due: l10DateStr_(m['Due']) }; })
      .sort(function (a, b) { return a.due < b.due ? -1 : 1; });
    return {
      id: id, text: String(r['Rock']), status: String(r['Status']).toUpperCase(),
      due: l10DateStr_(r['Due']), fq: l10FiscalQuarterOf_(l10DateStr_(r['Due'])),
      nextMs: openMs.length ? openMs[0] : null,
      dueThisWeek: openMs.filter(function (m) { return m.due && m.due <= ctx.dueCutoff; })
    };
  });

  return { todos: todos, rocks: rocks };
}

// Shared section markup — the personalized to-do list and rock cards. BOTH the
// day-before heads-up and a custom digest render these, so the two stay identical
// (one source of truth). `todos`/`rocks` are the arrays from l10MailDueFor_.
function l10MailTodoListHtml_(todos) {
  var M = L10_MAIL, esc = l10MailEsc_, today = l10Today_();
  function badge(t, bg, fg) {
    return '<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:700;background:' + bg + ';color:' + fg + ';">' + esc(t) + '</span>';
  }
  function odue(d) { return d && d < today ? ' ' + badge('overdue', '#fef3f2', '#dc2626') : ''; }
  return todos.length
    ? '<ul style="margin:6px 0 0;padding-left:18px;">' + todos.map(function (t) {
        return '<li style="margin:4px 0;color:' + M.INK + ';font-size:14px;">' + esc(t.text) +
          ' <span style="color:' + M.MUTED + ';font-size:12px;">(due ' + esc(t.due) + ')</span>' + odue(t.due) + '</li>';
      }).join('') + '</ul>'
    : '<p style="margin:6px 0 0;color:' + M.MUTED + ';font-size:14px;">Nothing due this week — nice.</p>';
}

function l10MailRockListHtml_(rocks) {
  var M = L10_MAIL, esc = l10MailEsc_, today = l10Today_();
  function badge(t, bg, fg) {
    return '<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:700;background:' + bg + ';color:' + fg + ';">' + esc(t) + '</span>';
  }
  function odue(d) { return d && d < today ? ' ' + badge('overdue', '#fef3f2', '#dc2626') : ''; }
  return rocks.length
    ? rocks.map(function (r) {
        var ms = '';
        if (r.dueThisWeek.length) {
          ms = '<div style="margin-top:4px;color:' + M.INK + ';font-size:13px;">Milestones due this week: ' +
            r.dueThisWeek.map(function (m) { return esc(m.text) + ' <span style="color:' + M.MUTED + ';">(' + esc(m.due) + ')</span>' + odue(m.due); }).join('; ') + '</div>';
        } else if (r.nextMs) {
          ms = '<div style="margin-top:4px;color:' + M.MUTED + ';font-size:13px;">Next milestone: ' + esc(r.nextMs.text) + ' (' + esc(r.nextMs.due) + ')</div>';
        }
        var sb = r.status === 'OFF TRACK' ? badge('OFF TRACK', '#fef3f2', '#dc2626') : badge('ON TRACK', '#ecfdf3', '#15803d');
        var fq = r.fq ? ' <span style="color:' + M.MUTED + ';font-size:12px;">· ' + esc(r.fq) + '</span>' : '';
        return '<div style="margin:8px 0;padding:10px 12px;border:1px solid ' + M.LINE + ';border-radius:8px;">' +
          '<div style="font-weight:600;color:' + M.INK + ';font-size:14px;">' + esc(r.text) + '</div>' +
          '<div style="margin-top:3px;">' + sb + fq + '</div>' + ms + '</div>';
      }).join('')
    : '<p style="margin:6px 0 0;color:' + M.MUTED + ';font-size:14px;">No active rocks assigned to you.</p>';
}

function l10SendMondayHeadsup() {
  var config = l10Config_();
  var roster = l10MailRoster_(config);
  if (!roster.list.length) {
    l10MailWarn_('TEAM_EMAILS is empty in L10_Config — add "Name=email" pairs, then re-run.');
    return { ok: false, error: 'TEAM_EMAILS empty' };
  }
  var ctx = l10MailContext_();
  var dayInfo = l10MailDay_(config.HUDDLE_DAY);
  var meetingName = String(config.MEETING_NAME || 'Paid Media L10 Huddle');
  var fromName = String(config.EMAIL_FROM_NAME || 'Paid Media L10');
  var prefs = l10NotifyPrefs_();
  var sent = 0, skipped = 0;
  roster.list.forEach(function (p) {
    // Per-analyst opt-out (Settings -> Notifications). Default is on.
    if (!l10NotifyPrefFor_(p.name, prefs).headsup) { skipped++; return; }
    var html = l10MailHeadsupHtml_(p, l10MailDueFor_(p, ctx), dayInfo, meetingName);
    MailApp.sendEmail({ to: p.email, subject: L10_MAIL.HEADSUP_SUBJECT, htmlBody: html, name: fromName });
    sent++;
  });
  return { ok: true, sent: sent, skipped: skipped };
}

function l10MailHeadsupHtml_(p, due, dayInfo, meetingName) {
  var M = L10_MAIL, esc = l10MailEsc_;
  function head(t) {
    return '<div style="font-weight:700;color:' + M.DEEP + ';font-size:14px;border-bottom:2px solid ' + M.TINT + ';padding-bottom:4px;margin-top:16px;">' + t + '</div>';
  }

  var todoHtml = l10MailTodoListHtml_(due.todos);
  var rockHtml = l10MailRockListHtml_(due.rocks);

  var ask =
    '<div style="margin-top:18px;padding:14px 16px;background:' + M.TINT + ';border-radius:8px;">' +
      '<div style="font-weight:700;color:' + M.DEEP + ';font-size:14px;">Add to tomorrow’s agenda — just reply to this email</div>' +
      '<p style="margin:8px 0 4px;color:' + M.INK + ';font-size:13px;line-height:1.5;">Start each line with a label and it lands in the huddle automatically, with your name on it:</p>' +
      '<ul style="margin:4px 0 0;padding-left:18px;color:' + M.INK + ';font-size:13px;line-height:1.6;">' +
        '<li><b>Issue:</b> something for the team to solve</li>' +
        '<li><b>Headline:</b> a customer / employee / kudos FYI</li>' +
        '<li><b>Rock:</b> a quarterly priority to propose</li>' +
      '</ul>' +
      '<p style="margin:8px 0 0;color:' + M.MUTED + ';font-size:12px;">No label? Your whole reply is added as one issue. One line per item; add as many as you like.</p>' +
    '</div>';

  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:' + M.INK + ';">' +
    '<div style="background:' + M.BLUE + ';color:#fff;padding:16px 18px;border-radius:8px 8px 0 0;">' +
      '<div style="font-size:18px;font-weight:700;">Heads-up for tomorrow’s huddle</div>' +
      '<div style="font-size:13px;opacity:.9;margin-top:2px;">' + esc(meetingName) + ' · ' + esc(dayInfo.dayLabel) + '</div>' +
    '</div>' +
    '<div style="border:1px solid ' + M.LINE + ';border-top:none;padding:18px;border-radius:0 0 8px 8px;">' +
      '<p style="margin:0 0 4px;font-size:15px;">Hi ' + esc(p.name) + ',</p>' +
      '<p style="margin:0 0 14px;color:' + M.MUTED + ';font-size:13px;">A quick look at what’s on your plate before we meet.</p>' +
      head('Your open to-dos') + todoHtml +
      head('Your rocks') + rockHtml +
      ask +
    '</div></div>';
}

// ---------------------------------------------------------------------------
// 2) Reply ingest
// ---------------------------------------------------------------------------

function l10ProcessMailReplies() {
  var config = l10Config_();
  var roster = l10MailRoster_(config);
  var ownerEmail = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  var stuartEmail = (String(config.STUART_EMAIL || '').trim() || L10_MAIL_STUART_DEFAULT).toLowerCase();
  var props = PropertiesService.getScriptProperties();
  var processed = l10MailProcessedSet_(props);
  var added = [];

  var threads = [];
  try { threads = GmailApp.search('subject:L10 newer_than:8d', 0, 50); }
  catch (e) { return { ok: false, error: 'Gmail search failed: ' + String(e).slice(0, 120) }; }

  threads.forEach(function (thread) {
    if (String(thread.getFirstMessageSubject() || '').indexOf(L10_MAIL.HEADSUP_TAG) === -1) return;
    thread.getMessages().forEach(function (msg) {
      var mid = msg.getId();
      if (processed[mid]) return;
      var from = l10MailParseFrom_(msg.getFrom());
      var isReply = /^\s*re:/i.test(String(msg.getSubject() || ''));

      // Skip our OWN outbound heads-up (it carries example "Issue:"/"Headline:"/
      // "Rock:" lines that must NOT be ingested), identified as an owner-sent
      // message that is not a "Re:". Mark it processed so we never look again.
      if (from.email && from.email === ownerEmail && !isReply) { processed[mid] = 1; return; }

      // No attributable sender yet — leave it for a later sweep rather than
      // burning it. (Marking "seen no matter what" *before* these checks is what
      // could silently drop a genuine reply: a transient skip became permanent.)
      if (!from.email) return;

      var who = roster.byEmail[from.email] || (from.email === stuartEmail ? 'Stuart' : (from.name || from.email));
      var msgAdded = [];
      l10MailParseReply_(msg.getPlainBody()).forEach(function (it) {
        var res = l10MailIngest_(it, who);
        if (res && res.ok) { var rec = { kind: it.kind, id: res.id, by: who, text: it.text }; msgAdded.push(rec); added.push(rec); }
      });
      processed[mid] = 1;   // handled this reply — safe not to reprocess it
      // Confirm back to the sender (Stuart or a teammate) exactly what landed.
      if (msgAdded.length) l10MailConfirmSender_(config, from.email, who, msgAdded);
    });
  });

  l10MailSaveProcessed_(props, processed);
  if (added.length) l10MailNotifyOwner_(config, added);
  return { ok: true, added: added.length, items: added };
}

// Strip the quoted original, then read labeled lines. Tolerant of pasted-template
// formatting: leading bullets ("- ", "* ", "1.") and markdown bold (*Issue:*). If a
// reply has no labels at all, the whole substantive body becomes one issue.
function l10MailParseReply_(body) {
  var text = l10MailStripQuote_(String(body || ''));
  var labeled = [], unlabeled = [];
  text.split(/\r?\n/).forEach(function (raw) {
    // Drop a leading list marker (-, *, •, 1., etc.), then trim.
    var ln = raw.replace(/^\s*(?:[-*•·–]|\d+[.)])\s+/, '').trim();
    if (!ln) return;
    // Label may be wrapped in markdown bold and the colon may sit inside it:
    // "*Issue:*", "*Issue: *", "**Rock** -", etc.
    var m = ln.match(/^\*{0,2}\s*(issue|headline|rock|to-?do|todo)\s*\*{0,2}\s*[:\-–—]\s*(.+)$/i);
    if (m) {
      var t = m[2].replace(/^\*+|\*+$/g, '').trim();
      if (t) labeled.push({ kind: l10MailKind_(m[1]), text: t });
    } else if (!l10MailIsNoise_(ln)) {
      unlabeled.push(ln.replace(/^\*+|\*+$/g, '').trim());
    }
  });
  if (labeled.length) return labeled;
  var joined = unlabeled.join(' ').trim();
  return joined ? [{ kind: 'issue', text: joined.slice(0, 500) }] : [];
}

// Cut the reply body at the first sign of the quoted original — handles the
// "On <date> … <email> wrote:" header whether it's on its own line or trailing,
// plus ">" quotes, "From:" headers, and "Original Message" dividers.
function l10MailStripQuote_(text) {
  var cut = text.length;
  [
    /\bOn\s.{0,200}?\bwrote:/,          // Gmail attribution, anywhere (incl. trailing)
    /\r?\n\s*-{2,}\s*Original Message/i,
    /\r?\n\s*From:\s.+/,
    /\r?\n\s*>/                          // first quoted line
  ].forEach(function (re) {
    var m = text.match(re);
    if (m && m.index < cut) cut = m.index;
  });
  return text.slice(0, cut);
}

function l10MailKind_(label) {
  var s = String(label).toLowerCase().replace(/[\s-]/g, '');
  if (s === 'headline') return 'headline';
  if (s === 'rock') return 'rock';
  if (s === 'todo') return 'todo';
  return 'issue';
}

function l10MailIsNoise_(line) {
  var s = String(line).trim();
  if (s.length < 4) return true;
  if (/^(hi|hey|hello|thanks|thank you|thx|cheers|best|regards|br|sincerely|sent from my|get outlook)\b/i.test(s)) return true;
  if (/^[-–—_=]{2,}$/.test(s)) return true;
  return false;
}

function l10MailIngest_(item, who) {
  var tag = 'Added via email reply from ' + who + ' on ' + l10Today_() + '.';
  switch (item.kind) {
    case 'headline':
      var htype = /kudos|shout\s?out|congrat|nice (job|work)|great (job|work)/i.test(item.text) ? 'Kudos' : 'FYI';
      return l10_addHeadline({ text: item.text, type: htype, by: who + ' (via email)' });
    case 'rock':
      return l10_addRock({ title: item.text, owner: who, notes: tag });
    case 'todo':
      return l10_addTodo({ text: item.text, owner: who, source: 'EMAIL', notes: tag });
    default:
      return l10_addIssue({ text: item.text, by: who, notes: tag });
  }
}

function l10MailProcessedSet_(props) {
  var set = {};
  String(props.getProperty(L10_MAIL.PROCESSED_PROP) || '').split(',').forEach(function (id) {
    if (id) set[id] = 1;
  });
  return set;
}
function l10MailSaveProcessed_(props, set) {
  var ids = Object.keys(set);
  if (ids.length > 800) ids = ids.slice(ids.length - 800);   // cap growth
  props.setProperty(L10_MAIL.PROCESSED_PROP, ids.join(','));
}

function l10MailNotifyOwner_(config, added) {
  var roster = l10MailRoster_(config);
  var to = (roster.byName['alex'] && roster.byName['alex'].email) || Session.getActiveUser().getEmail();
  if (!to) return;
  var counts = {};
  added.forEach(function (a) { counts[a.kind] = (counts[a.kind] || 0) + 1; });
  var summary = Object.keys(counts).map(function (k) { return counts[k] + ' ' + k + (counts[k] > 1 ? 's' : ''); }).join(', ');
  var li = added.map(function (a) {
    return '<li>' + l10MailEsc_(a.id) + ' — ' + l10MailEsc_(a.kind) + ' (from ' + l10MailEsc_(a.by) + ')</li>';
  }).join('');
  MailApp.sendEmail({
    to: to,
    subject: '[L10] ' + added.length + ' item(s) added from email replies',
    htmlBody: '<p>' + l10MailEsc_(summary) + ' added to the huddle from email replies (flagged “via email”). Review or trim before the huddle:</p><ul>' + li + '</ul>',
    name: String(config.EMAIL_FROM_NAME || 'Paid Media L10')
  });
}

function l10MailKindLabel_(kind) {
  return { issue: 'Issue', headline: 'Headline', rock: 'Rock', todo: 'To-do' }[kind] || 'Issue';
}

// Confirmation back to whoever emailed in (Stuart or a teammate): "got it —
// here's exactly what was added." Its subject has no Heads-up tag, so a reply to
// it is never swept back in (no loop).
function l10MailConfirmSender_(config, toEmail, who, items) {
  if (!toEmail || !items.length) return;
  var M = L10_MAIL, esc = l10MailEsc_;
  var dayInfo = l10MailDay_(config.HUDDLE_DAY);
  var counts = {};
  items.forEach(function (a) { counts[a.kind] = (counts[a.kind] || 0) + 1; });
  var summary = Object.keys(counts).map(function (k) { return counts[k] + ' ' + l10MailKindLabel_(k).toLowerCase() + (counts[k] > 1 ? 's' : ''); }).join(', ');
  var li = items.map(function (a) {
    return '<li style="margin:4px 0;font-size:13.5px;color:' + M.INK + ';"><b>' + esc(l10MailKindLabel_(a.kind)) + ':</b> ' + esc(a.text) + '</li>';
  }).join('');
  MailApp.sendEmail({
    to: toEmail,
    subject: 'Got it — added to ' + dayInfo.dayLabel + '’s huddle',
    htmlBody: '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:' + M.INK + ';">' +
      '<div style="background:' + M.BLUE + ';color:#fff;padding:13px 16px;border-radius:8px 8px 0 0;font-size:16px;font-weight:700;">Added to the huddle ✓</div>' +
      '<div style="border:1px solid ' + M.LINE + ';border-top:none;padding:16px;border-radius:0 0 8px 8px;">' +
        '<p style="margin:0 0 8px;font-size:13.5px;">Thanks ' + esc(who) + ' — your reply was added automatically to the ' + esc(dayInfo.dayLabel) + ' agenda (' + esc(summary) + '):</p>' +
        '<ul style="margin:0;padding-left:18px;">' + li + '</ul>' +
        '<p style="margin:10px 0 0;color:' + M.MUTED + ';font-size:12px;">Reply again any time before the huddle to add more. Nothing else you need to do.</p>' +
      '</div></div>',
    name: String(config.EMAIL_FROM_NAME || 'Paid Media L10')
  });
}

// ---------------------------------------------------------------------------
// 3) Recap email
// ---------------------------------------------------------------------------

// force=true (menu) sends the latest concluded meeting's recap regardless of
// date / prior send. The trigger calls it with no arg, so it only fires for a
// huddle concluded TODAY and never double-sends.
function l10SendTuesdayRecap(force) {
  var config = l10Config_();
  var roster = l10MailRoster_(config);

  var meetingsAll = l10ReadTab_(L10.TABS.MEETINGS).rows;
  var concluded = meetingsAll.filter(function (m) {
    return String(m['Status']).toUpperCase() === 'CONCLUDED';
  });
  if (!concluded.length) return { ok: false, error: 'No concluded meeting to recap.' };
  var meeting = concluded[concluded.length - 1];
  var mid = String(meeting['ID']);
  var concludedDate = l10DateStr_(meeting['Concluded At']) || l10DateStr_(meeting['Date']);

  // Recipients: team members whose per-analyst recap cadence fires THIS huddle
  // (Settings -> Notifications), plus any explicit RECAP_TO addresses (always sent,
  // regardless of cadence — that list is for people like the manager).
  var prefs = l10NotifyPrefs_();
  var extra = String(config.RECAP_TO || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  var seen = {}, recipients = [], skipped = 0;
  roster.list.forEach(function (p) {
    if (!l10RecapDueFor_(l10NotifyPrefFor_(p.name, prefs).recap, concludedDate, meetingsAll)) { skipped++; return; }
    var k = p.email.toLowerCase();
    if (p.email && !seen[k]) { seen[k] = 1; recipients.push(p.email); }
  });
  extra.forEach(function (e) { var k = e.toLowerCase(); if (e && !seen[k]) { seen[k] = 1; recipients.push(e); } });
  if (!recipients.length) {
    l10MailWarn_('Recap has no recipients this week — everyone on the roster has this huddle off in their notification cadence (or TEAM_EMAILS is empty).');
    return { ok: false, error: 'no recipients this cadence', skipped: skipped };
  }

  if (!force && concludedDate !== l10Today_()) return { ok: false, error: 'No huddle concluded today — recap skipped.' };
  var props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty(L10_MAIL.LAST_RECAP_PROP) === mid) return { ok: false, error: 'Recap for ' + mid + ' already sent.' };

  MailApp.sendEmail({
    to: recipients.join(','),
    subject: 'Paid Media L10 Recap — ' + l10DateStr_(meeting['Date']),
    htmlBody: l10MailRecapHtml_(meeting, config),
    name: String(config.EMAIL_FROM_NAME || 'Paid Media L10')
  });
  props.setProperty(L10_MAIL.LAST_RECAP_PROP, mid);
  return { ok: true, meeting: mid, recipients: recipients.length, skipped: skipped };
}

function l10MailRecapHtml_(meeting, config) {
  var M = L10_MAIL, esc = l10MailEsc_;
  var mid = String(meeting['ID']);
  var date = l10DateStr_(meeting['Date']);
  var meetingName = String(config.MEETING_NAME || 'Paid Media L10 Huddle');

  // Optional human summary the team wrote at Conclude (the room's TL;DR), shown
  // above the structured sections. Never the Cascade field — that's Alex's Meta
  // Monday talking points, with blanks.
  var recapText = String(meeting['Recap'] || '').trim();
  var summaryHtml = recapText
    ? l10MailSect_('Summary') + '<div style="white-space:pre-wrap;font-size:13.5px;color:' + M.INK + ';line-height:1.55;">' + esc(recapText) + '</div>'
    : '';

  var stats = [];
  var pct = meeting['Todo Done %'];
  if (pct !== '' && pct !== undefined && pct !== null) stats.push('To-dos done: ' + esc(pct) + '%');
  if (String(meeting['Issues Solved']) !== '') stats.push('Issues solved: ' + esc(meeting['Issues Solved']));
  if (String(meeting['Rating Avg']) !== '') stats.push('Avg rating: ' + esc(meeting['Rating Avg']) + '/10');
  var statsHtml = stats.length
    ? '<div style="margin-top:18px;padding-top:10px;border-top:1px solid ' + M.LINE + ';color:' + M.MUTED + ';font-size:12.5px;">' + stats.join(' &nbsp;·&nbsp; ') + '</div>'
    : '';

  var inner =
    l10MailRecapHeader_(meetingName + ' — Recap', esc(date), config) +
    '<div style="padding:18px 20px;">' +
      '<p style="margin:0;color:' + M.MUTED + ';font-size:13px;">This week’s huddle at a glance — scorecard, rocks, what we solved, and the open to-dos.</p>' +
      summaryHtml +
      l10MailSect_('Scorecard') + l10MailScorecardHtml_() +
      l10MailSect_('Rocks (quarterly priorities)') + l10MailRocksHtml_() +
      l10MailSect_('What we solved') + l10MailSolvedHtml_(mid) +
      l10MailSect_('To-dos') + l10MailOpenTodosHtml_(meeting) +
      l10MailSect_('Headlines') + l10MailHeadlinesHtml_() +
      statsHtml +
    '</div>';
  return l10MailDoc_(inner, { preheader: l10MailPreheader_(), title: meetingName + ' — Recap' });
}

// ---------------------------------------------------------------------------
// Shared recap building blocks — used by BOTH the team recap and the manager
// recap so the two stay identical in quality. Pure HTML builders; each reads its
// own tabs. Keep these the single source of a section's markup.
// ---------------------------------------------------------------------------

function l10MailBadge_(t, bg, fg) {
  return '<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700;background:' + bg + ';color:' + fg + ';">' + l10MailEsc_(t) + '</span>';
}
function l10MailOnoff_(st) {
  if (st === null) return l10MailBadge_('—', '#eef1f4', L10_MAIL.MUTED);
  return st ? l10MailBadge_('ON TRACK', '#ecfdf3', '#15803d') : l10MailBadge_('OFF TRACK', '#fef3f2', '#dc2626');
}
function l10MailSect_(t) {
  return '<div style="font-weight:700;color:' + L10_MAIL.DEEP + ';font-size:15px;border-bottom:2px solid ' + L10_MAIL.TINT + ';padding-bottom:5px;margin:22px 0 8px;">' + t + '</div>';
}
function l10MailEmptyP_(t) {
  return '<p style="margin:6px 0 0;color:' + L10_MAIL.MUTED + ';font-size:13.5px;">' + t + '</p>';
}
function l10MailOdue_(d) {
  return d && d < l10Today_() ? ' ' + l10MailBadge_('overdue', '#fef3f2', '#dc2626') : '';
}

// Gradient header + BDay/FY chips. title is escaped here; subHtml is inserted as-is
// (caller escapes its parts).
function l10MailRecapHeader_(title, subHtml, config) {
  var M = L10_MAIL, esc = l10MailEsc_;
  var bday = l10BdayInfo_(config), fiscal = l10Fiscal_();
  var chip = function (t) { return '<span style="display:inline-block;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.35);padding:2px 9px;border-radius:12px;font-size:12px;margin-right:6px;">' + esc(t) + '</span>'; };
  // Table + solid bgcolor fallback so Outlook desktop (Word engine — drops the
  // CSS gradient) still shows a solid brand band instead of white; modern
  // clients layer the gradient on top of the same band.
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + M.DEEP + '" style="background-color:' + M.DEEP + ';background:linear-gradient(135deg,' + M.BLUE + ',' + M.DEEP + ');"><tr>' +
    '<td style="padding:18px 20px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">' +
      '<div style="font-size:19px;font-weight:700;">' + esc(title) + '</div>' +
      '<div style="font-size:13px;opacity:.92;margin:3px 0 9px;">' + subHtml + '</div>' +
      chip('BDay ' + bday.n + ' of ' + bday.total) + chip(fiscal.fy + ' ' + fiscal.q) +
    '</td></tr></table>';
}

// ---------------------------------------------------------------------------
// Corporation-grade email shell + shared movement helpers (added for the rich
// recaps). A real HTML document with a charset-first head, a hidden preheader,
// a fixed 600px presentation-table layout (Outlook ignores max-width), one
// progressive-enhancement <style> block, and a deep-link footer button. Every
// section builder keeps its INLINE styles so the email stays legible even where
// a client (Gmail iOS, some Outlooks) drops the <style> block entirely.
// ---------------------------------------------------------------------------

function l10MailDoc_(innerHtml, opts) {
  var M = L10_MAIL, esc = l10MailEsc_;
  opts = opts || {};
  var pre = esc(String(opts.preheader || ''));
  // Zero-width spacer run keeps body text from bleeding into the inbox preview.
  var spacer = ' &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;';
  // One well-formed <style> block (no nested @-rules — a stray one voids the
  // whole block in Gmail). Enhancement only; never the sole path to a usable
  // layout. The default (no-media) layout is already single-column-safe.
  var css =
    '.l10-pre{display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;}' +
    '@media only screen and (max-width:480px){' +
      '.l10-container{width:100%!important;max-width:100%!important;}' +
      '.l10-sc-head{display:none!important;}' +
      '.l10-sc-row td{display:block!important;width:100%!important;box-sizing:border-box!important;text-align:left!important;border-top:none!important;padding:2px 14px!important;}' +
      '.l10-sc-row td.l10-sc-first{padding:10px 14px 2px!important;border-top:1px solid ' + M.LINE + '!important;}' +
    '}';
  var footer = l10MailButton_(l10WebAppUrl_(), 'Open the huddle');
  var html = '<!DOCTYPE html><html lang="en"><head>' +
    '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta http-equiv="x-ua-compatible" content="IE=edge">' +
    '<meta name="color-scheme" content="light dark">' +
    '<meta name="supported-color-schemes" content="light dark">' +
    '<title>' + esc(String(opts.title || 'Paid Media L10')) + '</title>' +
    '<style>' + css + '</style></head>' +
    '<body style="margin:0;padding:0;background-color:#f4f6fa;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">' +
    '<div class="l10-pre" style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f4f6fa;opacity:0;">' + pre + spacer + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f6fa" style="background-color:#f4f6fa;"><tr>' +
      '<td align="center" style="padding:20px 12px;">' +
        '<table role="presentation" class="l10-container" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid ' + M.LINE + ';border-radius:10px;overflow:hidden;">' +
          '<tr><td style="padding:0;font-family:Arial,Helvetica,sans-serif;color:' + M.INK + ';">' + innerHtml + '</td></tr>' +
          (footer ? '<tr><td style="padding:4px 20px 22px;">' + footer + '</td></tr>' : '') +
        '</table>' +
      '</td>' +
    '</tr></table></body></html>';
  // Gmail clips a message body at ~102KB — log if we approach it so an overgrown
  // recap is caught before the headlines silently fall behind a "[clipped]" link.
  if (html.length > 95000) { try { Logger.log('L10 email body ' + html.length + ' bytes — near the Gmail ~102KB clip threshold.'); } catch (e) {} }
  return html;
}

// Bulletproof deep-link button: a bgcolor table cell (solid brand in Outlook)
// holding a padded <a> (rounded in modern clients). Omitted entirely when the
// project isn't deployed as a web app (l10WebAppUrl_() returns '').
function l10MailButton_(url, label) {
  if (!url) return '';
  var M = L10_MAIL, esc = l10MailEsc_;
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr>' +
    '<td align="center" bgcolor="' + M.BLUE + '" style="background-color:' + M.BLUE + ';border-radius:8px;">' +
      '<a href="' + esc(url) + '" target="_blank" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">' + esc(label) + ' &rsaquo;</a>' +
    '</td></tr></table>';
}

// Movement-led inbox preview line — real captured numbers only, never a guess.
function l10MailPreheader_() {
  var weekOf = l10WeekOf_();
  var vals = {};
  l10ReadTab_(L10.TABS.DATA).rows.forEach(function (r) {
    if (l10DateStr_(r['Week Of']) === weekOf) vals[String(r['Metric ID'])] = r['Value'];
  });
  var defs = l10ReadTab_(L10.TABS.SCORECARD).rows.filter(function (d) { return String(d['Active']).toUpperCase() === 'YES'; });
  var captured = 0, onTrack = 0;
  defs.forEach(function (d) {
    var st = l10MailScoreStatus_(vals[String(d['ID'])], d['Rule'], d['Goal'], d['Goal 2']);
    if (st !== null) { captured++; if (st) onTrack++; }
  });
  var offRocks = l10ReadTab_(L10.TABS.ROCKS).rows.filter(function (r) { return String(r['Status']).toUpperCase() === 'OFF TRACK'; }).length;
  if (!captured && !offRocks) return 'This week’s huddle recap';
  var parts = [];
  if (captured) parts.push('Scorecard ' + onTrack + '/' + captured + ' on track');
  parts.push(offRocks + ' rock' + (offRocks === 1 ? '' : 's') + ' off track');
  return parts.join(' · ');
}

// "vs last week" delta — ▲/▼ + a signed amount (the sign carries the meaning;
// the arrow is decorative/aria-hidden), colored by the metric's OWN good/bad
// rule. Returns '' when there's no prior captured week (never a guessed move).
// 'between'-rule metrics get a neutral color (one arrow can't express a band).
function l10MailDelta_(val, prev, rule, format) {
  var M = L10_MAIL;
  if (val === '' || val === null || val === undefined || !isFinite(Number(val))) return '';
  if (prev === '' || prev === null || prev === undefined || !isFinite(Number(prev))) return '';
  var diff = Number(val) - Number(prev);
  if (diff === 0) return '';
  var up = diff > 0;
  var arrow = up ? '&#9650;' : '&#9660;'; // ▲ / ▼
  var r = String(rule);
  var good = r === '>=' ? up : r === '<=' ? !up : null; // 'between' → neutral
  var color = good === null ? M.MUTED : good ? M.GOOD : M.BAD;
  var amt = (up ? '+' : '-') + l10MailFmtScore_(Math.abs(diff), format);
  return '<div style="font-size:11px;font-weight:700;color:' + color + ';margin-top:2px;white-space:nowrap;">' +
    '<span aria-hidden="true">' + arrow + '</span> ' + l10MailEsc_(amt) +
    ' <span style="color:' + M.MUTED + ';font-weight:400;">vs last wk</span></div>';
}

// Table-based milestone progress bar (bgcolor fill survives Outlook + dark-mode
// inversion where a CSS gradient would not), with a done/all text caption.
function l10MailProgressBar_(done, all) {
  if (!all) return '';
  var M = L10_MAIL;
  var pct = Math.max(0, Math.min(100, Math.round(done / all * 100)));
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:7px;border-collapse:collapse;"><tr>' +
    '<td style="padding:0;vertical-align:middle;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="' + M.LINE + '" style="background-color:' + M.LINE + ';border-radius:99px;"><tr>' +
        (pct > 0 ? '<td width="' + pct + '%" bgcolor="' + M.GOOD + '" style="background-color:' + M.GOOD + ';border-radius:99px;font-size:0;line-height:0;height:6px;">&nbsp;</td>' : '') +
        (pct < 100 ? '<td style="font-size:0;line-height:0;height:6px;">&nbsp;</td>' : '') +
      '</tr></table>' +
    '</td>' +
    '<td style="padding:0 0 0 8px;white-space:nowrap;font-size:11px;color:' + M.MUTED + ';font-weight:700;vertical-align:middle;">' + done + '/' + all + ' milestones</td>' +
  '</tr></table>';
}

// Scorecard — this week's captured values in Sort order, with goal + status pill.
function l10MailScorecardHtml_() {
  var M = L10_MAIL, esc = l10MailEsc_;
  var weekOf = l10WeekOf_();
  // Prior week (this Monday minus 7 days) for the "vs last week" movement arrow.
  var prevWeekOf = (function () { var d = new Date(weekOf + 'T12:00:00'); d.setDate(d.getDate() - 7); return l10Fmt_(d, 'yyyy-MM-dd'); })();
  var vals = {}, prevVals = {};
  l10ReadTab_(L10.TABS.DATA).rows.forEach(function (r) {
    var wk = l10DateStr_(r['Week Of']), id = String(r['Metric ID']);
    if (wk === weekOf) vals[id] = r['Value'];
    else if (wk === prevWeekOf) prevVals[id] = r['Value'];
  });
  var defs = l10ReadTab_(L10.TABS.SCORECARD).rows
    .filter(function (d) { return String(d['Active']).toUpperCase() === 'YES'; })
    .sort(function (a, b) { return (Number(a['Sort']) || 0) - (Number(b['Sort']) || 0); });
  function goalText(d) {
    var rule = String(d['Rule']), fmt = String(d['Format']);
    if (rule === 'between') return l10MailFmtScore_(d['Goal'], fmt) + '–' + l10MailFmtScore_(d['Goal 2'], fmt);
    if (rule === '>=') return '≥ ' + l10MailFmtScore_(d['Goal'], fmt);
    if (rule === '<=') return '≤ ' + l10MailFmtScore_(d['Goal'], fmt);
    return '—';
  }
  var th = 'padding:6px 10px;font-size:11.5px;font-weight:700;color:' + M.DEEP + ';';
  var td = 'padding:7px 10px;border-top:1px solid ' + M.LINE + ';';
  var scRows = defs.map(function (d) {
    var val = vals[String(d['ID'])];
    var st = l10MailScoreStatus_(val, d['Rule'], d['Goal'], d['Goal 2']);
    var cav = String(d['Caveat'] || '').trim();
    var delta = l10MailDelta_(val, prevVals[String(d['ID'])], d['Rule'], d['Format']);
    return '<tr class="l10-sc-row">' +
      '<td class="l10-sc-first" style="' + td + 'font-size:13.5px;">' + esc(d['Metric']) +
        '<div style="color:' + M.MUTED + ';font-size:11.5px;">' + esc(d['Owner'] || '') + (cav ? ' · ' + esc(cav) : '') + '</div></td>' +
      '<td style="' + td + 'font-size:13.5px;font-weight:700;text-align:right;white-space:nowrap;">' + esc(l10MailFmtScore_(val, d['Format'])) + delta + '</td>' +
      '<td style="' + td + 'font-size:12.5px;color:' + M.MUTED + ';text-align:right;white-space:nowrap;">' + esc(goalText(d)) + '</td>' +
      '<td style="' + td + 'text-align:center;">' + l10MailOnoff_(st) + '</td></tr>';
  }).join('');
  return defs.length
    ? '<table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid ' + M.LINE + ';border-radius:8px;overflow:hidden;">' +
        '<tr class="l10-sc-head" style="background:' + M.TINT + ';"><td style="' + th + '">Metric</td><td style="' + th + 'text-align:right;">This week</td>' +
        '<td style="' + th + 'text-align:right;">Goal</td><td style="' + th + 'text-align:center;">Status</td></tr>' + scRows + '</table>' +
        '<p style="margin:6px 0 0;color:' + M.MUTED + ';font-size:11.5px;">"—" = not captured this week. Values are as recorded in the huddle; tracking caveats noted inline.</p>'
    : l10MailEmptyP_('No active scorecard metrics.');
}

// Rocks — off track first, with status badge, owner, fiscal quarter, milestones.
function l10MailRocksHtml_() {
  var M = L10_MAIL, esc = l10MailEsc_;
  var allMs = l10ReadTab_(L10.TABS.MILESTONES).rows;
  function msCounts(rockId) {
    var all = allMs.filter(function (m) { return String(m['Rock ID']).trim() === rockId; });
    var done = all.filter(function (m) { return String(m['Status']).toUpperCase() === 'DONE'; }).length;
    return { done: done, all: all.length };
  }
  var rocks = l10ReadTab_(L10.TABS.ROCKS).rows.filter(function (r) {
    return ['ON TRACK', 'OFF TRACK'].indexOf(String(r['Status']).toUpperCase()) !== -1;
  }).sort(function (a, b) {
    return (String(a['Status']).toUpperCase() === 'OFF TRACK' ? 0 : 1) - (String(b['Status']).toUpperCase() === 'OFF TRACK' ? 0 : 1);
  });
  return rocks.length
    ? rocks.map(function (r) {
        var st = String(r['Status']).toUpperCase() === 'OFF TRACK' ? l10MailBadge_('OFF TRACK', '#fef3f2', '#dc2626') : l10MailBadge_('ON TRACK', '#ecfdf3', '#15803d');
        var fq = l10FiscalQuarterOf_(l10DateStr_(r['Due']));
        var mc = msCounts(String(r['ID']));
        return '<div style="margin:6px 0;padding:9px 12px;border:1px solid ' + M.LINE + ';border-radius:8px;">' +
          '<div style="font-size:13.5px;font-weight:600;color:' + M.INK + ';">' + esc(r['Rock']) + '</div>' +
          '<div style="margin-top:3px;font-size:12px;color:' + M.MUTED + ';">' + st + ' &nbsp;·&nbsp; ' + esc(r['Owner'] || '') +
            (fq ? ' · ' + esc(fq) : '') + '</div>' +
          l10MailProgressBar_(mc.done, mc.all) + '</div>';
      }).join('')
    : l10MailEmptyP_('No active rocks.');
}

// What we solved this meeting + count still open.
function l10MailSolvedHtml_(mid) {
  var M = L10_MAIL, esc = l10MailEsc_;
  var issues = l10ReadTab_(L10.TABS.ISSUES).rows;
  var solved = issues.filter(function (i) { return String(i['Solved In']) === mid; });
  var openCount = issues.filter(function (i) { return String(i['Status']).toUpperCase() === 'OPEN'; }).length;
  return (solved.length
    ? '<ul style="margin:0;padding-left:18px;">' + solved.map(function (i) {
        var res = String(i['Resolution'] || '').trim();
        return '<li style="margin:3px 0;font-size:13px;color:' + M.INK + ';">' + esc(i['Issue']) +
          (res ? ' <span style="color:' + M.MUTED + ';">→ ' + esc(res) + '</span>' : '') + '</li>';
      }).join('') + '</ul>'
    : l10MailEmptyP_('No issues marked solved this meeting.')) +
    '<p style="margin:6px 0 0;color:' + M.MUTED + ';font-size:12px;">' + openCount + ' issue(s) still open on the list.</p>';
}

// To-dos — last week's completion + the open list (overdue flagged), capped at 20.
function l10MailOpenTodosHtml_(meeting) {
  var M = L10_MAIL, esc = l10MailEsc_;
  var openTodos = l10ReadTab_(L10.TABS.TODOS).rows
    .filter(function (t) { return l10TodoOpen_(t['Status']); })
    .map(function (t) { return { text: String(t['To-Do']), owner: String(t['Owner'] || 'unassigned'), due: l10DateStr_(t['Due']), status: String(t['Status'] || '').toUpperCase() }; })
    .sort(function (a, b) { return (a.due || '9999') < (b.due || '9999') ? -1 : 1; });
  var pct = meeting['Todo Done %'];
  return '<p style="margin:0 0 6px;font-size:13.5px;">' +
    (pct !== '' && pct !== undefined && pct !== null ? '<b>' + esc(pct) + '%</b> of last week’s to-dos done (team target ≥ 90%). ' : '') +
    '<span style="color:' + M.MUTED + ';">' + openTodos.length + ' open now.</span></p>' +
    (openTodos.length
      ? '<ul style="margin:4px 0 0;padding-left:18px;">' + openTodos.slice(0, 20).map(function (t) {
          // WORKING/BLOCKED ride along as text badges, never colour alone — the
          // recap is where someone outside the room finds out a to-do is stuck.
          var state = t.status === 'BLOCKED' ? ' ' + l10MailBadge_('blocked', M.BAD_BG, M.BAD)
            : t.status === 'WORKING' ? ' ' + l10MailBadge_('working', M.TINT, M.DEEP) : '';
          return '<li style="margin:3px 0;font-size:13px;color:' + M.INK + ';">' + esc(t.text) +
            ' <span style="color:' + M.MUTED + ';font-size:11.5px;">— ' + esc(t.owner) + (t.due ? ', due ' + esc(t.due) : '') + '</span>' + state + l10MailOdue_(t.due) + '</li>';
        }).join('') + '</ul>' + (openTodos.length > 20 ? '<p style="color:' + M.MUTED + ';font-size:11.5px;margin:4px 0 0;">+ ' + (openTodos.length - 20) + ' more</p>' : '')
      : '');
}

// Headlines — last 14 days, with a cascade badge where flagged.
function l10MailHeadlinesHtml_() {
  var M = L10_MAIL, esc = l10MailEsc_;
  var cut = new Date(); cut.setDate(cut.getDate() - 14);
  var cutStr = l10Fmt_(cut, 'yyyy-MM-dd');
  var heads = l10ReadTab_(L10.TABS.HEADLINES).rows.filter(function (h) {
    return l10DateStr_(h['Date']) >= cutStr && l10HeadlineLive_(h); // killed = old news, off the recap
  });
  return heads.length
    ? '<ul style="margin:0;padding-left:18px;">' + heads.map(function (h) {
        var casc = String(h['Cascade'] || '').toUpperCase() === 'YES' ? ' ' + l10MailBadge_('cascade', M.TINT, M.DEEP) : '';
        return '<li style="margin:3px 0;font-size:13px;color:' + M.INK + ';"><span style="color:' + M.MUTED + ';font-size:11.5px;">[' + esc(h['Type'] || 'FYI') + ']</span> ' +
          esc(h['Headline']) + ' <span style="color:' + M.MUTED + ';font-size:11.5px;">— ' + esc(h['By'] || '') + '</span>' + casc + '</li>';
      }).join('') + '</ul>'
    : l10MailEmptyP_('No recent headlines.');
}

// ---------------------------------------------------------------------------
// Manager recap (Stuart) — a fuller "here's everything going on" view:
// scorecard, rocks, what we solved, to-dos, headlines. REAL captured numbers
// only — a metric not captured this week shows "—", never a guess.
// ---------------------------------------------------------------------------

function l10SendStuartRecap(force) {
  var config = l10Config_();
  var to = String(config.STUART_EMAIL || '').trim() || L10_MAIL_STUART_DEFAULT;
  if (!to) return { ok: false, error: 'No manager email set.' };
  var concluded = l10ReadTab_(L10.TABS.MEETINGS).rows.filter(function (m) {
    return String(m['Status']).toUpperCase() === 'CONCLUDED';
  });
  if (!concluded.length) return { ok: false, error: 'No concluded meeting to recap.' };
  var meeting = concluded[concluded.length - 1];
  var mid = String(meeting['ID']);
  var concludedDate = l10DateStr_(meeting['Concluded At']) || l10DateStr_(meeting['Date']);
  if (!force && concludedDate !== l10Today_()) return { ok: false, error: 'No huddle concluded today — manager recap skipped.' };
  var props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty(L10_MAIL.LAST_STUART_PROP) === mid) return { ok: false, error: 'Manager recap for ' + mid + ' already sent.' };

  MailApp.sendEmail({
    to: to,
    subject: 'Paid Media L10 — manager recap — ' + l10DateStr_(meeting['Date']),
    htmlBody: l10MailStuartHtml_(meeting, config),
    name: String(config.EMAIL_FROM_NAME || 'Paid Media L10')
  });
  props.setProperty(L10_MAIL.LAST_STUART_PROP, mid);
  return { ok: true, meeting: mid, to: to };
}

function l10MailFmtScore_(value, format) {
  if (value === '' || value === null || value === undefined || !isFinite(Number(value))) return '—';
  var v = Number(value);
  switch (String(format)) {
    case 'usd': return '$' + Math.round(v).toLocaleString('en-US');
    case 'pct': return (Math.round(v * 10) / 10) + '%';
    case 'x':   return (Math.round(v * 100) / 100) + 'x';
    default:    return (Math.round(v * 10) / 10).toLocaleString('en-US');
  }
}

function l10MailScoreStatus_(value, rule, goal, goal2) {
  if (value === '' || value === null || value === undefined || !isFinite(Number(value))) return null;
  var v = Number(value), g = Number(goal), g2 = Number(goal2);
  switch (String(rule)) {
    case '>=': return isFinite(g) ? v >= g : null;
    case '<=': return isFinite(g) ? v <= g : null;
    case 'between': return (isFinite(g) && isFinite(g2)) ? (v >= g && v <= g2) : null;
    default: return null;
  }
}

function l10MailStuartHtml_(meeting, config) {
  var M = L10_MAIL, esc = l10MailEsc_;
  var date = l10DateStr_(meeting['Date']);
  var meetingName = String(config.MEETING_NAME || 'Paid Media L10 Huddle');
  var mid = String(meeting['ID']);

  var stats = [];
  if (String(meeting['Issues Solved']) !== '') stats.push('Issues solved: ' + esc(meeting['Issues Solved']));
  if (String(meeting['Rating Avg']) !== '') stats.push('Team rating: ' + esc(meeting['Rating Avg']) + '/10');
  var statsHtml = stats.length
    ? '<div style="margin-top:18px;padding-top:10px;border-top:1px solid ' + M.LINE + ';color:' + M.MUTED + ';font-size:12.5px;">' + stats.join(' &nbsp;·&nbsp; ') + '</div>'
    : '';

  // Same rich sections as the team recap (shared builders) — manager framing only:
  // a "here's everything going on" view, Sort order ≈ Stuart's lens.
  var inner =
    l10MailRecapHeader_('Paid Media — weekly manager recap', esc(meetingName) + ' · ' + esc(date), config) +
    '<div style="padding:18px 20px;">' +
      '<p style="margin:0;color:' + M.MUTED + ';font-size:13px;">Where the paid media team is this week — pacing, leading indicators, priorities, and what we’re solving.</p>' +
      l10MailSect_('Scorecard') + l10MailScorecardHtml_() +
      l10MailSect_('Rocks (quarterly priorities)') + l10MailRocksHtml_() +
      l10MailSect_('What we solved') + l10MailSolvedHtml_(mid) +
      l10MailSect_('To-dos') + l10MailOpenTodosHtml_(meeting) +
      l10MailSect_('Headlines') + l10MailHeadlinesHtml_() +
      statsHtml +
    '</div>';
  return l10MailDoc_(inner, { preheader: l10MailPreheader_(), title: 'Paid Media — weekly manager recap' });
}

// ---------------------------------------------------------------------------
// Manager Monday ask (Stuart) — a Monday email inviting Stuart to pass items to
// the team's Tuesday huddle. He is NOT a participant. His reply is picked up by
// the same hourly sweep (the subject carries the Heads-up tag), attributed to
// "Stuart" and flagged "via email" — fully automatic.
// ---------------------------------------------------------------------------

function l10SendStuartHeadsup() {
  var config = l10Config_();
  var to = String(config.STUART_EMAIL || '').trim() || L10_MAIL_STUART_DEFAULT;
  if (!to) return { ok: false, error: 'No manager email set.' };
  MailApp.sendEmail({
    to: to,
    subject: L10_MAIL.HEADSUP_SUBJECT_STUART,
    htmlBody: l10MailStuartHeadsupHtml_(config),
    name: String(config.EMAIL_FROM_NAME || 'Paid Media L10')
  });
  return { ok: true, to: to };
}

// Test fire: sends the same Monday ask to YOU, not Stuart, to preview it.
function l10TestStuartHeadsup() {
  var config = l10Config_();
  var roster = l10MailRoster_(config);
  var me = (roster.byName['alex'] && roster.byName['alex'].email) || Session.getActiveUser().getEmail();
  if (!me) return { ok: false, error: 'Could not resolve your email.' };
  MailApp.sendEmail({
    to: me,
    subject: '[TEST] ' + L10_MAIL.HEADSUP_SUBJECT_STUART,
    htmlBody: l10MailStuartHeadsupHtml_(config),
    name: String(config.EMAIL_FROM_NAME || 'Paid Media L10')
  });
  return { ok: true, to: me };
}

function l10MailStuartHeadsupHtml_(config) {
  var M = L10_MAIL, esc = l10MailEsc_;
  var meetingName = String(config.MEETING_NAME || 'Paid Media L10 Huddle');
  var dayInfo = l10MailDay_(config.HUDDLE_DAY);
  var day = esc(dayInfo.dayLabel);

  var how =
    '<div style="margin-top:16px;padding:14px 16px;background:' + M.TINT + ';border-radius:8px;">' +
      '<div style="font-weight:700;color:' + M.DEEP + ';font-size:14px;">It’s automatic — just reply</div>' +
      '<p style="margin:8px 0 4px;color:' + M.INK + ';font-size:13px;line-height:1.5;">Whatever you type back is added straight to our ' + day + ' agenda, with your name on it — nothing else to do. Start each line with a label so it lands in the right place:</p>' +
      '<ul style="margin:4px 0 0;padding-left:18px;color:' + M.INK + ';font-size:13px;line-height:1.6;">' +
        '<li><b>Issue:</b> something you’d like the team to work through</li>' +
        '<li><b>Headline:</b> a customer / people / FYI note to share</li>' +
        '<li><b>Rock:</b> a priority you want on our radar</li>' +
      '</ul>' +
      '<p style="margin:8px 0 0;color:' + M.MUTED + ';font-size:12px;">No label? Your reply is added as one issue. No need to reply if there’s nothing this week.</p>' +
    '</div>';

  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:' + M.INK + ';">' +
    '<div style="background:linear-gradient(135deg,' + M.BLUE + ',' + M.DEEP + ');color:#fff;padding:16px 18px;border-radius:8px 8px 0 0;">' +
      '<div style="font-size:18px;font-weight:700;">Anything for ' + day + '’s huddle?</div>' +
      '<div style="font-size:13px;opacity:.92;margin-top:2px;">' + esc(meetingName) + '</div>' +
    '</div>' +
    '<div style="border:1px solid ' + M.LINE + ';border-top:none;padding:18px;border-radius:0 0 8px 8px;">' +
      '<p style="margin:0 0 10px;font-size:15px;">Hi Stuart,</p>' +
      '<p style="margin:0 0 10px;font-size:13.5px;line-height:1.55;">You’re <b>not in this meeting</b> — the paid media team runs its weekly huddle ' + day + ' at 10. This is just your channel into it: if there’s anything you’d like us to cover, pass it along here and we’ll take it up for you.</p>' +
      how +
      '<p style="margin:14px 0 0;font-size:12.5px;color:' + M.MUTED + ';line-height:1.5;">And after the huddle you’ll automatically get a recap each ' + day + ' — scorecard, rocks, what we solved, open to-dos, and headlines — so you always have the rundown without sitting in the room. This is your two-way channel: drop in what you want covered today, get the wrap-up ' + day + '.</p>' +
    '</div></div>';
}

// ---------------------------------------------------------------------------
// 1:1 prep packs — emailed to Alex the morning of each 1:1 so he never walks in
// cold: that person's parked-for-1:1 issues, open to-dos, rocks/milestones, and
// the issues they raised. Stuart's (manager) 1:1 gets a prep-to-report-up pack.
// ---------------------------------------------------------------------------

function l10MailOneOnOnes_(config) {
  var raw = String((config && config.ONE_ON_ONES) || '').trim() || L10_MAIL_ONE_ON_ONES_DEFAULT;
  return raw.split(',').map(function (s) {
    var p = s.split(':').map(function (x) { return x.trim(); });
    if (!p[0] || !p[1]) return null;
    return { name: p[0], day: p[1].slice(0, 3).toLowerCase(), manager: String(p[2] || '').toLowerCase() === 'manager' };
  }).filter(Boolean);
}

function l10MailWeekDayConst_(short) {
  var W = ScriptApp.WeekDay;
  return ({ sun: W.SUNDAY, mon: W.MONDAY, tue: W.TUESDAY, wed: W.WEDNESDAY, thu: W.THURSDAY, fri: W.FRIDAY, sat: W.SATURDAY })[String(short).slice(0, 3).toLowerCase()] || null;
}

// force=true (menu) sends every 1:1 pack now; the trigger sends only today's.
function l10SendOneOnOnePreps(force) {
  var config = l10Config_();
  var roster = l10MailRoster_(config);
  var me = (roster.byName['alex'] && roster.byName['alex'].email) || Session.getActiveUser().getEmail();
  if (!me) return { ok: false, error: 'Could not resolve your email.' };
  var todayDay = l10Fmt_(new Date(), 'EEE').slice(0, 3).toLowerCase();
  var list = l10MailOneOnOnes_(config).filter(function (o) { return force || o.day === todayDay; });
  if (!list.length) return { ok: true, sent: 0, note: 'No 1:1s today.' };
  var ctx = {
    todos: l10ReadTab_(L10.TABS.TODOS).rows,
    rocks: l10ReadTab_(L10.TABS.ROCKS).rows,
    milestones: l10ReadTab_(L10.TABS.MILESTONES).rows,
    issues: l10ReadTab_(L10.TABS.ISSUES).rows,
    headlines: l10ReadTab_(L10.TABS.HEADLINES).rows.filter(l10HeadlineLive_)
  };
  var fromName = String(config.EMAIL_FROM_NAME || 'Paid Media L10');
  var sent = 0;
  list.forEach(function (o) {
    var html = o.manager ? l10MailMgrPrepHtml_(o, ctx) : l10MailReportPrepHtml_(o, ctx);
    MailApp.sendEmail({ to: me, subject: '1:1 prep — ' + o.name, htmlBody: html, name: fromName });
    sent++;
  });
  return { ok: true, sent: sent, people: list.map(function (o) { return o.name; }) };
}

function l10MailPrepHelpers_() {
  var M = L10_MAIL, esc = l10MailEsc_, today = l10Today_();
  return {
    M: M, esc: esc,
    sect: function (t) { return '<div style="font-weight:700;color:' + M.DEEP + ';font-size:14px;border-bottom:2px solid ' + M.TINT + ';padding-bottom:4px;margin:18px 0 8px;">' + t + '</div>'; },
    empty: function (t) { return '<p style="margin:6px 0 0;color:' + M.MUTED + ';font-size:13.5px;">' + t + '</p>'; },
    odue: function (d) { return d && d < today ? ' <span style="color:#dc2626;font-weight:700;font-size:11px;">(overdue)</span>' : ''; },
    todoList: function (rows) {
      var t = rows.map(function (r) { return { text: String(r['To-Do']), due: l10DateStr_(r['Due']) }; })
        .sort(function (a, b) { return (a.due || '9999') < (b.due || '9999') ? -1 : 1; });
      return t.length ? '<ul style="margin:6px 0 0;padding-left:18px;">' + t.map(function (x) {
        return '<li style="margin:3px 0;font-size:13.5px;">' + esc(x.text) + (x.due ? ' <span style="color:' + M.MUTED + ';font-size:11.5px;">(due ' + esc(x.due) + ')</span>' : '') + this.odue(x.due) + '</li>';
      }.bind(this)).join('') + '</ul>' : this.empty('None open.');
    },
    rockList: function (rows, ms) {
      return rows.length ? rows.map(function (r) {
        var id = String(r['ID']);
        var all = ms.filter(function (m) { return String(m['Rock ID']).trim() === id; });
        var done = all.filter(function (m) { return String(m['Status']).toUpperCase() === 'DONE'; }).length;
        var next = all.filter(function (m) { return String(m['Status']).toUpperCase() === 'OPEN'; })
          .map(function (m) { return { t: String(m['Milestone']), d: l10DateStr_(m['Due']) }; })
          .sort(function (a, b) { return (a.d || '9999') < (b.d || '9999') ? -1 : 1; })[0];
        var off = String(r['Status']).toUpperCase() === 'OFF TRACK';
        return '<div style="margin:6px 0;padding:8px 11px;border:1px solid ' + M.LINE + ';border-left:3px solid ' + (off ? '#dc2626' : '#15803d') + ';border-radius:6px;">' +
          '<div style="font-size:13.5px;font-weight:600;">' + esc(r['Rock']) + '</div>' +
          '<div style="font-size:12px;color:' + M.MUTED + ';margin-top:2px;">' + (off ? 'OFF TRACK' : 'ON TRACK') +
            (all.length ? ' · ' + done + '/' + all.length + ' milestones' : '') +
            (next ? ' · next: ' + esc(next.t) + (next.d ? ' (' + esc(next.d) + ')' : '') : '') + '</div></div>';
      }).join('') : this.empty('No active rocks.');
    },
    issueList: function (rows) {
      return rows.length ? '<ul style="margin:6px 0 0;padding-left:18px;">' + rows.map(function (i) {
        var n = String(i['Notes'] || '').trim();
        return '<li style="margin:3px 0;font-size:13.5px;">' + esc(i['Issue']) + (n ? ' <span style="color:' + M.MUTED + ';font-size:11.5px;">— ' + esc(n) + '</span>' : '') + '</li>';
      }).join('') + '</ul>' : null;
    },
    shell: function (title, sub, inner) {
      return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:' + M.INK + ';">' +
        '<div style="background:' + M.BLUE + ';color:#fff;padding:15px 18px;border-radius:8px 8px 0 0;">' +
          '<div style="font-size:18px;font-weight:700;">' + esc(title) + '</div>' +
          '<div style="font-size:12.5px;opacity:.9;margin-top:2px;">' + esc(sub) + '</div></div>' +
        '<div style="border:1px solid ' + M.LINE + ';border-top:none;padding:16px 18px;border-radius:0 0 8px 8px;">' + inner +
          '<div style="margin-top:16px;padding:10px 12px;background:' + M.TINT + ';border-radius:6px;color:' + M.MUTED + ';font-size:12px;">Your notes / to raise: ____________________</div>' +
        '</div></div>';
    }
  };
}

function l10MailReportPrepHtml_(o, ctx) {
  var H = l10MailPrepHelpers_(), nameLc = o.name.toLowerCase();
  var todos = ctx.todos.filter(function (t) { return String(t['Owner']).trim().toLowerCase() === nameLc && l10TodoOpen_(t['Status']); });
  var rocks = ctx.rocks.filter(function (r) { return String(r['Owner']).trim().toLowerCase() === nameLc && ['ON TRACK', 'OFF TRACK'].indexOf(String(r['Status']).toUpperCase()) !== -1; });
  var parked = ctx.issues.filter(function (i) { return String(i['Status']).toUpperCase() === 'PARKED' && String(i['Park With'] || '').toLowerCase().indexOf(nameLc) !== -1; });
  var theirOpen = ctx.issues.filter(function (i) { return String(i['Status']).toUpperCase() === 'OPEN' && String(i['Raised By'] || '').toLowerCase().indexOf(nameLc) !== -1; });
  var inner =
    H.sect('Parked for this 1:1') + (H.issueList(parked) || H.empty('Nothing parked for this 1:1.')) +
    H.sect('Their open to-dos') + H.todoList(todos) +
    H.sect('Their rocks') + H.rockList(rocks, ctx.milestones) +
    H.sect('Open issues they raised') + (H.issueList(theirOpen) || H.empty('None.'));
  return H.shell('1:1 prep — ' + o.name, 'Quick agenda for your 1:1 today', inner);
}

function l10MailMgrPrepHtml_(o, ctx) {
  var H = l10MailPrepHelpers_();
  var parked = ctx.issues.filter(function (i) { return String(i['Status']).toUpperCase() === 'PARKED' && /stuart/i.test(String(i['Park With'] || '')); });
  var myTodos = ctx.todos.filter(function (t) { return String(t['Owner']).trim().toLowerCase() === 'alex' && l10TodoOpen_(t['Status']); });
  var myRocks = ctx.rocks.filter(function (r) { return String(r['Owner']).trim().toLowerCase() === 'alex' && ['ON TRACK', 'OFF TRACK'].indexOf(String(r['Status']).toUpperCase()) !== -1; });
  var offRocks = ctx.rocks.filter(function (r) { return String(r['Status']).toUpperCase() === 'OFF TRACK'; });
  var offHtml = offRocks.length ? '<ul style="margin:6px 0 0;padding-left:18px;">' + offRocks.map(function (r) {
    return '<li style="margin:3px 0;font-size:13.5px;">' + H.esc(r['Rock']) + ' <span style="color:' + H.M.MUTED + ';font-size:11.5px;">— ' + H.esc(r['Owner'] || '') + '</span></li>';
  }).join('') + '</ul>' : H.empty('All rocks on track.');
  var inner =
    H.sect('To raise with Stuart') + (H.issueList(parked) || H.empty('Nothing parked for the Stuart 1:1.')) +
    H.sect('Team rocks off track (surface up)') + offHtml +
    H.sect('Your open to-dos') + H.todoList(myTodos) +
    H.sect('Your rocks') + H.rockList(myRocks, ctx.milestones);
  return H.shell('1:1 prep — Stuart (manager)', 'Prep to report up at your 1:1 today', inner);
}

// ---------------------------------------------------------------------------
// Monday cascade draft — fixes the timing gap: the huddle runs Tuesday but the
// digital-team meeting the cascade feeds is Monday, so the in-app cascade
// (built at Tuesday's Conclude) always lands a week stale. This sends Alex a
// fresh draft Monday morning, hours before that meeting: live dashboard pulls
// for the pacing lines + the still-flagged headlines, in the same order as the
// in-app cascade (revenue/pacing → leading indicators → automation — never
// leading with an efficiency cut).
//
// Read-only on purpose: values are resolved live but NOT written to
// L10_Scorecard_Data — capture stays an in-meeting act (the team sees the
// numbers land), and the huddle capture remains the number of record. A cell
// that can't be resolved renders ___ — the draft never invents a number.
// ---------------------------------------------------------------------------

function l10SendCascadeDraft(force) {
  var config = l10Config_();
  if (!force && String(config.CASCADE_DRAFT || 'YES').toUpperCase() === 'NO') {
    return { ok: false, error: 'CASCADE_DRAFT is off in L10_Config.' };
  }
  var roster = l10MailRoster_(config);
  var me = (roster.byName['alex'] && roster.byName['alex'].email) || Session.getActiveUser().getEmail();
  if (!me) return { ok: false, error: 'Could not resolve your email.' };
  var text = l10CascadeDraftText_(config);
  var M = L10_MAIL, esc = l10MailEsc_;
  var inner =
    l10MailRecapHeader_('Cascade draft — today’s digital-team meeting', esc(l10Today_()), config) +
    '<div style="padding:18px 20px;">' +
      '<p style="margin:0 0 10px;color:' + M.MUTED + ';font-size:13px;">Fresh pulls as of this morning — copy, trim to what moved, and walk in with it. ' +
      'Blanks (___) mean the source cell had no number; pull it from the live tool or drop the line. Nothing here was written to the scorecard — Tuesday’s capture stays the number of record.</p>' +
      '<pre style="white-space:pre-wrap;font-size:13px;line-height:1.5;background:#f7f9fc;border:1px solid ' + M.LINE + ';border-radius:8px;padding:12px 14px;color:' + M.INK + ';">' + esc(text) + '</pre>' +
    '</div>';
  MailApp.sendEmail({
    to: me,
    subject: '[L10] Cascade draft — ' + l10Today_(),
    htmlBody: l10MailDoc_(inner, { preheader: 'Fresh pacing pulls for the Monday meeting', title: 'Cascade draft' }),
    name: String(config.EMAIL_FROM_NAME || 'Paid Media L10')
  });
  return { ok: true, to: me };
}

// The draft text. Mirrors the in-app cascade builder's structure and order —
// keep the two in step if either changes.
function l10CascadeDraftText_(config) {
  var bday = l10BdayInfo_(config);
  var weekOf = l10WeekOf_();
  var scTab = l10ReadTab_(L10.TABS.SCORECARD);
  var defs = scTab.rows.filter(function (d) { return String(d['Active']).toUpperCase() === 'YES'; })
      .sort(function (a, b) { return (Number(a['Sort']) || 99) - (Number(b['Sort']) || 99); });
  // Source Ref cells may hold live formulas — read formulas + displays once,
  // resolve per row (same approach as capture, but nothing is persisted).
  var scSheet = l10Ss_().getSheetByName(L10.TABS.SCORECARD);
  var refCol = scTab.headers.indexOf('Source Ref') + 1;
  var refFormulas = [], refDisplays = [];
  if (refCol > 0 && scSheet.getLastRow() > 1) {
    var refRange = scSheet.getRange(2, refCol, scSheet.getLastRow() - 1, 1);
    refFormulas = refRange.getFormulas();
    refDisplays = refRange.getDisplayValues();
  }
  // This week's already-captured values fill the manual lines (never guessed).
  var captured = {};
  l10ReadTab_(L10.TABS.DATA).rows.forEach(function (r) {
    if (l10DateStr_(r['Week Of']) === weekOf) captured[String(r['Metric ID'])] = r['Value'];
  });
  var lines = ['Cascade — week of ' + weekOf + ' (BDay ' + bday.n + ' of ' + bday.total + ')', ''];
  lines.push('Pacing (live pull this morning):');
  defs.filter(function (d) { return String(d['Source']).toUpperCase() === 'RANGE'; }).forEach(function (d) {
    var i = d._row - 2;
    var res = l10ResolveRef_({
      text: String(d['Source Ref'] === undefined || d['Source Ref'] === null ? '' : d['Source Ref']).trim(),
      formula: String(refFormulas[i] ? refFormulas[i][0] : '').trim(),
      display: String(refDisplays[i] ? refDisplays[i][0] : '')
    });
    var st = l10MailScoreStatus_(res.value, d['Rule'], d['Goal'], d['Goal 2']);
    lines.push('- ' + d['Metric'] + ': ' + (res.value === null ? '___' : l10MailFmtScore_(res.value, d['Format'])) +
        (st === false ? '  ← off track' : ''));
  });
  lines.push('');
  lines.push('Leading indicators:');
  defs.filter(function (d) { return String(d['Source']).toUpperCase() === 'MANUAL'; }).forEach(function (d) {
    var v = captured[String(d['ID'])];
    lines.push('- ' + d['Metric'] + ': ' + (v === undefined || v === '' ? '___' : l10MailFmtScore_(v, d['Format'])));
  });
  var hub = l10HubCounts_(l10Config_(), true);
  if (hub && !hub.error) {
    lines.push('');
    lines.push('Automation/testing: ' + hub.running + ' experiments live, ' + hub.needDecision + ' awaiting a decision.');
  }
  var cut = new Date(); cut.setDate(cut.getDate() - 14);
  var cutStr = l10Fmt_(cut, 'yyyy-MM-dd');
  var heads = l10ReadTab_(L10.TABS.HEADLINES).rows.filter(function (h) {
    return String(h['Cascade'] || '').toUpperCase() === 'YES' && l10DateStr_(h['Date']) >= cutStr
        && l10HeadlineLive_(h); // a killed headline never cascades
  });
  if (heads.length) {
    lines.push('');
    lines.push('Headlines:');
    heads.forEach(function (h) { lines.push('- ' + h['Headline'] + ' (' + h['By'] + ')'); });
  }
  lines.push('');
  lines.push('(Order: revenue/pacing first, then leading indicators, then volume + automation — don\'t lead with an efficiency cut.)');
  return lines.join('\n');
}

function l10MenuSendCascadeDraft() {
  var r = l10SendCascadeDraft(true);
  l10MailToast_(r.ok ? ('Cascade draft sent to you (' + r.to + ').') : ('Not sent: ' + (r.error || '')));
}

// ---------------------------------------------------------------------------
// Custom digests (v2.2) — a free-schedule layer over the meeting-anchored
// heads-up/recap. An hourly trigger (l10RunDigests) sends each L10_Digests rule
// whose (Frequency, Weekday, Hour) matches "now" IN THE SHEET TIMEZONE, deduped
// by a visible Last Sent stamp, reusing the mail kit for content. An empty
// digest is never sent. Rules are authored per analyst in Settings → Custom
// digests; the schema + endpoints live in L10Setup.gs / L10Code.gs.
// ---------------------------------------------------------------------------

// "Now" decomposed in the SHEET timezone (never Date.getHours()/getDay(), which
// use the script tz). hour 0–23; dow3 = lowercased 3-letter weekday; stamp =
// 'yyyy-MM-dd HH' idempotency key; dateLabel for the subject/header.
function l10DigestNow_(now) {
  now = now || new Date();
  var dow3 = l10Fmt_(now, 'EEE').slice(0, 3).toLowerCase();
  return {
    hour: Number(l10Fmt_(now, 'H')),
    dow3: dow3,
    isWeekend: (dow3 === 'sat' || dow3 === 'sun'),
    stamp: l10Fmt_(now, 'yyyy-MM-dd HH'),
    dateLabel: l10Fmt_(now, 'EEE MMM d')
  };
}

// The Last Sent cell round-trips as text, but Sheets can coerce a date-like string
// written to a cell back into a Date on read (see l10DateStr_ in L10Code.gs) — so
// normalize it the way the rest of the app normalizes date cells before comparing,
// or the dedup stamp would never match and a rule could re-send within the hour.
function l10DigestStampOf_(v) {
  return (v instanceof Date) ? l10Fmt_(v, 'yyyy-MM-dd HH') : String(v === undefined || v === null ? '' : v).trim();
}

// Pure fire-or-not decision, factored so it runs headless with an injected clock.
// `rule` = {enabled, hour, freq, weekday, lastSent}; `now` = l10DigestNow_(). force
// (menu "run now") ignores the schedule + dedup — but a disabled rule and an
// invalid hour never fire either way, matching the runner's ordering.
function l10DigestRuleMatches_(rule, now, force) {
  if (String(rule.enabled || 'YES').toUpperCase() === 'NO') return false;
  if (force) return true;
  var hour = parseInt(rule.hour, 10);
  if (!(isFinite(hour) && hour >= 0 && hour <= 23)) return false; // blank/non-numeric never fires
  if (hour !== now.hour) return false;
  var freq = String(rule.freq || 'DAILY').toUpperCase();
  if (freq === 'WEEKDAYS' && now.isWeekend) return false;
  if (freq === 'WEEKLY') {
    if (String(rule.weekday || '').trim().toLowerCase().slice(0, 3) !== now.dow3) return false;
  }
  // DAILY / unknown -> every day.
  if (String(rule.lastSent || '').trim() === now.stamp) return false; // dedup within this clock-hour
  return true;
}

// Compact human label for a content set, canonical order: "To-dos + Scorecard".
function l10DigestContentLabel_(set) {
  var names = { TODOS: 'To-dos', ROCKS: 'Rocks', SCORECARD: 'Scorecard', HEADLINES: 'Headlines' };
  var out = [];
  L10.DIGEST_CONTENT.forEach(function (t) { if (set.indexOf(t) !== -1) out.push(names[t] || t); });
  return out.length ? out.join(' + ') : 'Digest';
}

// Subject: '[L10] <label or content> — Tue Jul 14'. MUST NOT carry the literal
// token the reply sweep matches on (L10_MAIL.HEADSUP_TAG) — a user-typed label is
// scrubbed of it so an outbound digest can never be mistaken for a heads-up thread.
function l10DigestSubject_(r, set, now) {
  var label = String((r && r.label) || '') || l10DigestContentLabel_(set);
  label = label.replace(/heads-?up/gi, 'update');
  return '[L10] ' + label + ' — ' + now.dateLabel;
}

// Active-metric / in-window-headline presence — the "has content" test for the
// SCORECARD / HEADLINES sections (which don't depend on the recipient).
function l10DigestScorecardHas_() {
  return l10ReadTab_(L10.TABS.SCORECARD).rows.some(function (d) { return String(d['Active']).toUpperCase() === 'YES'; });
}
function l10DigestHeadlinesHas_() {
  var cut = new Date(); cut.setDate(cut.getDate() - 14);
  var cutStr = l10Fmt_(cut, 'yyyy-MM-dd');
  return l10ReadTab_(L10.TABS.HEADLINES).rows.some(function (h) {
    return l10DateStr_(h['Date']) >= cutStr && l10HeadlineLive_(h);
  });
}

// Build a digest body for person `p` from the selected content tokens `set`.
// Returns {html, empty}; empty = none of the selected sections has any content
// (an empty digest is never sent). Reuses the recap kit so it reads as one product.
function l10DigestBuildHtml_(p, set, ctx, config, r) {
  var esc = l10MailEsc_, M = L10_MAIL;
  var due = null;
  function needDue() { if (!due) due = l10MailDueFor_(p, ctx); return due; }
  var has = {}, parts = [];
  if (set.indexOf('TODOS') !== -1) {
    var dt = needDue(); has.TODOS = dt.todos.length > 0;
    parts.push(l10MailSect_('Your open to-dos') + l10MailTodoListHtml_(dt.todos));
  }
  if (set.indexOf('ROCKS') !== -1) {
    var dr = needDue(); has.ROCKS = dr.rocks.length > 0;
    parts.push(l10MailSect_('Your rocks') + l10MailRockListHtml_(dr.rocks));
  }
  if (set.indexOf('SCORECARD') !== -1) {
    has.SCORECARD = l10DigestScorecardHas_();
    parts.push(l10MailSect_('Scorecard') + l10MailScorecardHtml_());
  }
  if (set.indexOf('HEADLINES') !== -1) {
    has.HEADLINES = l10DigestHeadlinesHas_();
    parts.push(l10MailSect_('Headlines') + l10MailHeadlinesHtml_());
  }
  var anyHas = Object.keys(has).some(function (k) { return has[k]; });

  var now = l10DigestNow_();
  var title = String((r && r.label) || '') || l10DigestContentLabel_(set);
  var inner =
    l10MailRecapHeader_(title, esc(now.dateLabel), config) +
    '<div style="padding:18px 20px;">' +
      '<p style="margin:0 0 4px;color:' + M.MUTED + ';font-size:13px;">Hi ' + esc(p.name) + ' — your custom digest.</p>' +
      parts.join('') +
    '</div>';
  return { html: l10MailDoc_(inner, { preheader: title, title: title }), empty: !anyHas };
}

// Hourly runner. Sends every enabled L10_Digests rule that matches "now" (sheet
// tz), deduped by Last Sent. force (menu "run now") ignores the schedule + dedup
// and writes no stamp. onlyEmail (test menu) restricts to one recipient's rules.
function l10RunDigests(force, onlyEmail) {
  var sheet = l10Ss_().getSheetByName(L10.TABS.DIGESTS);
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, sent: 0, skipped: 0 };
  var config = l10Config_();
  var roster = l10MailRoster_(config);
  var fromName = String(config.EMAIL_FROM_NAME || 'Paid Media L10');
  var now = l10DigestNow_();
  var lastSentCol = L10.HEADERS.L10_Digests.indexOf('Last Sent') + 1;
  var onlyLc = onlyEmail ? String(onlyEmail).toLowerCase() : '';
  var ctx = null; // lazy — only built once a rule actually needs recipient content
  var sent = 0, skipped = 0;

  l10ReadTab_(L10.TABS.DIGESTS).rows.forEach(function (row) {
    var person = roster.byName[String(row['Person'] || '').trim().toLowerCase()];
    if (onlyLc && (!person || String(person.email).toLowerCase() !== onlyLc)) return; // not my rule — silent
    var ruleM = {
      enabled: row['Enabled'], hour: row['Hour'], freq: row['Frequency'],
      weekday: row['Weekday'], lastSent: l10DigestStampOf_(row['Last Sent'])
    };
    if (!l10DigestRuleMatches_(ruleM, now, force)) return;
    if (!person || !person.email) { skipped++; return; }  // off-roster / no email — no stamp
    var set = l10DigestContentOut_(row['Content']);
    if (!set.length) { skipped++; return; }
    if (!ctx) ctx = l10MailContext_();
    var built = l10DigestBuildHtml_(person, set, ctx, config, { label: String(row['Label'] || '') });
    if (built.empty) { skipped++; return; }               // nothing to say — no send, no stamp
    MailApp.sendEmail({
      to: person.email,
      subject: l10DigestSubject_({ label: String(row['Label'] || '') }, set, now),
      htmlBody: built.html, name: fromName
    });
    if (!force) sheet.getRange(row._row, lastSentCol).setValue(now.stamp); // stamp only on a real scheduled send
    sent++;
  });

  l10TabDirty_(L10.TABS.DIGESTS);
  return { ok: true, sent: sent, skipped: skipped };
}

// Test fire: force-send only YOUR OWN rules to you — preview the layout without
// waiting for the hour or touching Last Sent. Uses the caller's roster email.
function l10TestDigest() {
  var me = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!me) return { ok: false, error: 'Could not resolve your email.' };
  return l10RunDigests(true, me);
}

// ---------------------------------------------------------------------------
// Triggers + menu wrappers
// ---------------------------------------------------------------------------

function l10InstallMailTriggers() {
  l10RemoveMailTriggers();
  var config = l10Config_();
  var dayInfo = l10MailDay_(config.HUDDLE_DAY);
  ScriptApp.newTrigger('l10SendMondayHeadsup').timeBased().onWeekDay(dayInfo.prev).atHour(7).create();
  ScriptApp.newTrigger('l10SendStuartHeadsup').timeBased().onWeekDay(dayInfo.prev).atHour(7).create();
  ScriptApp.newTrigger('l10SendTuesdayRecap').timeBased().onWeekDay(dayInfo.day).atHour(17).create();
  ScriptApp.newTrigger('l10SendStuartRecap').timeBased().onWeekDay(dayInfo.day).atHour(17).create();
  ScriptApp.newTrigger('l10ProcessMailReplies').timeBased().everyHours(1).create();
  // Custom digests — one hourly sweep; each run sends the rules whose hour matches.
  ScriptApp.newTrigger('l10RunDigests').timeBased().everyHours(1).create();
  // Monday morning, before the digital-team meeting the cascade feeds (1pm).
  ScriptApp.newTrigger('l10SendCascadeDraft').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(10).create();
  // One 1:1-prep trigger per distinct 1:1 weekday, fired the morning of.
  var oooDays = {};
  l10MailOneOnOnes_(config).forEach(function (o) { oooDays[o.day] = 1; });
  var oooLabels = [];
  Object.keys(oooDays).forEach(function (d) {
    var wd = l10MailWeekDayConst_(d);
    if (wd) { ScriptApp.newTrigger('l10SendOneOnOnePreps').timeBased().onWeekDay(wd).atHour(8).create(); oooLabels.push(d); }
  });
  return { ok: true, headsup: dayInfo.prevLabel + ' ~7am', stuartAsk: dayInfo.prevLabel + ' ~7am', recap: dayInfo.dayLabel + ' ~5pm', stuart: dayInfo.dayLabel + ' ~5pm', oneOnOnes: oooLabels.join('/') + ' ~8am', replies: 'hourly', cascadeDraft: 'Mon ~10am', digests: 'hourly' };
}

function l10RemoveMailTriggers() {
  var names = { l10SendMondayHeadsup: 1, l10SendStuartHeadsup: 1, l10SendTuesdayRecap: 1, l10SendStuartRecap: 1, l10SendOneOnOnePreps: 1, l10ProcessMailReplies: 1, l10SendCascadeDraft: 1, l10RunDigests: 1 };
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (names[t.getHandlerFunction()]) ScriptApp.deleteTrigger(t);
  });
  return { ok: true };
}

function l10MenuSendHeadsup() {
  var r = l10SendMondayHeadsup();
  l10MailToast_(r.ok ? ('Heads-up sent to ' + r.sent + ' people.') : ('Not sent: ' + (r.error || '')));
}
function l10MenuProcessReplies() {
  var r = l10ProcessMailReplies();
  l10MailToast_(r.ok ? (r.added + ' item(s) added from replies.') : ('Failed: ' + (r.error || '')));
}
function l10MenuSendRecap() {
  var r = l10SendTuesdayRecap(true);
  l10MailToast_(r.ok ? ('Recap sent for ' + r.meeting + ' to ' + r.recipients + ' recipients.') : ('Not sent: ' + (r.error || '')));
}
// Test fire: sends the EXACT team recap to YOU only — preview the layout without
// emailing the whole team. Uses the latest concluded meeting (a test huddle is fine).
function l10TestRecap() {
  var config = l10Config_();
  var roster = l10MailRoster_(config);
  var me = (roster.byName['alex'] && roster.byName['alex'].email) || Session.getActiveUser().getEmail();
  if (!me) return { ok: false, error: 'Could not resolve your email.' };
  var concluded = l10ReadTab_(L10.TABS.MEETINGS).rows.filter(function (m) { return String(m['Status']).toUpperCase() === 'CONCLUDED'; });
  if (!concluded.length) return { ok: false, error: 'No concluded meeting yet — conclude a (test) huddle first.' };
  var meeting = concluded[concluded.length - 1];
  MailApp.sendEmail({
    to: me,
    subject: '[TEST] Paid Media L10 Recap preview — ' + l10DateStr_(meeting['Date']),
    htmlBody: l10MailRecapHtml_(meeting, config),
    name: String(config.EMAIL_FROM_NAME || 'Paid Media L10')
  });
  return { ok: true, to: me, meeting: String(meeting['ID']) };
}
function l10MenuTestRecap() {
  var r = l10TestRecap();
  l10MailToast_(r.ok ? ('Test team recap sent to you (' + r.to + ').') : ('Not sent: ' + (r.error || '')));
}
function l10MenuSendStuartRecap() {
  var r = l10SendStuartRecap(true);
  l10MailToast_(r.ok ? ('Manager recap sent to ' + r.to + '.') : ('Not sent: ' + (r.error || '')));
}

// Test fire: sends the EXACT manager recap to YOU, not Stuart — preview it before
// it ever reaches him. Uses the latest concluded meeting (a test huddle is fine).
function l10TestStuartRecap() {
  var config = l10Config_();
  var roster = l10MailRoster_(config);
  var me = (roster.byName['alex'] && roster.byName['alex'].email) || Session.getActiveUser().getEmail();
  if (!me) return { ok: false, error: 'Could not resolve your email.' };
  var concluded = l10ReadTab_(L10.TABS.MEETINGS).rows.filter(function (m) { return String(m['Status']).toUpperCase() === 'CONCLUDED'; });
  if (!concluded.length) return { ok: false, error: 'No concluded meeting yet — conclude a (test) huddle first.' };
  var meeting = concluded[concluded.length - 1];
  MailApp.sendEmail({
    to: me,
    subject: '[TEST] Paid Media L10 — manager recap preview — ' + l10DateStr_(meeting['Date']),
    htmlBody: l10MailStuartHtml_(meeting, config),
    name: String(config.EMAIL_FROM_NAME || 'Paid Media L10')
  });
  return { ok: true, to: me, meeting: String(meeting['ID']) };
}
function l10MenuTestStuartRecap() {
  var r = l10TestStuartRecap();
  l10MailToast_(r.ok ? ('Test manager recap sent to you (' + r.to + ').') : ('Not sent: ' + (r.error || '')));
}
function l10MenuSendStuartHeadsup() {
  var r = l10SendStuartHeadsup();
  l10MailToast_(r.ok ? ('Monday ask sent to ' + r.to + '.') : ('Not sent: ' + (r.error || '')));
}
function l10MenuTestStuartHeadsup() {
  var r = l10TestStuartHeadsup();
  l10MailToast_(r.ok ? ('Test Monday ask sent to you (' + r.to + ').') : ('Not sent: ' + (r.error || '')));
}
function l10MenuSendOneOnOnePreps() {
  var r = l10SendOneOnOnePreps(true);
  l10MailToast_(r.ok ? ('1:1 prep packs sent to you (' + (r.people || []).join(', ') + ').') : ('Not sent: ' + (r.error || '')));
}
function l10MenuRunDigests() {
  var r = l10RunDigests();
  l10MailToast_(r && r.ok
    ? (r.sent + ' custom digest(s) sent' + (r.skipped ? ' (' + r.skipped + ' skipped — empty or no email)' : '') + '.')
    : ('Failed: ' + ((r && r.error) || '')));
}
function l10MenuTestDigest() {
  var r = l10TestDigest();
  l10MailToast_(r && r.ok
    ? (r.sent ? ('Test digest sent to you (' + r.sent + ').') : 'Nothing to send — add a rule with content in Settings → Custom digests, or check it has items.')
    : ('Not sent: ' + ((r && r.error) || '')));
}

function l10MenuInstallMailTriggers() {
  var r = l10InstallMailTriggers();
  l10MailToast_('Triggers set — heads-up ' + r.headsup + ', Stuart ask ' + r.stuartAsk + ', team recap ' + r.recap + ', manager recap ' + r.stuart + ', 1:1 preps ' + r.oneOnOnes + ', replies ' + r.replies + ', cascade draft ' + r.cascadeDraft + ', custom digests ' + r.digests + '.');
}

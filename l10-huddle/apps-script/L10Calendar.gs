// Level 10 Huddle — Google Calendar scheduling (Advanced Calendar Service).
//
// Lets the room book a meeting straight from any issue/headline without leaving
// the app: the item's text prefills the event title, a day view shows when the
// chosen calendars are busy (so an open slot is obvious), and the picked slot is
// written to Google Calendar. All warehouse-free — it talks to Calendar directly.
//
// Uses the ADVANCED Calendar service (the `Calendar` symbol), not CalendarApp,
// because free/busy (Calendar.Freebusy.query) and multi-attendee inserts aren't
// available through the basic service.
//
// ONE-TIME ENABLE (per script project): Apps Script editor → Services (＋) →
// "Calendar API" → Add. That defines the `Calendar` global and adds the calendar
// OAuth scope on the next authorization. Until it's on, l10_calContext() returns
// { enabled:false } and the UI shows a friendly "turn it on" note — the rest of
// the huddle app keeps working.
//
// All globals are l10-prefixed: this project is shared with other bound scripts.

// The advanced service global exists only after it's enabled in the editor.
// typeof guards a plain ReferenceError so nothing here throws pre-enable.
function l10CalOn_() {
  return (typeof Calendar !== 'undefined') && !!Calendar && !!Calendar.Events &&
      !!Calendar.Freebusy && !!Calendar.CalendarList;
}

// Calendar settings, read from L10_Config with sane, clamped defaults.
function l10CalCfg_() {
  var c = l10Config_();
  function num(key, def, lo, hi) {
    var n = Number(c[key]);
    if (!isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
  }
  var startH = num('CALENDAR_DAY_START', 7, 0, 23);
  var endH = num('CALENDAR_DAY_END', 19, 1, 24);
  if (endH <= startH) endH = Math.min(24, startH + 1);
  return {
    enabled: String(c.CALENDAR_ENABLED || 'YES').toUpperCase() !== 'NO',
    calendarId: String(c.CALENDAR_ID || 'primary').trim() || 'primary',
    dayStart: startH,
    dayEnd: endH,
    slotMin: num('CALENDAR_SLOT_MIN', 30, 5, 120),
    defaultDuration: num('CALENDAR_DEFAULT_DURATION', 30, 5, 480)
  };
}

// name → email map for attendees / room free-busy. Reuses TEAM_EMAILS from
// L10_Config (blank by default; same override the mail module documents). "Alex"
// with no mapping falls back to the executing user, so the day view is useful
// out of the box (it shows the deploying user's own busy blocks).
function l10CalPeople_() {
  var c = l10Config_();
  var map = {};
  String(c.TEAM_EMAILS || '').split(',').forEach(function (pair) {
    var i = pair.indexOf('=');
    if (i === -1) return;
    var name = pair.slice(0, i).trim();
    var email = pair.slice(i + 1).trim();
    if (name && email) map[name] = email;
  });
  var me = '';
  try { me = Session.getActiveUser().getEmail() || ''; } catch (e) {}
  var team = String(c.TEAM || 'Alex').split(',').map(function (s) { return s.trim(); }).filter(String);
  return team.map(function (name) {
    var email = map[name] || (name === 'Alex' ? me : '');
    return { name: name, email: email };
  });
}

function l10CalPad2_(n) { return (n < 10 ? '0' : '') + n; }

function l10CalUniq_(arr) {
  var seen = {}, out = [];
  (arr || []).forEach(function (x) { var k = String(x); if (x && !seen[k]) { seen[k] = 1; out.push(x); } });
  return out;
}

// The UTC offset for a calendar day in tz (DST-correct), formatted "-05:00".
// Probing at noon keeps us on the right side of any DST boundary for that date.
function l10CalDayOffset_(dateStr, tz) {
  var z = Utilities.formatDate(new Date(dateStr + 'T12:00:00Z'), tz, 'Z'); // "-0500" / "+0000"
  return z.slice(0, 3) + ':' + z.slice(3);
}

// tz offset in whole minutes AT a given instant (e.g. "-0500" → -300).
function l10CalOffMin_(instant, tz) {
  var z = Utilities.formatDate(instant, tz, 'Z'); // "-0500" / "+0000"
  var sign = z.charAt(0) === '-' ? -1 : 1;
  return sign * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5)));
}

// UTC instant of local wall-clock midnight on dateStr in tz. The offset is taken
// AT midnight (not a noon probe), so on a DST-transition day the boundary can't
// slip an hour and silently drop the transition hour's busy blocks.
function l10CalLocalMidnight_(dateStr, tz) {
  var t = new Date(dateStr + 'T00:00:00Z');       // wall time read as UTC (a guess)
  var off = l10CalOffMin_(t, tz);
  t = new Date(t.getTime() - off * 60000);         // shift onto the real instant
  var off2 = l10CalOffMin_(t, tz);                 // correct once if we crossed a change
  if (off2 !== off) t = new Date(t.getTime() - (off2 - off) * 60000);
  return t;
}

// The calendar date after dateStr (pure date arithmetic, tz-independent).
function l10CalNextDate_(dateStr) {
  var p = dateStr.split('-');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  d.setUTCDate(d.getUTCDate() + 1);
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

// [timeMin, timeMax) instants for the whole local day in tz, each anchored on its
// OWN local midnight so a DST cutover never shortens or shifts the query window.
function l10CalDayBounds_(dateStr, tz) {
  return {
    min: l10CalLocalMidnight_(dateStr, tz).toISOString(),
    max: l10CalLocalMidnight_(l10CalNextDate_(dateStr), tz).toISOString()
  };
}

// An RFC3339 instant → minutes-from-midnight on dateStr in tz, clamped to
// [0, 1440] so a block that starts yesterday / ends tomorrow renders at the edge.
function l10CalToLocalMinutes_(rfc, dateStr, tz) {
  var d = new Date(rfc);
  var day = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  if (day < dateStr) return 0;
  if (day > dateStr) return 24 * 60;
  var hm = Utilities.formatDate(d, tz, 'HH:mm').split(':');
  return Number(hm[0]) * 60 + Number(hm[1]);
}

// Calendars the user can create events on (primary first). Empty on any error.
function l10CalWritable_() {
  var out = [];
  try {
    var res = Calendar.CalendarList.list({ minAccessRole: 'writer', maxResults: 100, showHidden: false });
    (res.items || []).forEach(function (c) {
      out.push({ id: c.id, name: c.summaryOverride || c.summary || c.id, primary: !!c.primary });
    });
  } catch (e) {}
  out.sort(function (a, b) { return (b.primary ? 1 : 0) - (a.primary ? 1 : 0); });
  return out;
}

// -----------------------------------------------------------------------------
// Client API (called via google.script.run)
// -----------------------------------------------------------------------------

// Everything the scheduler modal needs to open: whether it's usable, the window
// + defaults, the writable calendars, and the roster with any known emails.
function l10_calContext() {
  var cfg = l10CalCfg_();
  if (!cfg.enabled) {
    return { enabled: false, reason: 'off',
      message: 'Calendar scheduling is turned off (set CALENDAR_ENABLED = YES in L10_Config to use it).' };
  }
  if (!l10CalOn_()) {
    return { enabled: false, reason: 'service',
      message: 'The Calendar advanced service isn\'t enabled yet. In the Apps Script editor open Services (＋), add "Calendar API", then reload this app.' };
  }
  var me = '';
  try { me = Session.getActiveUser().getEmail() || ''; } catch (e) {}
  var tz = l10Tz_();

  var calendars = l10CalWritable_();
  // Pick the default target: the configured id if writable, else primary, else first.
  var defaultId = cfg.calendarId;
  var haveConfigured = calendars.some(function (c) { return c.id === defaultId; });
  if (!haveConfigured) {
    var prim = calendars.filter(function (c) { return c.primary; })[0];
    defaultId = prim ? prim.id : (calendars[0] ? calendars[0].id : 'primary');
  }
  // The target's own time zone wins over the sheet's (events land in local time).
  try {
    var tcal = Calendar.Calendars.get(defaultId === 'primary' && me ? me : defaultId);
    if (tcal && tcal.timeZone) tz = tcal.timeZone;
  } catch (e) {}

  return {
    enabled: true,
    timeZone: tz,
    me: me,
    dayStart: cfg.dayStart,
    dayEnd: cfg.dayEnd,
    slotMin: cfg.slotMin,
    defaultDuration: cfg.defaultDuration,
    defaultCalendarId: defaultId,
    calendars: calendars,
    people: l10CalPeople_()
  };
}

// Busy blocks for one day. targetId is the calendar the event will land on (its
// own events come back WITH titles); extraIds are attendee calendars shown as
// anonymous "busy" (privacy — only the target calendar's titles are exposed).
function l10_calDay(dateStr, targetId, extraIds) {
  if (!l10CalOn_()) throw new Error('The Calendar service isn\'t enabled — add it in the Apps Script editor under Services.');
  dateStr = String(dateStr || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('Bad date.');
  var cfg = l10CalCfg_();
  var tz = l10Tz_();
  targetId = String(targetId || cfg.calendarId).trim() || cfg.calendarId;
  try { var tc = Calendar.Calendars.get(targetId); if (tc && tc.timeZone) tz = tc.timeZone; } catch (e) {}

  var bounds = l10CalDayBounds_(dateStr, tz);
  var nameById = {};
  l10CalPeople_().forEach(function (p) { if (p.email) nameById[p.email.toLowerCase()] = p.name; });

  var blocks = [];

  // Target calendar → titled events (respecting cancelled / "free" transparency).
  var titlesOk = false;
  try {
    var res = Calendar.Events.list(targetId, {
      timeMin: bounds.min, timeMax: bounds.max, singleEvents: true,
      orderBy: 'startTime', maxResults: 100, showDeleted: false
    });
    titlesOk = true;
    (res.items || []).forEach(function (ev) {
      if (ev.status === 'cancelled' || ev.transparency === 'transparent') return;
      var allDay = !!(ev.start && ev.start.date && !ev.start.dateTime);
      if (allDay) return; // all-day (OOO/holidays) shouldn't grey out the whole grid
      blocks.push({
        start: l10CalToLocalMinutes_(ev.start.dateTime, dateStr, tz),
        end: l10CalToLocalMinutes_(ev.end.dateTime, dateStr, tz),
        label: ev.summary || 'Busy', self: true
      });
    });
  } catch (e) { titlesOk = false; }

  // Free/busy for attendees (always) + the target too if we couldn't read titles.
  var fbIds = l10CalUniq_((extraIds || []).map(function (x) { return String(x).trim(); }).filter(Boolean));
  if (!titlesOk) fbIds.push(targetId);
  fbIds = l10CalUniq_(fbIds).slice(0, 40);
  if (fbIds.length) {
    try {
      var fb = Calendar.Freebusy.query({
        timeMin: bounds.min, timeMax: bounds.max, timeZone: tz,
        items: fbIds.map(function (id) { return { id: id }; })
      });
      var cals = (fb && fb.calendars) || {};
      fbIds.forEach(function (id) {
        var who = nameById[String(id).toLowerCase()] || '';
        ((cals[id] && cals[id].busy) || []).forEach(function (b) {
          blocks.push({
            start: l10CalToLocalMinutes_(b.start, dateStr, tz),
            end: l10CalToLocalMinutes_(b.end, dateStr, tz),
            label: who ? ('Busy — ' + who) : 'Busy', self: (id === targetId)
          });
        });
      });
    } catch (e) {}
  }

  blocks = blocks.filter(function (b) { return b.end > b.start; })
      .sort(function (a, b) { return (a.start - b.start) || (a.end - b.end); });

  // "now" is computed in the calendar's tz so the now-line + default slot line up
  // with the grid even when the viewer's browser is in a different time zone.
  var now = new Date();
  var nowHm = Utilities.formatDate(now, tz, 'HH:mm').split(':');
  return {
    date: dateStr, timeZone: tz,
    isToday: (dateStr === Utilities.formatDate(now, tz, 'yyyy-MM-dd')),
    nowMin: Number(nowHm[0]) * 60 + Number(nowHm[1]),
    dayStartMin: cfg.dayStart * 60, dayEndMin: cfg.dayEnd * 60,
    slotMin: cfg.slotMin, defaultDuration: cfg.defaultDuration,
    blocks: blocks
  };
}

// Create the event. p = { title, date, startTime 'HH:mm', durationMin, calendarId,
// attendees[], description, location, source }. Returns { ok, id, htmlLink, when }.
function l10_calCreate(p) {
  if (!l10CalOn_()) throw new Error('The Calendar service isn\'t enabled — add it in the Apps Script editor under Services.');
  p = p || {};
  var title = String(p.title || '').trim();
  if (!title) throw new Error('Give the meeting a title.');
  var dateStr = String(p.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('Pick a valid date.');
  var hm = String(p.startTime || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!hm) throw new Error('Pick a start time.');
  var startMin = Number(hm[1]) * 60 + Number(hm[2]);
  if (startMin < 0 || startMin >= 24 * 60) throw new Error('Start time is out of range.');
  var dur = Math.max(5, Math.min(600, Number(p.durationMin) || l10CalCfg_().defaultDuration));

  var cfg = l10CalCfg_();
  var calId = String(p.calendarId || cfg.calendarId).trim() || cfg.calendarId;
  var tz = l10Tz_();
  try { var cal = Calendar.Calendars.get(calId); if (cal && cal.timeZone) tz = cal.timeZone; } catch (e) {}

  // Wall-clock local dateTimes + explicit timeZone → Google resolves the offset
  // (DST-safe), and an end past midnight rolls onto the next calendar day.
  var startDT = dateStr + 'T' + l10CalPad2_(Math.floor(startMin / 60)) + ':' + l10CalPad2_(startMin % 60) + ':00';
  var endMin = startMin + dur;
  var endDate = dateStr, em = endMin;
  if (endMin >= 24 * 60) {
    var dN = new Date(dateStr + 'T12:00:00' + l10CalDayOffset_(dateStr, tz));
    dN.setDate(dN.getDate() + Math.floor(endMin / (24 * 60)));
    endDate = Utilities.formatDate(dN, tz, 'yyyy-MM-dd');
    em = endMin % (24 * 60);
  }
  var endDT = endDate + 'T' + l10CalPad2_(Math.floor(em / 60)) + ':' + l10CalPad2_(em % 60) + ':00';

  var attendees = l10CalUniq_((p.attendees || []).map(function (e) { return String(e).trim(); })
      .filter(function (e) { return e.indexOf('@') > 0; }));

  var event = {
    summary: title,
    start: { dateTime: startDT, timeZone: tz },
    end: { dateTime: endDT, timeZone: tz }
  };
  if (p.description) event.description = String(p.description).slice(0, 8000);
  if (p.location) event.location = String(p.location).slice(0, 300);
  if (attendees.length) event.attendees = attendees.map(function (e) { return { email: e }; });

  var created = Calendar.Events.insert(event, calId,
      attendees.length ? { sendUpdates: 'all' } : {});

  var whenSrc = (created.start && created.start.dateTime) ? new Date(created.start.dateTime) : new Date(startDT + l10CalDayOffset_(dateStr, tz));
  var calName = calId;
  try { var g = Calendar.Calendars.get(calId); if (g && g.summary) calName = g.summary; } catch (e) {}

  return {
    ok: true,
    id: created.id || '',
    htmlLink: created.htmlLink || '',
    calendarName: calName,
    when: Utilities.formatDate(whenSrc, tz, 'EEE MMM d · h:mm a')
  };
}

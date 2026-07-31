// Level 10 Huddle — Google Analytics (GA4) source for scorecard metrics.
//
// A metric whose Source is GA4 fills itself at weekly capture from the GA4
// Data API, the same way a RANGE metric fills itself from a cell. There are no
// stored tokens or keys anywhere: every request runs with the CURRENT USER's
// own Google sign-in (ScriptApp.getOAuthToken() under the read-only analytics
// scope), so each user can pull exactly the GA4 data their own account can see
// — nothing more, and nothing on their behalf later. The only configuration is
// the numeric GA4 property ID in L10_Config (GA4_PROPERTY_ID), which is an
// identifier, not a secret. The Analytics Data API must be enabled once in the
// Apps Script project's Cloud project (Services / Google Cloud console).
//
// Source Ref format on the metric row: "<metric>:<window>", e.g. "sessions:7d"
// or "revenue:mtd". The window is optional and defaults to 7d. The metric
// builder assembles refs from the catalogs below (shipped to the client in the
// boot payload via l10Ga4Catalog_), and l10MetricFields_ validates against the
// same lists, so a bad ref can only come from hand-editing the tab — and then
// fails with a spelled-out reason, at save and at capture.

// Friendly ref key → GA4 Data API metric name, plus the label the builder shows.
var L10_GA4_METRICS = [
  { key: 'sessions',  api: 'sessions',           label: 'Sessions' },
  { key: 'users',     api: 'activeUsers',        label: 'Active users' },
  { key: 'newusers',  api: 'newUsers',           label: 'New users' },
  { key: 'keyevents', api: 'keyEvents',          label: 'Key events (conversions)' },
  { key: 'revenue',   api: 'totalRevenue',       label: 'Total revenue' },
  { key: 'adscost',   api: 'advertiserAdCost',   label: 'Ads cost' },
  { key: 'adclicks',  api: 'advertiserAdClicks', label: 'Ads clicks' },
  { key: 'engaged',   api: 'engagedSessions',    label: 'Engaged sessions' },
  { key: 'pageviews', api: 'screenPageViews',    label: 'Page views' }
];

// Reporting windows. Every window ends on YESTERDAY — the last complete day —
// so the number the huddle reads doesn't drift as today's partial data streams
// in. Dates are computed in the SPREADSHEET's timezone (l10Fmt_), same as week
// keys, so "yesterday" flips when the sheet's day does, not the server's.
var L10_GA4_WINDOWS = [
  { key: '7d',       label: 'Last 7 days' },
  { key: 'lastweek', label: 'Last complete week (Mon–Sun)' },
  { key: '28d',      label: 'Last 28 days' },
  { key: 'mtd',      label: 'Month to date' }
];

// The configured GA4 property ID (digits). Accepts a pasted resource name like
// "properties/213025502" and strips the prefix; anything non-numeric reads as
// unset, so the feature is simply off until a real ID is saved.
function l10Ga4Property_(config) {
  var raw = String((config || l10Config_()).GA4_PROPERTY_ID || '').trim();
  raw = raw.replace(/^properties\//i, '').trim();
  return /^\d+$/.test(raw) ? raw : '';
}

// Static metric/window catalog for the client. Rides in the boot core payload
// next to the metric packs, so opening the builder costs no extra server call.
function l10Ga4Catalog_() {
  return {
    metrics: L10_GA4_METRICS.map(function (m) { return { key: m.key, label: m.label }; }),
    windows: L10_GA4_WINDOWS.map(function (w) { return { key: w.key, label: w.label }; })
  };
}

// Parse + validate a stored ref. Returns {ok:true, key, window, apiName, ref}
// with ref normalized to the full "metric:window" form, or {ok:false, why}
// (lowercase sentence fragment, composed into capture notes and test output).
function l10Ga4ParseRef_(ref) {
  var s = String(ref || '').trim().toLowerCase();
  if (!s) return { ok: false, why: 'no metric picked yet — the ref looks like "sessions:7d"' };
  var parts = s.split(':');
  var key = parts[0].trim();
  var win = String(parts[1] || '').trim() || '7d';
  var metric = null;
  L10_GA4_METRICS.forEach(function (m) { if (m.key === key) metric = m; });
  if (!metric) {
    return { ok: false, why: '"' + key + '" isn\'t a Google Analytics metric this connector knows (metrics: ' +
        L10_GA4_METRICS.map(function (m) { return m.key; }).join(', ') + ')' };
  }
  var known = L10_GA4_WINDOWS.some(function (w) { return w.key === win; });
  if (!known) {
    return { ok: false, why: '"' + win + '" isn\'t a reporting window (windows: ' +
        L10_GA4_WINDOWS.map(function (w) { return w.key; }).join(', ') + ')' };
  }
  return { ok: true, key: key, window: win, apiName: metric.api, ref: key + ':' + win };
}

// Window key → {startDate, endDate} ('yyyy-MM-dd', spreadsheet timezone), or
// {why} when the window has no complete day yet (month-to-date on the 1st).
function l10Ga4Window_(win) {
  var today = new Date(l10Today_() + 'T12:00:00');
  var yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  function span(start, end) {
    return { startDate: l10Fmt_(start, 'yyyy-MM-dd'), endDate: l10Fmt_(end, 'yyyy-MM-dd') };
  }
  function back(n) { var d = new Date(yest); d.setDate(d.getDate() - n); return d; }
  if (win === '28d') return span(back(27), yest);
  if (win === 'mtd') {
    if (today.getDate() === 1) return { why: 'month-to-date has no complete day yet on the 1st — it fills from tomorrow' };
    var first = new Date(today);
    first.setDate(1);
    return span(first, yest);
  }
  if (win === 'lastweek') {
    var mon = new Date(today);
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) - 7);
    var sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    return span(mon, sun);
  }
  return span(back(6), yest); // 7d — the default window
}

// Resolve a GA4 Source Ref to a number. Same contract as l10ResolveRef_:
// {value, how} on success, {value:null, why} on any failure — the capture
// loop, the cascade/leadership summary, and the builder's live test all consume it.
function l10Ga4Resolve_(ref) {
  var prop = l10Ga4Property_();
  if (!prop) return { value: null, why: 'set your GA4 property ID in Settings → Integrations first' };
  var p = l10Ga4ParseRef_(ref);
  if (!p.ok) return { value: null, why: p.why };
  var range = l10Ga4Window_(p.window);
  if (range.why) return { value: null, why: range.why };
  var res;
  try {
    res = UrlFetchApp.fetch('https://analyticsdata.googleapis.com/v1beta/properties/' + prop + ':runReport', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      payload: JSON.stringify({
        metrics: [{ name: p.apiName }],
        dateRanges: [{ startDate: range.startDate, endDate: range.endDate }]
      }),
      muteHttpExceptions: true
    });
  } catch (e) {
    return { value: null, why: 'could not reach Google Analytics (' + String(e).slice(0, 120) + ')' };
  }
  var code = res.getResponseCode();
  var body = res.getContentText() || '';
  if (code < 200 || code >= 300) return { value: null, why: l10Ga4ErrWhy_(code, body, prop, p.ref) };
  var json = null;
  try { json = JSON.parse(body); } catch (e2) {}
  if (!json) return { value: null, why: 'Google Analytics sent back something unreadable for ' + p.ref };
  // A well-formed 2xx with no rows means no data in the window — a REAL ZERO
  // (a quiet week captures as 0), never an error.
  var v = 0;
  if (json.rows && json.rows.length) {
    var mv = json.rows[0].metricValues;
    v = Number(mv && mv[0] ? mv[0].value : NaN);
    if (!isFinite(v)) return { value: null, why: 'Google Analytics sent back a non-number for ' + p.ref };
  }
  return { value: v, how: 'GA4 ' + p.ref + ' (' + range.startDate + ' → ' + range.endDate + ')' };
}

// Map an error response to one plain sentence the reader can act on. The two
// 403s matter most and mean opposite things: the Analytics Data API being off
// in the script's Cloud project (this shared project must enable it once) vs
// this user's Google account not having access to the property.
function l10Ga4ErrWhy_(code, body, prop, ref) {
  var msg = '';
  try {
    var j = JSON.parse(body);
    msg = String((j.error && j.error.message) || '');
  } catch (e) {}
  if (code === 403) {
    if (/SERVICE_DISABLED|has not been used in project|it is disabled/i.test(body)) {
      return 'the Analytics Data API isn\'t enabled for this script\'s Cloud project — enable it once in the Apps Script project (Services / Google Cloud console)';
    }
    return 'your Google account doesn\'t have access to GA4 property ' + prop +
        ' — ask an Analytics admin for Viewer access, or fix the property ID in Settings → Integrations';
  }
  if (code === 401) {
    return 'Google didn\'t accept the sign-in — close and reopen the app, approving the Analytics permission when asked';
  }
  if (code === 400) {
    return 'Google Analytics rejected the request for "' + ref + '"' +
        (msg ? ' (' + msg.slice(0, 140) + ')' : '') + ' — re-pick the metric and window in the builder';
  }
  if (code === 404) {
    return 'GA4 property ' + prop + ' was not found — check the property ID in Settings → Integrations';
  }
  return 'Google Analytics error HTTP ' + code + (msg ? ': ' + msg.slice(0, 140) : '');
}

// Live "test it" for the metric builder — same contract as l10_testRangeRef,
// so a wrong property ID or missing access surfaces at setup time, not
// silently at next week's capture.
function l10_ga4Test(ref) {
  var res = l10Ga4Resolve_(ref);
  return res.value === null ? { ok: false, why: res.why } : { ok: true, value: res.value };
}

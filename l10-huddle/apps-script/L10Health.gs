// ═════════════════════════════════════════════════════════════════════════
// L10 DATA HEALTH — the scorecard checks its sources before the room reads them.
// ═════════════════════════════════════════════════════════════════════════
// Reads `mktg_alex_langton_paid_media.v_l10_data_health` (see sql/l10-data-
// health.sql — one row per upstream source with FRESH/LAG/STALE/BROKEN computed
// in the warehouse), plus one live check the view can't do: whether the spend
// mart's Amazon block carries SP+SB or is still SP-only (compared against
// mktg_amazon's own cost, columns discovered via INFORMATION_SCHEMA so schema
// drift degrades to UNKNOWN, never a wrong verdict).
//
// OPTIONAL module, same contract as the GA4 connector:
//   • Needs the BigQuery advanced service (already on if Revenue Pull works;
//     otherwise Editor ▸ Services (+) ▸ BigQuery API ▸ Add).
//   • Config DATA_HEALTH = ON/OFF (seeded ON). Missing service or OFF → the
//     app simply shows no health strip. Every failure path returns a value;
//     nothing here ever throws to the client or blocks a capture.
//   • Results cached ~30 min (CacheService) so boots don't pay a query.
// ═════════════════════════════════════════════════════════════════════════

var L10H = {
  PROJECT_ID: 'amasdataprd',
  LOCATION: 'US',
  VIEW: 'amasdataprd.mktg_alex_langton_paid_media.v_l10_data_health',
  CACHE_KEY: 'l10_health_v2',
  CACHE_SECS: 1800,
  // Amazon mart-block ratio window: 14 complete days ending 3 days back, so
  // the mart's ~1-day lag and restatement edges never skew the comparison.
  AMZ_WINDOW_DAYS: 14,
  AMZ_END_OFFSET_DAYS: 3,
  AMZ_MART_KEYS: ['Brady-Amazon|US|Nonbrand', 'Brady-Amazon|US|NA'],
  AMZ_COST_CANDIDATES: ['cost', 'spend']
};

function l10HealthOn_() {
  if (typeof BigQuery === 'undefined') return false;
  var v = String(l10Config_().DATA_HEALTH === undefined ? 'ON' : l10Config_().DATA_HEALTH).toUpperCase();
  return v !== 'OFF' && v !== 'NO' && v !== '';
}

// Client entry point. Always returns an object; {ok:false} means "no strip",
// never an error the UI has to handle.
function l10_dataHealth(force) {
  try {
    if (!l10HealthOn_()) return { ok: false, reason: 'off' };
    var cache = null;
    try { cache = CacheService.getScriptCache(); } catch (e) {}
    if (cache && !force) {
      var hit = cache.get(L10H.CACHE_KEY);
      if (hit) { try { return JSON.parse(hit); } catch (e) {} }
    }
    var sources = l10HealthView_();
    var amz = l10HealthAmazonBlock_();
    if (amz) sources.push(amz);
    var out = {
      ok: true,
      checkedAt: l10Fmt_(new Date(), 'yyyy-MM-dd HH:mm'),
      sources: sources
    };
    if (cache) { try { cache.put(L10H.CACHE_KEY, JSON.stringify(out), L10H.CACHE_SECS); } catch (e) {} }
    return out;
  } catch (e) {
    // A warehouse hiccup must read as "health unknown", not break the huddle.
    // Cache the failure briefly too — without this, every scorecard render in
    // the outage window re-paid the full (multi-second) BigQuery attempt.
    var bad = { ok: false, reason: String(e && e.message || e).slice(0, 200) };
    try {
      var c2 = CacheService.getScriptCache();
      if (c2 && !force) c2.put(L10H.CACHE_KEY, JSON.stringify(bad), 300);
    } catch (e2) {}
    return bad;
  }
}

// The view: one row per source, already scored in SQL.
function l10HealthView_() {
  var rows = l10HealthBq_('SELECT source_key, source_label, CAST(last_data_date AS STRING) AS last_data_date, days_behind, status, detail FROM `' + L10H.VIEW + '`');
  return rows.map(function (r) {
    return {
      key: String(r.source_key || ''),
      label: String(r.source_label || ''),
      lastDate: String(r.last_data_date || ''),
      daysBehind: r.days_behind === null || r.days_behind === undefined ? null : Number(r.days_behind),
      status: String(r.status || 'UNKNOWN').toUpperCase(),
      detail: String(r.detail || '')
    };
  });
}

// Does the spend mart's Amazon block carry SP+SB, or is it still SP-only?
// mart(Amazon keys) ÷ (SP cost + SB cost) over a stable window:
//   ≥ 0.9 → SP+SB applied (FRESH) · < 0.9 with SB cost present → SP-only
//   (STALE: "Amazon spend understated") · discovery/zero fails → UNKNOWN.
function l10HealthAmazonBlock_() {
  var out = {
    key: 'amazon_mart_block',
    label: 'Amazon block in spend mart (SP+SB?)',
    lastDate: '', daysBehind: null, status: 'UNKNOWN',
    detail: 'Could not compare mart vs mktg_amazon cost.'
  };
  try {
    var cols = l10HealthBq_(
      "SELECT table_name, column_name FROM `amasdataprd.mktg_amazon.INFORMATION_SCHEMA.COLUMNS`" +
      " WHERE table_name IN ('amazon_product_metrics', 'sb_query_metrics')");
    var byTable = {};
    cols.forEach(function (r) {
      (byTable[String(r.table_name)] = byTable[String(r.table_name)] || [])
        .push(String(r.column_name).toLowerCase());
    });
    var pick = function (table) {
      var have = byTable[table] || [];
      for (var i = 0; i < L10H.AMZ_COST_CANDIDATES.length; i++) {
        if (have.indexOf(L10H.AMZ_COST_CANDIDATES[i]) >= 0) return L10H.AMZ_COST_CANDIDATES[i];
      }
      return null;
    };
    var spCol = pick('amazon_product_metrics');
    var sbCol = pick('sb_query_metrics');
    if (!spCol) { out.detail = 'No cost column found on amazon_product_metrics — schema drifted; check by hand.'; return out; }
    var win = 'DATE_SUB(CURRENT_DATE(), INTERVAL ' + (L10H.AMZ_WINDOW_DAYS + L10H.AMZ_END_OFFSET_DAYS) + ' DAY)' +
              ' AND DATE_SUB(CURRENT_DATE(), INTERVAL ' + L10H.AMZ_END_OFFSET_DAYS + ' DAY)';
    var keys = L10H.AMZ_MART_KEYS.map(function (k) { return "'" + k + "'"; }).join(', ');
    var sql =
      'SELECT' +
      ' (SELECT ROUND(SUM(Daily_Spend), 2) FROM `amasdataprd.mktg_mtd_spend_pull.mtd_spend_pull_v3`' +
      '   WHERE Budget_Key IN (' + keys + ') AND Date BETWEEN ' + win + ') AS mart_spend,' +
      ' (SELECT ROUND(SUM(' + spCol + '), 2) FROM `amasdataprd.mktg_amazon.amazon_product_metrics`' +
      '   WHERE date BETWEEN ' + win + ') AS sp_cost,' +
      (sbCol
        ? ' (SELECT ROUND(SUM(' + sbCol + '), 2) FROM `amasdataprd.mktg_amazon.sb_query_metrics`' +
          '   WHERE date BETWEEN ' + win + ') AS sb_cost'
        : ' NULL AS sb_cost');
    var r = l10HealthBq_(sql)[0] || {};
    var mart = Number(r.mart_spend) || 0;
    var sp = Number(r.sp_cost) || 0;
    var sb = r.sb_cost === null || r.sb_cost === undefined ? null : (Number(r.sb_cost) || 0);
    if (!mart || !sp) { out.detail = 'No Amazon spend in the comparison window (mart ' + mart + ', SP ' + sp + ').'; return out; }
    var denom = sp + (sb || 0);
    var ratio = denom ? mart / denom : null;
    var pct = ratio === null ? '?' : Math.round(ratio * 100) + '%';
    if (ratio !== null && ratio >= 0.9) {
      out.status = 'FRESH';
      out.detail = 'Mart carries ' + pct + ' of SP+SB cost over the last ' + L10H.AMZ_WINDOW_DAYS + ' complete days — SP+SB fix looks applied.';
    } else if (sb !== null && sb > 0) {
      out.status = 'STALE';
      out.detail = 'Mart carries only ' + pct + ' of SP+SB cost — looks SP-only. Amazon spend (and A/S) understated until the mart fix lands.';
    } else {
      out.detail = 'SB cost column missing or zero (' + pct + ' of SP) — cannot call it; check by hand.';
    }
    return out;
  } catch (e) {
    out.detail = 'Comparison query failed: ' + String(e && e.message || e).slice(0, 140);
    return out;
  }
}

// Minimal query runner (same job pattern as the other pulls in this project;
// own copy so this module never depends on another file being pasted).
function l10HealthBq_(sql) {
  var pid = L10H.PROJECT_ID;
  var job = BigQuery.Jobs.insert(
    { configuration: { query: { query: sql, useLegacySql: false } } }, pid);
  var jobId = job.jobReference.jobId;
  var loc = job.jobReference.location || L10H.LOCATION;
  // Poll immediately — getQueryResults long-polls server-side (timeoutMs), so
  // the old unconditional 800ms pre-sleep only added latency. Sleep briefly
  // between subsequent polls only.
  var res, deadline = Date.now() + 1000 * 60 * 3;
  res = BigQuery.Jobs.getQueryResults(pid, jobId, { location: loc, timeoutMs: 30000 });
  while (!res.jobComplete && Date.now() < deadline) {
    Utilities.sleep(400);
    res = BigQuery.Jobs.getQueryResults(pid, jobId, { location: loc, timeoutMs: 30000 });
  }
  if (!res.jobComplete) throw new Error('BigQuery job timed out: ' + jobId);
  var info = BigQuery.Jobs.get(pid, jobId, { location: loc });
  if (info.status && info.status.errorResult) throw new Error(info.status.errorResult.message);
  var fields = (res.schema && res.schema.fields) ? res.schema.fields.map(function (f) { return f.name; }) : [];
  var out = [];
  while (true) {
    (res.rows || []).forEach(function (row) {
      var o = {};
      row.f.forEach(function (cell, i) { o[fields[i]] = cell.v; });
      out.push(o);
    });
    if (!res.pageToken) break;
    res = BigQuery.Jobs.getQueryResults(pid, jobId, { location: loc, pageToken: res.pageToken, timeoutMs: 30000 });
  }
  return out;
}

// Menu: force a fresh check and say what came back, worst first.
function l10MenuDataHealth() {
  var r = l10_dataHealth(true);
  if (!r.ok) {
    SpreadsheetApp.getUi().alert('Data health', 'Check unavailable: ' + (r.reason === 'off'
      ? 'DATA_HEALTH is OFF in L10_Config (or the BigQuery service is missing — Services (+) ▸ BigQuery API).'
      : r.reason), SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  var order = { BROKEN: 0, STALE: 1, UNKNOWN: 2, LAG: 3, FRESH: 4 };
  var rows = r.sources.slice().sort(function (a, b) {
    var ra = (a.status in order) ? order[a.status] : 9;
    var rb = (b.status in order) ? order[b.status] : 9;
    return ra - rb;
  }).map(function (s) {
    return s.status + ' — ' + s.label + (s.lastDate ? ' (through ' + s.lastDate + ')' : '') + '\n    ' + s.detail;
  });
  SpreadsheetApp.getUi().alert('Data health — checked ' + r.checkedAt, rows.join('\n\n'),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

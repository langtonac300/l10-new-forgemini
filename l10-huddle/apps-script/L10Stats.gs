// Team stats — the to-do completion analytics feed.
//
// The boot payload deliberately ages finished to-dos out after TODO_KEEP_DAYS
// (see l10BootWork_), which is right for the To-dos page and wrong for a trend
// view. This endpoint reads the WHOLE L10_Todos tab once, on demand, when the
// Team stats page is opened, and ships a compact row per to-do (short keys, no
// free text) so a year of history stays a small payload. All the arithmetic
// happens on the client (teamStatsCompute_ in the JS file), so changing the
// window or a toggle never costs another round trip.
//
// Read-only. Nothing here writes to any tab.

function l10_teamStats() {
  try {
    var config = l10Config_();
    var team = String(config.TEAM || '').split(',').map(function (s) { return s.trim(); }).filter(String);
    var todos = l10ReadTab_(L10.TABS.TODOS).rows;
    // Sub-step and note counts per to-do — cheap engagement signals. Both tabs
    // read as zero rows on a workbook that hasn't run Setup / repair tabs.
    var steps = {}, notes = {};
    l10ReadTab_(L10.TABS.TODO_STEPS).rows.forEach(function (s) {
      var k = String(s['Todo ID'] || '').trim();
      if (k) steps[k] = (steps[k] || 0) + 1;
    });
    l10ReadTab_(L10.TABS.TODO_LOG).rows.forEach(function (n) {
      var k = String(n['Todo ID'] || '').trim();
      if (k) notes[k] = (notes[k] || 0) + 1;
    });
    var rows = todos.map(function (t) {
      var id = String(t['ID'] || '').trim();
      return {
        id: id,
        owner: String(t['Owner'] || '').trim(),
        created: l10DateStr_(t['Created']),
        due: l10DateStr_(t['Due']),
        // Done At is the terminal stamp for DONE and DROPPED alike.
        doneAt: l10DateStr_(t['Done At']),
        status: String(t['Status'] || '').trim().toUpperCase(),
        carried: Number(t['Carried Over']) || 0,
        source: String(t['Source'] || '').trim(),
        repeat: String(t['Repeat'] || '').trim().toUpperCase() === 'WEEKLY',
        blocked: String(t['Blocked On'] || '').trim() !== '',
        jira: String(t['Jira Key'] || '').trim() !== '',
        steps: steps[id] || 0,
        notes: notes[id] || 0
      };
    });
    // The huddle's own weekly completion score, as concluded in the room. The
    // boot slice carries only the last 12; the trend view wants all of them.
    var meetings = l10ReadTab_(L10.TABS.MEETINGS).rows.filter(function (m) {
      return String(m['Status']) === 'CONCLUDED';
    }).map(function (m) {
      var pct = m['Todo Done %'];
      return {
        date: l10DateStr_(m['Date']),
        pct: (pct === '' || pct === null || pct === undefined || !isFinite(Number(pct))) ? null : Number(pct),
        done: Number(m['Todos Done']) || 0,
        open: Number(m['Todos Open']) || 0
      };
    });
    return {
      ok: true,
      asOf: l10Now_(),
      today: l10Today_(),
      weekOf: l10WeekOf_(),
      team: team,
      target: Number(config.TODO_DONE_TARGET) || 90,
      staleAt: Number(config.TODO_STALE_CARRIES) || 3,
      // Per-person breakdown is on unless the config says otherwise. The team
      // completion score itself is never split per person here — see the
      // client renderer for the rule.
      perPerson: String(config.STATS_PER_PERSON || 'YES').trim().toUpperCase() !== 'NO',
      todos: rows,
      meetings: meetings
    };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

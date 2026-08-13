// Fixture registry for the google.script.run stub. Shapes mirror the real
// server payloads: the four boot slices from L10Code.gs (l10BootCore_/Work_/
// Plan_/Scorecard_) with row objects keyed by the L10.HEADERS column strings.
// Mutation endpoints echo plausible success shapes and are asserted via
// window.__GS_CALLS rather than by data effect.
(function () {
  // Monday of the current week, matching l10WeekOf_ (weeks key on Monday).
  function mondayOf(d) {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7; // Mon=0
    x.setDate(x.getDate() - day);
    return x;
  }
  function fmt(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function shiftDays(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return d; }

  const NOW = new Date();
  const MON = mondayOf(NOW);
  const WEEK_OF = fmt(MON);
  const TODAY = fmt(NOW);
  const WEEKS = [];
  for (let i = 12; i >= 0; i--) WEEKS.push(fmt(shiftDays(MON, -7 * i)));

  const TEAM = ['Alex', 'Courtney', 'CJ', 'Scott'];

  const CONFIG = {
    TEAM: TEAM.join(', '),
    SEGMENTS: JSON.stringify([['Segue', 5], ['Scorecard', 5], ['Rock review', 5], ['Headlines', 5], ['To-do list', 5], ['IDS', 60], ['Conclude', 5]]),
    SCORECARD_WEEKS: '13',
    TODO_DONE_TARGET: '90',
    RATING_BAR: '8',
    TODO_KEEP_DAYS: '60',
    TODO_STALE_CARRIES: '3',
    FISCAL_START_MONTH: '8',
    TEAM_EMAILS: '',
    EXPERIMENT_HUB_URL: 'https://docs.google.com/spreadsheets/d/hub-fixture',
    GA4_PROPERTY_ID: '',
    BDAYS_OVERRIDE: '',
    DATA_HEALTH: 'ON',
    HEALTH_MAP: '{"SC-011":["spend_mart","web_orders","adobe_orders"],"SC-015":["spend_mart","amazon_sp","amazon_sb","amazon_mart_block"],"SC-016":["leads_lifecycle"]}'
  };

  const CORE = {
    config: CONFIG,
    team: TEAM,
    segments: JSON.parse(CONFIG.SEGMENTS),
    weekOf: WEEK_OF,
    today: TODAY,
    bday: { n: 19, total: 23 },
    fiscal: { fy: 'FY26', q: 'Q4' },
    events: [
      { 'Start Date': fmt(shiftDays(NOW, 4)), 'End Date': fmt(shiftDays(NOW, 4)), 'Event': 'FY27 starts', 'Notes': 'Rock reset' },
      { 'Start Date': fmt(shiftDays(NOW, 27)), 'End Date': fmt(shiftDays(NOW, 30)), 'Event': 'Grand Geneva sales meeting', 'Notes': '' }
    ],
    openMeeting: null,
    lastMeeting: {
      'ID': 'M-011', 'Date': fmt(shiftDays(MON, -6)), 'Status': 'CONCLUDED', 'Attendees': TEAM.join(', '),
      'Started At': '', 'Concluded At': '', 'Segue (JSON)': '', 'Todo Done %': '86', 'Todos Done': '12',
      'Todos Open': '2', 'Issues Solved': '2', 'Rating Avg': '8.5', 'Ratings (JSON)': '{}',
      'Cascade': 'Utilization steady; NB negatives loop saving ~$700/wk.', 'Recap': 'Recap text', 'Notes': ''
    },
    history: [
      { 'ID': 'M-009', 'Date': fmt(shiftDays(MON, -20)), 'Status': 'CONCLUDED', 'Todo Done %': '92', 'Rating Avg': '8.2', 'Issues Solved': '3', 'Todos Done': '11', 'Todos Open': '1', 'Ratings (JSON)': '{}' },
      { 'ID': 'M-010', 'Date': fmt(shiftDays(MON, -13)), 'Status': 'CONCLUDED', 'Todo Done %': '78', 'Rating Avg': '7.5', 'Issues Solved': '1', 'Todos Done': '7', 'Todos Open': '2', 'Ratings (JSON)': '{}' },
      { 'ID': 'M-011', 'Date': fmt(shiftDays(MON, -6)), 'Status': 'CONCLUDED', 'Todo Done %': '86', 'Rating Avg': '8.5', 'Issues Solved': '2', 'Todos Done': '12', 'Todos Open': '2', 'Ratings (JSON)': '{}' }
    ],
    packs: [
      { id: 'paid-search', name: 'Paid search pack', icon: '🔍', metrics: ['Spend pacing', 'CPL', 'Impression share'] },
      { id: 'web', name: 'Web pack', icon: '🌐', metrics: ['Sessions', 'CVR'] }
    ],
    ga4: {
      metrics: [{ key: 'sessions', label: 'Sessions' }, { key: 'totalUsers', label: 'Users' }, { key: 'purchaseRevenue', label: 'Revenue' }],
      windows: [{ key: '7d', label: 'Last 7 days' }, { key: '28d', label: 'Last 28 days' }]
    },
    hub: { running: 7, needDecision: 6 },
    brief: [
      { 'Week Of': WEEK_OF, 'Section': 'DOCKET', 'Rank': 1, 'Title': 'PDC feed disapprovals climbing', 'Body': '412 SKUs disapproved; ~$18K/mo spend at risk.', 'Dollars At Stake': '18000', 'Accounts': 'PDC', 'Caveat': '', 'Playbook Ref': 'PB-002', 'Promoted To': '', 'Received At': WEEK_OF + ' 08:31' },
      { 'Week Of': WEEK_OF, 'Section': 'WATCHLIST', 'Rank': 1, 'Title': 'Seton CA CPL drift', 'Body': 'CPL +22% WoW on brand.', 'Dollars At Stake': '', 'Accounts': 'Seton', 'Caveat': 'GTM defect skews CA conversions', 'Playbook Ref': '', 'Promoted To': '', 'Received At': WEEK_OF + ' 08:31' }
    ],
    user: 'alex@bradycorp.com'
  };

  // Settings-page data — rides OFF the boot payload now (l10_settingsData is
  // fetched the first time the Settings page becomes visible).
  const SETTINGS_DATA = {
    notify: TEAM.map(function (p) { return { person: p, headsup: p !== 'Scott', recap: 'EVERY' }; }),
    digests: [
      { id: 'D-001', person: 'Alex', label: 'Morning to-dos', content: ['TODOS'], freq: 'WEEKDAYS', weekday: '', hour: 8, enabled: true }
    ]
  };

  const TODOS = [
    { 'ID': 'TD-101', 'To-Do': 'Rebuild Seton/Emedco SQR negatives list', 'Owner': 'Scott', 'Due': fmt(shiftDays(MON, 4)), 'Status': 'OPEN', 'Created': fmt(shiftDays(MON, -7)), 'Done At': '', 'Carried Over': 0, 'Source': '', 'Notes': 'Shared sheet, Weekly Negatives Impact tab', 'Jira Key': 'BNADM-501', 'Jira Done': '', 'Repeat': '', 'Blocked On': '', 'Last Carried Week': WEEK_OF },
    { 'ID': 'TD-102', 'To-Do': 'Confirm Amazon SP+SB fix at the mart', 'Owner': 'CJ', 'Due': fmt(shiftDays(MON, -3)), 'Status': 'WORKING', 'Created': fmt(shiftDays(MON, -14)), 'Done At': '', 'Carried Over': 1, 'Source': '', 'Notes': '', 'Jira Key': '', 'Jira Done': '', 'Repeat': '', 'Blocked On': '', 'Last Carried Week': WEEK_OF },
    { 'ID': 'TD-103', 'To-Do': 'Chase IT on GTM internal-IP filter', 'Owner': 'Courtney', 'Due': fmt(shiftDays(MON, -10)), 'Status': 'BLOCKED', 'Created': fmt(shiftDays(MON, -28)), 'Done At': '', 'Carried Over': 3, 'Source': 'IS-014', 'Notes': '', 'Jira Key': 'BNADM-490', 'Jira Done': '', 'Repeat': '', 'Blocked On': 'IT change window approval', 'Last Carried Week': WEEK_OF },
    { 'ID': 'TD-104', 'To-Do': 'Post weekly trend report', 'Owner': 'Alex', 'Due': fmt(shiftDays(MON, 0)), 'Status': 'DONE', 'Created': fmt(shiftDays(MON, -7)), 'Done At': fmt(shiftDays(MON, 0)), 'Carried Over': 0, 'Source': '', 'Notes': '', 'Jira Key': '', 'Jira Done': fmt(shiftDays(MON, 0)), 'Repeat': 'WEEKLY', 'Blocked On': '', 'Last Carried Week': '' },
    { 'ID': 'TD-105', 'To-Do': 'Pull PDC disapproval export', 'Owner': 'Scott', 'Due': fmt(shiftDays(MON, 2)), 'Status': 'OPEN', 'Created': fmt(shiftDays(MON, -2)), 'Done At': '', 'Carried Over': 0, 'Source': '', 'Notes': '', 'Jira Key': '', 'Jira Done': '', 'Repeat': '', 'Blocked On': '', 'Last Carried Week': '' }
  ];

  const WORK = {
    todoTabsReady: true,
    todos: TODOS,
    todoSteps: [
      { 'ID': 'TS-001', 'Todo ID': 'TD-101', 'Step': 'Export search terms', 'Status': 'DONE', 'Done At': fmt(shiftDays(MON, -1)), 'Created': fmt(shiftDays(MON, -7)) },
      { 'ID': 'TS-002', 'Todo ID': 'TD-101', 'Step': 'Score against MVP list', 'Status': 'OPEN', 'Done At': '', 'Created': fmt(shiftDays(MON, -7)) },
      { 'ID': 'TS-003', 'Todo ID': 'TD-101', 'Step': 'Apply negatives in both MCCs', 'Status': 'OPEN', 'Done At': '', 'Created': fmt(shiftDays(MON, -7)) }
    ],
    todoLog: [
      { 'ID': 'TL-001', 'Todo ID': 'TD-103', 'At': fmt(shiftDays(MON, -2)) + ' 09:14', 'Who': 'Courtney', 'Note': 'Pinged IT again — waiting on change window.' },
      { 'ID': 'TL-002', 'Todo ID': 'TD-102', 'At': fmt(shiftDays(MON, -1)) + ' 15:40', 'Who': 'CJ', 'Note': 'Mart query drafted, running reconcile.' }
    ],
    issues: [
      { 'ID': 'IS-014', 'Issue': 'GTM internal IPs pollute Brady US/CA conversions', 'Raised By': 'Alex', 'Raised': fmt(shiftDays(MON, -35)), 'Accounts': 'Brady', 'Category': 'Data', 'Votes': 5, 'Status': 'OPEN', 'Park With': '', 'Resolution': '', 'Solved In': '', 'Notes': '', 'Identified': 'Internal traffic not filtered', 'Discussed': '', 'Outcome': '', 'Outcome At': '', 'Review On': '', 'Waiting On': 'TD-103' },
      { 'ID': 'IS-021', 'Issue': 'PDC feed disapprovals climbing', 'Raised By': 'Scott', 'Raised': fmt(shiftDays(MON, -3)), 'Accounts': 'PDC', 'Category': 'Feed', 'Votes': 3, 'Status': 'OPEN', 'Park With': '', 'Resolution': '', 'Solved In': '', 'Notes': '', 'Identified': '', 'Discussed': '', 'Outcome': '', 'Outcome At': '', 'Review On': '', 'Waiting On': '' },
      { 'ID': 'IS-019', 'Issue': 'LinkedIn feed stale creative', 'Raised By': 'Courtney', 'Raised': fmt(shiftDays(MON, -20)), 'Accounts': 'Social', 'Category': 'Creative', 'Votes': 1, 'Status': 'SOLVED', 'Park With': '', 'Resolution': 'Refreshed batch shipped', 'Solved In': 'M-010', 'Notes': '', 'Identified': 'Rotation never scheduled', 'Discussed': 'Owner set', 'Outcome': '', 'Outcome At': '', 'Review On': fmt(shiftDays(MON, 7)), 'Waiting On': '' },
      { 'ID': 'IS-020', 'Issue': 'Seton stand-up cadence', 'Raised By': 'Scott', 'Raised': fmt(shiftDays(MON, -13)), 'Accounts': 'Seton', 'Category': 'Process', 'Votes': 0, 'Status': 'PARKED', 'Park With': 'Scott', 'Resolution': '', 'Solved In': '', 'Notes': '', 'Identified': '', 'Discussed': '', 'Outcome': '', 'Outcome At': '', 'Review On': '', 'Waiting On': '' }
    ],
    headlines: [
      { 'ID': 'HL-031', 'Date': fmt(shiftDays(MON, -1)), 'Type': 'Customer', 'Headline': 'Emedco Q3 promo beat plan by 12%', 'By': 'Scott', 'Cascade': 'YES', 'Meeting ID': '', 'Status': '' },
      { 'ID': 'HL-032', 'Date': fmt(shiftDays(MON, -2)), 'Type': 'Kudos', 'Headline': '🏆 Courtney — social CTR record on Brady US', 'By': 'Alex', 'Cascade': '', 'Meeting ID': '', 'Status': '' },
      { 'ID': 'HL-030', 'Date': fmt(shiftDays(MON, -9)), 'Type': 'FYI', 'Headline': 'Old news that was killed', 'By': 'CJ', 'Cascade': '', 'Meeting ID': '', 'Status': 'KILLED' }
    ]
  };

  const PLAN = {
    rocks: [
      { 'ID': 'RK-001', 'Rock': 'Stand up Seton/Emedco negatives loop end-to-end', 'Owner': 'Scott', 'Due': fmt(shiftDays(MON, 32)), 'Shift': 'Shift 2', 'Accounts': 'Seton', 'Status': 'ON TRACK', 'Definition of Done': 'Weekly negatives applied in both MCCs 4 weeks running', 'Notes': '', 'Created': fmt(shiftDays(MON, -42)), 'Status Updated': fmt(shiftDays(MON, -6)), 'Metric ID': 'SC-013', 'Source': '', fq: 'FY27 Q1' },
      { 'ID': 'RK-002', 'Rock': 'Amazon A/S under 15% with advertised-only base', 'Owner': 'CJ', 'Due': fmt(shiftDays(MON, 60)), 'Shift': 'Shift 1', 'Accounts': 'Amazon', 'Status': 'OFF TRACK', 'Definition of Done': 'SC-015 < 15% for a full month', 'Notes': '', 'Created': fmt(shiftDays(MON, -30)), 'Status Updated': fmt(shiftDays(MON, -6)), 'Metric ID': 'SC-015', 'Source': 'IS-014', fq: 'FY27 Q1' }
    ],
    milestones: [
      { 'ID': 'MS-001', 'Rock ID': 'RK-001', 'Milestone': 'Shared SQR sheet live', 'Due': fmt(shiftDays(MON, -14)), 'Status': 'DONE', 'Done At': fmt(shiftDays(MON, -12)), 'Created': fmt(shiftDays(MON, -42)), 'Notes': '' },
      { 'ID': 'MS-002', 'Rock ID': 'RK-001', 'Milestone': 'First weekly apply in both MCCs', 'Due': fmt(shiftDays(MON, 7)), 'Status': 'OPEN', 'Done At': '', 'Created': fmt(shiftDays(MON, -42)), 'Notes': '' },
      { 'ID': 'MS-003', 'Rock ID': 'RK-001', 'Milestone': '4-week streak', 'Due': fmt(shiftDays(MON, 30)), 'Status': 'OPEN', 'Done At': '', 'Created': fmt(shiftDays(MON, -42)), 'Notes': '' }
    ],
    playbook: [
      { 'Playbook ID': 'PB-002', 'Name': 'Feed disapproval sweep', 'Trigger Keywords': 'feed, disapproval, merchant', 'Accounts': 'PDC', 'What It Answers': 'Which SKUs and why', 'How To Run': 'Merchant Center diagnostics export', 'Standing Caveat': '', 'Updated At': fmt(shiftDays(MON, -20)) }
    ]
  };

  const DEFS = [
    { 'ID': 'SC-001', 'Metric': 'Brady utilization', 'Owner': 'CJ', 'Format': '%', 'Rule': 'between', 'Goal': 95, 'Goal 2': 105, 'Source': 'RANGE', 'Source Ref': "'Financial Dashboard v2'!H7", 'Caveat': '', 'Active': 'YES', 'Sort': 1 },
    { 'ID': 'SC-002', 'Metric': 'Seton/Emedco utilization', 'Owner': 'Scott', 'Format': '%', 'Rule': 'between', 'Goal': 95, 'Goal 2': 105, 'Source': 'RANGE', 'Source Ref': "'Financial Dashboard v2'!H8", 'Caveat': 'GTM defect skews CA conversions', 'Active': 'YES', 'Sort': 2 },
    { 'ID': 'SC-011', 'Metric': 'Brady paid-search A/S %', 'Owner': 'CJ', 'Format': '%', 'Rule': '<=', 'Goal': 40, 'Goal 2': '', 'Source': 'RANGE', 'Source Ref': "'Financial Dashboard v2'!K7", 'Caveat': 'First-touch attribution', 'Active': 'YES', 'Sort': 3 },
    { 'ID': 'SC-006', 'Metric': 'NB negatives added/wk', 'Owner': 'Scott', 'Format': '#', 'Rule': '>=', 'Goal': 10, 'Goal 2': '', 'Source': 'RANGE', 'Source Ref': 'IMPORTRANGE ref', 'Caveat': '', 'Active': 'YES', 'Sort': 4 },
    { 'ID': 'SC-009', 'Metric': 'Experiments running (Brady)', 'Owner': 'Alex', 'Format': '#', 'Rule': '>=', 'Goal': 2, 'Goal 2': '', 'Source': 'RANGE', 'Source Ref': "'L10 - Experiments Scorecard Google Ads pull'!B4", 'Caveat': '', 'Active': 'YES', 'Sort': 5 },
    { 'ID': 'SC-016', 'Metric': 'Manual leads count', 'Owner': 'Courtney', 'Format': '#', 'Rule': '>=', 'Goal': 50, 'Goal 2': '', 'Source': 'MANUAL', 'Source Ref': '', 'Caveat': 'BQ leads source freshness', 'Active': 'YES', 'Sort': 6 }
  ];
  const VALUES = {};
  DEFS.forEach(function (d, di) {
    VALUES[d['ID']] = {};
    WEEKS.forEach(function (w, wi) {
      if (wi === 4 && di === 2) return; // a null week → sparkline gap
      let v;
      if (d['Format'] === '%') v = 90 + ((wi * 7 + di * 13) % 20);
      else v = 5 + ((wi * 3 + di * 5) % 12);
      if (di === 5 && wi < 8) return; // late-start metric: mostly uncaptured
      VALUES[d['ID']][w] = v;
    });
  });
  // This week deliberately uncaptured for one metric (capture-grid path).
  delete VALUES['SC-006'][WEEK_OF];

  const SCORECARD = { scorecard: { defs: DEFS, weeks: WEEKS, values: VALUES } };

  function bootstrapAll() {
    const out = {};
    [CORE, WORK, PLAN, SCORECARD].forEach(function (s) {
      Object.keys(s).forEach(function (k) { out[k] = s[k]; });
    });
    return out;
  }

  // #firstrun: an empty workspace — no history, rocks, or metrics — so the
  // start screen's setup checklist path can be exercised.
  if (location.hash === '#firstrun') {
    CORE.history = [];
    CORE.lastMeeting = null;
    CORE.openMeeting = null;
    CORE.brief = [];
    PLAN.rocks = [];
    PLAN.milestones = [];
    SCORECARD.scorecard.defs = [];
    SCORECARD.scorecard.values = {};
  }

  let idSeq = 500;
  const ok = { ok: true };

  window.__FIXTURES = {
    l10_bootCore: CORE,
    l10_bootWork: WORK,
    l10_bootPlan: PLAN,
    l10_bootScorecard: SCORECARD,
    l10_bootstrap: bootstrapAll,

    l10_settingsData: SETTINGS_DATA,
    l10_hubCounts: { running: 7, needDecision: 6 },

    // Meetings — `row` mirrors the real server's shape (the client splices it
    // into state.boot.openMeeting and paints the first segment immediately).
    l10_startMeeting: function (attendees) {
      return { ok: true, id: 'M-012', row: {
        'ID': 'M-012', 'Date': TODAY, 'Status': 'OPEN',
        'Attendees': (attendees || []).join(', '), 'Started At': TODAY + ' 09:00',
        'Segue (JSON)': '', 'Ratings (JSON)': '{}', 'Todo Done %': '', 'Rating Avg': '',
        'Issues Solved': '', 'Cascade': '', 'Recap': '', 'Notes': ''
      } };
    },
    l10_saveSegue: ok,
    l10_concludeMeeting: { ok: true, todoPct: 86, ratingAvg: 8.5, issuesSolved: 2 },
    l10_cancelMeeting: ok,

    // To-dos
    l10_addTodo: function (payload) { idSeq++; return { ok: true, id: 'TD-' + idSeq, due: (payload && payload.due) || WEEK_OF }; },
    l10_addTodoMulti: function (payload) {
      const owners = (payload && payload.owners) || ['Alex'];
      return { ok: true, items: owners.map(function (o) {
        idSeq++;
        return { row: { 'ID': 'TD-' + idSeq, 'To-Do': (payload && payload.text) || 'New', 'Owner': o, 'Due': (payload && payload.due) || WEEK_OF, 'Status': 'OPEN', 'Created': TODAY, 'Done At': '', 'Carried Over': 0, 'Source': (payload && payload.source) || '', 'Notes': (payload && payload.notes) || '', 'Jira Key': '', 'Jira Done': '', 'Repeat': payload && payload.repeat ? 'WEEKLY' : '', 'Blocked On': '', 'Last Carried Week': '' } };
      }) };
    },
    l10_setTodoStatus: function (id, status) { return { ok: true, id: id, status: status }; },
    l10_setTodoStatusBulk: function (ids, status) { return { ok: true, ids: ids, status: status, nextRows: [] }; },
    l10_editTodo: ok,
    l10_setTodoDue: function (id, due) { return { ok: true, id: id, due: due }; },
    l10_pushTodoDue: function (ids, days) { return { ok: true, moved: (ids || []).map(function (id) { return { id: id, due: WEEK_OF }; }), skipped: [] }; },
    l10_addTodoStep: function (todoId, text) { idSeq++; return { ok: true, step: { 'ID': 'TS-' + idSeq, 'Todo ID': todoId, 'Step': text, 'Status': 'OPEN', 'Done At': '', 'Created': TODAY } }; },
    l10_setTodoStepStatus: function (id, status) { return { ok: true, id: id, status: status, todoDone: false }; },
    l10_deleteTodoStep: ok,
    l10_addTodoLog: function (todoId, note) { idSeq++; return { ok: true, entry: { 'ID': 'TL-' + idSeq, 'Todo ID': todoId, 'At': TODAY + ' 10:00', 'Who': 'Alex', 'Note': note } }; },

    // Issues / IDS
    l10_addIssue: function (payload) { idSeq++; return { ok: true, issue: { 'ID': 'IS-' + idSeq, 'Issue': (payload && payload.text) || 'New issue', 'Raised By': 'Alex', 'Raised': TODAY, 'Accounts': '', 'Category': '', 'Votes': 0, 'Status': 'OPEN', 'Park With': '', 'Resolution': '', 'Solved In': '', 'Notes': '', 'Identified': '', 'Discussed': '', 'Outcome': '', 'Outcome At': '', 'Review On': '', 'Waiting On': '' } }; },
    l10_editIssue: ok,
    l10_voteIssue: function (id, n) { return { ok: true, id: id, votes: n }; },
    l10_resetVotes: ok,
    l10_solveIssue: { ok: true, todoRows: [] },
    l10_reopenIssue: ok,
    l10_parkIssue: ok,
    l10_killIssue: ok,
    l10_saveIssueNotes: ok,
    l10_setIssueOutcome: ok,
    l10_issueNeedsData: ok,
    l10_sendIssueToHub: { ok: true, id: 'IDEA-042' },
    l10_promoteIssue: function (id) { idSeq++; return { ok: true, rock: { 'ID': 'RK-' + idSeq, 'Rock': 'Promoted', 'Owner': 'Alex', 'Due': '', 'Status': 'ON TRACK', 'Created': TODAY, 'Metric ID': '', 'Source': id, fq: '' } }; },
    l10_promoteBriefItem: function (id) { idSeq++; return { ok: true, issue: { 'ID': 'IS-' + idSeq, 'Issue': 'Promoted from brief', 'Raised By': 'Alex', 'Raised': TODAY, 'Votes': 0, 'Status': 'OPEN' } }; },

    // Headlines / rocks / milestones
    l10_addHeadline: function (payload) { idSeq++; return { ok: true, headline: { 'ID': 'HL-' + idSeq, 'Date': TODAY, 'Type': (payload && payload.type) || 'FYI', 'Headline': (payload && payload.text) || 'New', 'By': 'Alex', 'Cascade': '', 'Meeting ID': '', 'Status': '' } }; },
    l10_killHeadline: ok,
    l10_reviveHeadline: ok,
    l10_toggleCascade: ok,
    l10_addRock: function (payload) { idSeq++; return { ok: true, rock: { 'ID': 'RK-' + idSeq, 'Rock': (payload && payload.text) || 'New rock', 'Owner': 'Alex', 'Due': '', 'Shift': '', 'Accounts': '', 'Status': 'ON TRACK', 'Created': TODAY, 'Metric ID': '', 'Source': '', fq: '' } }; },
    l10_setRockStatus: ok,
    l10_editRock: ok,
    l10_addMilestone: function (rockId, text, due) { idSeq++; return { ok: true, milestone: { 'ID': 'MS-' + idSeq, 'Rock ID': rockId, 'Milestone': text, 'Due': due || '', 'Status': 'OPEN', 'Done At': '', 'Created': TODAY, 'Notes': '' }, rockDone: false }; },
    l10_setMilestoneStatus: { ok: true, rockDone: false },
    l10_editMilestone: ok,
    l10_deleteMilestone: ok,

    // Scorecard
    l10_captureWeek: { ok: true, captured: 3, skipped: [] },
    l10_addMetric: function (payload) { idSeq++; return { ok: true, metric: { 'ID': 'SC-' + idSeq, 'Metric': (payload && payload.name) || 'New metric', 'Owner': 'Alex', 'Format': '#', 'Rule': '>=', 'Goal': 0, 'Goal 2': '', 'Source': 'MANUAL', 'Source Ref': '', 'Caveat': '', 'Active': 'YES', 'Sort': 99 } }; },
    l10_addMetricPack: { ok: true, added: 3 },
    l10_editMetric: ok,
    l10_setMetricActive: ok,

    // Settings / misc
    l10_getSettings: {
      config: {
        TEAM: CONFIG.TEAM, SEGMENTS: CONFIG.SEGMENTS, SCORECARD_WEEKS: '13',
        TODO_DONE_TARGET: '90', RATING_BAR: '8', EXPERIMENT_HUB_URL: CONFIG.EXPERIMENT_HUB_URL,
        GA4_PROPERTY_ID: '', CHAT_WEBHOOK_URL: '', TEAM_EMAILS: '', MANAGER_EMAIL: ''
      },
      team: CONFIG.TEAM, webAppUrl: '', jiraTokenSet: true, mailTriggersOn: true
    },
    l10_saveSettings: ok,
    l10_saveNotifyPrefs: ok,
    l10_saveDigests: function (rules) { return { ok: true, digests: rules || [] }; },
    l10_installMailTriggers: ok,
    l10_setJiraToken: ok,
    l10_webAppUrl: '',
    l10_dataHealth: {
      ok: true,
      checkedAt: TODAY + ' 08:00',
      sources: [
        { key: 'spend_mart', label: 'Spend mart (mtd_spend_pull_v3)', lastDate: fmt(shiftDays(NOW, -1)), daysBehind: 1, status: 'FRESH', detail: 'Feeds all pacing + the A/S spend side.' },
        { key: 'leads_lifecycle', label: 'Leads lifecycle (al_leads_lifecycle_v1)', lastDate: fmt(shiftDays(NOW, -12)), daysBehind: 11, status: 'STALE', detail: 'Form fills, ppc first touch. Stale = any lead trend is a lie.' },
        { key: 'web_orders', label: 'Web orders (Combined_order_items)', lastDate: fmt(shiftDays(NOW, -2)), daysBehind: 2, status: 'FRESH', detail: 'Order revenue for A/S.' },
        { key: 'adobe_orders', label: 'Adobe first-touch (aa_global_orders)', lastDate: fmt(shiftDays(NOW, -2)), daysBehind: 2, status: 'FRESH', detail: 'ppc attribution feed.' },
        { key: 'amazon_sp', label: 'Amazon SP (amazon_product_metrics)', lastDate: fmt(shiftDays(NOW, -2)), daysBehind: 2, status: 'FRESH', detail: '14-day attribution restates recent days.' },
        { key: 'amazon_sb', label: 'Amazon SB (sb_query_metrics)', lastDate: fmt(shiftDays(NOW, -2)), daysBehind: 2, status: 'FRESH', detail: 'SB side of the trusted number.' },
        { key: 'sf_opportunities', label: 'SF_AllOpportunites_view', lastDate: '2024-05-24', daysBehind: 790, status: 'BROKEN', detail: 'Frozen since 2024-05-24. Never use.' },
        { key: 'amazon_mart_block', label: 'Amazon block in spend mart (SP+SB?)', lastDate: '', daysBehind: null, status: 'STALE', detail: 'Mart carries only 71% of SP+SB cost — looks SP-only.' }
      ]
    },
    l10_calContext: { ok: true, team: [], tz: 'America/Chicago' },
    l10_calDay: { ok: true, events: [], busy: [] },
    l10_calCreate: { ok: true, link: 'https://calendar.google.com/event-fixture' },
    l10_getGuideHtml: '<h2>Guide fixture</h2>'
  };
})();

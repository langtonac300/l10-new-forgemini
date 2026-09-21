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
  // A 1×1 PNG: the smallest thing avatar() will accept as a team photo.
  const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const CONFIG = {
    TEAM: TEAM.join(', '),
    SEGMENTS: JSON.stringify([['Check-in', 5], ['Metrics', 5], ['Priority review', 5], ['Headlines', 5], ['To-do list', 5], ['Solve', 60], ['Wrap-up', 5]]),
    SCORECARD_WEEKS: '13',
    TODO_DONE_TARGET: '90',
    RATING_BAR: '8',
    TODO_KEEP_DAYS: '60',
    TODO_STALE_CARRIES: '3',
    FISCAL_START_MONTH: '8',
    TEAM_EMAILS: '',
    EXPERIMENT_HUB_URL: 'https://docs.google.com/spreadsheets/d/hub-fixture',
    ACCOUNT_TAGS: 'Brady US, Seton US, EMEDCO, Amazon',
    INITIATIVE_LEAD: 'Courtney',
    INITIATIVE_STALE_DAYS: '14',
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
      { 'Start Date': fmt(shiftDays(NOW, 4)), 'End Date': fmt(shiftDays(NOW, 4)), 'Event': 'FY27 starts', 'Notes': 'Priority reset' },
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
    user: 'alex@bradycorp.com',
    photos: { 'CJ': TINY_PNG }
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
    { 'ID': 'TD-106', 'To-Do': 'Build the Seton US Demand Gen campaign shell', 'Owner': 'Courtney', 'Due': fmt(shiftDays(MON, 6)), 'Status': 'OPEN', 'Created': fmt(shiftDays(MON, -1)), 'Done At': '', 'Carried Over': 0, 'Source': 'SI-001', 'Notes': '', 'Jira Key': '', 'Jira Done': '', 'Repeat': '', 'Blocked On': '', 'Last Carried Week': '' },
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
    // Strategy tabs (v2.14). SI-001 is piloting with an open to-do; SI-002 is
    // rolling out with NO open to-do and last touched 20 days ago (both flags).
    initiativeTabsReady: true,
    initiatives: [
      { 'ID': 'SI-001', 'Initiative': 'Demand Gen campaigns across Google accounts', 'Thesis': 'Demand Gen beat Display on CPL in Brady US; the audience signals should transfer.', 'Lead': 'Courtney', 'Shift': 'Shift 2', 'Stage': 'PILOTING', 'Origin': 'Brady US test EXP-014', 'Target Quarter': 'FY27 Q2', 'Notes': '', 'Created': fmt(shiftDays(MON, -21)), 'Last Touched': fmt(shiftDays(MON, -1)) + ' 10:12', 'Decided At': '', 'Decision': '', 'Next Check-in': fmt(shiftDays(MON, 10)), 'Expected Impact': '−15% CPL on Seton US ≈ $40K/yr', 'Effort': 'M' },
      { 'ID': 'SI-002', 'Initiative': 'Port the NB negatives loop to every account', 'Thesis': 'The Seton loop saves ~$700/wk; the same script runs anywhere.', 'Lead': 'Courtney', 'Shift': 'Shift 1', 'Stage': 'ROLLING OUT', 'Origin': 'Seton/Emedco', 'Target Quarter': '', 'Notes': '', 'Created': fmt(shiftDays(MON, -60)), 'Last Touched': fmt(shiftDays(MON, -20)) + ' 09:00', 'Decided At': '', 'Decision': '', 'Next Check-in': '', 'Expected Impact': '', 'Effort': 'S' },
      { 'ID': 'SI-003', 'Initiative': 'Broad match + tROAS on brand', 'Thesis': '', 'Lead': 'CJ', 'Shift': 'Shift 1', 'Stage': 'IDEA', 'Origin': '', 'Target Quarter': '', 'Notes': '', 'Created': fmt(shiftDays(MON, -40)), 'Last Touched': fmt(shiftDays(MON, -40)) + ' 14:30', 'Decided At': '', 'Decision': '', 'Next Check-in': '', 'Expected Impact': '', 'Effort': '' },
      { 'ID': 'SI-004', 'Initiative': 'Apple Ads for the catalog brands', 'Thesis': '', 'Lead': 'Courtney', 'Shift': 'Shift 4', 'Stage': 'KILLED', 'Origin': '', 'Target Quarter': '', 'Notes': '', 'Created': fmt(shiftDays(MON, -90)), 'Last Touched': fmt(shiftDays(MON, -30)) + ' 11:00', 'Decided At': fmt(shiftDays(MON, -30)), 'Decision': 'No volume outside Brady US', 'Next Check-in': '', 'Expected Impact': '', 'Effort': '' },
      { 'ID': 'SI-005', 'Initiative': 'Brand tROAS on Seton', 'Thesis': '', 'Lead': 'Scott', 'Shift': 'Shift 1', 'Stage': 'ADOPTED', 'Origin': '', 'Target Quarter': '', 'Notes': '', 'Created': fmt(shiftDays(MON, -140)), 'Last Touched': fmt(shiftDays(MON, -100)) + ' 11:00', 'Decided At': fmt(shiftDays(MON, -100)), 'Decision': 'ROAS +22% at flat spend over 6 weeks; kept.', 'Next Check-in': '', 'Expected Impact': '', 'Effort': 'S' }
    ],
    initiativeAccounts: [
      { 'ID': 'SA-001', 'Initiative ID': 'SI-001', 'Account': 'Brady US', 'State': 'ADOPTED', 'Hub Ref': 'EXP-014', 'Rock ID': '', 'Note': 'CPL -18% vs Display', 'Updated At': fmt(shiftDays(MON, -7)) + ' 10:00' },
      { 'ID': 'SA-002', 'Initiative ID': 'SI-001', 'Account': 'Seton US', 'State': 'TESTING', 'Hub Ref': 'IDEA-051', 'Rock ID': '', 'Note': '', 'Updated At': fmt(shiftDays(MON, -1)) + ' 10:12' },
      { 'ID': 'SA-003', 'Initiative ID': 'SI-001', 'Account': 'EMEDCO', 'State': 'NOT STARTED', 'Hub Ref': '', 'Rock ID': '', 'Note': '', 'Updated At': fmt(shiftDays(MON, -21)) + ' 09:00' },
      { 'ID': 'SA-004', 'Initiative ID': 'SI-002', 'Account': 'Seton US', 'State': 'ADOPTED', 'Hub Ref': '', 'Rock ID': 'RK-001', 'Note': '', 'Updated At': fmt(shiftDays(MON, -40)) + ' 09:00' },
      { 'ID': 'SA-005', 'Initiative ID': 'SI-002', 'Account': 'Brady US', 'State': 'TESTING', 'Hub Ref': '', 'Rock ID': '', 'Note': 'script installed, first apply pending', 'Updated At': fmt(shiftDays(MON, -20)) + ' 09:00' }
    ],
    initiativeLog: [
      { 'ID': 'SL-001', 'Initiative ID': 'SI-001', 'At': fmt(shiftDays(MON, -1)) + ' 10:12', 'Who': 'Courtney', 'Note': 'Seton US: not started → TESTING · hub IDEA-051' },
      { 'ID': 'SL-002', 'Initiative ID': 'SI-001', 'At': fmt(shiftDays(MON, -21)) + ' 09:00', 'Who': 'Courtney', 'Note': 'Created' }
    ],
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

  // #firstrun: an empty workspace — no history, priorities, or metrics — so the
  // start screen's setup checklist path can be exercised.
  if (location.hash === '#firstrun') {
    CORE.history = [];
    CORE.lastMeeting = null;
    CORE.openMeeting = null;
    CORE.brief = [];
    PLAN.rocks = [];
    PLAN.milestones = [];
    PLAN.initiatives = [];
    PLAN.initiativeAccounts = [];
    PLAN.initiativeLog = [];
    SCORECARD.scorecard.defs = [];
    SCORECARD.scorecard.values = {};
  }

  let idSeq = 500;
  const ok = { ok: true };

  // --- Forge (v2.18): a small stateful session so the smoke can walk Lobby →
  // Locked on the room screen and drive the player view. Shapes mirror
  // l10ForgePersonalize_ in L10Forge.gs. The default day: one ideas round on a
  // seeded wall → claim → write the goal → one peer review → commit.
  const FORGE_PHASES = [['DIVERGE', 'New ideas', 600, 1], ['CLAIM', 'Claim', 600], ['FORGE', 'Write the goal', 2400], ['DOCTOR', 'Peer review', 600, 1], ['COMMIT', 'Commit', 600]]
    .map((p) => ({ key: p[0], label: p[1], seconds: p[2], rounds: p[3] || 1 }));
  const FORGE_PROMPTS = {
    opener: [{ text: 'Launch a podcast sponsorship.', answer: 'project' }, { text: 'Run four experiments.', answer: 'task' },
      { text: 'Grow PDC sales-accepted pipeline within an agreed cost and quality limit.', answer: 'outcome' }, { text: 'Save five hours a week preparing reports.', answer: 'incomplete' }],
    openerLabels: [['outcome', 'Outcome'], ['project', 'Project'], ['task', 'Recurring task'], ['incomplete', 'Incomplete goal']],
    rounds: [{ title: 'New ideas', prompt: 'The FY27 goals and the team backlog are on the wall. What is missing for YOUR accounts? One idea per card.' }],
    wildcards: ['+$250K lands tomorrow. Where?', 'Cut 10% and hold revenue. How?'],
    card: 'For [account], change [thing] because [reason], so that [result].',
    relay: ['Strengthen the revenue link.', 'Add a test or a missing assumption.'],
    thought: [{ title: 'July 31, 2027', minutes: 10, prompt: 'Write the TLDR Stuart sends Nicole.' }],
    doctor: ['Specific enough?', 'Has a number, source, date?', 'Names the FY27 goal it serves?', 'Could they hit it without helping the business?'],
    stuart: ['What is the why?'], rungs: ['Revenue / pacing', 'Leading indicator', 'Volume', 'Automation'],
    levers: ['Spend allocation', 'Efficiency', 'Conversion (LP / feed / creative)'], shifts: ['Shift 1', 'Shift 2', 'Shift 3', 'Shift 4']
  };
  const FORGE_LINES = [['Direct revenue', '+8% YoY shipped direct revenue to $121.8M at $8.22 direct ROAS'],
    ['New customers', 'Paid search new-customer acquisition +5% on BradyID, +3% on Seton US'],
    ['Awareness: create demand', 'Always-on brand campaign; a scalable ad-asset process']];
  // The seeded wall, as FORGE_SEED_CARDS rows: [text, area, source].
  const FORGE_SEEDS = [['Drive +8% YoY shipped direct revenue at $8.22 direct ROAS.', 'Direct revenue', 'Stuart'],
    ['Grow paid search new-customer acquisition +5% on BradyID.', 'New customers', 'Stuart'],
    ['Scope at least one host-read podcast opportunity by end of Q1.', 'Awareness: create demand', 'Team'],
    ['Use AI to build out barren landing pages and test them against the originals.', 'New customers', 'Team']];
  const FORGE_CFG = { voteMode: 'TOKENS', tokens: 10, tokenMax: 4, dots: 5, dotMax: 2, superVotes: 1, ideaTarget: 15, reviews: 1, shortlist: 12,
    goalsPerPerson: 5, lines: FORGE_LINES, hasVote: false, hasHandoffs: false, timedWrite: false, seeds: FORGE_SEEDS.length,
    q1By: '2026-10-31', pollSec: 3, timedWriteMin: 10, wheel: true, fy: 'FY27', accounts: ['Brady US', 'Seton US'], team: TEAM };
  const FORGE = { seq: 1, sessions: {} };
  function forgeSeed(id, title, facilitator, phase, round) {
    const ses = { id: id, title: title, status: 'OPEN', date: TODAY, facilitator: facilitator, phase: phase, round: round,
      phaseStartedAt: Date.now(), phaseSeconds: 300, pausedAt: 0, participants: TEAM.slice(), themes: [], flags: {}, timedWrite: null,
      ratings: {}, lockedAt: '', version: 1, ideas: [], votes: [], handoffs: [], goals: [], opener: {}, ideaSeq: 0, goalSeq: 0, hoSeq: 0 };
    // The seeded wall first (round S, never anonymous, area as theme), then the
    // three cards the room writes in the ideas round.
    FORGE_SEEDS.forEach((sd) => {
      ses.ideaSeq++;
      ses.ideas.push({ id: 'FI-' + String(ses.ideaSeq).padStart(3, '0'), round: 'S', prompt: 'seed', idea: sd[0], by: sd[2], anon: false,
        buildBy: '', build: '', relay2By: '', relay2: '', theme: sd[1], account: '', shift: '', lever: '', status: 'RAW', claimedBy: '', goalId: '', parkedTo: '', created: TODAY });
    });
    [['Courtney', 'For Brady US, run a Demand Gen test because search is capped, so that NB leads grow.'],
     ['CJ', 'For Seton US, tier the Shopping feed because half the spend is at break-even, so that ROAS reaches 1.08.'],
     ['Scott', 'For EMEDCO, move feeds in-house because Feedonomics costs $15K, so that we control freshness.']].forEach((x) => {
      ses.ideaSeq++;
      ses.ideas.push({ id: 'FI-' + String(ses.ideaSeq).padStart(3, '0'), round: '1', prompt: 'New ideas', idea: x[1], by: x[0], anon: true,
        buildBy: '', build: '', relay2By: '', relay2: '', theme: '', account: '', shift: '', lever: '', status: 'RAW', claimedBy: '', goalId: '', parkedTo: '', created: TODAY });
    });
    ses.goalSeq++;
    ses.goals.push({ id: 'G-' + String(ses.goalSeq).padStart(3, '0'), person: 'CJ', goalNo: 1, type: 'Business', title: 'Deliver Brady US to guardrail',
      line: 'Direct revenue', rung: 'Revenue / pacing', lever: 'Spend allocation', metric: 'Utilization %', source: 'Financial Dashboard v2', baseline: '88.1%', target: '95–105%',
      deadline: '2027-01-31', doneWhen: 'Three months inside the band', indicator: '', stake: 'unknown', shift: 'Shift 1', ms1: '', ms1Due: '', ms2: '', ms2Due: '',
      doctorBy: '', doctorChecks: null, doctorNote: '', doctor2By: '', doctor2Checks: null, doctor2Note: '', verdict: '', status: 'DRAFT', ideaId: '', rockId: '',
      writtenAt: '', guardrail: 'revenue at plan per BD', dependency: '', priv: false });
    FORGE.sessions[id] = ses;
    return ses;
  }
  forgeSeed('FS-001', 'Fixture goals day', 'Alex', 'DIVERGE', 1);
  function forgePhaseIdx(key) { for (let i = 0; i < FORGE_PHASES.length; i++) if (FORGE_PHASES[i].key === key) return i; return key === 'LOCKED' ? FORGE_PHASES.length : -1; }
  function forgePast(ses, key) { return forgePhaseIdx(ses.phase) >= forgePhaseIdx(key); }
  function forgeDoctorAssign(participants, reviews) {
    const out = {}; const n = participants.length;
    participants.forEach((p, i) => { out[p] = []; for (let r = 1; r <= reviews; r++) out[p].push(n > 1 ? participants[(i + r) % n] : ''); });
    return out;
  }
  function forgeState(ses, who) {
    if (!ses) return { ok: false, error: 'Session not found.' };
    const namesOpen = forgePast(ses, 'CLAIM');
    const revealed = !!ses.flags.openerRevealed;
    const tallies = {}, mine = {}, voters = {};
    ses.votes.forEach((v) => {
      voters[v.by] = true;
      if (v.by === who) { mine[v.target] = mine[v.target] || { dots: 0, supers: 0 }; mine[v.target][v.kind === 'SUPER' ? 'supers' : 'dots']++; }
      if (v.by === ses.facilitator && !ses.flags.facilitatorShown) return;
      tallies[v.target] = tallies[v.target] || { dots: 0, supers: 0 }; tallies[v.target][v.kind === 'SUPER' ? 'supers' : 'dots']++;
    });
    const answers = {};
    Object.keys(ses.opener).forEach((n) => { if (revealed || n === who) answers[n] = ses.opener[n]; });
    return {
      ok: true, version: ses.version, serverNow: Date.now(), me: who,
      session: { id: ses.id, title: ses.title, status: ses.status, date: ses.date, facilitator: ses.facilitator, phase: ses.phase, round: ses.round,
        phaseStartedAt: ses.phaseStartedAt, phaseSeconds: ses.phaseSeconds, pausedAt: ses.pausedAt, participants: ses.participants.slice(),
        themes: JSON.parse(JSON.stringify(ses.themes)), flags: Object.assign({}, ses.flags), timedWrite: ses.timedWrite, ratings: Object.assign({}, ses.ratings), lockedAt: ses.lockedAt },
      phases: FORGE_PHASES, prompts: FORGE_PROMPTS, cfg: FORGE_CFG,
      ideas: ses.ideas.filter((i) => i.status !== 'DROPPED').map((i) => Object.assign({}, i, { mine: !!who && i.by === who, by: (i.anon && !namesOpen && i.by !== who) ? '' : i.by })),
      opener: { answered: Object.keys(ses.opener), answers: answers },
      voted: Object.keys(voters), myVotes: mine, tallies: forgePast(ses, 'COMMITTEE') ? tallies : {},
      handoffs: ses.handoffs.map((h) => Object.assign({}, h)),
      goals: ses.goals.filter((g) => g.status !== 'SUPERSEDED').map((g) => (g.priv && g.person !== who) ? { id: g.id, person: g.person, type: g.type, priv: true, status: g.status, hidden: true, goalNo: g.goalNo } : Object.assign({}, g)),
      doctorAssign: forgeDoctorAssign(ses.participants, FORGE_CFG.reviews),
      scorecard: [{ id: 'SC-001', name: 'Brady Paid Search (US+CA) — budget utilization %' }, { id: 'SC-002', name: 'Seton/Emedco — budget utilization %' }]
    };
  }
  function forgeEnter(ses, i, r) {
    const ph = FORGE_PHASES[i];
    ses.phase = ph.key; ses.round = r; ses.phaseStartedAt = Date.now(); ses.phaseSeconds = ph.seconds; ses.pausedAt = 0;
    if (ph.key === 'RELAY') {
      const n = ses.participants.length;
      ses.ideas.forEach((c) => { if (c.round === 'O') return; const k = ses.participants.indexOf(c.by); const to = ses.participants[(Math.max(0, k) + r) % n]; if (r === 1) c.buildBy = to; else c.relay2By = to; });
    }
  }
  function forgeBump(ses) { ses.version++; return { ok: true, version: ses.version }; }
  function forgeSes(id) { return FORGE.sessions[id]; }

  window.__FIXTURES = {
    l10_bootCore: CORE,
    l10_bootWork: WORK,
    l10_bootPlan: PLAN,
    l10_bootScorecard: SCORECARD,
    l10_bootstrap: bootstrapAll,

    l10_settingsData: SETTINGS_DATA,

    // Team stats — the whole to-do tab, compact rows (see l10_teamStats).
    // Deterministic relative to MON so the smoke suite can assert exact
    // numbers: see the TEAM_STATS_EXPECT block in run.js.
    l10_teamStats: function () {
      var rows = [];
      function td(id, owner, cWk, dueOff, status, dOff, carried, source, repeat) {
        rows.push({ id: id, owner: owner, created: fmt(shiftDays(MON, cWk)), due: dueOff === null ? '' : fmt(shiftDays(MON, cWk + dueOff)),
          doneAt: dOff === null ? '' : fmt(shiftDays(MON, cWk + dOff)), status: status, carried: carried || 0,
          source: source || '', repeat: !!repeat, blocked: status === 'BLOCKED', jira: false, steps: id === 'TD-201' ? 2 : 0, notes: id === 'TD-202' ? 1 : 0 });
      }
      // Live rows mirror the boot fixture's five to-dos.
      td('TD-101', 'Scott', -7, 11, 'OPEN', null, 0);
      td('TD-102', 'CJ', -14, 11, 'WORKING', null, 1);
      td('TD-103', 'Courtney', -28, 18, 'BLOCKED', null, 3, 'IS-014');
      td('TD-104', 'Alex', -7, 7, 'DONE', 7, 0, '', true);
      td('TD-105', 'Scott', -2, 4, 'OPEN', null, 0);
      // Finished history across the last 13 weeks.
      td('TD-201', 'Alex', -70, 5, 'DONE', 4, 0, 'IS-014');
      td('TD-202', 'Courtney', -63, 7, 'DONE', 9, 1);
      td('TD-203', 'CJ', -56, 7, 'DONE', 3, 0, 'EMAIL');
      td('TD-204', 'Scott', -49, 7, 'DONE', 16, 2);
      td('TD-205', 'Alex', -42, null, 'DONE', 2, 0);
      td('TD-206', 'CJ', -35, 7, 'DROPPED', 12, 1);
      td('TD-207', 'Courtney', -28, 7, 'DONE', 6, 0, 'RK-001');
      td('TD-208', 'Scott', -21, 7, 'DONE', 5, 0);
      td('TD-209', 'Alex', -14, 7, 'DONE', 13, 3);
      td('TD-210', 'CJ', -14, 3, 'DONE', 2, 0, 'MANUAL');
      // Older than any 13-week window — must not leak into those numbers.
      td('TD-001', 'Alex', -120, 7, 'DONE', 3, 0);
      td('TD-002', 'Scott', -110, 7, 'DROPPED', null, 2); // pre-v2.12 drop: no Done At, keys on Created
      return {
        ok: true, asOf: TODAY + ' 09:00', today: TODAY, weekOf: WEEK_OF, team: TEAM,
        target: 90, staleAt: 3, perPerson: true, todos: rows,
        meetings: CORE.history.map(function (m) { return { date: m['Date'], pct: Number(m['Todo Done %']), done: Number(m['Todos Done']), open: Number(m['Todos Open']) }; })
      };
    },
    l10_hubCounts: { running: 7, needDecision: 6 },
    // Team photos (Settings → Team)
    l10_setTeamPhoto: function (name, uri) { return { ok: true, name: name }; },
    l10_removeTeamPhoto: function (name) { return { ok: true, name: name }; },

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
    l10_addTodoStep: function (todoId, text) { idSeq++; return { ok: true, row: { 'ID': 'TS-' + idSeq, 'Todo ID': todoId, 'Step': text, 'Status': 'OPEN', 'Done At': '', 'Created': TODAY } }; },
    l10_setTodoStepStatus: function (id, status) { return { ok: true, id: id, status: status, todoDone: false }; },
    l10_deleteTodoStep: ok,
    l10_addTodoLog: function (todoId, note) { idSeq++; return { ok: true, row: { 'ID': 'TL-' + idSeq, 'Todo ID': todoId, 'At': TODAY + ' 10:00', 'Who': 'Alex', 'Note': note } }; },

    // Issues / Solve
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
    // Mirrors the real server: {ok, id, row} on first promote, {ok, id,
    // already:true} on a re-tap — the client's splice path depends on `row`.
    l10_promoteBriefItem: (function () {
      const promoted = {};
      return function (weekOf, rank) {
        const key = weekOf + '|' + rank;
        if (promoted[key]) return { ok: true, id: promoted[key], already: true };
        idSeq++;
        const id = 'IS-' + idSeq;
        promoted[key] = id;
        return { ok: true, id: id, row: {
          'ID': id, 'Issue': 'Promoted from brief', 'Raised By': 'Alex', 'Raised': TODAY,
          'Accounts': 'PDC', 'Category': '', 'Votes': 0, 'Status': 'OPEN', 'Park With': '',
          'Resolution': '', 'Solved In': '', 'Notes': 'from pre-brief ' + weekOf,
          'Identified': 'Promoted docket context', 'Discussed': '', 'Outcome': '',
          'Outcome At': '', 'Review On': '', 'Waiting On': ''
        } };
      };
    })(),

    // Headlines / priorities / milestones
    l10_addHeadline: function (payload) { idSeq++; return { ok: true, headline: { 'ID': 'HL-' + idSeq, 'Date': TODAY, 'Type': (payload && payload.type) || 'FYI', 'Headline': (payload && payload.text) || 'New', 'By': 'Alex', 'Cascade': '', 'Meeting ID': '', 'Status': '' } }; },
    l10_killHeadline: ok,
    l10_reviveHeadline: ok,
    l10_toggleCascade: ok,
    l10_addRock: function (payload) { idSeq++; return { ok: true, rock: { 'ID': 'RK-' + idSeq, 'Rock': (payload && payload.text) || 'New priority', 'Owner': 'Alex', 'Due': '', 'Shift': '', 'Accounts': '', 'Status': 'ON TRACK', 'Created': TODAY, 'Metric ID': '', 'Source': '', fq: '' } }; },
    l10_setRockStatus: ok,

    // Strategy initiatives (v2.14) — shapes mirror L10Code.gs.
    l10_addInitiative: function (p) {
      idSeq++;
      const id = 'SI-' + idSeq, now = TODAY + ' 10:00';
      return { ok: true, id: id,
        row: { 'ID': id, 'Initiative': (p && p.title) || 'New initiative', 'Thesis': (p && p.thesis) || '', 'Lead': (p && p.lead) || 'Courtney', 'Shift': (p && p.shift) || '', 'Stage': 'IDEA', 'Origin': (p && p.origin) || '', 'Target Quarter': '', 'Notes': '', 'Created': TODAY, 'Last Touched': now, 'Decided At': '', 'Decision': '', 'Next Check-in': (p && p.nextCheck) || '', 'Expected Impact': (p && p.impact) || '', 'Effort': (p && p.effort) || '' },
        cells: ((p && p.accounts) || []).map(function (a) { idSeq++; return { 'ID': 'SA-' + idSeq, 'Initiative ID': id, 'Account': a, 'State': 'NOT STARTED', 'Hub Ref': '', 'Rock ID': '', 'Note': '', 'Updated At': now }; }),
        log: { 'ID': 'SL-' + idSeq, 'Initiative ID': id, 'At': now, 'Who': 'Alex', 'Note': 'Created' } };
    },
    l10_editInitiative: function (id) { return { ok: true, id: id, touched: TODAY + ' 10:01', log: { 'ID': 'SL-9', 'Initiative ID': id, 'At': TODAY + ' 10:01', 'Who': 'Alex', 'Note': 'Edited' } }; },
    l10_setInitiativeStage: function (id, stage, decision) {
      const decided = stage === 'ADOPTED' || stage === 'KILLED';
      return { ok: true, id: id, stage: stage, decidedAt: decided ? TODAY : '', decision: decided ? (decision || '') : '', touched: TODAY + ' 10:02', log: { 'ID': 'SL-8', 'Initiative ID': id, 'At': TODAY + ' 10:02', 'Who': 'Alex', 'Note': '→ ' + stage } };
    },
    l10_setInitiativeAccount: function (p) {
      idSeq++;
      return { ok: true, touched: TODAY + ' 10:03', row: { 'ID': 'SA-' + idSeq, 'Initiative ID': p.initiativeId, 'Account': p.account, 'State': p.state || 'NOT STARTED', 'Hub Ref': p.hubRef || '', 'Rock ID': p.rockId || '', 'Note': p.note || '', 'Updated At': TODAY + ' 10:03' }, log: { 'ID': 'SL-' + idSeq, 'Initiative ID': p.initiativeId, 'At': TODAY + ' 10:03', 'Who': 'Alex', 'Note': p.account + ': → ' + (p.state || '') } };
    },
    l10_addInitiativeLog: function (p) { idSeq++; return { ok: true, row: { 'ID': 'SL-' + idSeq, 'Initiative ID': p.initiativeId, 'At': TODAY + ' 10:04', 'Who': 'Alex', 'Note': p.note } }; },
    l10_sendInitiativeToHub: function (id, acct) { idSeq++; return { ok: true, ideaId: 'IDEA-0' + idSeq, touched: TODAY + ' 10:05', row: { 'ID': 'SA-x', 'Initiative ID': id, 'Account': acct, 'State': 'TESTING', 'Hub Ref': 'IDEA-0' + idSeq, 'Rock ID': '', 'Note': '', 'Updated At': TODAY + ' 10:05' }, log: null }; },
    l10_promoteInitiativeToRock: function (id, acct, p) { idSeq++; return { ok: true, rockId: 'RK-' + idSeq, touched: TODAY + ' 10:06', rock: { 'ID': 'RK-' + idSeq, 'Rock': (p && p.title) || 'Promoted', 'Owner': 'Courtney', 'Due': '', 'Shift': '', 'Accounts': acct, 'Status': 'ON TRACK', 'Created': TODAY, 'Metric ID': '', 'Source': id, fq: '' }, row: { 'ID': 'SA-y', 'Initiative ID': id, 'Account': acct, 'State': 'TESTING', 'Hub Ref': '', 'Rock ID': 'RK-' + idSeq, 'Note': '', 'Updated At': TODAY + ' 10:06' }, log: null }; },
    l10_editRock: ok,
    l10_addMilestone: function (rockId, text, due) { idSeq++; return { ok: true, milestone: { 'ID': 'MS-' + idSeq, 'Rock ID': rockId, 'Milestone': text, 'Due': due || '', 'Status': 'OPEN', 'Done At': '', 'Created': TODAY, 'Notes': '' }, rockDone: false }; },
    l10_setMilestoneStatus: { ok: true, rockDone: false },
    l10_editMilestone: ok,
    l10_deleteMilestone: ok,

    // Metrics
    // Capture returns {written: {id: value}, notes: [why…]} (see l10_captureWeek
    // in L10Code.gs). Stateful so the smoke can watch the notes appear, get
    // replaced by the next capture, and clear on a clean one.
    l10_captureWeek: (function () {
      var calls = 0;
      return function () {
        calls++;
        if (calls === 1) return { ok: true, written: { 'SC-001': 101.2 }, notes: [
          'SC-002: could not capture — the source cell Financial Dashboard v2!H8 is blank — nothing to capture until it holds a value.',
          'SC-006: could not capture — the Source Ref formula shows "#REF!", which is not a number (a formula error — for IMPORTRANGE, open the tab and allow access once).'
        ] };
        if (calls === 2) return { ok: true, written: { 'SC-001': 101.2, 'SC-006': 12 }, notes: [
          'SC-002: could not capture — the source cell Financial Dashboard v2!H8 is blank — nothing to capture until it holds a value.'
        ] };
        return { ok: true, written: { 'SC-001': 101.2, 'SC-002': 97.5, 'SC-006': 12 }, notes: [] };
      };
    })(),
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
    l10_getGuideHtml: '<h2>Guide fixture</h2>',

    // Forge (v2.18). No passphrase by default (FORGE_PASSWORD blank): the reads
    // answer straight away and unlock hands back the "open" token, like the server.
    l10_forgeUnlock: function () { return { ok: true, token: 'open' }; },
    l10_forgeHome: function () {
      const list = Object.values(FORGE.sessions).filter((x) => x.status !== 'DISCARDED').map((x) => ({ id: x.id, date: x.date, title: x.title, status: x.status, phase: x.phase,
        facilitator: x.facilitator, participants: x.participants.slice(), lockedAt: x.lockedAt, ratings: x.ratings, ideas: x.ideas.length, goals: x.goals.length, rating: null }));
      const open = list.filter((x) => x.status === 'OPEN');
      return { ok: true, ready: true, enabled: true, wheel: true, sessions: list.reverse(), open: open.length ? open[open.length - 1].id : '', team: TEAM, webAppUrl: 'https://script.google.com/macros/s/fixture/exec',
        phases: FORGE_PHASES.map((p) => p.label + (p.rounds > 1 ? ' ×' + p.rounds : '')), seeds: FORGE_SEEDS.length, timedWrite: false };
    },
    l10_forgeCreate: function (title, fac) { FORGE.seq++; const id = 'FS-' + String(FORGE.seq).padStart(3, '0'); forgeSeed(id, title || 'Forge', fac, 'LOBBY', 0); return { ok: true, id: id, seeded: FORGE_SEEDS.length }; },
    l10_forgeDiscard: function (id) { const ses = forgeSes(id); if (ses) ses.status = 'DISCARDED'; return { ok: true }; },
    l10_forgePlayerBoot: function (id, who) { const st = forgeState(forgeSes(id), who); return { ok: !!st.ok, error: st.error, team: TEAM, photos: { CJ: TINY_PNG }, meetingName: 'Fixture', state: st }; },
    l10_forgeState: function (id, since, who) { const ses = forgeSes(id); if (!ses) return { ok: false, error: 'Session not found.' }; if (since && Number(since) === ses.version) return { ok: true, unchanged: true, version: ses.version, serverNow: Date.now() }; return forgeState(ses, who); },
    l10_forgeJoin: function (id, name) { const ses = forgeSes(id); if (ses.participants.indexOf(name) === -1) { ses.participants.push(name); forgeBump(ses); } return { ok: true, participants: ses.participants }; },
    l10_forgePhase: function (id, action, arg) {
      const ses = forgeSes(id); if (!ses) return { ok: false, error: 'not found' };
      const idx = forgePhaseIdx(ses.phase); const now = Date.now();
      switch (action) {
        case 'start': forgeEnter(ses, 0, 1); break;
        case 'next': if (ses.phase === 'LOBBY') forgeEnter(ses, 0, 1); else if (ses.round < FORGE_PHASES[idx].rounds) forgeEnter(ses, idx, ses.round + 1); else if (idx + 1 < FORGE_PHASES.length) forgeEnter(ses, idx + 1, 1); else return { ok: false, error: 'last phase' }; break;
        case 'back': if (ses.round > 1) forgeEnter(ses, idx, ses.round - 1); else if (idx > 0) forgeEnter(ses, idx - 1, FORGE_PHASES[idx - 1].rounds); break;
        case 'goto': forgeEnter(ses, forgePhaseIdx(String(arg)), 1); break;
        case 'pause': if (!ses.pausedAt) ses.pausedAt = now; break;
        case 'resume': if (ses.pausedAt) { ses.phaseStartedAt += now - ses.pausedAt; ses.pausedAt = 0; } break;
        case 'add60': ses.phaseSeconds += 60; break;
        case 'end': ses.phaseStartedAt = now - ses.phaseSeconds * 1000; ses.pausedAt = 0; break;
        case 'endWrite': { const tw = ses.timedWrite; ses.timedWrite = null; if (tw && tw.resume && ses.pausedAt) { ses.phaseStartedAt += now - ses.pausedAt; ses.pausedAt = 0; } break; }
        case 'reveal': ses.flags.openerRevealed = true; break;
        case 'showMine': ses.flags.facilitatorShown = true; break;
        default: return { ok: false, error: 'unknown action ' + action };
      }
      return forgeBump(ses);
    },
    l10_forgeTimedWrite: function (id, prompt, seconds, mode) { const ses = forgeSes(id); const running = ses.phase !== 'LOBBY' && !ses.pausedAt; ses.timedWrite = { prompt: prompt, seconds: seconds, mode: mode, startedAt: Date.now(), resume: running }; if (running) ses.pausedAt = Date.now(); return forgeBump(ses); },
    l10_forgeOpener: function (id, who, labelsJson) { const ses = forgeSes(id); ses.opener[who] = JSON.parse(labelsJson); return forgeBump(ses); },
    l10_forgeAddIdea: function (id, who, text) {
      const ses = forgeSes(id); ses.ideaSeq++;
      const round = ses.timedWrite ? 'T' : ses.phase === 'DIVERGE' ? String(ses.round) : ses.phase === 'LOBBY' ? 'P' : 'X';
      const row = { id: 'FI-' + String(ses.ideaSeq).padStart(3, '0'), round: round, prompt: '', idea: text, by: who, anon: round !== 'P', buildBy: '', build: '', relay2By: '', relay2: '', theme: '', account: '', shift: '', lever: '', status: 'RAW', claimedBy: '', goalId: '', parkedTo: '', created: TODAY };
      ses.ideas.push(row); forgeBump(ses); return { ok: true, id: row.id, row: row };
    },
    l10_forgeEditIdea: function (ideaId, who, text) { Object.values(FORGE.sessions).forEach((ses) => ses.ideas.forEach((c) => { if (c.id === ideaId && c.by === who) { c.idea = text; forgeBump(ses); } })); return { ok: true }; },
    l10_forgeDropIdea: function (ideaId) { Object.values(FORGE.sessions).forEach((ses) => ses.ideas.forEach((c) => { if (c.id === ideaId) { c.status = 'DROPPED'; forgeBump(ses); } })); return { ok: true }; },
    l10_forgeBuild: function (ideaId, who, text) { Object.values(FORGE.sessions).forEach((ses) => ses.ideas.forEach((c) => { if (c.id === ideaId) { if (ses.round >= 2) c.relay2 = text; else c.build = text; if (text) c.status = 'BUILT'; forgeBump(ses); } })); return { ok: true }; },
    l10_forgeCluster: function (id, themes) {
      const ses = forgeSes(id);
      ses.themes = (themes || []).map((t, i) => ({ id: t.id || ('T' + (i + 1)), name: t.name || ('Theme ' + (i + 1)), ideaIds: (t.ideaIds || []).slice(), selected: !!t.selected, stop: t.stop || '' }));
      ses.themes.forEach((t) => t.ideaIds.forEach((iid) => ses.ideas.forEach((c) => { if (c.id === iid) c.theme = t.name; })));
      forgeBump(ses); return { ok: true, themes: ses.themes };
    },
    l10_forgeVote: function (id, who, target, kind) { const ses = forgeSes(id); ses.votes.push({ target: target, by: who, kind: kind }); return forgeBump(ses); },
    l10_forgeUnvote: function (id, who, target, kind) { const ses = forgeSes(id); const i = ses.votes.map((v) => v.by === who && v.target === target && v.kind === kind).lastIndexOf(true); if (i !== -1) ses.votes.splice(i, 1); return forgeBump(ses); },
    l10_forgeCommittee: function (id, themes, note) {
      const ses = forgeSes(id);
      ses.themes = (themes || []).map((t) => ({ id: t.id, name: t.name, ideaIds: (t.ideaIds || []).slice(), selected: !!t.selected, stop: t.stop || '' }));
      ses.flags.committeeNote = note || '';
      const chosen = {}; ses.themes.forEach((t) => { if (t.selected) chosen[t.name] = true; });
      ses.ideas.forEach((c) => { if (c.status === 'RAW' || c.status === 'BUILT' || c.status === 'SHORTLIST') c.status = chosen[c.theme] ? 'SHORTLIST' : (c.status === 'SHORTLIST' ? 'BUILT' : c.status); });
      return forgeBump(ses);
    },
    l10_forgeClaim: function (ideaId, who) { let out = { ok: true }; Object.values(FORGE.sessions).forEach((ses) => ses.ideas.forEach((c) => { if (c.id === ideaId) { if (c.claimedBy && c.claimedBy !== who) out = { ok: false, error: c.claimedBy + ' already claimed this card.' }; else { c.claimedBy = who; c.status = 'CLAIMED'; forgeBump(ses); } } })); return out; },
    l10_forgeUnclaim: function (ideaId) { Object.values(FORGE.sessions).forEach((ses) => ses.ideas.forEach((c) => { if (c.id === ideaId) { c.claimedBy = ''; c.status = c.round === 'S' ? 'RAW' : 'SHORTLIST'; forgeBump(ses); } })); return { ok: true }; },
    l10_forgeHandoff: function (id, from, to, need, provide, due) { const ses = forgeSes(id); ses.hoSeq++; const row = { id: 'FH-' + String(ses.hoSeq).padStart(3, '0'), from: from, to: to, need: need, provide: provide, due: due || '', status: TEAM.indexOf(to) !== -1 ? 'PROPOSED' : 'UNCONFIRMED', goalId: '' }; ses.handoffs.push(row); forgeBump(ses); return { ok: true, id: row.id, row: row }; },
    l10_forgeHandoffRespond: function (hid, who, status, edits) { Object.values(FORGE.sessions).forEach((ses) => ses.handoffs.forEach((h) => { if (h.id === hid) { h.status = status; if (edits) { if (edits.need !== undefined) h.need = edits.need; if (edits.due !== undefined) h.due = edits.due; } forgeBump(ses); } })); return { ok: true }; },
    l10_forgeSaveGoal: function (id, who, g) {
      const ses = forgeSes(id);
      let row = g.id ? ses.goals.filter((x) => x.id === g.id)[0] : null;
      const created = !row;
      if (!row) {
        ses.goalSeq++;
        row = { id: 'G-' + String(ses.goalSeq).padStart(3, '0'), person: who, goalNo: ses.goals.filter((x) => x.person === who).length + 1, type: g.type === 'Personal' ? 'Personal' : 'Business', title: '', line: '', rung: '', lever: '', metric: '', source: '', baseline: '', target: '', deadline: '', doneWhen: '', indicator: '', stake: '', shift: '', ms1: '', ms1Due: '', ms2: '', ms2Due: '', doctorBy: '', doctorChecks: null, doctorNote: '', doctor2By: '', doctor2Checks: null, doctor2Note: '', verdict: '', status: 'DRAFT', ideaId: g.ideaId || '', rockId: '', writtenAt: '', guardrail: '', dependency: '', priv: g.type === 'Personal' };
        ses.goals.push(row);
        if (row.ideaId) ses.ideas.forEach((c) => { if (c.id === row.ideaId) { c.status = 'GOAL'; c.goalId = row.id; } });
      }
      Object.keys(g).forEach((k) => { if (k !== 'id' && k in row) row[k] = k === 'priv' ? !!g[k] : g[k]; });
      // Like the server: a goal made from a card starts as that card.
      const card = created && row.ideaId ? ses.ideas.find((c) => c.id === row.ideaId) : null;
      if (card) {
        if (!row.title) row.title = card.idea.slice(0, 120);
        if (!row.line && card.theme && FORGE_LINES.some((l) => l[0] === card.theme)) row.line = card.theme;
      }
      forgeBump(ses); return { ok: true, id: row.id };
    },
    l10_forgeDropGoal: function (goalId) { Object.values(FORGE.sessions).forEach((ses) => ses.goals.forEach((g) => { if (g.id === goalId) { g.status = 'SUPERSEDED'; forgeBump(ses); } })); return { ok: true }; },
    l10_forgeDoctor: function (goalId, who, round, checks, note, verdict) { Object.values(FORGE.sessions).forEach((ses) => ses.goals.forEach((g) => { if (g.id === goalId) { if (Number(round) === 2) { g.doctor2By = who; g.doctor2Checks = checks; g.doctor2Note = note; } else { g.doctorBy = who; g.doctorChecks = checks; g.doctorNote = note; } g.verdict = verdict; forgeBump(ses); } })); return { ok: true }; },
    l10_forgeCommit: function (goalId, who, p) { let out = { ok: true }; Object.values(FORGE.sessions).forEach((ses) => ses.goals.forEach((g) => { if (g.id === goalId) { if (g.type === 'Business' && (!p.ms1 || !p.ms1Due)) { out = { ok: false, error: 'A business goal needs a dated Q1 milestone.' }; return; } g.indicator = p.indicator || ''; g.ms1 = p.ms1; g.ms1Due = p.ms1Due; g.ms2 = p.ms2 || ''; g.ms2Due = p.ms2Due || ''; g.status = 'COMMITTED'; forgeBump(ses); } })); return out; },
    l10_forgeLockPreview: function (id) {
      const ses = forgeSes(id);
      const people = {}; ses.goals.forEach((g) => { (people[g.person] = people[g.person] || []).push(g); });
      return { ok: true, goals: ses.goals.length, sheets: ses.goals.length, rocks: ses.goals.filter((g) => g.type === 'Business' && g.ms1 && g.ms1Due).length, parks: [], strategyReady: true,
        warnings: Object.keys(people).map((p) => { const n = people[p].filter((g) => g.type === 'Business').length; return n < 2 ? p + ': only ' + n + ' business goal(s) — the brief is 3–5 goals including one personal.' : ''; }).filter(Boolean),
        people: Object.keys(people).map((p) => ({ person: p, business: people[p].filter((g) => g.type === 'Business').length, personal: people[p].filter((g) => g.type === 'Personal').length, sheet: p + ' — FY27 Goals', blocks: 5,
          items: people[p].map((g, i) => ({ goal: g.id, title: g.title, type: g.type, block: i + 1, row: 37 + 6 * i, rock: g.type === 'Business' && !!(g.ms1 && g.ms1Due) })) })) };
    },
    l10_forgeLock: function (id, who) { const ses = forgeSes(id); ses.status = 'LOCKED'; ses.phase = 'LOCKED'; ses.lockedAt = TODAY + ' 14:00'; ses.goals.forEach((g) => { g.status = 'LOCKED'; if (g.ms1 && g.ms1Due) g.rockId = 'RK-9' + g.id.slice(-2); }); forgeBump(ses); return { ok: true, written: ses.goals.length, rocks: ses.goals.filter((g) => g.rockId).length, parked: 0, errors: [] }; },
    l10_forgeRate: function (id, who, rating) { const ses = forgeSes(id); ses.ratings[who] = rating; return forgeBump(ses); }
  };
})();

// L10 Huddle — Forge: the timed, multi-device idea-generation and
// goal-setting session (v2.17). Five tabs (L10_Forge_Sessions / _Ideas /
// _Votes / _Handoffs and L10_Goals), one server-authoritative phase machine,
// two client views (room + player) polling l10_forgeState. Every write bumps
// the session's Version and rebuilds a cached state blob, so five devices
// polling every few seconds cost cache hits, not tab reads.
//
// All globals carry the l10 prefix (shared script project). Nothing here
// creates to-dos: to-do creation pings the team chat and syncs to Jira, and a
// brainstorm must never do either. Lock writes goals to each person's own
// "<Name> — FY27 Goals" tab, creates rocks from the Q1 milestones, and
// parks unclaimed shortlist cards as IDEA-stage initiatives.

var L10_FORGE_PHASE_KEYS_ = ['OPENER', 'DIVERGE', 'RELAY', 'CLUSTER', 'VOTE', 'COMMITTEE',
  'CLAIM', 'HANDOFFS', 'FORGE', 'DOCTOR', 'COMMIT'];
var L10_FORGE_CACHE_SEC_ = 3600;
var L10_FORGE_CACHE_MAX_ = 90000; // CacheService caps a value at 100 KB

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function l10ForgeCfg_(config) {
  var c = config || l10Config_();
  var phases;
  try { phases = JSON.parse(c.FORGE_PHASES); } catch (e) { phases = null; }
  if (!phases || !phases.length) {
    try { phases = JSON.parse(L10_FORGE_PHASES_DEFAULT); } catch (e2) { phases = []; }
  }
  phases = phases.map(function (p) {
    return { key: String(p[0] || '').toUpperCase(), label: String(p[1] || p[0] || ''),
      seconds: Math.max(30, Number(p[2]) || 300), rounds: Math.max(1, Number(p[3]) || 1) };
  }).filter(function (p) { return L10_FORGE_PHASE_KEYS_.indexOf(p.key) !== -1; });
  var prompts;
  try { prompts = JSON.parse(c.FORGE_PROMPTS); } catch (e3) { prompts = null; }
  if (!prompts) { try { prompts = JSON.parse(L10_FORGE_PROMPTS_DEFAULT); } catch (e4) { prompts = {}; } }
  var lines;
  try { lines = JSON.parse(c.FORGE_LINES); } catch (e5) { lines = null; }
  if (!lines) { try { lines = JSON.parse(L10_FORGE_LINES_DEFAULT); } catch (e6) { lines = []; } }
  var num = function (k, d) { var n = Number(c[k]); return isFinite(n) && n > 0 ? n : d; };
  return {
    enabled: String(c.FORGE_ENABLED || 'YES').toUpperCase() !== 'NO',
    wheel: String(c.WHEEL_ENABLED || 'YES').toUpperCase() !== 'NO',
    phases: phases, prompts: prompts, lines: lines,
    voteMode: String(c.FORGE_VOTE_MODE || 'TOKENS').toUpperCase() === 'DOTS' ? 'DOTS' : 'TOKENS',
    tokens: num('FORGE_TOKENS', 10), tokenMax: num('FORGE_TOKEN_MAX_PER_THEME', 4),
    dots: num('FORGE_DOTS', 5), dotMax: num('FORGE_DOT_MAX_PER_IDEA', 2),
    superVotes: num('FORGE_SUPER_VOTES', 1), ideaTarget: num('FORGE_IDEA_TARGET', 40),
    reviews: num('FORGE_REVIEWS_PER_GOAL', 2), shortlist: num('FORGE_SHORTLIST', 12),
    goalsPerPerson: num('FORGE_GOALS_PER_PERSON', 5), pollSec: num('FORGE_POLL_SEC', 3),
    timedWriteMin: num('FORGE_TIMED_WRITE_MIN', 10),
    q1By: l10DueOk_(c.FORGE_Q1_MILESTONE_BY) ? String(c.FORGE_Q1_MILESTONE_BY) : '',
    goalSuffix: String(c.FORGE_GOAL_SHEET_SUFFIX || ' — FY27 Goals'),
    fy: String(c.FORGE_FY || 'FY27')
  };
}

function l10ForgeTabsReady_() {
  var ss = l10Ss_();
  return [L10.TABS.FORGE_SESSIONS, L10.TABS.FORGE_IDEAS, L10.TABS.FORGE_VOTES,
    L10.TABS.FORGE_HANDOFFS, L10.TABS.GOALS].every(function (t) { return !!ss.getSheetByName(t); });
}
function l10ForgeNotReady_() {
  return { ok: false, error: 'The Forge tabs are not in this workbook yet — run L10 Huddle → Setup / repair tabs once, then reload.' };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function l10ForgeJson_(s, fallback) {
  if (s === undefined || s === null || s === '') return fallback;
  try { return JSON.parse(String(s)); } catch (e) { return fallback; }
}
function l10ForgeNowMs_() { return Date.now(); }
function l10ForgeStr_(v, max) { return String(v === undefined || v === null ? '' : v).trim().slice(0, max || 500); }
function l10ForgeTeam_(config) {
  return String((config || l10Config_()).TEAM || '').split(',').map(function (s) { return s.trim(); }).filter(String);
}
function l10ForgeOnRoster_(name, config) {
  return l10ForgeTeam_(config).indexOf(String(name || '').trim()) !== -1;
}

function l10ForgeSession_(id) {
  var rows = l10ReadTab_(L10.TABS.FORGE_SESSIONS).rows;
  for (var i = 0; i < rows.length; i++) if (String(rows[i]['ID']).trim() === String(id).trim()) return rows[i];
  return null;
}
function l10ForgeIdea_(ideaId) {
  var rows = l10ReadTab_(L10.TABS.FORGE_IDEAS).rows;
  for (var i = 0; i < rows.length; i++) if (String(rows[i]['ID']).trim() === String(ideaId).trim()) return rows[i];
  return null;
}
function l10ForgeGoalRow_(goalId) {
  var rows = l10ReadTab_(L10.TABS.GOALS).rows;
  for (var i = 0; i < rows.length; i++) if (String(rows[i]['ID']).trim() === String(goalId).trim()) return rows[i];
  return null;
}
function l10ForgeRowsFor_(tab, sessionId) {
  return l10ReadTab_(tab).rows.filter(function (r) { return String(r['Session ID']).trim() === String(sessionId).trim(); });
}
function l10ForgeParticipants_(s) {
  var p = l10ForgeJson_(s['Participants'], []);
  return Array.isArray(p) ? p.map(String) : [];
}
function l10ForgePhaseIdx_(cfg, key) {
  for (var i = 0; i < cfg.phases.length; i++) if (cfg.phases[i].key === key) return i;
  return -1;
}
function l10ForgePhaseRank_(cfg, key) {
  if (key === 'LOBBY') return -1;
  if (key === 'LOCKED') return cfg.phases.length;
  return l10ForgePhaseIdx_(cfg, key);
}
function l10ForgeAtOrPast_(cfg, s, key) {
  return l10ForgePhaseRank_(cfg, String(s['Phase'])) >= l10ForgePhaseRank_(cfg, key);
}

// Append a row to a Forge tab, writing by the sheet's OWN headers (a pre-repair
// tab still gets a row exactly as wide as it is — the rule every add path follows).
function l10ForgeAppend_(tab, vals) {
  var headers = l10ReadTab_(tab).headers;
  if (!headers.length) headers = L10.HEADERS[tab];
  var row = l10Append_(tab, headers.map(function (h) { return vals[h] === undefined ? '' : vals[h]; }));
  Object.keys(vals).forEach(function (h) { row[h] = vals[h]; });
  return row;
}

// Every write ends here: bump Version, drop the cached blob, rebuild it.
function l10ForgeTouch_(sessionId, updates) {
  var s = l10ForgeSession_(sessionId);
  if (!s) return null;
  var u = updates || {};
  u['Version'] = (Number(s['Version']) || 0) + 1;
  l10SetCells_(L10.TABS.FORGE_SESSIONS, sessionId, u);
  l10ForgeCacheDrop_(sessionId);
  return u['Version'];
}
function l10ForgeCacheKey_(id) { return 'forge:' + id; }
function l10ForgeCacheDrop_(id) {
  try { CacheService.getScriptCache().remove(l10ForgeCacheKey_(id)); } catch (e) {}
}

// ---------------------------------------------------------------------------
// The passphrase gate. FORGE_PASSWORD in L10_Config (blank = no gate) keeps the
// room and the player link from being opened before the day. It is a curtain,
// not a vault: the words are compared server-side and a random token is handed
// back and cached for six hours; the read endpoints and create require it.
// ---------------------------------------------------------------------------

function l10ForgePassword_(config) {
  return String((config || l10Config_()).FORGE_PASSWORD || '').trim();
}
function l10ForgeGateOk_(token, config) {
  if (!l10ForgePassword_(config)) return true;
  token = String(token || '').trim();
  if (!token || token === 'open') return false;
  try { return CacheService.getScriptCache().get('forge:tok:' + token) === '1'; } catch (e) { return false; }
}
function l10ForgeLocked_() {
  return { ok: false, locked: true, error: 'Enter the passphrase first.' };
}
function l10_forgeUnlock(password) {
  var pw = l10ForgePassword_();
  if (!pw) return { ok: true, token: 'open' };
  if (String(password || '').trim().toLowerCase() !== pw.toLowerCase()) {
    return { ok: false, locked: true, error: 'That is not the passphrase.' };
  }
  var token = Utilities.getUuid();
  try { CacheService.getScriptCache().put('forge:tok:' + token, '1', 21600); } catch (e) {}
  return { ok: true, token: token };
}

// ---------------------------------------------------------------------------
// Home + create
// ---------------------------------------------------------------------------

function l10_forgeHome(token) {
  var config = l10Config_();
  if (!l10ForgeGateOk_(token, config)) return l10ForgeLocked_();
  var cfg = l10ForgeCfg_(config);
  if (!l10ForgeTabsReady_()) return { ok: true, ready: false, enabled: cfg.enabled, wheel: cfg.wheel, sessions: [], team: l10ForgeTeam_(config) };
  var sessions = l10ReadTab_(L10.TABS.FORGE_SESSIONS).rows.map(function (s) {
    return {
      id: String(s['ID']), date: l10DateStr_(s['Date']), title: String(s['Title'] || ''),
      status: String(s['Status'] || ''), phase: String(s['Phase'] || 'LOBBY'),
      facilitator: String(s['Facilitator'] || ''), participants: l10ForgeParticipants_(s),
      lockedAt: String(s['Locked At'] || ''), ratings: l10ForgeJson_(s['Ratings (JSON)'], {})
    };
  }).filter(function (s) { return s.status !== 'DISCARDED'; });
  var ideas = l10ReadTab_(L10.TABS.FORGE_IDEAS).rows, goals = l10ReadTab_(L10.TABS.GOALS).rows;
  sessions.forEach(function (s) {
    s.ideas = ideas.filter(function (i) { return String(i['Session ID']) === s.id && String(i['Round']) !== 'O'; }).length;
    s.goals = goals.filter(function (g) { return String(g['Session ID']) === s.id && String(g['Status']) !== 'SUPERSEDED'; }).length;
    var r = s.ratings || {}, ks = Object.keys(r);
    s.rating = ks.length ? Math.round(ks.reduce(function (a, k) { return a + Number(r[k] || 0); }, 0) / ks.length * 10) / 10 : null;
  });
  var open = sessions.filter(function (s) { return s.status === 'OPEN'; });
  return { ok: true, ready: true, enabled: cfg.enabled, wheel: cfg.wheel, sessions: sessions.reverse(),
    open: open.length ? open[open.length - 1].id : '', team: l10ForgeTeam_(config), webAppUrl: l10WebAppUrl_() };
}

function l10_forgeCreate(title, facilitator, token) {
  if (!l10ForgeTabsReady_()) return l10ForgeNotReady_();
  var config = l10Config_();
  if (!l10ForgeGateOk_(token, config)) return l10ForgeLocked_();
  facilitator = l10ForgeStr_(facilitator, 60);
  if (!l10ForgeOnRoster_(facilitator, config)) return { ok: false, error: 'Pick your name from the roster first.' };
  var id = l10NextId_(L10.TABS.FORGE_SESSIONS, 'FS');
  var cfg = l10ForgeCfg_(config);
  l10ForgeAppend_(L10.TABS.FORGE_SESSIONS, {
    'ID': id, 'Date': l10Today_(), 'Title': l10ForgeStr_(title, 120) || ('Forge ' + l10Today_()),
    'Status': 'OPEN', 'Facilitator': facilitator, 'Phase': 'LOBBY', 'Round': 0,
    'Phase Started At': '', 'Phase Seconds': '', 'Paused At': '',
    'Prompt Deck (JSON)': JSON.stringify(cfg.prompts), 'Themes (JSON)': '[]', 'Ratings (JSON)': '{}',
    'Participants': JSON.stringify([facilitator]), 'Created': l10Now_(), 'Locked At': '', 'Notes': '',
    'Timed Write (JSON)': '', 'Flags (JSON)': '{}', 'Version': 1
  });
  return { ok: true, id: id };
}

function l10_forgeDiscard(sessionId) {
  var s = l10ForgeSession_(sessionId);
  if (!s) return { ok: false, error: 'Session ' + sessionId + ' not found.' };
  if (String(s['Status']) === 'LOCKED') return { ok: false, error: 'A locked session cannot be discarded.' };
  l10ForgeTouch_(sessionId, { 'Status': 'DISCARDED', 'Notes': (String(s['Notes'] || '') + ' [discarded]').trim() });
  return { ok: true };
}

// The player page's one boot call: roster + photos + the first state.
function l10_forgePlayerBoot(sessionId, who, token) {
  var config = l10Config_();
  if (!l10ForgeGateOk_(token, config)) return l10ForgeLocked_();
  var st = l10_forgeState(sessionId, 0, who, token);
  return { ok: !!st.ok, error: st.error, team: l10ForgeTeam_(config), photos: l10TeamPhotos_(),
    meetingName: String(config.MEETING_NAME || ''), state: st };
}

// ---------------------------------------------------------------------------
// State — the blob every client polls
// ---------------------------------------------------------------------------

function l10_forgeState(sessionId, since, who, token) {
  if (!l10ForgeGateOk_(token)) return l10ForgeLocked_();
  if (!l10ForgeTabsReady_()) return l10ForgeNotReady_();
  var raw = l10ForgeRaw_(sessionId);
  if (!raw) return { ok: false, error: 'Session ' + sessionId + ' not found.' };
  if (since && Number(since) === raw.version) return { ok: true, unchanged: true, version: raw.version, serverNow: l10ForgeNowMs_() };
  return l10ForgePersonalize_(raw, l10ForgeStr_(who, 60));
}

function l10ForgeRaw_(sessionId) {
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) { cache = null; }
  if (cache) {
    var hit = cache.get(l10ForgeCacheKey_(sessionId));
    if (hit) { try { return JSON.parse(hit); } catch (e2) {} }
  }
  var s = l10ForgeSession_(sessionId);
  if (!s) return null;
  var raw = l10ForgeBuildRaw_(s);
  if (cache) {
    try {
      var json = JSON.stringify(raw);
      if (json.length < L10_FORGE_CACHE_MAX_) cache.put(l10ForgeCacheKey_(sessionId), json, L10_FORGE_CACHE_SEC_);
    } catch (e3) {}
  }
  return raw;
}

function l10ForgeBuildRaw_(s) {
  var config = l10Config_();
  var cfg = l10ForgeCfg_(config);
  var id = String(s['ID']);
  var prompts = l10ForgeJson_(s['Prompt Deck (JSON)'], null) || cfg.prompts;
  var ideas = l10ForgeRowsFor_(L10.TABS.FORGE_IDEAS, id).map(function (r) {
    return {
      id: String(r['ID']), round: String(r['Round']), prompt: String(r['Prompt'] || ''), idea: String(r['Idea'] || ''),
      by: String(r['By'] || ''), anon: String(r['Anon'] || '').toUpperCase() === 'YES',
      buildBy: String(r['Build By'] || ''), build: String(r['Build'] || ''),
      relay2By: String(r['Relay 2 By'] || ''), relay2: String(r['Relay 2'] || ''),
      theme: String(r['Theme'] || ''), account: String(r['Account'] || ''), shift: String(r['Shift'] || ''),
      lever: String(r['Lever'] || ''), status: String(r['Status'] || 'RAW'), claimedBy: String(r['Claimed By'] || ''),
      goalId: String(r['Goal ID'] || ''), parkedTo: String(r['Parked To'] || ''), created: String(r['Created'] || '')
    };
  });
  var votes = l10ForgeRowsFor_(L10.TABS.FORGE_VOTES, id).map(function (r) {
    return { id: String(r['ID']), target: String(r['Target ID']), by: String(r['By']), kind: String(r['Kind']).toUpperCase() };
  });
  var handoffs = l10ForgeRowsFor_(L10.TABS.FORGE_HANDOFFS, id).map(function (r) {
    return { id: String(r['ID']), from: String(r['From']), to: String(r['To']), need: String(r['Need'] || ''),
      provide: String(r['Provide'] || ''), due: l10DateStr_(r['Due']), status: String(r['Status'] || 'PROPOSED'),
      goalId: String(r['Goal ID'] || '') };
  });
  var goals = l10ForgeRowsFor_(L10.TABS.GOALS, id).filter(function (r) {
    return String(r['Status']) !== 'SUPERSEDED';
  }).map(l10ForgeGoalOut_);
  var scorecard = l10ReadTab_(L10.TABS.SCORECARD).rows.filter(function (d) {
    return String(d['Active']).toUpperCase() === 'YES';
  }).map(function (d) { return { id: String(d['ID']), name: String(d['Metric']) }; });
  return {
    ok: true, version: Number(s['Version']) || 0, serverNow: l10ForgeNowMs_(),
    session: {
      id: id, title: String(s['Title'] || ''), status: String(s['Status'] || 'OPEN'), date: l10DateStr_(s['Date']),
      facilitator: String(s['Facilitator'] || ''), phase: String(s['Phase'] || 'LOBBY'), round: Number(s['Round']) || 0,
      phaseStartedAt: Number(s['Phase Started At']) || 0, phaseSeconds: Number(s['Phase Seconds']) || 0,
      pausedAt: Number(s['Paused At']) || 0, participants: l10ForgeParticipants_(s),
      themes: l10ForgeJson_(s['Themes (JSON)'], []), flags: l10ForgeJson_(s['Flags (JSON)'], {}),
      timedWrite: l10ForgeJson_(s['Timed Write (JSON)'], null), ratings: l10ForgeJson_(s['Ratings (JSON)'], {}),
      lockedAt: String(s['Locked At'] || '')
    },
    phases: cfg.phases, prompts: prompts,
    cfg: { voteMode: cfg.voteMode, tokens: cfg.tokens, tokenMax: cfg.tokenMax, dots: cfg.dots, dotMax: cfg.dotMax,
      superVotes: cfg.superVotes, ideaTarget: cfg.ideaTarget, reviews: cfg.reviews, shortlist: cfg.shortlist,
      goalsPerPerson: cfg.goalsPerPerson, lines: cfg.lines, q1By: cfg.q1By, pollSec: cfg.pollSec,
      timedWriteMin: cfg.timedWriteMin, wheel: cfg.wheel, fy: cfg.fy,
      accounts: String(config.ACCOUNT_TAGS || '').split(',').map(function (t) { return t.trim(); }).filter(String),
      team: l10ForgeTeam_(config) },
    ideas: ideas, votes: votes, handoffs: handoffs, goals: goals, scorecard: scorecard
  };
}

function l10ForgeGoalOut_(r) {
  return {
    id: String(r['ID']), person: String(r['Person'] || ''), goalNo: Number(r['Goal No']) || 0,
    type: String(r['Type'] || 'Business'), title: String(r['Title'] || ''), line: String(r['Revenue Line'] || ''),
    rung: String(r['Rung'] || ''), lever: String(r['Lever'] || ''), metric: String(r['Metric'] || ''),
    source: String(r['Metric Source'] || ''), baseline: String(r['Baseline'] || ''), target: String(r['Target'] || ''),
    deadline: l10DateStr_(r['Deadline']), doneWhen: String(r['Done When'] || ''), indicator: String(r['Leading Indicator'] || ''),
    stake: String(r['Dollars At Stake'] || ''), shift: String(r['Shift'] || ''),
    ms1: String(r['Milestone Q1'] || ''), ms1Due: l10DateStr_(r['Milestone Q1 Due']),
    ms2: String(r['Milestone Q2'] || ''), ms2Due: l10DateStr_(r['Milestone Q2 Due']),
    doctorBy: String(r['Doctor By'] || ''), doctorChecks: l10ForgeJson_(r['Doctor Checks (JSON)'], null), doctorNote: String(r['Doctor Note'] || ''),
    doctor2By: String(r['Doctor 2 By'] || ''), doctor2Checks: l10ForgeJson_(r['Doctor 2 Checks (JSON)'], null), doctor2Note: String(r['Doctor 2 Note'] || ''),
    verdict: String(r['Verdict'] || ''), status: String(r['Status'] || 'DRAFT'), ideaId: String(r['Idea ID'] || ''),
    rockId: String(r['Rock ID'] || ''), writtenAt: String(r['Written To Sheet At'] || ''),
    guardrail: String(r['Guardrail'] || ''), dependency: String(r['Dependency'] || ''),
    priv: String(r['Private'] || '').toUpperCase() === 'YES'
  };
}

// What one viewer may see: names stay hidden on anonymous cards until Claim
// (own cards excepted), tallies appear from Committee on (the facilitator's
// ballot only once they add it), private goals reach only their author, and
// each person gets their own vote budget and Doctor assignments.
function l10ForgePersonalize_(raw, who) {
  var cfg = { phases: raw.phases };
  var s = raw.session;
  var past = function (key) { return l10ForgeAtOrPast_(cfg, { 'Phase': s.phase }, key); };
  var namesOpen = past('CLAIM');
  var out = JSON.parse(JSON.stringify(raw));
  out.me = who;
  out.ideas = out.ideas.map(function (i) {
    i.mine = !!who && i.by === who;
    if (i.anon && !namesOpen && !i.mine) i.by = '';
    return i;
  });
  // Opener answers: revealed together, by the facilitator.
  var revealed = !!(s.flags && s.flags.openerRevealed);
  out.opener = { answered: [], answers: {} };
  out.ideas = out.ideas.filter(function (i) {
    if (i.round !== 'O') return true;
    out.opener.answered.push(i.by);
    if (revealed || i.mine) out.opener.answers[i.by] = l10ForgeJson_(i.idea, {});
    return false;
  });
  // Tallies from Committee on; the facilitator's votes join when they say so.
  var tallies = {}, mine = {}, voters = {};
  var showFac = !!(s.flags && s.flags.facilitatorShown);
  out.votes.forEach(function (v) {
    voters[v.by] = true;
    if (v.by === who) { mine[v.target] = mine[v.target] || { dots: 0, supers: 0 }; mine[v.target][v.kind === 'SUPER' ? 'supers' : 'dots']++; }
    if (v.by === s.facilitator && !showFac) return;
    tallies[v.target] = tallies[v.target] || { dots: 0, supers: 0 };
    tallies[v.target][v.kind === 'SUPER' ? 'supers' : 'dots']++;
  });
  delete out.votes;
  out.voted = Object.keys(voters);
  out.myVotes = mine;
  out.tallies = past('COMMITTEE') ? tallies : {};
  // Private goals: only the author sees the body; everyone sees that one exists.
  out.goals = out.goals.map(function (g) {
    if (g.priv && g.person !== who) {
      return { id: g.id, person: g.person, type: g.type, priv: true, status: g.status, hidden: true, goalNo: g.goalNo };
    }
    return g;
  });
  out.doctorAssign = l10ForgeDoctorAssign_(s.participants, raw.cfg.reviews);
  return out;
}

// reviewer for (person, round r) = participants[(i + r) % n]; two rounds give
// two different reviewers and nobody ever reads their own cards.
function l10ForgeDoctorAssign_(participants, reviews) {
  var out = {};
  var n = participants.length;
  participants.forEach(function (p, i) {
    out[p] = [];
    for (var r = 1; r <= reviews; r++) out[p].push(n > 1 ? participants[(i + r) % n] : '');
  });
  return out;
}

// ---------------------------------------------------------------------------
// Joining + phases
// ---------------------------------------------------------------------------

function l10_forgeJoin(sessionId, name) {
  var s = l10ForgeSession_(sessionId);
  if (!s) return { ok: false, error: 'Session not found.' };
  if (String(s['Status']) !== 'OPEN') return { ok: false, error: 'This session is ' + String(s['Status']).toLowerCase() + '.' };
  name = l10ForgeStr_(name, 60);
  if (!l10ForgeOnRoster_(name)) return { ok: false, error: 'Not on the roster: ' + name };
  var p = l10ForgeParticipants_(s);
  if (p.indexOf(name) === -1) {
    p.push(name);
    l10ForgeTouch_(sessionId, { 'Participants': JSON.stringify(p) });
  }
  return { ok: true, participants: p };
}

function l10_forgePhase(sessionId, action, arg) {
  var s = l10ForgeSession_(sessionId);
  if (!s) return { ok: false, error: 'Session not found.' };
  if (String(s['Status']) !== 'OPEN') return { ok: false, error: 'This session is ' + String(s['Status']).toLowerCase() + '.' };
  var cfg = l10ForgeCfg_();
  var phase = String(s['Phase'] || 'LOBBY'), round = Number(s['Round']) || 0;
  var idx = l10ForgePhaseIdx_(cfg, phase);
  var now = l10ForgeNowMs_();
  var u = {};
  var flags = l10ForgeJson_(s['Flags (JSON)'], {});
  var enter = function (i, r) {
    var ph = cfg.phases[i];
    u['Phase'] = ph.key; u['Round'] = r; u['Phase Started At'] = now; u['Phase Seconds'] = ph.seconds; u['Paused At'] = '';
    if (ph.key === 'RELAY') l10ForgeDeal_(sessionId, s, r);
  };
  switch (String(action)) {
    case 'start':
      if (phase !== 'LOBBY') return { ok: false, error: 'Already started.' };
      if (!cfg.phases.length) return { ok: false, error: 'FORGE_PHASES is empty — fix L10_Config.' };
      enter(0, 1);
      break;
    case 'next':
      if (phase === 'LOBBY') { enter(0, 1); break; }
      if (idx === -1) return { ok: false, error: 'Unknown phase ' + phase };
      if (round < cfg.phases[idx].rounds) { enter(idx, round + 1); break; }
      if (idx + 1 >= cfg.phases.length) return { ok: false, error: 'This is the last phase — use Lock to finish.' };
      enter(idx + 1, 1);
      break;
    case 'back':
      if (idx <= 0 && round <= 1) return { ok: false, error: 'Already at the first phase.' };
      if (round > 1) enter(idx, round - 1); else enter(idx - 1, cfg.phases[idx - 1].rounds);
      break;
    case 'goto': {
      var to = l10ForgePhaseIdx_(cfg, String(arg || '').toUpperCase());
      if (to === -1) return { ok: false, error: 'Unknown phase.' };
      enter(to, 1);
      break;
    }
    case 'pause':
      if (!Number(s['Paused At'])) u['Paused At'] = now;
      break;
    case 'resume':
      if (Number(s['Paused At'])) {
        u['Phase Started At'] = (Number(s['Phase Started At']) || now) + (now - Number(s['Paused At']));
        u['Paused At'] = '';
      }
      break;
    case 'add60':
      u['Phase Seconds'] = (Number(s['Phase Seconds']) || 0) + 60;
      break;
    case 'end':
      u['Phase Started At'] = now - (Number(s['Phase Seconds']) || 0) * 1000;
      u['Paused At'] = '';
      break;
    case 'endWrite': {
      var tw = l10ForgeJson_(s['Timed Write (JSON)'], null);
      u['Timed Write (JSON)'] = '';
      if (tw && tw.resume && Number(s['Paused At'])) {
        u['Phase Started At'] = (Number(s['Phase Started At']) || now) + (now - Number(s['Paused At']));
        u['Paused At'] = '';
      }
      break;
    }
    case 'reveal':
      flags.openerRevealed = true; u['Flags (JSON)'] = JSON.stringify(flags);
      break;
    case 'showMine':
      flags.facilitatorShown = true; u['Flags (JSON)'] = JSON.stringify(flags);
      break;
    default:
      return { ok: false, error: 'Unknown action ' + action };
  }
  var v = l10ForgeTouch_(sessionId, u);
  return { ok: true, version: v };
}

// "For the next N minutes, everyone write…" — pauses the phase clock
// underneath and takes over every player screen until endWrite.
function l10_forgeTimedWrite(sessionId, prompt, seconds, mode) {
  var s = l10ForgeSession_(sessionId);
  if (!s) return { ok: false, error: 'Session not found.' };
  if (String(s['Status']) !== 'OPEN') return { ok: false, error: 'Session is not open.' };
  prompt = l10ForgeStr_(prompt, 400);
  if (!prompt) return { ok: false, error: 'Type the prompt first.' };
  seconds = Math.max(30, Math.min(3600, Number(seconds) || 600));
  var now = l10ForgeNowMs_();
  var running = String(s['Phase']) !== 'LOBBY' && !Number(s['Paused At']);
  var u = { 'Timed Write (JSON)': JSON.stringify({ prompt: prompt, seconds: seconds, mode: mode === 'share' ? 'share' : 'silent', startedAt: now, resume: running }) };
  if (running) u['Paused At'] = now;
  l10ForgeTouch_(sessionId, u);
  return { ok: true };
}

// Relay dealing: every diverge card goes to participants[(author + r) % n]
// — never its author, and round 2 lands on a different person than round 1.
function l10ForgeDeal_(sessionId, s, round) {
  var p = l10ForgeParticipants_(s);
  var n = p.length;
  if (n < 2) return;
  var col = round === 1 ? 'Build By' : 'Relay 2 By';
  l10ForgeRowsFor_(L10.TABS.FORGE_IDEAS, sessionId).forEach(function (r) {
    var rd = String(r['Round']);
    if (rd === 'O') return;
    if (String(r[col] || '')) return; // already dealt this round
    var i = p.indexOf(String(r['By']));
    var to = i === -1 ? p[Math.floor(Math.random() * n)] : p[(i + round) % n];
    if (to === String(r['By'])) to = p[(p.indexOf(to) + 1) % n];
    var u = {}; u[col] = to; u['Updated At'] = l10Now_();
    l10SetCells_(L10.TABS.FORGE_IDEAS, String(r['ID']), u);
  });
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function l10ForgeOpenCheck_(sessionId, who) {
  var s = l10ForgeSession_(sessionId);
  if (!s) return { err: { ok: false, error: 'Session not found.' } };
  if (String(s['Status']) !== 'OPEN') return { err: { ok: false, error: 'This session is ' + String(s['Status']).toLowerCase() + '.' } };
  who = l10ForgeStr_(who, 60);
  if (who && !l10ForgeOnRoster_(who)) return { err: { ok: false, error: 'Not on the roster: ' + who } };
  return { s: s, who: who };
}

function l10_forgeOpener(sessionId, who, labelsJson) {
  var c = l10ForgeOpenCheck_(sessionId, who);
  if (c.err) return c.err;
  var labels = l10ForgeJson_(labelsJson, null);
  if (!labels || typeof labels !== 'object') return { ok: false, error: 'Nothing to save.' };
  var existing = l10ForgeRowsFor_(L10.TABS.FORGE_IDEAS, sessionId).filter(function (r) {
    return String(r['Round']) === 'O' && String(r['By']) === c.who;
  });
  var body = JSON.stringify(labels).slice(0, 2000);
  if (existing.length) {
    l10SetCells_(L10.TABS.FORGE_IDEAS, String(existing[0]['ID']), { 'Idea': body, 'Updated At': l10Now_() });
  } else {
    l10ForgeAppend_(L10.TABS.FORGE_IDEAS, {
      'ID': l10NextId_(L10.TABS.FORGE_IDEAS, 'FI'), 'Session ID': sessionId, 'Round': 'O', 'Prompt': 'opener',
      'Idea': body, 'By': c.who, 'Anon': 'NO', 'Created': l10Now_(), 'Status': 'RAW', 'Updated At': l10Now_()
    });
  }
  l10ForgeTouch_(sessionId);
  return { ok: true };
}

function l10_forgeAddIdea(sessionId, who, text) {
  var c = l10ForgeOpenCheck_(sessionId, who);
  if (c.err) return c.err;
  if (!c.who) return { ok: false, error: 'Pick your name first.' };
  text = l10ForgeStr_(text, 600);
  if (!text) return { ok: false, error: 'Type the idea first.' };
  var s = c.s;
  var tw = l10ForgeJson_(s['Timed Write (JSON)'], null);
  var round, prompt, anon = 'YES';
  if (tw) { round = 'T'; prompt = String(tw.prompt || ''); }
  else {
    var phase = String(s['Phase']);
    if (phase === 'DIVERGE') {
      round = String(Number(s['Round']) || 1);
      var deck = l10ForgeJson_(s['Prompt Deck (JSON)'], {}) || {};
      var rounds = deck.rounds || [];
      var rp = rounds[Number(round) - 1];
      prompt = rp ? String(rp.prompt || rp) : '';
    } else if (phase === 'LOBBY') { round = 'P'; prompt = 'pre-work'; anon = 'NO'; }
    else { round = 'X'; prompt = 'ad hoc'; }
  }
  var id = l10NextId_(L10.TABS.FORGE_IDEAS, 'FI');
  var row = l10ForgeAppend_(L10.TABS.FORGE_IDEAS, {
    'ID': id, 'Session ID': sessionId, 'Round': round, 'Prompt': prompt.slice(0, 300), 'Idea': text, 'By': c.who,
    'Anon': anon, 'Created': l10Now_(), 'Status': 'RAW', 'Dots': 0, 'Super Votes': 0, 'Updated At': l10Now_()
  });
  l10ForgeTouch_(sessionId);
  return { ok: true, id: id, row: row };
}

function l10_forgeEditIdea(ideaId, who, text) {
  var r = l10ForgeIdea_(ideaId);
  if (!r) return { ok: false, error: 'Card not found.' };
  who = l10ForgeStr_(who, 60);
  if (String(r['By']) !== who) return { ok: false, error: 'Only the author can edit this card.' };
  text = l10ForgeStr_(text, 600);
  if (!text) return { ok: false, error: 'A card cannot be empty — drop it instead.' };
  l10SetCells_(L10.TABS.FORGE_IDEAS, ideaId, { 'Idea': text, 'Updated At': l10Now_() });
  l10ForgeTouch_(String(r['Session ID']));
  return { ok: true };
}

function l10_forgeDropIdea(ideaId, who) {
  var r = l10ForgeIdea_(ideaId);
  if (!r) return { ok: false, error: 'Card not found.' };
  var s = l10ForgeSession_(String(r['Session ID']));
  who = l10ForgeStr_(who, 60);
  if (String(r['By']) !== who && (!s || String(s['Facilitator']) !== who)) return { ok: false, error: 'Only the author or the facilitator can drop a card.' };
  l10SetCells_(L10.TABS.FORGE_IDEAS, ideaId, { 'Status': 'DROPPED', 'Updated At': l10Now_() });
  l10ForgeTouch_(String(r['Session ID']));
  return { ok: true };
}

// Relay: the dealt reviewer adds a line; the author's text is never touched.
function l10_forgeBuild(ideaId, who, text) {
  var r = l10ForgeIdea_(ideaId);
  if (!r) return { ok: false, error: 'Card not found.' };
  var s = l10ForgeSession_(String(r['Session ID']));
  if (!s || String(s['Status']) !== 'OPEN') return { ok: false, error: 'Session is not open.' };
  who = l10ForgeStr_(who, 60);
  var round = Number(s['Round']) || 1;
  var byCol = round >= 2 ? 'Relay 2 By' : 'Build By', txtCol = round >= 2 ? 'Relay 2' : 'Build';
  if (String(r[byCol] || '') !== who) return { ok: false, error: 'This card was dealt to someone else this round.' };
  var u = {}; u[txtCol] = l10ForgeStr_(text, 600); u['Updated At'] = l10Now_();
  if (String(r['Status']) === 'RAW' && u[txtCol]) u['Status'] = 'BUILT';
  l10SetCells_(L10.TABS.FORGE_IDEAS, ideaId, u);
  l10ForgeTouch_(String(r['Session ID']));
  return { ok: true };
}

// Cluster: the facilitator's themes [{id, name, ideaIds}] → Theme on each card
// and Themes (JSON) on the session. Any card left out keeps its old theme.
function l10_forgeCluster(sessionId, themes) {
  var s = l10ForgeSession_(sessionId);
  if (!s) return { ok: false, error: 'Session not found.' };
  if (!Array.isArray(themes)) return { ok: false, error: 'Nothing to save.' };
  var old = l10ForgeJson_(s['Themes (JSON)'], []);
  var oldById = {};
  old.forEach(function (t) { oldById[t.id] = t; });
  var clean = themes.map(function (t, i) {
    var id = l10ForgeStr_(t.id, 12) || ('T' + (i + 1));
    var prev = oldById[id] || {};
    return { id: id, name: l10ForgeStr_(t.name, 80) || ('Theme ' + (i + 1)),
      ideaIds: (Array.isArray(t.ideaIds) ? t.ideaIds : []).map(String),
      selected: !!(t.selected !== undefined ? t.selected : prev.selected), stop: l10ForgeStr_(t.stop !== undefined ? t.stop : prev.stop, 300) };
  });
  var byIdea = {};
  clean.forEach(function (t) { t.ideaIds.forEach(function (iid) { byIdea[iid] = t.name; }); });
  l10ForgeRowsFor_(L10.TABS.FORGE_IDEAS, sessionId).forEach(function (r) {
    var want = byIdea[String(r['ID'])];
    if (want !== undefined && String(r['Theme'] || '') !== want) {
      l10SetCells_(L10.TABS.FORGE_IDEAS, String(r['ID']), { 'Theme': want, 'Updated At': l10Now_() });
    }
  });
  l10ForgeTouch_(sessionId, { 'Themes (JSON)': JSON.stringify(clean) });
  return { ok: true, themes: clean };
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

function l10_forgeVote(sessionId, who, targetId, kind) {
  var c = l10ForgeOpenCheck_(sessionId, who);
  if (c.err) return c.err;
  if (!c.who) return { ok: false, error: 'Pick your name first.' };
  if (String(c.s['Phase']) !== 'VOTE') return { ok: false, error: 'Voting is not open right now.' };
  var cfg = l10ForgeCfg_();
  kind = String(kind || 'DOT').toUpperCase() === 'SUPER' ? 'SUPER' : 'DOT';
  targetId = l10ForgeStr_(targetId, 20);
  var mine = l10ForgeRowsFor_(L10.TABS.FORGE_VOTES, sessionId).filter(function (v) { return String(v['By']) === c.who; });
  var spent = mine.filter(function (v) { return String(v['Kind']).toUpperCase() === kind; }).length;
  var onTarget = mine.filter(function (v) { return String(v['Kind']).toUpperCase() === kind && String(v['Target ID']) === targetId; }).length;
  if (kind === 'SUPER') {
    if (spent >= cfg.superVotes) return { ok: false, error: 'No revenue votes left — take one back first.' };
  } else {
    var budget = cfg.voteMode === 'TOKENS' ? cfg.tokens : cfg.dots;
    var cap = cfg.voteMode === 'TOKENS' ? cfg.tokenMax : cfg.dotMax;
    if (spent >= budget) return { ok: false, error: 'All ' + budget + ' spent — take one back first.' };
    if (onTarget >= cap) return { ok: false, error: 'Max ' + cap + ' on one ' + (cfg.voteMode === 'TOKENS' ? 'theme' : 'card') + '.' };
  }
  l10ForgeAppend_(L10.TABS.FORGE_VOTES, {
    'ID': l10NextId_(L10.TABS.FORGE_VOTES, 'FV'), 'Session ID': sessionId, 'Target ID': targetId, 'By': c.who, 'Kind': kind, 'At': l10Now_()
  });
  l10ForgeRetally_(sessionId);
  l10ForgeTouch_(sessionId);
  return { ok: true };
}

// Take one back: rows are never deleted — the vote is voided in place.
function l10_forgeUnvote(sessionId, who, targetId, kind) {
  var c = l10ForgeOpenCheck_(sessionId, who);
  if (c.err) return c.err;
  if (String(c.s['Phase']) !== 'VOTE') return { ok: false, error: 'Voting is not open right now.' };
  kind = String(kind || 'DOT').toUpperCase() === 'SUPER' ? 'SUPER' : 'DOT';
  var rows = l10ForgeRowsFor_(L10.TABS.FORGE_VOTES, sessionId).filter(function (v) {
    return String(v['By']) === c.who && String(v['Kind']).toUpperCase() === kind && String(v['Target ID']) === String(targetId);
  });
  if (!rows.length) return { ok: false, error: 'Nothing to take back there.' };
  var last = rows[rows.length - 1];
  l10SetCells_(L10.TABS.FORGE_VOTES, String(last['ID']), { 'Kind': 'VOID ' + kind, 'At': l10Now_() });
  l10ForgeRetally_(sessionId);
  l10ForgeTouch_(sessionId);
  return { ok: true };
}

// Keep the Dots / Super Votes columns on the cards honest (a pure function of
// the votes tab; nobody edits them by hand). Theme votes are not on cards.
function l10ForgeRetally_(sessionId) {
  var counts = {};
  l10ForgeRowsFor_(L10.TABS.FORGE_VOTES, sessionId).forEach(function (v) {
    var k = String(v['Kind']).toUpperCase();
    if (k !== 'DOT' && k !== 'SUPER') return;
    var t = String(v['Target ID']);
    counts[t] = counts[t] || { d: 0, s: 0 };
    counts[t][k === 'SUPER' ? 's' : 'd']++;
  });
  l10ForgeRowsFor_(L10.TABS.FORGE_IDEAS, sessionId).forEach(function (r) {
    var c = counts[String(r['ID'])] || { d: 0, s: 0 };
    if (Number(r['Dots']) !== c.d || Number(r['Super Votes']) !== c.s) {
      l10SetCells_(L10.TABS.FORGE_IDEAS, String(r['ID']), { 'Dots': c.d, 'Super Votes': c.s });
    }
  });
}

// Committee: which themes the room chose, what gets stopped to make room, and
// the note when the facilitator's call differs from the vote.
function l10_forgeCommittee(sessionId, themes, note) {
  var s = l10ForgeSession_(sessionId);
  if (!s) return { ok: false, error: 'Session not found.' };
  var res = l10_forgeCluster(sessionId, Array.isArray(themes) ? themes : l10ForgeJson_(s['Themes (JSON)'], []));
  if (!res.ok) return res;
  var flags = l10ForgeJson_(s['Flags (JSON)'], {});
  flags.committeeNote = l10ForgeStr_(note, 400);
  // Shortlist the cards in the chosen themes so Claim knows what is on the table.
  var chosen = {};
  res.themes.forEach(function (t) { if (t.selected) chosen[t.name] = true; });
  l10ForgeRowsFor_(L10.TABS.FORGE_IDEAS, sessionId).forEach(function (r) {
    var st = String(r['Status']);
    if (st === 'CLAIMED' || st === 'GOAL' || st === 'DROPPED' || String(r['Round']) === 'O') return;
    var want = chosen[String(r['Theme'] || '')] ? 'SHORTLIST' : (st === 'SHORTLIST' ? 'BUILT' : st);
    if (want !== st) l10SetCells_(L10.TABS.FORGE_IDEAS, String(r['ID']), { 'Status': want, 'Updated At': l10Now_() });
  });
  l10ForgeTouch_(sessionId, { 'Flags (JSON)': JSON.stringify(flags) });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Claim + handoffs
// ---------------------------------------------------------------------------

function l10_forgeClaim(ideaId, who) {
  var r = l10ForgeIdea_(ideaId);
  if (!r) return { ok: false, error: 'Card not found.' };
  who = l10ForgeStr_(who, 60);
  if (!l10ForgeOnRoster_(who)) return { ok: false, error: 'Pick your name first.' };
  var held = String(r['Claimed By'] || '');
  if (held && held !== who) return { ok: false, error: held + ' already claimed this card.', heldBy: held };
  l10SetCells_(L10.TABS.FORGE_IDEAS, ideaId, { 'Status': 'CLAIMED', 'Claimed By': who, 'Updated At': l10Now_() });
  l10ForgeTouch_(String(r['Session ID']));
  return { ok: true };
}
function l10_forgeUnclaim(ideaId, who) {
  var r = l10ForgeIdea_(ideaId);
  if (!r) return { ok: false, error: 'Card not found.' };
  var s = l10ForgeSession_(String(r['Session ID']));
  who = l10ForgeStr_(who, 60);
  if (String(r['Claimed By']) !== who && (!s || String(s['Facilitator']) !== who)) return { ok: false, error: 'Only the owner or the facilitator can release it.' };
  if (String(r['Goal ID'] || '')) return { ok: false, error: 'A goal was already written from this card.' };
  l10SetCells_(L10.TABS.FORGE_IDEAS, ideaId, { 'Status': 'SHORTLIST', 'Claimed By': '', 'Updated At': l10Now_() });
  l10ForgeTouch_(String(r['Session ID']));
  return { ok: true };
}

function l10_forgeHandoff(sessionId, from, to, need, provide, due) {
  var c = l10ForgeOpenCheck_(sessionId, from);
  if (c.err) return c.err;
  if (!c.who) return { ok: false, error: 'Pick your name first.' };
  to = l10ForgeStr_(to, 60);
  need = l10ForgeStr_(need, 300); provide = l10ForgeStr_(provide, 300);
  if (!to || !need) return { ok: false, error: 'Say who you need it from and what you need.' };
  var id = l10NextId_(L10.TABS.FORGE_HANDOFFS, 'FH');
  var row = l10ForgeAppend_(L10.TABS.FORGE_HANDOFFS, {
    'ID': id, 'Session ID': sessionId, 'From': c.who, 'To': to, 'Need': need, 'Provide': provide,
    'Due': l10DueOk_(due) ? String(due) : '', 'Status': l10ForgeOnRoster_(to) ? 'PROPOSED' : 'UNCONFIRMED',
    'Goal ID': '', 'Created': l10Now_(), 'Updated At': l10Now_()
  });
  l10ForgeTouch_(sessionId);
  return { ok: true, id: id, row: row };
}

// Only the named recipient (or the facilitator) may accept or negotiate. A
// recipient off the roster can never leave UNCONFIRMED from inside Forge.
function l10_forgeHandoffRespond(handoffId, who, status, edits) {
  var rows = l10ReadTab_(L10.TABS.FORGE_HANDOFFS).rows.filter(function (r) { return String(r['ID']) === String(handoffId); });
  if (!rows.length) return { ok: false, error: 'Handoff not found.' };
  var h = rows[0];
  var s = l10ForgeSession_(String(h['Session ID']));
  who = l10ForgeStr_(who, 60);
  var isTo = String(h['To']) === who, isFac = s && String(s['Facilitator']) === who, isFrom = String(h['From']) === who;
  status = String(status || '').toUpperCase();
  var u = { 'Updated At': l10Now_() };
  if (status === 'ACCEPTED' || status === 'NEGOTIATED') {
    if (!isTo && !isFac) return { ok: false, error: 'Only ' + String(h['To']) + ' can answer this one.' };
    if (!l10ForgeOnRoster_(String(h['To']))) return { ok: false, error: String(h['To']) + ' is not in the room — this stays unconfirmed until they agree.' };
    u['Status'] = status;
  } else if (status === 'PROPOSED' || status === 'WITHDRAWN') {
    if (!isFrom && !isFac) return { ok: false, error: 'Only the person who asked can change that.' };
    u['Status'] = status;
  } else return { ok: false, error: 'Unknown status.' };
  if (edits && typeof edits === 'object') {
    if (edits.need !== undefined) u['Need'] = l10ForgeStr_(edits.need, 300);
    if (edits.provide !== undefined) u['Provide'] = l10ForgeStr_(edits.provide, 300);
    if (edits.due !== undefined) u['Due'] = l10DueOk_(edits.due) ? String(edits.due) : '';
  }
  l10SetCells_(L10.TABS.FORGE_HANDOFFS, handoffId, u);
  l10ForgeTouch_(String(h['Session ID']));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

var L10_FORGE_GOAL_FIELDS_ = {
  title: ['Title', 120], line: ['Revenue Line', 120], rung: ['Rung', 40], lever: ['Lever', 60],
  metric: ['Metric', 200], source: ['Metric Source', 300], baseline: ['Baseline', 200], target: ['Target', 200],
  doneWhen: ['Done When', 500], indicator: ['Leading Indicator', 20], stake: ['Dollars At Stake', 200],
  shift: ['Shift', 20], ms1: ['Milestone Q1', 200], ms2: ['Milestone Q2', 200],
  guardrail: ['Guardrail', 300], dependency: ['Dependency', 20]
};

function l10_forgeSaveGoal(sessionId, who, g) {
  var c = l10ForgeOpenCheck_(sessionId, who);
  if (c.err) return c.err;
  if (!c.who) return { ok: false, error: 'Pick your name first.' };
  if (!g || typeof g !== 'object') return { ok: false, error: 'Nothing to save.' };
  var cfg = l10ForgeCfg_();
  var u = {};
  Object.keys(L10_FORGE_GOAL_FIELDS_).forEach(function (k) {
    if (g[k] !== undefined) u[L10_FORGE_GOAL_FIELDS_[k][0]] = l10ForgeStr_(g[k], L10_FORGE_GOAL_FIELDS_[k][1]);
  });
  if (g.deadline !== undefined) u['Deadline'] = l10DueOk_(g.deadline) ? String(g.deadline) : '';
  if (g.ms1Due !== undefined) u['Milestone Q1 Due'] = l10DueOk_(g.ms1Due) ? String(g.ms1Due) : '';
  if (g.ms2Due !== undefined) u['Milestone Q2 Due'] = l10DueOk_(g.ms2Due) ? String(g.ms2Due) : '';
  if (g.type !== undefined) u['Type'] = String(g.type) === 'Personal' ? 'Personal' : 'Business';
  if (g.priv !== undefined) u['Private'] = g.priv ? 'YES' : 'NO';
  if (u['Leading Indicator'] && !l10RockMetricOk_(u['Leading Indicator'])) return { ok: false, error: 'Leading indicator must be a metric on the metrics list (or blank).' };
  u['Updated At'] = l10Now_();
  var id = l10ForgeStr_(g.id, 12);
  if (id) {
    var row = l10ForgeGoalRow_(id);
    if (!row) return { ok: false, error: 'Goal ' + id + ' not found.' };
    if (String(row['Person']) !== c.who && String(c.s['Facilitator']) !== c.who) return { ok: false, error: 'Only the owner can edit this goal.' };
    if (String(row['Status']) === 'LOCKED') return { ok: false, error: 'This goal is locked.' };
    l10SetCells_(L10.TABS.GOALS, id, u);
  } else {
    var mine = l10ForgeRowsFor_(L10.TABS.GOALS, sessionId).filter(function (r) {
      return String(r['Person']) === c.who && String(r['Status']) !== 'SUPERSEDED';
    });
    if (mine.length >= cfg.goalsPerPerson) return { ok: false, error: 'That is ' + cfg.goalsPerPerson + ' goals already — edit or drop one.' };
    id = l10NextId_(L10.TABS.GOALS, 'G');
    var vals = { 'ID': id, 'Session ID': sessionId, 'Person': c.who, 'FY': cfg.fy, 'Goal No': mine.length + 1,
      'Type': u['Type'] || 'Business', 'Status': 'DRAFT', 'Created': l10Now_(), 'Private': u['Private'] || (u['Type'] === 'Personal' ? 'YES' : 'NO'),
      'Idea ID': l10ForgeStr_(g.ideaId, 12) };
    Object.keys(u).forEach(function (h) { vals[h] = u[h]; });
    l10ForgeAppend_(L10.TABS.GOALS, vals);
    if (vals['Idea ID']) {
      var idea = l10ForgeIdea_(vals['Idea ID']);
      if (idea) l10SetCells_(L10.TABS.FORGE_IDEAS, vals['Idea ID'], { 'Status': 'GOAL', 'Goal ID': id, 'Updated At': l10Now_() });
    }
  }
  l10ForgeTouch_(sessionId);
  return { ok: true, id: id };
}

function l10_forgeDropGoal(goalId, who) {
  var row = l10ForgeGoalRow_(goalId);
  if (!row) return { ok: false, error: 'Goal not found.' };
  var s = l10ForgeSession_(String(row['Session ID']));
  who = l10ForgeStr_(who, 60);
  if (String(row['Person']) !== who && (!s || String(s['Facilitator']) !== who)) return { ok: false, error: 'Only the owner can drop this goal.' };
  if (String(row['Status']) === 'LOCKED') return { ok: false, error: 'This goal is locked.' };
  l10SetCells_(L10.TABS.GOALS, goalId, { 'Status': 'SUPERSEDED', 'Updated At': l10Now_() });
  if (String(row['Idea ID'] || '')) l10SetCells_(L10.TABS.FORGE_IDEAS, String(row['Idea ID']), { 'Status': 'CLAIMED', 'Goal ID': '', 'Updated At': l10Now_() });
  l10ForgeTouch_(String(row['Session ID']));
  return { ok: true };
}

// The peer review: the assigned reviewer for that round, one improvement, a verdict.
function l10_forgeDoctor(goalId, who, round, checks, note, verdict) {
  var row = l10ForgeGoalRow_(goalId);
  if (!row) return { ok: false, error: 'Goal not found.' };
  var s = l10ForgeSession_(String(row['Session ID']));
  if (!s || String(s['Status']) !== 'OPEN') return { ok: false, error: 'Session is not open.' };
  who = l10ForgeStr_(who, 60);
  if (String(row['Private'] || '').toUpperCase() === 'YES') return { ok: false, error: 'Private goals skip the review unless the author opens them.' };
  var cfg = l10ForgeCfg_();
  var assign = l10ForgeDoctorAssign_(l10ForgeParticipants_(s), cfg.reviews)[String(row['Person'])] || [];
  round = Number(round) === 2 ? 2 : 1;
  var expected = assign[round - 1] || '';
  if (expected && expected !== who && String(s['Facilitator']) !== who) return { ok: false, error: 'Round ' + round + ' of this goal is ' + expected + '\'s to review.' };
  verdict = String(verdict || '').toUpperCase();
  if (['READY', 'REVISE', 'NEEDS EVIDENCE'].indexOf(verdict) === -1) return { ok: false, error: 'Pick a verdict: ready, revise or needs evidence.' };
  var u = { 'Updated At': l10Now_() };
  var chk = JSON.stringify(checks && typeof checks === 'object' ? checks : {}).slice(0, 1000);
  if (round === 2) { u['Doctor 2 By'] = who; u['Doctor 2 Checks (JSON)'] = chk; u['Doctor 2 Note'] = l10ForgeStr_(note, 400); }
  else { u['Doctor By'] = who; u['Doctor Checks (JSON)'] = chk; u['Doctor Note'] = l10ForgeStr_(note, 400); }
  u['Verdict'] = verdict;
  l10SetCells_(L10.TABS.GOALS, goalId, u);
  l10ForgeTouch_(String(row['Session ID']));
  return { ok: true };
}

// Commit: the facilitator pins the scorecard metric and the two milestones.
function l10_forgeCommit(goalId, who, p) {
  var row = l10ForgeGoalRow_(goalId);
  if (!row) return { ok: false, error: 'Goal not found.' };
  var s = l10ForgeSession_(String(row['Session ID']));
  if (!s || String(s['Status']) !== 'OPEN') return { ok: false, error: 'Session is not open.' };
  who = l10ForgeStr_(who, 60);
  if (String(s['Facilitator']) !== who && String(row['Person']) !== who) return { ok: false, error: 'Only the facilitator or the owner can commit this goal.' };
  p = p || {};
  var cfg = l10ForgeCfg_();
  var u = { 'Updated At': l10Now_() };
  var ind = l10ForgeStr_(p.indicator, 20);
  if (ind && !l10RockMetricOk_(ind)) return { ok: false, error: 'Leading indicator must be a metric on the metrics list.' };
  u['Leading Indicator'] = ind;
  u['Milestone Q1'] = l10ForgeStr_(p.ms1, 200); u['Milestone Q1 Due'] = l10DueOk_(p.ms1Due) ? String(p.ms1Due) : '';
  u['Milestone Q2'] = l10ForgeStr_(p.ms2, 200); u['Milestone Q2 Due'] = l10DueOk_(p.ms2Due) ? String(p.ms2Due) : '';
  if (String(row['Type']) === 'Business') {
    if (!u['Milestone Q1'] || !u['Milestone Q1 Due']) return { ok: false, error: 'A business goal needs a dated Q1 milestone.' };
    if (cfg.q1By && u['Milestone Q1 Due'] > cfg.q1By) return { ok: false, error: 'The Q1 milestone must land by ' + cfg.q1By + ' (fiscal Q1 ends then).' };
  }
  u['Status'] = 'COMMITTED';
  l10SetCells_(L10.TABS.GOALS, goalId, u);
  l10ForgeTouch_(String(row['Session ID']));
  return { ok: true };
}

function l10_forgeRate(sessionId, who, rating, note) {
  var s = l10ForgeSession_(sessionId);
  if (!s) return { ok: false, error: 'Session not found.' };
  who = l10ForgeStr_(who, 60);
  if (!l10ForgeOnRoster_(who)) return { ok: false, error: 'Pick your name first.' };
  var r = l10ForgeJson_(s['Ratings (JSON)'], {});
  r[who] = Math.max(1, Math.min(10, Number(rating) || 8));
  var u = { 'Ratings (JSON)': JSON.stringify(r) };
  if (note) u['Notes'] = (String(s['Notes'] || '') + '\n' + who + ': ' + l10ForgeStr_(note, 300)).trim();
  l10ForgeTouch_(sessionId, u);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Lock — preview first, then write. Never a to-do.
// ---------------------------------------------------------------------------

// The per-person goal tab: "<Name> — FY27 Goals" by exact name first, then any
// tab that starts with "<Name> " and ends with the suffix. Blocks are found by
// scanning column B for "Goal N" — the row offsets are read, never assumed.
function l10ForgeGoalSheet_(person, cfg) {
  var ss = l10Ss_();
  var exact = ss.getSheetByName(person + cfg.goalSuffix);
  if (exact) return exact;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(person + ' ') === 0 && n.slice(-cfg.goalSuffix.length) === cfg.goalSuffix) return sheets[i];
  }
  return null;
}
function l10ForgeGoalBlocks_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var colB = sheet.getRange(1, 2, last, 3).getValues(); // B..D
  var blocks = [];
  for (var r = 0; r < colB.length; r++) {
    var m = String(colB[r][0] || '').trim().match(/^Goal\s+(\d+)$/i);
    if (m) blocks.push({ n: Number(m[1]), row: r + 1, shiftCell: String(colB[r][2] || '').trim() });
  }
  return blocks;
}

function l10ForgeSmartSentence_(g) {
  var parts = [];
  parts.push('By ' + (g.deadline || '[date]') + ', ' + (g.title || '[goal]') + ' for ' + (g.line || '[line]') +
    ', from ' + (g.baseline || 'baseline: size first') + ' to ' + (g.target || '[target]') +
    (g.guardrail ? ', while maintaining ' + g.guardrail : '') +
    (g.metric ? ', measured as ' + g.metric + (g.source ? ' (' + g.source + ')' : '') : '') + '.');
  if (g.rung || g.lever) parts.push('Rung: ' + (g.rung || '—') + ' · Lever: ' + (g.lever || '—') + (g.indicator ? ' · Leading indicator: ' + g.indicator : ''));
  if (g.stake) parts.push('$ at stake: ' + g.stake);
  if (g.dependencyText) parts.push('Dependency: ' + g.dependencyText);
  if (g.ms1) parts.push('Q1 milestone: ' + g.ms1 + (g.ms1Due ? ' by ' + g.ms1Due : ''));
  if (g.ms2) parts.push('Q2 milestone: ' + g.ms2 + (g.ms2Due ? ' by ' + g.ms2Due : ''));
  return parts.join('\n');
}

function l10ForgeLockPlan_(sessionId) {
  var s = l10ForgeSession_(sessionId);
  if (!s) return { ok: false, error: 'Session not found.' };
  var cfg = l10ForgeCfg_();
  var goals = l10ForgeRowsFor_(L10.TABS.GOALS, sessionId).filter(function (r) { return String(r['Status']) !== 'SUPERSEDED'; }).map(l10ForgeGoalOut_);
  var handoffs = l10ForgeRowsFor_(L10.TABS.FORGE_HANDOFFS, sessionId);
  var hById = {};
  handoffs.forEach(function (h) { hById[String(h['ID'])] = h; });
  var people = {};
  goals.forEach(function (g) { (people[g.person] = people[g.person] || []).push(g); });
  var plan = { ok: true, people: [], parks: [], warnings: [], rocks: 0, sheets: 0, goals: goals.length };
  Object.keys(people).forEach(function (person) {
    var list = people[person].sort(function (a, b) { return a.goalNo - b.goalNo; });
    var biz = list.filter(function (g) { return g.type === 'Business'; });
    var pers = list.filter(function (g) { return g.type === 'Personal'; });
    var sheet = l10ForgeGoalSheet_(person, cfg);
    var blocks = sheet ? l10ForgeGoalBlocks_(sheet) : [];
    var entry = { person: person, business: biz.length, personal: pers.length, sheet: sheet ? sheet.getName() : '', blocks: blocks.length, items: [] };
    if (!sheet) plan.warnings.push(person + ': no "' + person + cfg.goalSuffix + '" tab — goals stay in L10_Goals only.');
    else if (!blocks.length) plan.warnings.push(person + ': the tab has no "Goal N" blocks in column B — nothing will be written there.');
    if (biz.length < cfg.goalsPerPerson - 1) plan.warnings.push(person + ': ' + biz.length + ' business goal(s), expected ' + (cfg.goalsPerPerson - 1) + '.');
    if (!pers.length) plan.warnings.push(person + ': no personal goal.');
    biz.forEach(function (g) {
      if (!g.ms1 || !g.ms1Due) plan.warnings.push(person + ' · "' + g.title + '": no dated Q1 milestone, so no rock will be created.');
      if (g.dependency && hById[g.dependency] && String(hById[g.dependency]['Status']) !== 'ACCEPTED' && String(hById[g.dependency]['Status']) !== 'NEGOTIATED') {
        plan.warnings.push(person + ' · "' + g.title + '": its dependency (' + g.dependency + ') was never accepted.');
      }
    });
    // Business goals fill Goal 1..N-1 in order; the personal goal takes the
    // block whose column D says Personal, else the last block.
    var personalBlock = null;
    blocks.forEach(function (b) { if (/^personal$/i.test(b.shiftCell)) personalBlock = b; });
    if (!personalBlock && blocks.length) personalBlock = blocks[blocks.length - 1];
    var bizBlocks = blocks.filter(function (b) { return b !== personalBlock; });
    biz.forEach(function (g, i) {
      var b = bizBlocks[i] || null;
      entry.items.push({ goal: g.id, title: g.title, type: 'Business', block: b ? b.n : 0, row: b ? b.row : 0, rock: !!(g.ms1 && g.ms1Due) });
      if (b) plan.sheets++;
      if (g.ms1 && g.ms1Due) plan.rocks++;
    });
    pers.forEach(function (g, i) {
      var b = i === 0 ? personalBlock : null;
      entry.items.push({ goal: g.id, title: g.priv ? '(private personal goal)' : g.title, type: 'Personal', block: b ? b.n : 0, row: b ? b.row : 0, rock: false });
      if (b) plan.sheets++;
    });
    plan.people.push(entry);
  });
  // Parking: shortlisted cards nobody claimed → IDEA-stage initiatives.
  l10ForgeRowsFor_(L10.TABS.FORGE_IDEAS, sessionId).forEach(function (r) {
    if (String(r['Status']) === 'SHORTLIST' && !String(r['Claimed By'] || '')) plan.parks.push({ id: String(r['ID']), text: String(r['Idea']).slice(0, 120), theme: String(r['Theme'] || '') });
  });
  plan.parks = plan.parks.slice(0, 20);
  plan.strategyReady = l10InitTabsReady_();
  if (plan.parks.length && !plan.strategyReady) plan.warnings.push('Strategy tabs missing — parked cards will be marked PARKED without an initiative.');
  return plan;
}

function l10_forgeLockPreview(sessionId) { return l10ForgeLockPlan_(sessionId); }

function l10_forgeLock(sessionId, who) {
  var s = l10ForgeSession_(sessionId);
  if (!s) return { ok: false, error: 'Session not found.' };
  if (String(s['Status']) !== 'OPEN') return { ok: false, error: 'This session is already ' + String(s['Status']).toLowerCase() + '.' };
  who = l10ForgeStr_(who, 60);
  if (String(s['Facilitator']) !== who) return { ok: false, error: 'Only the facilitator (' + String(s['Facilitator']) + ') can lock.' };
  var plan = l10ForgeLockPlan_(sessionId);
  if (!plan.ok) return plan;
  var cfg = l10ForgeCfg_();
  var now = l10Now_();
  var handoffs = l10ForgeRowsFor_(L10.TABS.FORGE_HANDOFFS, sessionId);
  var hById = {};
  handoffs.forEach(function (h) { hById[String(h['ID'])] = h; });
  var written = 0, rocks = 0, parked = 0, errors = [];
  plan.people.forEach(function (entry) {
    var sheet = entry.sheet ? l10Ss_().getSheetByName(entry.sheet) : null;
    entry.items.forEach(function (item) {
      var row = l10ForgeGoalRow_(item.goal);
      if (!row) return;
      var g = l10ForgeGoalOut_(row);
      var h = g.dependency ? hById[g.dependency] : null;
      g.dependencyText = h ? (String(h['To']) + ': ' + String(h['Need']) + (h['Due'] ? ' by ' + l10DateStr_(h['Due']) : '') + ' (' + String(h['Status']).toLowerCase() + ')') : '';
      var u = { 'Status': 'LOCKED', 'Updated At': now };
      if (sheet && item.row) {
        try {
          sheet.getRange(item.row, 3, 1, 2).setValues([[g.title, g.type === 'Personal' ? 'Personal' : (g.shift || '')]]);
          sheet.getRange(item.row + 1, 3).setValue(g.deadline || '');
          sheet.getRange(item.row + 2, 3).setValue(l10ForgeSmartSentence_(g));
          sheet.getRange(item.row + 3, 3).setValue(g.doneWhen || '');
          u['Written To Sheet At'] = now;
          written++;
        } catch (e) { errors.push(entry.person + ' · ' + g.title + ': sheet write failed — ' + String(e).slice(0, 120)); }
      }
      if (item.rock && !g.rockId) {
        var res = l10_addRock({ title: g.ms1, owner: g.person, due: g.ms1Due, shift: g.shift, accounts: g.line,
          done: g.title, notes: 'Q1 milestone of goal ' + g.id + ' (Forge ' + sessionId + ')', metricId: g.indicator, source: g.id });
        if (res && res.ok) {
          u['Rock ID'] = res.id; rocks++;
          if (g.ms2 && g.ms2Due) l10_addMilestone({ rockId: res.id, text: g.ms2, due: g.ms2Due, notes: 'Q2 milestone of goal ' + g.id });
        } else errors.push(entry.person + ' · ' + g.title + ': rock not created — ' + ((res && res.error) || 'unknown'));
      }
      l10SetCells_(L10.TABS.GOALS, item.goal, u);
    });
  });
  plan.parks.forEach(function (p) {
    var u = { 'Status': 'PARKED', 'Updated At': now };
    if (plan.strategyReady) {
      var idea = l10ForgeIdea_(p.id);
      var res = l10_addInitiative({ title: p.text, thesis: idea ? String(idea['Build'] || '') : '', lead: l10Config_().INITIATIVE_LEAD || '',
        stage: 'IDEA', origin: 'Forge ' + sessionId + (p.theme ? ' · ' + p.theme : ''), accounts: [] });
      if (res && res.ok) u['Parked To'] = res.id;
    }
    l10SetCells_(L10.TABS.FORGE_IDEAS, p.id, u);
    parked++;
  });
  l10ForgeTouch_(sessionId, { 'Status': 'LOCKED', 'Locked At': now, 'Phase': 'LOCKED' });
  var ratings = l10ForgeJson_(s['Ratings (JSON)'], {}), rk = Object.keys(ratings);
  var avg = rk.length ? Math.round(rk.reduce(function (a, k) { return a + Number(ratings[k] || 0); }, 0) / rk.length * 10) / 10 : null;
  var ideasN = l10ForgeRowsFor_(L10.TABS.FORGE_IDEAS, sessionId).filter(function (r) { return String(r['Round']) !== 'O' && String(r['Status']) !== 'DROPPED'; }).length;
  try {
    l10NotifyChat_('Forge — ' + String(s['Title'] || sessionId) + ': ' + ideasN + ' ideas · ' + plan.goals + ' goals locked · ' +
      rocks + ' rocks created · ' + parked + ' parked' + (avg !== null ? ' · rated ' + avg + '/10' : ''));
  } catch (e2) {}
  return { ok: true, written: written, rocks: rocks, parked: parked, errors: errors };
}

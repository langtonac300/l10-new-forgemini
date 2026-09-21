// Level 10 Huddle — spreadsheet schema, one-time setup, and seed data.
// Everything is prefixed L10/l10 because this script shares a project with other
// bound scripts (FY27 Goals template, dashboard helpers). Run l10Setup() once.
//
// IMPORTANT: this file deliberately does NOT define onOpen() — the project already
// has one (FY27 Goals). Add the single line  l10BuildMenu();  inside the existing
// onOpen() to get the menu, or run l10Setup() straight from the editor.
//
// Internal identifiers keep the l10/L10 prefix; only user-facing strings carry the
// L10 vocabulary the team already uses (Segue / Rock review / IDS / Headlines). The
// scorecard metric builder, GA4 source, priorities + issue-solving upgrades, the
// four-slice boot, and the settings page come from the reworked app; the Brady
// seeds, config, Experiment Hub, pre-huddle brief intake, and email cascade are the
// paid-media team's own layer on top.

var L10 = {
  TABS: {
    MEETINGS: 'L10_Meetings',
    SCORECARD: 'L10_Scorecard',
    DATA: 'L10_Scorecard_Data',
    ROCKS: 'L10_Rocks',
    MILESTONES: 'L10_Rock_Milestones',
    TODOS: 'L10_Todos',
    TODO_STEPS: 'L10_Todo_Steps',
    TODO_LOG: 'L10_Todo_Log',
    ISSUES: 'L10_Issues',
    HEADLINES: 'L10_Headlines',
    EVENTS: 'L10_Events',
    CONFIG: 'L10_Config',
    BRIEF: 'L10_Brief',
    PLAYBOOK: 'L10_Playbook',
    NOTIFY: 'L10_Notify',
    DIGESTS: 'L10_Digests',
    TEAM: 'L10_Team',
    // Strategy page (v2.14): cross-account initiatives, their per-account
    // rollout cells, and an append-only trail. Documented in the folder README.
    INITIATIVES: 'L10_Initiatives',
    INIT_ACCOUNTS: 'L10_Initiative_Accounts',
    INIT_LOG: 'L10_Initiative_Log',
    // Forge (v2.17): the timed idea-generation / goal-setting session — a
    // session row, its cards, one row per vote, the handoff board, and the
    // goals that come out of it. Documented in IDEA-FORGE.md.
    FORGE_SESSIONS: 'L10_Forge_Sessions',
    FORGE_IDEAS: 'L10_Forge_Ideas',
    FORGE_VOTES: 'L10_Forge_Votes',
    FORGE_HANDOFFS: 'L10_Forge_Handoffs',
    GOALS: 'L10_Goals'
  },
  // Column-header strings double as row-object keys across the codebase (e.g.
  // r['Rock'], 'Segue (JSON)') — treat them as internal identifiers and do not
  // rename them; the UI shows its own labels.
  HEADERS: {
    L10_Meetings: ['ID', 'Date', 'Status', 'Attendees', 'Started At', 'Concluded At',
      'Segue (JSON)', 'Todo Done %', 'Todos Done', 'Todos Open', 'Issues Solved',
      'Rating Avg', 'Ratings (JSON)', 'Cascade', 'Recap', 'Notes'],
    L10_Scorecard: ['ID', 'Metric', 'Owner', 'Format', 'Rule', 'Goal', 'Goal 2',
      'Source', 'Source Ref', 'Caveat', 'Active', 'Sort'],
    L10_Scorecard_Data: ['Week Of', 'Metric ID', 'Value', 'Captured At', 'Note'],
    // 'Metric ID'/'Source' sit at the END on purpose — 'Metric ID' optionally links
    // a rock to the scorecard number it should move (its trend renders on the card);
    // 'Source' is the issue id a promoted rock came from (the tappable cross-
    // reference — l10_promoteIssue writes it instead of a Notes breadcrumb).
    // Inserting either mid-row would shift every existing row under the wrong header.
    L10_Rocks: ['ID', 'Rock', 'Owner', 'Due', 'Shift', 'Accounts', 'Status',
      'Definition of Done', 'Notes', 'Created', 'Status Updated', 'Metric ID', 'Source'],
    L10_Rock_Milestones: ['ID', 'Rock ID', 'Milestone', 'Due', 'Status', 'Done At',
      'Created', 'Notes'],
    // 'Jira Key'/'Jira Done' sit at the END on purpose — same rule as the IDS
    // note columns below: they're the L10->Jira sync bookkeeping (created issue
    // key + close timestamp), and inserting them mid-row would shift every
    // existing row under the wrong header. See L10Jira.gs. 'Repeat' (WEEKLY = a
    // recurring weekly to-do that respawns on completion) is appended after them.
    // 'Blocked On' (what a BLOCKED to-do is waiting for) and 'Last Carried Week'
    // (the Monday of the last week this row's carry counter advanced — see
    // l10SweepCarries_) are appended after 'Repeat' under the same rule.
    L10_Todos: ['ID', 'To-Do', 'Owner', 'Due', 'Status', 'Created', 'Done At',
      'Carried Over', 'Source', 'Notes', 'Jira Key', 'Jira Done', 'Repeat',
      'Blocked On', 'Last Carried Week'],
    // Sub-steps of a single to-do — the same parent/child shape as
    // L10_Rock_Milestones, and the same roll-up rule: completing the last open
    // step marks the parent to-do DONE (l10_setTodoStepStatus).
    L10_Todo_Steps: ['ID', 'Todo ID', 'Step', 'Status', 'Done At', 'Created'],
    // Append-only activity trail on a to-do: progress notes, blockers, hand-offs.
    // Posting a note never changes the to-do's status — the trail is the story,
    // the Status column is the state.
    L10_Todo_Log: ['ID', 'Todo ID', 'At', 'Who', 'Note'],
    // One row per roster name. 'Photo' holds a small (≤128px) image as a data
    // URI written by the Settings page — well under the 50,000-character cell
    // limit. Blank = the avatar falls back to the initial.
    L10_Team: ['Name', 'Photo', 'Updated At'],
    // 'Identified'/'Discussed' (IDS notes) sit at the END on purpose — the
    // columns were added later and inserting them mid-row would shift every
    // existing row's data under the wrong header. Same rule for the outcome-review
    // columns after them: 'Outcome' (did the fix hold), 'Outcome At', and 'Review
    // On' (the date the Conclude segment starts asking about a solved issue's
    // outcome) — and for 'Waiting On' (the homework to-do id when the huddle said
    // "bring the data"; the issue stays OPEN and resurfaces once that to-do
    // completes).
    L10_Issues: ['ID', 'Issue', 'Raised By', 'Raised', 'Accounts', 'Category',
      'Votes', 'Status', 'Park With', 'Resolution', 'Solved In', 'Notes',
      'Identified', 'Discussed', 'Outcome', 'Outcome At', 'Review On', 'Waiting On'],
    // 'Status' sits at the END on purpose — same rule as the other appended
    // columns: blank = live, KILLED = dropped from every render/recap/cascade
    // while the row stays in the tab as the audit trail.
    L10_Headlines: ['ID', 'Date', 'Type', 'Headline', 'By', 'Cascade', 'Meeting ID', 'Status'],
    L10_Events: ['Start Date', 'End Date', 'Event', 'Notes'],
    L10_Config: ['Key', 'Value', 'Description'],
    // Pre-huddle brief rows, replaced per week by the intake endpoint (doPost in
    // L10Code.gs). Section: DOCKET (ranked IDS candidates) / WATCHLIST /
    // EXPERIMENTS / NEGATIVES (one-line context strips).
    L10_Brief: ['Week Of', 'Section', 'Rank', 'Title', 'Body', 'Dollars At Stake',
      'Accounts', 'Caveat', 'Playbook Ref', 'Promoted To', 'Received At'],
    // Analysis playbook the issue forms match against while you type — which
    // standing report answers this kind of issue and how to get it run.
    // Seeded below; also maintained by the intake endpoint (upsert by ID).
    L10_Playbook: ['Playbook ID', 'Name', 'Trigger Keywords', 'Accounts',
      'What It Answers', 'How To Run', 'Standing Caveat', 'Updated At'],
    // Per-analyst email preferences (edited from Settings → Notifications).
    // Heads-up = YES/NO for the day-before personal email; Recap = how often the
    // post-huddle team recap reaches this person (EVERY/BIWEEKLY/MONTHLY/OFF).
    L10_Notify: ['Person', 'Heads-up', 'Recap', 'Updated At'],
    // Free-schedule "Custom digests" — one row per RULE, many per person (edited
    // from Settings → Custom digests). Opt-in: no rows are seeded. 'Content' is a
    // compact multi-token cell (e.g. "TODOS, ROCKS") so adding a content type later
    // never widens the schema. 'Weekday' is used only when Frequency = WEEKLY;
    // 'Hour' is 0–23 in the SHEET timezone; 'Last Sent' ('yyyy-MM-dd HH', blank =
    // never) is the runner's idempotency stamp. 'ID' (D-001…) is the stable
    // edit/remove handle and lets a resave preserve 'Last Sent'.
    L10_Digests: ['ID', 'Person', 'Label', 'Content', 'Frequency', 'Weekday', 'Hour', 'Enabled', 'Last Sent', 'Updated At'],
    // Strategy initiatives (SI-###). 'Last Touched' is bumped by EVERY write
    // against the initiative (edit, stage, cell, trail note, to-do added or
    // completed) and drives the staleness flag; 'Decided At'/'Decision' are
    // stamped when Stage lands on ADOPTED or KILLED.
    // 'Next Check-in' / 'Expected Impact' / 'Effort' sit at the END on purpose
    // (v2.14.2; same append rule as every other late column): the lead's own
    // review date (drives the stale flag when set), the business case in one
    // line, and S / M / L.
    L10_Initiatives: ['ID', 'Initiative', 'Thesis', 'Lead', 'Shift', 'Stage', 'Origin',
      'Target Quarter', 'Notes', 'Created', 'Last Touched', 'Decided At', 'Decision',
      'Next Check-in', 'Expected Impact', 'Effort'],
    // The initiative × account matrix, one row per pair (upserted, never
    // duplicated). 'Hub Ref' = the Experiment Hub id this cell's test lives
    // under; 'Rock ID' = the rock created from this cell.
    L10_Initiative_Accounts: ['ID', 'Initiative ID', 'Account', 'State', 'Hub Ref', 'Rock ID',
      'Note', 'Updated At'],
    // Append-only trail — same shape and rule as L10_Todo_Log.
    L10_Initiative_Log: ['ID', 'Initiative ID', 'At', 'Who', 'Note'],
    // Forge session (FS-###). Phase is a key (LOBBY / OPENER / DIVERGE / RELAY /
    // CLUSTER / VOTE / COMMITTEE / CLAIM / HANDOFFS / FORGE / DOCTOR / COMMIT /
    // LOCKED); 'Phase Started At' and 'Paused At' are epoch milliseconds so every
    // device computes the same clock; 'Version' is bumped by every write and is
    // what the clients poll against.
    L10_Forge_Sessions: ['ID', 'Date', 'Title', 'Status', 'Facilitator', 'Phase', 'Round',
      'Phase Started At', 'Phase Seconds', 'Paused At', 'Prompt Deck (JSON)', 'Themes (JSON)',
      'Ratings (JSON)', 'Participants', 'Created', 'Locked At', 'Notes', 'Timed Write (JSON)',
      'Flags (JSON)', 'Version'],
    // One card (FI-###). 'By' is always stored; Anon = YES hides it until Claim.
    // 'Build By'/'Build' are relay pass 1; pass 2 sits at the END as 'Relay 2 By'/
    // 'Relay 2' (same append rule as every late column). Round: O = opener,
    // P = pre-work, T = timed write, 1..n = diverge rounds.
    L10_Forge_Ideas: ['ID', 'Session ID', 'Round', 'Prompt', 'Idea', 'By', 'Anon', 'Created',
      'Build By', 'Build', 'Theme', 'Account', 'Shift', 'Lever', 'Dots', 'Super Votes', 'Status',
      'Claimed By', 'Goal ID', 'Parked To', 'Updated At', 'Relay 2 By', 'Relay 2'],
    // One row per vote (FV-###) so blind voting is auditable; a taken-back vote
    // is voided in place ('VOID DOT'), never deleted.
    L10_Forge_Votes: ['ID', 'Session ID', 'Target ID', 'By', 'Kind', 'At'],
    // "I need ___ from ___ by ___; I will provide ___" (FH-###) with a state the
    // named recipient sets. A recipient off the roster stays UNCONFIRMED.
    L10_Forge_Handoffs: ['ID', 'Session ID', 'From', 'To', 'Need', 'Provide', 'Due', 'Status',
      'Goal ID', 'Created', 'Updated At'],
    // The goals (G-###). The HR-facing copy is each person's own
    // "<Name> — FY27 Goals" tab, written by Lock. 'Guardrail' … 'Verdict' sit at
    // the END on purpose (v2 of the spec added them).
    L10_Goals: ['ID', 'Session ID', 'Person', 'FY', 'Goal No', 'Type', 'Title', 'Revenue Line',
      'Rung', 'Lever', 'Metric', 'Metric Source', 'Baseline', 'Target', 'Deadline', 'Done When',
      'Leading Indicator', 'Dollars At Stake', 'Shift', 'Milestone Q1', 'Milestone Q1 Due',
      'Milestone Q2', 'Milestone Q2 Due', 'Doctor By', 'Doctor Checks (JSON)', 'Doctor Note',
      'Status', 'Idea ID', 'Rock ID', 'Written To Sheet At', 'Created', 'Updated At',
      'Guardrail', 'Dependency', 'Private', 'Doctor 2 By', 'Doctor 2 Checks (JSON)',
      'Doctor 2 Note', 'Verdict']
  },
  ROCK_STATUSES: ['ON TRACK', 'OFF TRACK', 'DONE', 'DROPPED'],
  MILESTONE_STATUSES: ['OPEN', 'DONE'],
  // WORKING and BLOCKED are open states, not new outcomes: a to-do in either one
  // is still owed. They exist so "started it" and "stuck on someone else" stop
  // looking identical to untouched — the exact exchange the huddle wastes time on,
  // and the thing Stuart can't see between meetings.
  // ⚠ Anything that asks "is this still owed?" must test TODO_OPEN_STATUSES, never
  // Status === 'OPEN'. The completion score's denominator is built from it
  // (l10_concludeMeeting / weekTodos_), and so is the Jira create test
  // (L10Jira.gs) — a bare 'OPEN' comparison silently drops these rows from both.
  TODO_STATUSES: ['OPEN', 'WORKING', 'BLOCKED', 'DONE', 'DROPPED'],
  TODO_OPEN_STATUSES: ['OPEN', 'WORKING', 'BLOCKED'],
  TODO_STEP_STATUSES: ['OPEN', 'DONE'],
  ISSUE_STATUSES: ['OPEN', 'SOLVED', 'PARKED', 'KILLED'],
  HEADLINE_TYPES: ['Customer', 'Employee', 'Kudos', 'FYI'],
  // MANUAL/RANGE/GA4 are the generic sources; HUB_RUNNING/HUB_DECISIONS pull the
  // live/awaiting-decision counts from the Experiment Hub (see l10HubCounts_).
  SOURCES: ['MANUAL', 'RANGE', 'GA4', 'HUB_RUNNING', 'HUB_DECISIONS'],
  RULES: ['>=', '<=', 'between', 'none'],
  FORMATS: ['num', 'usd', 'pct', 'x'],
  BRIEF_SECTIONS: ['DOCKET', 'WATCHLIST', 'EXPERIMENTS', 'NEGATIVES'],
  // Outcome-review verdicts on a solved issue (Conclude segment). TOO EARLY is
  // never stored — it pushes Review On forward instead.
  ISSUE_OUTCOMES: ['HELD', 'DID NOT HOLD'],
  // How often the post-huddle recap reaches an analyst (L10_Notify.Recap).
  RECAP_CADENCES: ['EVERY', 'BIWEEKLY', 'MONTHLY', 'OFF'],
  // Custom-digest rule enums (L10_Digests). Frequency drives the runner's day
  // match (DAILY = every day, WEEKDAYS = Mon–Fri, WEEKLY = the named Weekday);
  // Content is the set of sections a digest carries; Weekday labels are the
  // 3-letter day names the runner matches against.
  DIGEST_FREQS: ['DAILY', 'WEEKDAYS', 'WEEKLY'],
  DIGEST_CONTENT: ['TODOS', 'ROCKS', 'SCORECARD', 'HEADLINES', 'INITIATIVES'],
  // Strategy initiatives: the four live stages in order, then the two decided
  // ones. An initiative ends on a decision (ADOPTED/KILLED), never on a task count.
  INITIATIVE_STAGES: ['IDEA', 'SCOPING', 'PILOTING', 'ROLLING OUT', 'ADOPTED', 'KILLED'],
  INITIATIVE_LIVE_STAGES: ['IDEA', 'SCOPING', 'PILOTING', 'ROLLING OUT'],
  // Per-account rollout state (the matrix cell).
  INITIATIVE_ACCOUNT_STATES: ['NOT STARTED', 'TESTING', 'ADOPTED', 'REJECTED', 'N/A'],
  INITIATIVE_EFFORTS: ['S', 'M', 'L'],
  DIGEST_WEEKDAYS: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  // Forge enums (v2.17). A card's life: RAW → BUILT (relay) → SHORTLIST (in a
  // chosen theme) → CLAIMED → GOAL; PARKED / DROPPED are the exits.
  FORGE_SESSION_STATUSES: ['OPEN', 'LOCKED', 'DISCARDED'],
  FORGE_IDEA_STATUSES: ['RAW', 'BUILT', 'SHORTLIST', 'CLAIMED', 'GOAL', 'PARKED', 'DROPPED'],
  FORGE_HANDOFF_STATUSES: ['PROPOSED', 'ACCEPTED', 'NEGOTIATED', 'UNCONFIRMED', 'WITHDRAWN'],
  GOAL_STATUSES: ['DRAFT', 'COMMITTED', 'LOCKED', 'SUPERSEDED'],
  GOAL_TYPES: ['Business', 'Personal'],
  GOAL_VERDICTS: ['READY', 'REVISE', 'NEEDS EVIDENCE']
};

// Forge defaults (v2.17). Editable in L10_Config once seeded; these are the
// fallbacks when a key is blank or unparseable. Phase = [key, label, seconds,
// rounds]; keys are fixed (the renderer switches on them), the rest is free.
var L10_FORGE_PHASES_DEFAULT = JSON.stringify([
  ['OPENER', 'Goal, project or chore?', 300], ['DIVERGE', 'Diverge', 300, 3], ['RELAY', 'Relay', 240, 2],
  ['CLUSTER', 'Cluster', 480], ['VOTE', 'Vote', 300], ['COMMITTEE', 'Investment committee', 600],
  ['CLAIM', 'Claim', 300], ['HANDOFFS', 'Handoff contracts', 600], ['FORGE', 'Forge the goal', 2100],
  ['DOCTOR', 'Goal doctor', 480, 2], ['COMMIT', 'Commit', 300]
]);
var L10_FORGE_PROMPTS_DEFAULT = JSON.stringify({
  opener: [
    { text: 'Launch a podcast sponsorship.', answer: 'project' },
    { text: 'Run four experiments.', answer: 'task' },
    { text: 'Grow PDC sales-accepted pipeline within an agreed cost and quality limit.', answer: 'outcome' },
    { text: 'Save five hours a week preparing reports.', answer: 'incomplete' }
  ],
  openerLabels: [['outcome', 'Outcome'], ['project', 'Project'], ['task', 'Recurring task'], ['incomplete', 'Incomplete goal']],
  rounds: [
    { title: 'Your line', prompt: 'Look at your FY27 number. Write ideas that move THAT line. One idea per card.' },
    { title: 'Wildcard', prompt: 'Draw a wildcard (below) and answer it for your accounts. One idea per card.' },
    { title: "Stuart's list, made concrete", prompt: "Take any item from Stuart's list and make it concrete for YOUR accounts. What would you actually launch?" }
  ],
  wildcards: [
    '+$250K lands in your budget tomorrow. Where does it go, what does it return?',
    'Cut 10% of spend and hold revenue. How?',
    'What would you stop doing?',
    'Steal a play that works in another account.',
    'What is the 10x version, not the 10%?',
    'What can a customer not find or buy from us today?',
    'Automate one thing you do every week.'
  ],
  card: 'For [customer / account], change [thing] because [reason], so that [business result]. We would look for [evidence].',
  relay: ['Strengthen the customer or revenue link on the two most promising cards you were dealt.',
    'Add a test, a missing assumption, or an extension.'],
  thought: [
    { title: 'July 31, 2027', minutes: 10, prompt: 'It is the last day of FY27. Write the two-sentence TLDR Stuart sends Nicole about YOUR accounts. Then list the three things you did that made it true.' },
    { title: 'The 20% cut', minutes: 10, prompt: 'Tomorrow your budget drops 20% and the revenue number does not move. Write what you stop, what you protect, and what you automate.' },
    { title: 'Swap seats', minutes: 10, prompt: 'Write the #1 goal you would set for the person on your left, in THEIR new role.' },
    { title: 'Be the customer', minutes: 10, prompt: 'You are a hospital facilities manager, or a plant electrician. Write how you would find and buy from us today, step by step, and exactly where you give up.' },
    { title: 'Ten times', minutes: 10, prompt: 'Success is leads x10, not +10%. What would have to be true? What would you have to stop believing?' },
    { title: "Stuart's chair", minutes: 10, prompt: "You are Stuart reading the team's five goals on Friday. Write the first question you ask, and the goal you would send back." },
    { title: 'The number nobody can see', minutes: 10, prompt: 'Name one number you would need to make a decision this year that no tool gives you today. How would you get it, and what would it cost?' },
    { title: 'Kill list', minutes: 10, prompt: 'List everything you run that you would not restart if it were switched off today.' },
    { title: 'Twice the leads', minutes: 10, prompt: 'Lead volume doubles next quarter and sales-accepted leads stay flat. Write what happened, and what you would have measured to see it coming.' },
    { title: 'Efficient and shrinking', minutes: 10, prompt: 'Your ROAS improves all year while revenue falls. Did you succeed? Write the sentence you would say to Stuart.' },
    { title: 'No new platforms', minutes: 10, prompt: 'No new platform for 90 days. Where does growth come from?' }
  ],
  doctor: [
    'Specific enough that a stranger could start Monday?',
    'Has a number, a source and a date?',
    'Names a revenue line and a rung?',
    'Achievable inside their actual role, with the dependencies accepted?',
    'Would the manager know by the Q1 check-in whether it is on track?',
    'Distinct from the owner\'s other goals?',
    'Could the owner hit this metric WITHOUT helping the business?'
  ],
  stuart: [
    'What is the why? What mechanism moves the number?',
    'Per business day, what does that look like? Delta to plan?',
    'Is this volume or efficiency? If efficiency, does it kill leads?',
    'What does the business get, in one sentence I could give Nicole?',
    'What did you automate before asking for money or people?',
    'If the FY27 spend ask is not honored, does this goal survive?'
  ],
  rungs: ['Revenue / pacing', 'Leading indicator', 'Volume', 'Automation'],
  levers: ['Spend allocation', 'Efficiency', 'Conversion (LP / feed / creative)', 'New channel or audience', 'Measurement', 'Automation'],
  shifts: ['Shift 1', 'Shift 2', 'Shift 3', 'Shift 4']
});
// Revenue lines as label → the FY27 number AS TEXT (the app never computes with
// them; they are what a goal names). Edit FORGE_LINES in L10_Config to change.
var L10_FORGE_LINES_DEFAULT = JSON.stringify([
  ['Brady US paid search', '$8.54M spend · $23.67M revenue · ROAS 2.77'],
  ['Brady CA paid search', '$0.43M spend · $1.92M revenue · ROAS 4.45'],
  ['Seton US paid search', '$4.00M spend · $4.31M revenue · ROAS 1.08'],
  ['EMEDCO paid search', '$1.43M spend · $1.96M revenue · ROAS 1.37 (managed decline)'],
  ['Seton CA paid search', '$0.35M spend · $0.52M revenue · ROAS 1.47'],
  ['Awareness media', '$979,548 · lead and pipeline lines'],
  ['Amazon', '$819,786 · ACOS under 15%'],
  ['PDC Healthcare', '$300K · lead-gen push, no target yet'],
  ['Cross-account / capacity', 'enabling work — name the constraint it removes']
]);

var L10_CONFIG_DEFAULTS = [
  ['MEETING_NAME', 'Paid Media L10 Huddle', 'Shown in the app header and recaps.'],
  ['TEAM', 'Alex, Courtney, Scott, CJ', 'Attendee + owner roster (comma-separated). Edit freely.'],
  ['SEGMENTS', '[["Segue",5],["Scorecard",5],["Rock review",5],["Headlines",5],["To-do list",5],["IDS",60],["Conclude",5]]',
    'Agenda segments + minutes (JSON). Classic Level 10 = 90 min; trim minutes here to fit a shorter slot.'],
  ['SCORECARD_WEEKS', 13, 'Trailing weeks shown on the scorecard grid (13 = one quarter).'],
  ['TODO_DONE_TARGET', 90, 'Weekly to-do completion target % (team-level, not per person).'],
  ['TODO_KEEP_DAYS', 60, 'How many days of FINISHED to-dos the app loads. Still-owed to-dos always load, whatever their age.'],
  ['TODO_STALE_CARRIES', 3, 'Carry-overs before a to-do is flagged as misclassified work and offered a promotion to a rock or an issue.'],
  ['STATS_PER_PERSON', 'YES', 'Team stats page: show the per-person counts table (added/done/open/overdue, days to done). NO = hide it. The completion score itself is never split per person.'],
  ['RATING_BAR', 8, 'Meeting ratings below this prompt a "where did we lose you?" note.'],
  ['DATA_HEALTH', 'ON', 'Scorecard data-source health strip (needs the BigQuery service + the v_l10_data_health view). OFF = hide.'],
  ['HEALTH_MAP', '{"SC-007":["leads_lifecycle"],"SC-011":["spend_mart","web_orders","adobe_orders"],"SC-012":["spend_mart","web_orders","adobe_orders"],"SC-015":["spend_mart","amazon_sp","amazon_sb","amazon_mart_block"]}',
    'Metric ID → data-health source keys (JSON). A metric is flagged in the grid and at capture when any mapped source reads STALE or BROKEN.'],
  ['EXPERIMENT_HUB_URL', 'https://docs.google.com/spreadsheets/d/1tiONB25PX_N02oQmBRPmG98vQnvbeRv_vPm0ErVRgdg/edit',
    'Experiment Hub sheet URL — feeds the auto experiment counts on the scorecard. Blank = off.'],
  ['ACCOUNT_TAGS', 'Brady US, Brady CA/MX/BR, Seton US, EMEDCO, Seton CA, PDC/Wristbands, Amazon, Social/Awareness, Marking, Cross-account',
    'Account tags for rocks + issues (comma-separated).'],
  ['INITIATIVE_LEAD', 'Courtney', 'Strategy page: the roster name preselected as lead on a new initiative (the team strategist).'],
  ['INITIATIVE_STALE_DAYS', 14, 'Strategy page: for an initiative that is PILOTING or ROLLING OUT with no Next Check-in date set, days since it was last touched (any edit, cell change, note or to-do activity) before it is flagged STALE. Ideas and scoping are never timer-flagged; a Next Check-in date always wins.'],
  ['ISSUE_CATEGORIES', 'Tracking/Data, Budget/Pacing, Platform/Engine, Creative/LP, Feeds, Process/SOP, Test idea, Other',
    'Issue categories (comma-separated).'],
  ['PARK_TARGETS', 'Courtney 1:1 (Wed 9:30), CJ 1:1 (Wed 10:30), Scott 1:1 (Fri 11:00), Stuart 1:1 (Thu 10:00), Seton/EMEDCO weekly (Wed 2:00)',
    'Where an issue can be parked when it belongs in a smaller meeting.'],
  ['BDAYS_OVERRIDE', '', 'Optional business-day overrides, e.g. "2026-07=22, 2026-09=21". Default = weekday count (no holiday calendar).'],
  ['HUDDLE_DAY', 'Tuesday', 'Day the weekly huddle runs. Drives the email automation: heads-up goes out the day before, recap that evening.'],
  ['TEAM_EMAILS', '', 'OPTIONAL override of the built-in roster in L10Mail.gs. Blank = use the addresses baked into the code. To override: "Alex=alex@bradycorp.com, Courtney=...", names matching the Owner column on rocks/to-dos.'],
  ['RECAP_TO', '', 'Extra recap recipients beyond the team (comma-separated emails), e.g. Stuart. Blank = team only.'],
  ['STUART_EMAIL', '', 'OPTIONAL override of the manager-recap recipient (Stuart, baked into L10Mail.gs). Blank = use the built-in address. Gets the fuller manager recap (scorecard/rocks/to-dos/headlines) after each huddle.'],
  ['ONE_ON_ONES', '', 'OPTIONAL override of the 1:1 schedule (baked into L10Mail.gs). Format "Name:Weekday[:manager]", e.g. "Courtney:Wed, CJ:Wed, Scott:Fri, Stuart:Thu:manager". Each weekday morning Alex gets a prep pack for that day\'s 1:1s.'],
  ['EMAIL_FROM_NAME', 'Paid Media L10', 'Display name on the automated L10 emails.'],
  ['CHAT_WEBHOOK_URL', '',
    'Incoming-webhook URL for the team chat space. When set, adding or completing a to-do posts a line to that space (e.g. "L10 To-Do - Complete - Scott - Fix the PDC feed"). Blank = off. Create it in the space → Apps & integrations → Webhooks → Add; or use L10 Huddle → Chat → Set to-do webhook URL.'],
  ['JIRA_DOMAIN', 'bradyagile.atlassian.net', 'Atlassian site host for the L10→Jira to-do sync (no https://, no trailing path). Blank = Jira sync off. See L10Jira.gs.'],
  ['JIRA_PROJECT_KEY', 'BNADM', 'Jira project key new to-dos are created in (BNA - Digital Marketing board). Use L10 Huddle → Jira → Test connection to list the project keys you can access.'],
  ['JIRA_EMAIL', '', 'Atlassian account email that owns the API token — issues are created as this user. Token itself lives in the L10_JIRA_API_TOKEN script property (L10 Huddle → Jira → Set API token).'],
  ['JIRA_ISSUE_TYPE', 'Task', 'Issue type created for each to-do (must exist in the project). Default Task.'],
  ['JIRA_DONE_TRANSITION', 'Done', 'Workflow transition name used to close a Jira issue when its to-do is completed in the huddle. Default Done; falls back to any transition whose target is in the "done" status category.'],
  ['JIRA_USER_MAP', '', 'OPTIONAL owner→Jira accountId map for assignment, e.g. "Scott=5b10...;CJ=5b10...". Blank = resolve owner → email → accountId via the roster (TEAM_EMAILS override if set, else the addresses baked into L10Mail.gs).'],
  ['GA4_PROPERTY_ID', '', 'Google Analytics (GA4) property ID — the digits from Analytics → Admin → Property settings (a pasted "properties/123456" works too). Powers scorecard metrics with the GA4 source: each user\'s own sign-in reads the data, so no key or token is stored. Blank = off. Also editable in the app: Settings → Integrations.'],
  ['GEMINI_ENABLED', 'YES', 'Master switch for every Gemini-powered feature. NO turns them all off in one edit without clearing the key. Needs an API key set via L10 Huddle > Gemini > Set API key (stored in the L10_GEMINI_API_KEY script property, never in the sheet). See L10Gemini.gs.'],
  ['GEMINI_MODEL', 'gemini-2.5-flash', 'Gemini model the app calls. Change only if your key cannot reach the default or you want a different speed/quality trade-off.'],
  ['GEMINI_DAILY_CAP', 200, 'Maximum Gemini API calls per day across all features combined, so one runaway loop cannot spend the quota. Reached = features report the cap and stop until tomorrow.'],
  ['BRIEF_ENABLED', 'YES', 'Show the pre-huddle brief (L10_Brief rows for the current week) on the start screen and in IDS. The rows arrive via the intake endpoint (doPost) or can be typed into the tab by hand. NO = hide.'],
  ['FISCAL_START_MONTH', 8, 'First month of the fiscal year (1 = January; 8 = the Brady Aug–Jul fiscal year). Drives the fiscal-quarter date chips.'],
  ['OUTCOME_REVIEW_WEEKS', 4, 'Weeks after an issue is SOLVED before the Conclude segment asks "did the fix hold?". The answer lands in the Outcome column — the decision ledger\'s hit rate.'],
  ['CASCADE_DRAFT', 'YES', 'Email a cascade draft (fresh dashboard pulls + last huddle\'s flagged headlines) to Alex on Monday morning, before the digital-team meeting the cascade feeds. NO = off. Needs the mail triggers installed.'],
  ['TIMER_CHIME', 'YES', 'Play a soft chime when a huddle segment first goes over time. NO = silent (the red pulse still shows).'],
  ['CALENDAR_ENABLED', 'YES', 'Show the "📅 Schedule" control that books a Google Calendar meeting from an issue/headline. NO = hide. Needs the Calendar advanced service added in the Apps Script editor (Services → Calendar API).'],
  ['CALENDAR_ID', 'primary', 'Default calendar new events land on ("primary" = the deploying user\'s own calendar, or a calendar ID / address). The modal still lets you pick any calendar you can write to.'],
  ['CALENDAR_DAY_START', 7, 'First hour (0–23) shown on the scheduler day view.'],
  ['CALENDAR_DAY_END', 19, 'Last hour (1–24) shown on the scheduler day view.'],
  ['CALENDAR_SLOT_MIN', 30, 'Snap granularity in minutes for picking a start time on the day view.'],
  ['CALENDAR_DEFAULT_DURATION', 30, 'Default meeting length in minutes when the scheduler opens.'],
  // Forge (v2.17)
  ['FORGE_ENABLED', 'YES', 'Show the Forge page (timed idea-generation / goal-setting sessions). NO = hide the nav entry.'],
  ['FORGE_PASSWORD', 'Welcome', 'Passphrase the Forge page and the player link ask for before anything shows (case-insensitive). Keeps the room from being opened before the day. Blank = no gate.'],
  ['WHEEL_ENABLED', 'YES', 'Show the "Pick someone" wheel (random person from the roster, with team photos) in Forge and in the huddle.'],
  ['FORGE_PHASES', L10_FORGE_PHASES_DEFAULT, 'Forge phases as JSON [[key, label, seconds, rounds], …]. Keys are fixed (OPENER DIVERGE RELAY CLUSTER VOTE COMMITTEE CLAIM HANDOFFS FORGE DOCTOR COMMIT); labels, seconds and round counts are yours to edit. Order matters.'],
  ['FORGE_PROMPTS', L10_FORGE_PROMPTS_DEFAULT, 'The prompt deck as JSON: opener statements, diverge rounds, wildcards, the card format, relay instructions, thought experiments (for Timed write), the doctor checklist, the manager-test questions, rungs, levers, shifts.'],
  ['FORGE_LINES', L10_FORGE_LINES_DEFAULT, 'Revenue lines a goal can name, as JSON [[label, number-as-text], …]. Kept as text on purpose — the app never computes with them.'],
  ['FORGE_VOTE_MODE', 'TOKENS', 'TOKENS = investment tokens on the clustered themes (forces the committee conversation); DOTS = dots on individual cards.'],
  ['FORGE_TOKENS', 10, 'Tokens per person in TOKENS mode.'],
  ['FORGE_TOKEN_MAX_PER_THEME', 4, 'Most tokens one person may put on one theme.'],
  ['FORGE_DOTS', 5, 'Dots per person in DOTS mode.'],
  ['FORGE_DOT_MAX_PER_IDEA', 2, 'Most dots one person may put on one card.'],
  ['FORGE_SUPER_VOTES', 1, 'Revenue super-votes per person (the "is this about the number?" vote), either mode.'],
  ['FORGE_IDEA_TARGET', 40, 'The team card-count target shown on the room screen during Diverge.'],
  ['FORGE_REVIEWS_PER_GOAL', 2, 'Goal-doctor rounds; each round assigns a different reviewer.'],
  ['FORGE_SHORTLIST', 12, 'DOTS mode only: how many top cards are eligible to claim.'],
  ['FORGE_GOALS_PER_PERSON', 5, 'Goal cards per person, the personal one included (4 business + 1 personal = 5).'],
  ['FORGE_Q1_MILESTONE_BY', '2026-10-31', 'Latest allowed date for a goal\'s Q1 milestone (the fiscal Q1 end). Blank = no check.'],
  ['FORGE_FY', 'FY27', 'Fiscal-year label stamped on goals.'],
  ['FORGE_GOAL_SHEET_SUFFIX', ' — FY27 Goals', 'Lock writes each person\'s goals into the tab named "<Name>" + this suffix (the Goal N blocks are found by scanning column B). No tab = the goals stay in L10_Goals only.'],
  ['FORGE_POLL_SEC', 3, 'How often player and room screens poll for the session state, in seconds.'],
  ['FORGE_TIMED_WRITE_MIN', 10, 'Default minutes for an ad-hoc Timed write ("for the next N minutes, everyone write…").']
];

function l10BuildMenu() {
  // getUi() is illegal outside the spreadsheet UI (e.g. during a web-app
  // request) — swallow it so a misplaced call can never break doGet.
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('L10 Huddle')
        .addItem('Open huddle', 'l10OpenDashboard')
        .addSeparator()
        // Quick add: small dialogs for between-huddle upkeep — add a batch of
        // headlines/issues/to-dos/rocks or capture the scorecard week without
        // opening (or accidentally starting) the full huddle app.
        .addItem('Add headlines…', 'l10QuickAddHeadlines')
        .addItem('Add issues…', 'l10QuickAddIssues')
        .addItem('Add to-dos…', 'l10QuickAddTodos')
        .addItem('Add rocks…', 'l10QuickAddRocks')
        .addItem('Update scorecard…', 'l10QuickAddScorecard')
        .addSeparator()
        .addItem('New member guide', 'l10OpenGuide')
        .addItem('Data health check', 'l10MenuDataHealth')
        .addItem('Setup / repair tabs', 'l10Setup')
        .addSubMenu(ui.createMenu('Email')
            .addItem('Install / refresh triggers', 'l10MenuInstallMailTriggers')
            .addSeparator()
            .addItem('Send team heads-up now', 'l10MenuSendHeadsup')
            .addItem('Send Stuart’s Monday ask now', 'l10MenuSendStuartHeadsup')
            .addItem('Test Stuart’s Monday ask (to me)', 'l10MenuTestStuartHeadsup')
            .addItem('Process replies now', 'l10MenuProcessReplies')
            .addItem('Send 1:1 prep packs now (to me)', 'l10MenuSendOneOnOnePreps')
            .addItem('Send Monday cascade draft now (to me)', 'l10MenuSendCascadeDraft')
            .addSeparator()
            .addItem('Send team recap now', 'l10MenuSendRecap')
            .addItem('Test team recap (to me)', 'l10MenuTestRecap')
            .addItem('Send manager recap now', 'l10MenuSendStuartRecap')
            .addItem('Test manager recap (to me)', 'l10MenuTestStuartRecap')
            .addItem('Run custom digests now', 'l10MenuRunDigests')
            .addItem('Test my digest (to me)', 'l10MenuTestDigest'))
        .addSubMenu(ui.createMenu('Chat')
            .addItem('Set to-do webhook URL…', 'l10MenuSetChatWebhook')
            .addItem('Send test message', 'l10MenuTestChatNotify'))
        .addSubMenu(ui.createMenu('Brief')
            .addItem('Set intake token…', 'l10MenuSetBriefToken')
            .addItem('Set web app URL…', 'l10MenuSetBriefUrl')
            .addItem('Send test brief (sample rows)', 'l10MenuBriefSelfTest')
            .addItem('Intake status', 'l10MenuBriefStatus'))
        .addSubMenu(ui.createMenu('Gemini')
            .addItem('Set API key…', 'l10MenuSetGeminiKey')
            .addItem('Test connection', 'l10MenuTestGemini')
            .addItem('Status / usage', 'l10MenuGeminiStatus'))
        .addSubMenu(ui.createMenu('Jira')
            .addItem('Set API token…', 'l10MenuSetJiraToken')
            .addItem('Test connection', 'l10MenuTestJira')
            .addSeparator()
            .addItem('Sync now', 'l10MenuSyncJiraNow')
            .addItem('Assign owners on existing issues', 'l10MenuJiraBackfillAssignees')
            .addItem('Find duplicate issues', 'l10MenuJiraDuplicateReport')
            .addItem('Turn on auto-sync (every 10 min)', 'l10MenuInstallJiraTrigger')
            .addItem('Turn off auto-sync', 'l10MenuRemoveJiraTrigger'))
        .addToUi();
  } catch (e) {}
}

// The core boot slice, serialized for embedding into the served page. Costs
// ~3 tab reads inside the doGet/modal execution and saves the client an entire
// google.script.run round trip (execution startup + serialize + network) before
// anything can paint — the header/start screen renders the moment the page
// parses instead of after a spinner. The hub pull inside l10BootCore_ is
// cache-only, so this can never block on the foreign-workbook openByUrl.
// Every '<' is JSON-escaped (backslash-u003c) so user-typed text can never
// break out of the script block (a literal closing script tag in a headline
// would otherwise end it — an XSS-adjacent hole, not just a parse error).
// Any failure serves 'null' and the client falls back to the normal slice
// fetch (its errors surface there).
function l10BootJson_() {
  try {
    var core = l10BootCore_();
    core.sid = l10Ss_().getId(); // keys the client-side snapshot per workbook
    return JSON.stringify(core).replace(/</g, '\\u003c');
  } catch (e) {
    return 'null';
  }
}

function l10OpenDashboard() {
  // Modal (embedded) context: no web-app URL (Present pops out from the
  // standalone tab, not the modal). The template var must still be defined.
  var t = HtmlService.createTemplateFromFile('L10Index');
  t.webAppUrl = '';
  t.forgePlayer = '';
  t.bootJson = l10BootJson_();
  var html = t.evaluate().setWidth(1400).setHeight(850).setTitle('Level 10 Huddle');
  SpreadsheetApp.getUi().showModalDialog(html, 'Level 10 Huddle');
}

// Visual onboarding one-pager, shown in a modal (static HTML, no templating).
function l10OpenGuide() {
  var html = HtmlService.createHtmlOutputFromFile('L10Guide')
      .setWidth(1000).setHeight(820);
  SpreadsheetApp.getUi().showModalDialog(html, 'L10 Huddle — New Member Guide');
}

function doGet(e) {
  // Standalone web-app tab: hand the page its own URL so Present can pop out
  // here and go full-screen (full-screen is blocked inside the Sheets modal).
  var t = HtmlService.createTemplateFromFile('L10Index');
  t.webAppUrl = l10WebAppUrl_();
  // ?forge=FS-001 serves the phone-first Forge player view for that session
  // instead of the full app (one boot call, no four-slice fetch). The id is
  // validated to its own shape so nothing user-typed reaches the page.
  var fp = String((e && e.parameter && e.parameter.forge) || '').trim();
  t.forgePlayer = /^FS-\d{3,}$/.test(fp) ? fp : '';
  t.bootJson = t.forgePlayer ? 'null' : l10BootJson_();
  return t.evaluate()
      .setTitle('Level 10 Huddle')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// The deployed web-app URL, used by the client's Present control to pop out of
// the Sheets modal. Returns '' if the project isn't deployed as a web app (or
// when called from a non-web context) so the embed path never throws.
function l10WebAppUrl_() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}
function l10_webAppUrl() { return l10WebAppUrl_(); } // client-callable fallback

function l10Include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Create/repair every tab, apply validations, seed config defaults, then seed the
// team's real starting state. Each seeder self-skips when its tab already has rows,
// so re-running is always safe — it never overwrites existing rows or config values.
function l10Setup() {
  var ss = l10Ss_();
  Object.keys(L10.HEADERS).forEach(function (tabName) {
    var sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
    var headers = L10.HEADERS[tabName];
    if (sheet.getMaxColumns() < headers.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
    }
    var existing = sheet.getLastRow() > 0 ?
        sheet.getRange(1, 1, 1, headers.length).getValues()[0] : [];
    if (String(existing[0] || '') !== headers[0]) sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold').setBackground('#06316b').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  });
  l10ApplyValidations_(ss);
  l10SeedConfig_(ss);
  l10SeedScorecard_(ss);
  l10EnsureScorecardRows_(ss);
  l10WireExperimentScorecardRows_(ss);
  l10ReorderScorecardRows_(ss);
  l10SeedRocks_(ss);
  l10SeedIssues_(ss);
  l10SeedEvents_(ss);
  l10SeedPlaybook_(ss);
  l10SeedNotify_(ss);
  // L10_Digests is intentionally NOT seeded — custom digests are opt-in, so the
  // HEADERS loop above creates the empty tab and each analyst adds their own rules
  // from Settings → Custom digests. Zero rows is the valid default state.
  try {
    SpreadsheetApp.getActive().toast('L10 Huddle tabs ready.', 'Setup', 8);
  } catch (e) {}
}

function l10ApplyValidations_(ss) {
  var rows = 998;
  var sc = ss.getSheetByName(L10.TABS.SCORECARD);
  l10ListValidation_(sc, 4, rows, L10.FORMATS);
  l10ListValidation_(sc, 5, rows, L10.RULES);
  l10ListValidation_(sc, 8, rows, L10.SOURCES);
  l10ListValidation_(sc, 11, rows, ['YES', 'NO']);
  var rk = ss.getSheetByName(L10.TABS.ROCKS);
  l10ListValidation_(rk, 7, rows, L10.ROCK_STATUSES);
  l10StatusColors_(rk, 7, { 'ON TRACK': '#b7e1cd', 'OFF TRACK': '#f4c7c3', 'DONE': '#c9daf8', 'DROPPED': '#d9d9d9' });
  var ms = ss.getSheetByName(L10.TABS.MILESTONES);
  l10ListValidation_(ms, 5, rows, L10.MILESTONE_STATUSES);
  l10StatusColors_(ms, 5, { 'OPEN': '#fce8b2', 'DONE': '#b7e1cd' });
  var td = ss.getSheetByName(L10.TABS.TODOS);
  l10ListValidation_(td, 5, rows, L10.TODO_STATUSES);
  l10ListValidation_(td, 13, rows, ['WEEKLY']);
  // WORKING borrows the rocks' on-track green-blue and BLOCKED the off-track red,
  // so a glance down the tab reads the same way it does in the app.
  l10StatusColors_(td, 5, {
    'OPEN': '#fce8b2', 'WORKING': '#c9daf8', 'BLOCKED': '#f4c7c3',
    'DONE': '#b7e1cd', 'DROPPED': '#d9d9d9'
  });
  var ts = ss.getSheetByName(L10.TABS.TODO_STEPS);
  l10ListValidation_(ts, 4, rows, L10.TODO_STEP_STATUSES);
  l10StatusColors_(ts, 4, { 'OPEN': '#fce8b2', 'DONE': '#b7e1cd' });
  var is = ss.getSheetByName(L10.TABS.ISSUES);
  l10ListValidation_(is, 8, rows, L10.ISSUE_STATUSES);
  l10StatusColors_(is, 8, { 'OPEN': '#fce8b2', 'SOLVED': '#b7e1cd', 'PARKED': '#c9daf8', 'KILLED': '#d9d9d9' });
  var hl = ss.getSheetByName(L10.TABS.HEADLINES);
  l10ListValidation_(hl, 3, rows, L10.HEADLINE_TYPES);
  // Headline Status (col 8): blank = live; KILLED greys out in the tab.
  l10ListValidation_(hl, 8, rows, ['KILLED']);
  l10StatusColors_(hl, 8, { 'KILLED': '#d9d9d9' });
  l10ListValidation_(is, 15, rows, L10.ISSUE_OUTCOMES);
  var br = ss.getSheetByName(L10.TABS.BRIEF);
  l10ListValidation_(br, 2, rows, L10.BRIEF_SECTIONS);
  // Strategy tabs: Stage (col 6) on initiatives, State (col 4) on the matrix
  // cells. Decided stages grey out in the tab the way DONE/DROPPED do elsewhere.
  var si = ss.getSheetByName(L10.TABS.INITIATIVES);
  if (si) {
    l10ListValidation_(si, 6, rows, L10.INITIATIVE_STAGES);
    l10ListValidation_(si, 16, rows, L10.INITIATIVE_EFFORTS);
    l10StatusColors_(si, 6, {
      'IDEA': '#fce8b2', 'SCOPING': '#fce8b2', 'PILOTING': '#c9daf8', 'ROLLING OUT': '#c9daf8',
      'ADOPTED': '#b7e1cd', 'KILLED': '#d9d9d9'
    });
  }
  var sa = ss.getSheetByName(L10.TABS.INIT_ACCOUNTS);
  if (sa) {
    l10ListValidation_(sa, 4, rows, L10.INITIATIVE_ACCOUNT_STATES);
    l10StatusColors_(sa, 4, {
      'NOT STARTED': '#f3f3f3', 'TESTING': '#c9daf8', 'ADOPTED': '#b7e1cd',
      'REJECTED': '#f4c7c3', 'N/A': '#d9d9d9'
    });
  }
  var nt = ss.getSheetByName(L10.TABS.NOTIFY);
  l10ListValidation_(nt, 2, rows, ['YES', 'NO']);
  l10ListValidation_(nt, 3, rows, L10.RECAP_CADENCES);
  // L10_Digests: Frequency (5), Weekday (6, blank allowed unless WEEKLY),
  // Hour (7, 0–23), Enabled (8). Content (4) stays free-text (multi-token,
  // app-written). Dropdowns allow-invalid so an app write is never rejected.
  // L10_Digests is an app-managed, opt-in tab that never holds many rows. A 24-item
  // Hour dropdown across ~1000 rows was by far the heaviest data-validation in the
  // whole workbook and measurably slowed opening a large book — so keep this tab's
  // validation footprint tiny: clear any prior wide validation, apply compact
  // dropdowns to a modest range only, and give Hour a plain-number format instead of
  // a 24-item list (the app writes 0-23 and l10_saveDigests validates it on save).
  var dg = ss.getSheetByName(L10.TABS.DIGESTS);
  if (dg) {
    var dRows = 200;
    dg.getRange(2, 1, rows, Math.min(10, dg.getMaxColumns())).clearDataValidations();
    l10ListValidation_(dg, 5, dRows, L10.DIGEST_FREQS);
    l10ListValidation_(dg, 6, dRows, [''].concat(L10.DIGEST_WEEKDAYS));
    l10ListValidation_(dg, 8, dRows, ['YES', 'NO']);
    dg.getRange(2, 7, dRows, 1).setNumberFormat('0');  // Hour: plain integer, no heavy dropdown
    // Last Sent (col 9) as PLAIN TEXT so the 'yyyy-MM-dd HH' idempotency stamp
    // round-trips as a string — Sheets otherwise coerces a date-like write into a
    // Date, which would break the runner's string-equality dedup and re-send.
    dg.getRange(2, 9, dRows, 1).setNumberFormat('@');
  }
  // Forge tabs (v2.17): status dropdowns + the same grey-out colours as elsewhere.
  var fs = ss.getSheetByName(L10.TABS.FORGE_SESSIONS);
  if (fs) {
    l10ListValidation_(fs, 4, 200, L10.FORGE_SESSION_STATUSES);
    l10StatusColors_(fs, 4, { 'OPEN': '#fce8b2', 'LOCKED': '#b7e1cd', 'DISCARDED': '#d9d9d9' });
    // Epoch-millisecond clocks + the version counter stay plain numbers.
    fs.getRange(2, 8, 200, 1).setNumberFormat('0');
    fs.getRange(2, 10, 200, 1).setNumberFormat('0');
    fs.getRange(2, 20, 200, 1).setNumberFormat('0');
  }
  var fi = ss.getSheetByName(L10.TABS.FORGE_IDEAS);
  if (fi) {
    l10ListValidation_(fi, 17, rows, L10.FORGE_IDEA_STATUSES);
    l10StatusColors_(fi, 17, { 'SHORTLIST': '#fce8b2', 'CLAIMED': '#c9daf8', 'GOAL': '#b7e1cd', 'PARKED': '#e6e0f8', 'DROPPED': '#d9d9d9' });
  }
  var fh = ss.getSheetByName(L10.TABS.FORGE_HANDOFFS);
  if (fh) {
    l10ListValidation_(fh, 8, rows, L10.FORGE_HANDOFF_STATUSES);
    l10StatusColors_(fh, 8, { 'PROPOSED': '#fce8b2', 'ACCEPTED': '#b7e1cd', 'NEGOTIATED': '#c9daf8', 'UNCONFIRMED': '#f4c7c3', 'WITHDRAWN': '#d9d9d9' });
  }
  var gl = ss.getSheetByName(L10.TABS.GOALS);
  if (gl) {
    l10ListValidation_(gl, 6, rows, L10.GOAL_TYPES);
    l10ListValidation_(gl, 27, rows, L10.GOAL_STATUSES);
    l10ListValidation_(gl, 35, rows, ['YES', 'NO']);
    l10ListValidation_(gl, 39, rows, L10.GOAL_VERDICTS);
    l10StatusColors_(gl, 27, { 'DRAFT': '#fce8b2', 'COMMITTED': '#c9daf8', 'LOCKED': '#b7e1cd', 'SUPERSEDED': '#d9d9d9' });
  }
}

// 0–23 as strings, for the L10_Digests Hour dropdown.
function l10HourList_() {
  var out = [];
  for (var h = 0; h < 24; h++) out.push(String(h));
  return out;
}

function l10ListValidation_(sheet, col, rows, values) {
  var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(values, true).setAllowInvalid(true).build();
  sheet.getRange(2, col, rows, 1).setDataValidation(rule);
}

function l10StatusColors_(sheet, col, colors) {
  var range = sheet.getRange(2, col, 998, 1);
  var rules = sheet.getConditionalFormatRules();
  Object.keys(colors).forEach(function (status) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(status).setBackground(colors[status]).setRanges([range]).build());
  });
  sheet.setConditionalFormatRules(rules);
}

function l10SeedConfig_(ss) {
  var sheet = ss.getSheetByName(L10.TABS.CONFIG);
  var existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
      existing[String(r[0]).trim()] = true;
    });
  }
  L10_CONFIG_DEFAULTS.forEach(function (row) {
    if (!existing[row[0]]) sheet.appendRow(row);
  });
}

// ---------------------------------------------------------------------------
// Seeds. All seed rows are starting points for the team to edit in-sheet —
// owners follow the in-motion account transitions; goals/cells should be
// verified against the live dashboard before the first real huddle.
// ---------------------------------------------------------------------------

// Canonical scorecard display order — the single source of truth for the Sort
// column, which is what every render path sorts by (the tab's physical row order
// is irrelevant). Grouped by metric family so like sits next to like, instead of
// the chronological interleave that built up as rows were added over time:
//   budget utilization %  →  A/S %  →  NB negatives  →  experiments
// Within a family the account order is Brady → Seton/Emedco → Amazon → PDC →
// Awareness, and "added" comes before "$ saved". Both seed arrays below read their
// Sort from this map, and l10ReorderScorecardRows_ re-applies it to an already-
// populated scorecard — so fresh installs and repaired installs always agree.
var L10_SCORECARD_ORDER = {
  'SC-001': 1, 'SC-002': 2, 'SC-003': 3, 'SC-004': 4, 'SC-005': 5,  // budget utilization %
  'SC-011': 6, 'SC-012': 7, 'SC-015': 8,                            // A/S % (efficiency)
  'SC-006': 9, 'SC-007': 10, 'SC-013': 11, 'SC-014': 12,            // NB negatives (added, then $ saved)
  'SC-008': 13, 'SC-009': 14, 'SC-010': 15                          // experiments
};

function l10SeedScorecard_(ss) {
  var sheet = ss.getSheetByName(L10.TABS.SCORECARD);
  if (sheet.getLastRow() > 1) return;
  // Source Ref cells reference the Financial Dashboard v2 executive-summary
  // Utilization column as laid out June 2026 — re-point them if the dashboard
  // layout changes (a wrong ref shows up as a failed auto-pull, never a wrong number).
  var rows = [
    ['SC-001', 'Brady Paid Search (US+CA) — budget utilization %', 'CJ', 'pct', 'between', 95, 105,
      'RANGE', 'Financial Dashboard v2!H7',
      'Utilization = MTD vs target. >105 = overspend conversation, <95 = underspend (re-deploy, don\'t bank it).', 'YES', L10_SCORECARD_ORDER['SC-001']],
    ['SC-002', 'Seton/Emedco Paid Search — budget utilization %', 'Scott', 'pct', 'between', 95, 105,
      'RANGE', 'Financial Dashboard v2!H8',
      'Finance is watching this account group\'s overage specifically — flag >105 the week it happens.', 'YES', L10_SCORECARD_ORDER['SC-002']],
    ['SC-003', 'PDC Paid Search — budget utilization %', 'Scott', 'pct', 'between', 95, 105,
      'RANGE', 'Financial Dashboard v2!H9',
      'FY27 fate of PDC/Wristbands paid search is still undecided — pacing here informs that call.', 'YES', L10_SCORECARD_ORDER['SC-003']],
    ['SC-004', 'Amazon — budget utilization %', 'CJ', 'pct', 'between', 95, 105,
      'RANGE', 'Financial Dashboard v2!H10',
      'Known artifact: budget mapping inflates utilization; Sponsored Brands spend missing from pacing. Read direction, not level, until fixed.', 'YES', L10_SCORECARD_ORDER['SC-004']],
    ['SC-005', 'Awareness/Social — budget utilization %', 'Courtney', 'pct', 'between', 95, 105,
      'RANGE', 'Financial Dashboard v2!H11',
      'Underspend here is fungible into search per Stuart — surface it, don\'t sit on it.', 'YES', L10_SCORECARD_ORDER['SC-005']],
    ['SC-006', 'NB negatives added / week', 'CJ', 'num', '>=', 30, '',
      'RANGE', '=IMPORTRANGE("' + L10_NB_REVIEW_SHEET_ID + '","Weekly Negatives Impact!B3")',
      'Auto-pull from the NB search-terms review sheet (last complete week). Track-only for now — set a target once a few weeks of baseline land; a zero week usually means the daily Keep/Kill loop stalled, not an efficiency win.', 'YES', L10_SCORECARD_ORDER['SC-006']],
    ['SC-007', 'Negatives — est. annualized $ saved / week', 'CJ', 'usd', '>=', 1500, '',
      'RANGE', '=IMPORTRANGE("' + L10_NB_REVIEW_SHEET_ID + '","Weekly Negatives Impact!B4")',
      'Sum of killed terms’ trailing-365-day cost = estimated annualized spend avoided (last complete week). Cost-based, so NOT subject to the conversion/ROAS tracking caveats — but it is avoided spend, not guaranteed P&L savings.', 'YES', L10_SCORECARD_ORDER['SC-007']],
    ['SC-008', 'Experiments live (hub)', 'Alex', 'num', '>=', 2, '',
      'MANUAL', '=sum(I10:I11)',
      'Auto-counted from the Experiment Hub. Zero live tests = the testing muscle is idle.', 'YES', L10_SCORECARD_ORDER['SC-008']],
    ['SC-009', 'Brady Experiments Running', 'Courtney', 'num', '>=', 1, '',
      'RANGE', L10_EXP_PULL_TAB + '!B4',
      'Live count from Google Ads (Brady US + Brady CA): an experiment counts only ' +
      'if it is non-terminal AND its serving arm had impressions in the last day — ' +
      'not merely "enabled." Fed by the Brady Global MCC pull script into the "' +
      L10_EXP_PULL_TAB + '" tab; blank (skipped) until that script first runs.', 'YES', L10_SCORECARD_ORDER['SC-009']],
    ['SC-010', 'Seton/Emedco Experiments Running', 'Scott', 'num', '>=', 1, '',
      'RANGE', L10_EXP_PULL_TAB + '!B5',
      'Live count from Google Ads (Seton US + Emedco + Seton CA): same basis as ' +
      'SC-009. Fed by the Brady US-MCC (Seton/Emed) pull script; blank (skipped) ' +
      'until that script first runs.', 'YES', L10_SCORECARD_ORDER['SC-010']]
  ];
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sheet.setColumnWidth(2, 320);
  sheet.setColumnWidth(10, 380);
}

// The NB search-terms review workbook that the SC-006/SC-007 negatives rows
// IMPORTRANGE from (seeded above). First pull needs a one-time "Allow access"
// click on each IMPORTRANGE Source Ref cell.
var L10_NB_REVIEW_SHEET_ID = '1HRb1oLicdgwi7LiF7hAWj9W0yNvbXA0euWvdtnP85oY';

// The Seton/Emedco NB search-terms review workbook ("MVP Search Terms SQR -
// Seton/Emed" — one shared sheet covering Seton US + Seton CA + Emedco). Its
// Weekly Negatives Impact tab has the same fixed last-complete-week cells as
// Brady's (B3 = negatives added, B4 = est. annualized $ saved). Feeds the
// SC-013/SC-014 managed rows below; same one-time "Allow access" click applies.
var L10_NB_REVIEW_SETON_SHEET_ID = '1QU8eRh4GqjMQBoQKmC5SCH08Z4GCZuUxbGJMVKZGHsQ';

// Scorecard rows kept in sync idempotently: appended only if their ID is missing,
// so re-running setup on an already-populated scorecard adds them without
// duplicating or disturbing existing rows.
// • SC-011/SC-012/SC-015 — the A/S metrics: they read straight off the Financial
//   Dashboard v2 A/S column (K7 = Brady exec row, K8 = Seton/Emedco, K10 = Amazon).
//   Lower is better; Brady/Seton goals per Alex 2026-06-24, Amazon <15% per Alex
//   2026-07-20. Amazon divides by an ADVERTISED-ONLY ad-attributed-sales figure
//   auto-pulled from BigQuery by RevenuePull.gs (mktg_amazon, halo excluded to match the
//   deep dive) — marketplace sales aren't in the FT-CPC web-order pull.
//   Text (not formula) Source Refs on purpose: a blank K cell (no revenue yet) then
//   reads as empty and capture skips it loudly, instead of a formula ref coercing the
//   blank to 0% — a fake "perfect" A/S.
// • SC-013/SC-014 — the Seton/Emedco NB-negatives pair, mirroring Brady's
//   SC-006/SC-007: live IMPORTRANGE of the Seton/Emedco review sheet's
//   last-complete-week cells, so weekly capture always snapshots the
//   just-finished week. Formula (not text) refs on purpose — a text ref can
//   only point inside this workbook, and until the one-time Allow access click
//   the cell shows #REF!, which capture skips loudly (never a wrong number).
var L10_SCORECARD_MANAGED = [
  ['SC-011', 'Brady — paid-search A/S % (spend ÷ FT-CPC order revenue)', 'CJ', 'pct', '<=', 40, '',
    'RANGE', 'Financial Dashboard v2!K7',
    'A/S = MTD paid-search spend ÷ first-touch paid-search order revenue (Adobe ft ' +
    'code ppc%), gross of returns, web-tracked orders only. Lower = more efficient; ' +
    'goal <40%. First-touch attribution (not click-level); reconcile to PBI Onebrady once.',
    'YES', L10_SCORECARD_ORDER['SC-011']],
  ['SC-012', 'Seton/Emedco — paid-search A/S %', 'Scott', 'pct', '<=', 80, '',
    'RANGE', 'Financial Dashboard v2!K8',
    'Same basis as SC-011 for the Seton/Emedco rollup (SETONUS+SETONCA+EMEDCO). ' +
    'Order-driven accounts, so order revenue is the right lens (form-fills understate ' +
    'them). Goal <80%. Stays blank until the multi-brand revenue pull (aa_global_orders) lands.',
    'YES', L10_SCORECARD_ORDER['SC-012']],
  ['SC-013', 'Seton/Emedco NB negatives added / week', 'Scott', 'num', '>=', 10, '',
    'RANGE', '=IMPORTRANGE("' + L10_NB_REVIEW_SETON_SHEET_ID + '","Weekly Negatives Impact!B3")',
    'Auto-pull from the Seton/Emedco NB search-terms review sheet (last complete week; ' +
    'Seton US + Seton CA + Emedco, one shared MCC list — a term killed once is deduped ' +
    'across all three). Same basis as Brady\'s SC-006. Track-only for now — the loop only ' +
    'went live Jul 2026, so the >=10 goal is a placeholder; set a real target once a few ' +
    'weeks of baseline land. A zero week usually means the daily Keep/Kill loop stalled.',
    'YES', L10_SCORECARD_ORDER['SC-013']],
  ['SC-014', 'Seton/Emedco — negatives est. annualized $ saved / week', 'Scott', 'usd', '>=', 500, '',
    'RANGE', '=IMPORTRANGE("' + L10_NB_REVIEW_SETON_SHEET_ID + '","Weekly Negatives Impact!B4")',
    'Sum of killed terms\' trailing-365-day cost across all three Seton/Emedco accounts = ' +
    'estimated annualized spend avoided (last complete week). Same basis as Brady\'s SC-007: ' +
    'cost-based, so NOT subject to the conversion/ROAS tracking caveats — but it is avoided ' +
    'spend, not guaranteed P&L savings. Goal is a track-only placeholder until baseline lands.',
    'YES', L10_SCORECARD_ORDER['SC-014']],
  ['SC-015', 'Amazon — advertising A/S % (ACOS)', 'CJ', 'pct', '<=', 15, '',
    'RANGE', 'Financial Dashboard v2!K10',
    'A/S = MTD Amazon ad spend (mart, trusted — ties to the Amazon console) ÷ Amazon ' +
    'ad-attributed sales, ADVERTISED-PRODUCT ONLY (SP same-SKU + SB, halo excluded), ' +
    'matching the deep dive. Auto-pulled from BigQuery by RevenuePull.gs (mktg_amazon), ' +
    'feeding Financial Dashboard v2!K10 — NOT the halo-inclusive console headline Sales. ' +
    'Lower = more efficient; goal <15% (~ROAS >6.7; Alex 2026-07-20). 14-day attribution, ' +
    'so early-month A/S is noisy (directional). Text ref: a blank K10 is skipped loudly.',
    'YES', L10_SCORECARD_ORDER['SC-015']]
];

function l10EnsureScorecardRows_(ss) {
  var sheet = ss.getSheetByName(L10.TABS.SCORECARD);
  var existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
      existing[String(r[0]).trim()] = true;
    });
  }
  var added = 0;
  L10_SCORECARD_MANAGED.forEach(function (row) {
    if (!existing[row[0]]) {
      sheet.appendRow(row);
      added++;
    }
  });
  if (added) {
    sheet.setColumnWidth(2, 320);
    sheet.setColumnWidth(10, 380);
  }
}

// The tab the two Google Ads experiment-count scripts write to (one per MCC):
// B4 = Brady (US+CA) live count, B5 = Seton/Emedco live count. Used as a plain
// TEXT Source Ref (not a formula) on purpose — same reason as SC-011/SC-012:
// before the Ads script first runs the cell is empty, and a text ref then reads
// as empty so capture skips it loudly, whereas a formula ref would coerce the
// blank to 0 and bank a fake "zero experiments."
var L10_EXP_PULL_TAB = 'L10 - Experiments Scorecard Google Ads pull';
var L10_EXP_PULL_WIRING = {
  'SC-009': L10_EXP_PULL_TAB + '!B4',
  'SC-010': L10_EXP_PULL_TAB + '!B5'
};

// Point SC-009 / SC-010 ("…Experiments Running") at the Google Ads pull tab so
// they capture automatically. In-place + idempotent: only rewrites a row whose
// Source Ref is still blank or already points at this tab, so a deliberate manual
// override is never clobbered. Fresh installs get this from l10SeedScorecard_;
// already-populated scorecards (the seed self-skips) get it here.
function l10WireExperimentScorecardRows_(ss) {
  var sheet = ss.getSheetByName(L10.TABS.SCORECARD);
  if (!sheet || sheet.getLastRow() < 2) return;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idCol = headers.indexOf('ID') + 1;
  var srcCol = headers.indexOf('Source') + 1;
  var refCol = headers.indexOf('Source Ref') + 1;
  if (!idCol || !srcCol || !refCol) return;
  var ids = sheet.getRange(2, idCol, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    var want = L10_EXP_PULL_WIRING[String(ids[i][0]).trim()];
    if (!want) continue;
    var row = i + 2;
    var refCell = sheet.getRange(row, refCol);
    var cur = String(refCell.getFormula() || refCell.getValue() || '').trim();
    if (cur === '' || cur.indexOf(L10_EXP_PULL_TAB) >= 0) {
      sheet.getRange(row, srcCol).setValue('RANGE');
      refCell.setValue(want); // no leading "=" -> stored as text, resolved at capture
    }
  }
}

// Re-apply the canonical grouped display order (L10_SCORECARD_ORDER) to the Sort
// column. Fresh installs already get these values from the seed arrays; this pass
// is for an ALREADY-populated scorecard, where the rows were added over time and
// their sequential Sort values interleave the families (Brady negatives at 6-7 but
// Seton's at 13-14, A/S split across 11-12 and 15). In-place + idempotent: only
// rows whose ID is in the map are touched, and only when the Sort actually differs,
// so team-added custom metrics keep their own Sort and a re-run is a silent no-op.
function l10ReorderScorecardRows_(ss) {
  var sheet = ss.getSheetByName(L10.TABS.SCORECARD);
  if (!sheet || sheet.getLastRow() < 2) return;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idCol = headers.indexOf('ID') + 1;
  var sortCol = headers.indexOf('Sort') + 1;
  if (!idCol || !sortCol) return;
  var n = sheet.getLastRow() - 1;
  var ids = sheet.getRange(2, idCol, n, 1).getValues();
  var sorts = sheet.getRange(2, sortCol, n, 1).getValues();
  var changed = false;
  for (var i = 0; i < n; i++) {
    var want = L10_SCORECARD_ORDER[String(ids[i][0]).trim()];
    if (want && Number(sorts[i][0]) !== want) {
      sorts[i][0] = want;
      changed = true;
    }
  }
  if (changed) sheet.getRange(2, sortCol, n, 1).setValues(sorts);
}

function l10SeedRocks_(ss) {
  var sheet = ss.getSheetByName(L10.TABS.ROCKS);
  if (sheet.getLastRow() > 1) return;
  var today = l10Today_();
  // Analyst rocks mirror the FY27 goal drafts — confirm with each owner before
  // treating them as committed. Fiscal year starts Aug 1.
  var rows = [
    ['RK-001', 'FY27 budgets locked & deployed — all accounts × all months', 'Alex', '2026-08-01', '',
      'Cross-account', 'ON TRACK', 'Every account/month populated; team executing on FY27 numbers Aug 1.', '', today, today],
    ['RK-002', 'M610/M710 promo live — campaigns + on-site display ready', 'Alex', '2026-07-01', '',
      'Brady US, Brady CA/MX/BR', 'ON TRACK', '~20%-off portables promo live with site placements on day 1.', 'Promo window Jul 1 – Sep 30.', today, today],
    ['RK-003', 'Marking ramp close-out: variant LPs published, real conversion values, Clarity params fixed', 'Alex', '', '',
      'Marking', 'ON TRACK', 'Variant LPs live with final URLs; $1 placeholder values replaced; UTM/Clarity passthrough working.', 'Set a due date.', today, today],
    ['RK-004', 'Leads-slowdown part 2: paused-keyword check + funnel attribution', 'Alex', '', '',
      'Brady US', 'ON TRACK', 'NB demand-gen decline explained to root cause; fix list in motion.', 'Brand is up on less spend; the drop is NB demand-gen ad groups at zero.', today, today],
    ['RK-005', 'Fix the 6 verified tag-manager conversion defects', 'Alex', '', '',
      'Brady US, Brady CA/MX/BR', 'ON TRACK', 'Internal-IP exclusion restored, CA add-to-cart firing, iframe country filter, CA form US-blocker, primary/secondary verified, remaining containers audited.', 'Until fixed, platform conversion numbers stay skewed.', today, today],
    ['RK-006', 'CRO clinic on awareness/lead-gen LPs — backlog + ≥3 A/B tests shipped', 'Courtney', '2027-01-31', 'Shift 4',
      'Social/Awareness', 'ON TRACK', 'Six-lens audit done; prioritized backlog; 3 tests shipped incl. one outcome-led headline test; read out at a Deep Dive.', 'From the FY27 goal draft — confirm with Courtney.', today, today],
    ['RK-007', 'Prove an awareness channel\'s incremental value (geo/audience holdout)', 'Courtney', '2027-04-30', 'Shift 2',
      'Social/Awareness', 'ON TRACK', 'Test designed, run, lift measured; Scale/Hold/Stop recommendation written.', 'From the FY27 goal draft — confirm with Courtney.', today, today],
    ['RK-008', 'Feed-segmented Shopping structure on Seton/EMEDCO (performance tiers)', 'Scott', '2026-12-31', 'Shift 4',
      'Seton US, EMEDCO', 'ON TRACK', 'Tiers live via custom labels; documented in the SOP; one measured ROAS read-out.', 'From the FY27 goal draft — confirm with Scott.', today, today],
    ['RK-009', 'Daily Keep/Kill loop live on Seton/EMEDCO at ≥90% completion', 'Scott', '2027-04-30', 'Shift 1',
      'Seton US, EMEDCO, Seton CA', 'ON TRACK', 'Loop installed; ≥90% review completion; measurable wasted-spend reduction vs baseline.', 'From the FY27 goal draft — confirm with Scott. Blocked on the loop stand-up (see Issues).', today, today],
    ['RK-010', 'PMax vs Standard Shopping test on Brady US with an enriched feed', 'CJ', '2027-01-31', 'Shift 4',
      'Brady US', 'ON TRACK', 'Feed enriched (custom labels); controlled test live with a holdout; ROAS read-out vs the 1.01 baseline.', 'From the FY27 goal draft — confirm with CJ.', today, today],
    ['RK-011', 'Scale/Hold/Stop as the operating rubric on Brady US search', 'CJ', '2026-10-31', 'Shift 1/2',
      'Brady US', 'ON TRACK', 'Reallocation logged: scale starved winners, cut sub-break-even bleeders; quarterly cadence documented.', 'From the FY27 goal draft — confirm with CJ.', today, today]
  ];
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sheet.setColumnWidth(2, 360);
  sheet.setColumnWidth(8, 320);
}

function l10SeedIssues_(ss) {
  var sheet = ss.getSheetByName(L10.TABS.ISSUES);
  if (sheet.getLastRow() > 1) return;
  var today = l10Today_();
  var rows = [
    ['IS-001', 'PDC Healthcare merchant feed issue still unresolved — who owns the fix and what\'s the next step?', 'Alex', today,
      'PDC/Wristbands', 'Feeds', 0, 'OPEN', '', '', '', 'Internal dev team manages the Merchant API feed.'],
    ['IS-002', 'LinkedIn spend feed: Brady blank + PDC $0 (pacing −100%) — real pause or dead connector?', 'Courtney', today,
      'Social/Awareness', 'Tracking/Data', 0, 'OPEN', '', '', '', 'Intersects the 3-month social trending review.'],
    ['IS-003', 'Amazon budget mapping: utilization reads 242% vs the $31K target — fix the dashboard mapping', 'CJ', today,
      'Amazon', 'Budget/Pacing', 0, 'OPEN', '', '', '', 'Separate $77.6K line is the suspect; also Sponsored Brands spend missing from pacing.'],
    ['IS-004', 'NB demand-gen leads −38% YoY: lockout/labels ad groups at literal zero — paused keywords?', 'Alex', today,
      'Brady US', 'Platform/Engine', 0, 'OPEN', '', '', '', 'High-intent NB −47% matches the demo-submit drop; Brand is +13% on −14% spend.'],
    ['IS-005', 'Unattached negative lists (Brady US ×4, Marking ×1) — attach them or decide deliberately not to', 'Alex', today,
      'Brady US, Marking', 'Process/SOP', 0, 'OPEN', '', '', '', 'Includes the 4,355-kw close-variants list and "Famous Brady Terms".'],
    ['IS-006', 'Seton/EMEDCO automation stand-up: SQR loop + experiment engine not installed yet', 'Scott', today,
      'Seton US, EMEDCO, Seton CA', 'Process/SOP', 0, 'OPEN', '', '', '', 'Blocks RK-009 and Seton-side testing.']
  ];
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sheet.setColumnWidth(2, 420);
}

function l10SeedEvents_(ss) {
  var sheet = ss.getSheetByName(L10.TABS.EVENTS);
  if (sheet.getLastRow() > 1) return;
  sheet.getRange(2, 1, 7, 4).setValues([
    ['2026-06-15', '2026-06-26', 'HR self-eval window (team)', 'Analysts fill their FY27 Goals tabs in this workbook; due Jun 26.'],
    ['2026-06-23', '', 'NB Printers CLP experiment ends', 'Decide at the Thursday Deep Dive; log the learning.'],
    ['2026-07-01', '2026-09-30', 'M610/M710 printer promo (~20% off, US + CA)', 'Expect CVR/AOV shifts on printer campaigns; flag overlapping tests.'],
    ['2026-08-01', '', 'FY27 begins', 'Budgets must be locked and deployed before this date.'],
    ['2026-08-13', '', 'Leads history table expires (BigQuery temp dataset)', 'Preservation/rebuild must be confirmed before expiry or lead history is lost.'],
    ['2026-08-24', '2026-08-27', 'National sales meeting — Grand Geneva', 'Alex attends in Stuart\'s place.'],
    ['2026-09-14', '2026-09-25', 'Year-end conversations (HR window)', 'Alex schedules these with each analyst.']
  ]);
  sheet.setColumnWidth(3, 320);
  sheet.setColumnWidth(4, 380);
}

// The analysis playbook the issue forms match against as you type: "this kind
// of issue has a standing report — here's how to get it run." Appended by ID
// (idempotent, like the managed scorecard rows) so endpoint upserts and hand
// edits are never clobbered by a setup re-run. Keyword lists are matched as
// case-insensitive substrings of the issue text.
var L10_PLAYBOOK_SEED = [
  ['PB-001', 'Nonbrand spend pullback report',
    'pullback, bleeding, conversion value, month over month, wasted spend, declining, cpc creep, roas drop',
    'Brady US',
    'Where nonbrand conversion value is dropping month-over-month, ranked by campaign — which campaigns to pull back first.',
    'Ask Alex to run the nonbrand pullback report (Google Ads, Brady US). Same day-of-month windows with an attribution-lag guard; output is a ranked pull-back list.',
    'Platform conversion values are skewed until the tag-manager fixes land — read direction, not level.', ''],
  ['PB-002', 'Bid-simulator S-curve read',
    'cpc, bid, troas, tcpa, target, budget cap, diminishing returns, impression share, scale',
    'Brady US',
    'Where extra clicks stop paying off — Google\'s own bid-simulator curves; keyword CPC where manual, target/cap/budget where Smart Bidding.',
    'Ask Alex to run the optimal-CPC / S-curve reader (read-only). A shared or capped budget confounds the bid curve — the report flags "isolate the budget" when that\'s the real lever.',
    'Conversion value is directional context only; nonbrand guardrail A/S ≤105% on the IP view.', ''],
  ['PB-003', 'Ad serving-URL audit',
    'landing page, redirect, tracking template, utm, gclid, final url, 404, suffix, broken link',
    'Brady US',
    'Every URL the ads actually route through — final URLs, effective tracking templates + suffixes, keyword/sitelink overrides — with ready-to-crawl test URLs.',
    'Ask Alex to run the serving-URL audit; hand the output to SEO for the bulk redirect / tracking-loss check.',
    '', ''],
  ['PB-004', 'Search-terms Keep/Kill loop',
    'search terms, negatives, junk queries, irrelevant, sqr, query mining',
    'Brady US, Seton US, EMEDCO, Seton CA',
    'Which live search terms are junk and what killing them avoids (trailing-365-day cost).',
    'Work today\'s batch in the daily Keep/Kill review sheet — kills flow to the negative lists (Seton/Emedco routes to the manager-level Universal Negative List).',
    '"$ saved" is avoided spend, one-sided — not P&L savings.', ''],
  ['PB-005', 'Experiment Hub test',
    'test, a/b, experiment, hypothesis, which is better, try',
    'Cross-account',
    'Whether the question should be a structured test instead of a debate.',
    'From IDS use "Make it a test" — it lands in the Experiment Hub Ideas backlog with the hypothesis attached.',
    'Hub live counts run hot until the junk-row hygiene pass is done.', '']
];

function l10SeedPlaybook_(ss) {
  var sheet = ss.getSheetByName(L10.TABS.PLAYBOOK);
  var existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
      existing[String(r[0]).trim()] = true;
    });
  }
  var added = 0;
  L10_PLAYBOOK_SEED.forEach(function (row) {
    if (!existing[row[0]]) {
      sheet.appendRow(row);
      added++;
    }
  });
  if (added) {
    sheet.setColumnWidth(2, 240);
    sheet.setColumnWidth(3, 300);
    sheet.setColumnWidth(5, 340);
    sheet.setColumnWidth(6, 380);
  }
}

// Seed one L10_Notify row per current team member. Defaults preserve the prior
// behavior — everyone gets the day-before heads-up and every recap. Idempotent:
// skips names that already have a row, so re-running setup never resets someone's
// choices, and a newly-added analyst simply gets defaults on the next repair.
function l10SeedNotify_(ss) {
  var sheet = ss.getSheetByName(L10.TABS.NOTIFY);
  var existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
      existing[String(r[0]).trim().toLowerCase()] = true;
    });
  }
  var team = String(l10Config_().TEAM || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  var today = l10Today_();
  var added = 0;
  team.forEach(function (name) {
    if (!name || existing[name.toLowerCase()]) return;
    sheet.appendRow([name, 'YES', 'EVERY', today]);
    added++;
  });
  if (added) sheet.setColumnWidth(1, 160);
}

// ---------------------------------------------------------------------------
// Chat menu wrappers (kept here so they don't depend on the optional L10Mail.gs).
// ---------------------------------------------------------------------------

// Prompt for the team space's incoming-webhook URL and save it to L10_Config.
function l10MenuSetChatWebhook() {
  var ui = SpreadsheetApp.getUi();
  var cur = '';
  try { cur = String(l10Config_().CHAT_WEBHOOK_URL || ''); } catch (e) {}
  var resp = ui.prompt(
    'L10 to-do chat notifications',
    'Paste the incoming-webhook URL for the team chat space.\n' +
    '(In the space: Apps & integrations → Webhooks → Add, then copy the URL.)\n' +
    'Leave blank to turn the notifications OFF.' + (cur ? '\n\nCurrent: ' + cur : ''),
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var url = String(resp.getResponseText() || '').trim();
  l10SetConfigValue_('CHAT_WEBHOOK_URL', url);
  ui.alert(url
    ? 'Saved. Adding or completing a to-do will now post to the space. Use “Send test message” to verify it lands in the right place.'
    : 'Cleared — to-do chat notifications are now off.');
}

// Post a sample line to confirm the webhook works end-to-end.
function l10MenuTestChatNotify() {
  var ui = SpreadsheetApp.getUi();
  var r = l10SendTodoChatTest_();
  ui.alert(r.ok
    ? 'Test message posted. Check it appeared in the team chat space.'
    : 'Could not post: ' + (r.error || 'unknown error'));
}

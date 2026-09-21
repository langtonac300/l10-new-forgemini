#!/usr/bin/env node
// Builds goals-day-pack.html — the printable pack for the FY27 goals day run on
// paper (rules poster, run of show, wall headers, seed cards, goal sheets).
// The 12 goal areas and the 39 seed cards are read from L10Setup.gs
// (FORGE_LINES / FORGE_SEED_CARDS defaults) so the paper deck and the app's
// deck can never drift apart. Usage: node build-pack.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SETUP = path.join(__dirname, '..', 'apps-script', 'L10Setup.gs');
const OUT = path.join(__dirname, 'goals-day-pack.html');

function readArray(src, name) {
  const marker = 'var ' + name + ' = JSON.stringify(';
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(name + ' not found in L10Setup.gs');
  const open = start + marker.length;
  const close = src.indexOf('\n]);', open);
  if (close < 0) throw new Error(name + ' has no closing "]);"');
  return vm.runInNewContext('(' + src.slice(open, close + 2) + ')');
}

const src = fs.readFileSync(SETUP, 'utf8');
const LINES = readArray(src, 'L10_FORGE_LINES_DEFAULT');   // [label, goal as text]
const SEEDS = readArray(src, 'L10_FORGE_SEED_DEFAULT');    // [text, area, source]

const areaLabels = new Set(LINES.map(l => l[0]));
SEEDS.forEach((s, i) => {
  if (!areaLabels.has(s[1])) throw new Error('seed ' + (i + 1) + ' names an unknown area: ' + s[1]);
});
const nStuart = SEEDS.filter(s => s[2] === 'Stuart').length;
const nTeam = SEEDS.length - nStuart;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const glyph = source => source === 'Stuart' ? '★ STUART' : 'T TEAM';

// ---------- pieces ----------

const CSS = `
  @page { size: letter; margin: 0.5in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111;
    font: 12pt/1.35 "Helvetica Neue", Arial, Helvetica, sans-serif; }
  .page { width: 7.5in; margin: 0 auto; padding: 0;
    page-break-after: always; break-after: page; position: relative; }
  .page:last-child { page-break-after: auto; }
  @media screen { body { background: #ddd; padding: 20px 0; }
    .page { background: #fff; margin: 0 auto 20px; padding: 0.5in; min-height: 11in;
      box-shadow: 0 1px 6px rgba(0,0,0,.25); } }
  h1 { font-size: 28pt; margin: 0 0 6pt; letter-spacing: -.01em; }
  h2 { font-size: 18pt; margin: 14pt 0 6pt; }
  h3 { font-size: 13pt; margin: 10pt 0 4pt; }
  p { margin: 0 0 6pt; }
  .kicker { text-transform: uppercase; letter-spacing: .12em; font-size: 9pt; color: #444; margin-bottom: 4pt; }
  .small { font-size: 9.5pt; color: #333; }
  .muted { color: #555; }
  ol.rules { font-size: 14pt; padding-left: 1.6em; margin: 0; }
  ol.rules li { margin: 0 0 9pt; }
  ol.rules b { font-weight: 700; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #333; padding: 4pt 6pt; vertical-align: top; text-align: left; font-size: 10.5pt; }
  th { background: #eee; }
  .ros td:first-child, .ros th:first-child { white-space: nowrap; width: 0.75in; }
  .ros td:nth-child(2), .ros th:nth-child(2) { white-space: nowrap; width: 0.55in; }
  .box { border: 1.5px solid #111; padding: 6pt 8pt; margin: 0 0 8pt; }
  .check li { list-style: none; margin: 0 0 5pt; padding-left: 1.7em; position: relative; }
  .check li:before { content: ""; position: absolute; left: 0; top: .1em; width: 1em; height: 1em; border: 1.5px solid #111; }
  .check { padding: 0; margin: 0; }
  /* wall headers: two per page, cut on the dashed line */
  .half { height: 4.9in; border-bottom: 1.5px dashed #777; padding: 0.3in 0.25in; display: flex; flex-direction: column; justify-content: center; }
  .half:last-child { border-bottom: 0; }
  .half .kicker { font-size: 11pt; }
  .half .label { font-size: 40pt; font-weight: 800; line-height: 1.05; margin: 4pt 0 10pt; }
  .half .goal { font-size: 15pt; line-height: 1.3; }
  .half .foot { margin-top: auto; font-size: 10pt; color: #444; }
  /* seed cards: 2 x 3 per page */
  .grid { display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 3.25in; gap: 0; }
  .card { border: 1.5px dashed #777; padding: 0.18in 0.2in; display: flex; flex-direction: column; }
  .card .top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6pt; }
  .card .src { font-weight: 800; font-size: 13pt; border: 2px solid #111; padding: 1pt 6pt; }
  .card .num { font-size: 10pt; color: #444; }
  .card .text { font-size: 12.5pt; line-height: 1.3; flex: 1; }
  .card .area { font-size: 10pt; margin-top: 6pt; border-top: 1px solid #999; padding-top: 4pt; }
  .card .claim { font-size: 10pt; margin-top: 4pt; height: 0.55in; border: 1px solid #999; padding: 2pt 4pt; color: #444; }
  /* goal sheets */
  .sheet .row { display: flex; border: 1.5px solid #111; border-top: 0; }
  .sheet .row.first { border-top: 1.5px solid #111; }
  .sheet .f { padding: 4pt 6pt; flex: 1; }
  .sheet .f + .f { border-left: 1.5px solid #111; }
  .sheet .f .k { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .08em; color: #333; }
  .sheet .f .hint { font-size: 8.5pt; color: #666; }
  .sheet .h1 { min-height: 0.45in; } .sheet .h2 { min-height: 0.7in; } .sheet .h3 { min-height: 1.0in; } .sheet .h4 { min-height: 1.3in; }
  .sheet .title { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6pt; }
  .sheet .title h1 { font-size: 20pt; margin: 0; }
  .review { margin-top: 8pt; border: 2px solid #111; padding: 6pt 8pt; }
  .review .k { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .08em; }
  .review ul.check li { font-size: 10.5pt; margin-bottom: 3pt; }
  .verdict { display: flex; gap: 14pt; font-size: 11pt; margin-top: 4pt; }
  .verdict span { border: 1.5px solid #111; padding: 2pt 8pt; }
  .footer { margin-top: 10pt; padding-top: 4pt; border-top: 1px solid #bbb; font-size: 8.5pt; color: #666; }
  .ros th, .ros td { font-size: 9.5pt; padding: 3pt 5pt; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; }
`;

function pageCover() {
  return `
<section class="page">
  <div class="kicker">FY27 goals day · Thu 24 Sep 2026 · Expansive, Cathedral Square</div>
  <h1>Print this pack</h1>
  <p class="small">Letter, portrait, black and white, 100% scale (turn browser “headers and footers” off). Print the day before. Cut on the dashed lines.</p>
  <table>
    <tr><th style="width:38%">Pages</th><th>Copies</th><th>Then</th></tr>
    <tr><td>2 · The rules of the day</td><td>2</td><td>One on the wall, one on the table.</td></tr>
    <tr><td>3 · Run of show</td><td>1</td><td>Facilitator keeps it. Name a clock-keeper per phase.</td></tr>
    <tr><td>4 · Lock checklist and what happens after</td><td>1</td><td>Facilitator, for the last 20 minutes.</td></tr>
    <tr><td>5–11 · Wall headers (${LINES.length} FY27 goal areas + New today + Parking lot)</td><td>1</td><td>Cut into 14 half-sheets. Tape across the wall left to right before anyone arrives; New today and Parking lot at the far right.</td></tr>
    <tr><td>12–18 · Seed cards (${SEEDS.length}: ${nStuart} from Stuart’s F27 goals, ${nTeam} from the team backlog)</td><td>1</td><td>Cut into ${SEEDS.length} cards. Stick each under the area printed on it. This is the wall the day starts with.</td></tr>
    <tr><td>19 · Goal sheet (business)</td><td>25</td><td>5 people × up to 4 business goals, plus spares.</td></tr>
    <tr><td>20 · Goal sheet (personal)</td><td>7</td><td>One each, plus spares.</td></tr>
  </table>
  <h2>Also bring</h2>
  <ul>
    <li>3 pads of 3×3 in sticky notes (any colours: the letter in the corner is what counts, not the colour).</li>
    <li>6 chisel-tip dark markers (one each plus a spare). No fine pens on cards: it must read from six feet.</li>
    <li>Claim flags: a pack of small page-marker flags or 1 in round stickers. Each person writes their initials on 5.</li>
    <li>Painter’s tape or sticky putty, scissors, a timer everyone can see (laptop with a full-screen timer is fine).</li>
    <li>5 printed copies of Stuart’s F27 goals draft, one per seat.</li>
    <li>A phone with space for photos: the wall and every sheet get photographed before anyone leaves.</li>
    <li>Ask Expansive whether tape on the wall is allowed. If not: two flip-chart pads, headers on flip-chart sheets, cards on the sheets.</li>
  </ul>
  <div class="footer">Goals day pack · ${LINES.length} areas and ${SEEDS.length} cards from “Draft | Stuart F27 goals Digital Marketing” and “Draft | F27 Digital Prios” (Sep 2026).</div>
</section>`;
}

function pageRules() {
  return `
<section class="page">
  <div class="kicker">FY27 goals day</div>
  <h1>The rules of the day</h1>
  <ol class="rules">
    <li><b>One idea per card.</b> Marker, one sentence, something a stranger could act on Monday.</li>
    <li><b>Mark the source in the top corner:</b> ★ Stuart · T team backlog · N new today. The letter counts, not the colour of the paper.</li>
    <li><b>No number without a source next to it.</b> Don’t know it? Write “TBD · where it lives · who checks by Monday”. Never guess.</li>
    <li><b>Silent when the clock says write.</b> Talk when it says stick, claim, review or commit.</li>
    <li><b>The clock is the boss.</b> One +1 minute per phase, by a show of hands. The clock-keeper changes every phase so the facilitator plays too.</li>
    <li><b>Claim with a flag</b> (your initials). 2 to 4 business goals each, plus 1 personal. Two flags on one card: 60 seconds, one owner; the other is written on the sheet as “depends on”.</li>
    <li><b>Every ★ card leaves the wall with a flag or a tag:</b> OWNED · STUART’S OWN · OTHER TEAM · FOLDED INTO #__. No orphans.</li>
    <li><b>Review the goal, not the person.</b> Four checks, one improvement, one verdict: ✔ Ready · ✎ Fix one thing · ↺ Rethink. The author answers every improvement in writing: “Taken” or “No, because …”.</li>
    <li><b>A goal is committed when the sheet is complete and signed:</b> area, shift, metric, source, baseline, target, date, done-when, Q1 milestone by 31 Oct, Q2 milestone by 31 Jan.</li>
    <li><b>Off-topic goes to the Parking lot header.</b> Nothing is lost, nothing derails.</li>
  </ol>
  <div class="box" style="margin-top:14pt">
    <div class="kicker">The four checks (every reviewer, every goal)</div>
    <ul class="check">
      <li>Specific enough that a stranger could start Monday?</li>
      <li>Has a number, a source and a date?</li>
      <li>Names the FY27 goal it serves — and would Stuart agree it does?</li>
      <li>Could the owner hit this metric <b>without</b> helping the business? (If yes, fix the metric.)</li>
    </ul>
  </div>
  <div class="footer">Brief: 3 to 5 goals each, one of them personal. FY27 runs 1 Aug 2026 – 31 Jul 2027; Q1 ends 31 Oct, Q2 ends 31 Jan.</div>
</section>`;
}

function pageRunOfShow() {
  const rows = [
    ['0:00', '15', 'Doors', 'Wall is up: 12 headers, 39 cards under them, New today and Parking lot at the right. Rules poster on the wall. Coffee.', '—'],
    ['0:15', '15', 'Brief', 'Stuart’s 12 areas read from the wall, 5 min. Rules poster, 5 min. The four checks and a blank goal sheet, 5 min. Timer on the table.', '—'],
    ['0:30', '20', 'New ideas', '<b>8 min silent:</b> what is missing for YOUR accounts? Add an idea, make one of Stuart’s concrete, or name something to stop. One idea per card, N in the corner. <b>12 min stick-and-say:</b> round the table, one card at a time, read it in ten seconds, stick it under an area (or New today). Duplicates are stacked, never binned.', 'Clock-keeper: ______'],
    ['0:50', '15', 'Claim', '<b>8 min gallery walk:</b> everyone flags the cards they will turn into goals (2–4 flags). <b>7 min:</b> contested cards get 60 seconds each; every ★ card without a flag gets a tag (STUART’S OWN · OTHER TEAM · FOLDED INTO #). Count flags per person out loud.', 'Clock-keeper: ______'],
    ['1:05', '10', 'Break', '', ''],
    ['1:15', '45', 'Write the goal', 'Silent, at the table. Take your flagged cards down and fill one business goal sheet per card (about 10 min each), then the personal sheet. Numbers only with a source; TBD with a where-and-who is allowed. Facilitator writes too.', 'Clock-keeper: ______'],
    ['2:00', '25', 'Peer review', '<b>12 min:</b> pass your sheets to the person on your left; reviewer ticks the four checks, writes one improvement and a verdict on each sheet. <b>3 min:</b> hand back. <b>10 min:</b> author writes “Taken” or “No, because …” on every improvement and fixes the sheet.', 'Clock-keeper: ______'],
    ['2:25', '10', 'Break', '', ''],
    ['2:35', '50', 'Commit', 'Stand at the wall. Each business goal read aloud in 30 seconds; the room may ask two questions only: “Would Stuart agree this serves that area?” and “What is done by 31 Oct?”. Owner writes the Q1 and Q2 milestones, signs, sticks the sheet over its card. Personal goals: one sentence each, no questions. Up to 20 business goals × about 2 min.', 'Clock-keeper: ______'],
    ['3:25', '20', 'Lock', 'Lock checklist (next page): coverage of every ★ card, dependencies, 3–5 sheets per person, rate the day 1–10 on a card, photos, name the typist.', 'Clock-keeper: ______'],
    ['3:45', '15', 'Buffer', 'Pack up. Every sheet leaves with its owner; the photos are the record until they are typed.', ''],
  ];
  return `
<section class="page">
  <div class="kicker">Facilitator</div>
  <h1>Run of show · 4 hours</h1>
  <table class="ros">
    <tr><th>Clock</th><th>Min</th><th>Phase</th><th>What happens</th><th>Who keeps time</th></tr>
    ${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td><b>${r[2]}</b></td><td>${r[3]}</td><td>${r[4]}</td></tr>`).join('\n    ')}
  </table>
  <p class="small" style="margin-top:8pt">Timings sum to 240 minutes with 25 minutes of buffer and breaks. If Write runs long, take it from Commit by cutting the read-outs to 20 seconds, never from Peer review. “+1 minute” once per phase, by a show of hands.</p>
  <div class="footer">Five in the room: the facilitator plays every phase; the clock-keeper role rotates so nobody sits out.</div>
</section>`;
}

function pageLock() {
  return `
<section class="page">
  <div class="kicker">Facilitator · last 20 minutes</div>
  <h1>Lock checklist</h1>
  <ul class="check">
    <li><b>Coverage.</b> Walk the wall. Every ★ card has a signed sheet on it or a tag (STUART’S OWN · OTHER TEAM · FOLDED INTO #). Read the untagged ones aloud and tag them now.</li>
    <li><b>Load.</b> Count sheets per person: 3 to 5 including the personal one. Under 3: claim from the wall now. Over 5: fold or release one.</li>
    <li><b>Dependencies.</b> Anyone whose sheet says “depends on” another person or another team says so aloud; the other person initials it or it goes to the Parking lot with a name.</li>
    <li><b>Dates.</b> Every business sheet has a Q1 milestone dated on or before 31 Oct 2026 and a Q2 milestone on or before 31 Jan 2027.</li>
    <li><b>Rate the day.</b> Everyone writes 1–10 on a card, face down, then all up at once. Anything under 8: “where did we lose you?” in one sentence, to the Parking lot.</li>
    <li><b>Photos.</b> The whole wall, each area close enough to read, and every signed sheet, front and back.</li>
    <li><b>Typist.</b> Name who types the sheets into the workbook, and by when (Fri 25 Sep). Write it on the Parking lot header.</li>
  </ul>
  <h2>What happens after</h2>
  <p>Each signed sheet is typed into the owner’s <b>“Name — FY27 Goals”</b> tab in the team workbook, one goal block per sheet, exactly as written on paper. The block already exists in the tab:</p>
  <table>
    <tr><th style="width:30%">Tab row</th><th>Take it from the sheet</th></tr>
    <tr><td>Goal N · title · “Which shift?”</td><td>Title · Shift (1–4, or “Personal” for the personal sheet)</td></tr>
    <tr><td>Deadline</td><td>By (date)</td></tr>
    <tr><td>SMART</td><td>The SMART sentence, plus “Serves: [FY27 goal area]” and “Metric: … read in … (caveat)”</td></tr>
    <tr><td>Done</td><td>Done when</td></tr>
    <tr><td>Status · Q1 (Aug–Oct) · Q2 (Nov–Jan)</td><td>Q1 milestone · Q2 milestone (the lines stay for the quarterly check-ins)</td></tr>
  </table>
  <p class="small" style="margin-top:6pt">People without a tab yet get one copied from an existing tab before typing. Then every Q1 milestone becomes one priority on the weekly huddle’s Priorities page, owner = the signer, due 31 Oct 2026, so the goals are reviewed every week from the first huddle after the day. Tags on unclaimed ★ cards and everything on the Parking lot go under the personal goals as a short list. Nothing from the day becomes a to-do.</p>
  <div class="footer">Typed by ________________ on or before Fri 25 Sep 2026.</div>
</section>`;
}

function pageHeaders() {
  const items = LINES.map(([label, goal]) => ({ label, goal, kicker: 'FY27 goal area' }));
  items.push({ label: 'New today', goal: 'Ideas from the room that do not fit an area yet. N in the corner. Sorted or claimed before Write.', kicker: 'Wall' });
  items.push({ label: 'Parking lot', goal: 'Anything off-topic, any dependency on another team, anything under 8 in the rating. Nothing is lost. Typist and date go here at Lock.', kicker: 'Wall' });
  const pages = [];
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    pages.push(`
<section class="page">
  ${pair.map(it => `<div class="half">
    <div class="kicker">${esc(it.kicker)}</div>
    <div class="label">${esc(it.label)}</div>
    <div class="goal">${esc(it.goal)}</div>
    <div class="foot">${it.kicker === 'FY27 goal area' ? 'From “Draft | Stuart F27 goals Digital Marketing” (Sep 2026). Cards under this header serve this goal.' : '&nbsp;'}</div>
  </div>`).join('\n  ')}
</section>`);
  }
  return pages.join('\n');
}

function pageCards() {
  const pages = [];
  for (let i = 0; i < SEEDS.length; i += 6) {
    const six = SEEDS.slice(i, i + 6);
    pages.push(`
<section class="page">
  <div class="grid">
    ${six.map((s, j) => `<div class="card">
      <div class="top"><span class="src">${glyph(s[2])}</span><span class="num">#${i + j + 1}</span></div>
      <div class="text">${esc(s[0])}</div>
      <div class="area">Serves: <b>${esc(s[1])}</b></div>
      <div class="claim">Flags / tag:</div>
    </div>`).join('\n    ')}
  </div>
</section>`);
  }
  return pages.join('\n');
}

function pageGoalSheet() {
  const f = (k, hint, cls, extra) => `<div class="f ${cls || ''}"><div class="k">${k}</div>${hint ? `<div class="hint">${hint}</div>` : ''}${extra || ''}</div>`;
  return `
<section class="page sheet">
  <div class="title"><h1>Goal sheet · business</h1><span class="small">Owner ______________ &nbsp; Goal # ___ of ___ &nbsp; From card # ____</span></div>
  <div class="row first">${f('Title — what you are going to do', 'One line. This is what gets typed as the goal.', 'h1')}</div>
  <div class="row">${f('Serves which FY27 goal area', 'A header on the wall, word for word.', 'h1')}${f('Shift', '1 Agentic PPC · 2 Measurement past last-click · 3 AI-search visibility + on-site behaviour · 4 Structure + a converting page', 'h1')}</div>
  <div class="row">${f('Metric', 'The one number that moves.', 'h1')}${f('Where it is read', 'Report or query, and its caveat.', 'h1')}</div>
  <div class="row">${f('Baseline today', 'Number + as-of date, or “TBD · where · who checks by Mon”.', 'h1')}${f('Target', 'Number.', 'h1')}${f('By', 'Date.', 'h1')}</div>
  <div class="row">${f('SMART sentence', 'Specific · Measurable · Achievable · Relevant · Time-bound. One or two sentences a stranger could start on Monday.', 'h3')}</div>
  <div class="row">${f('Done when', 'What proves it: numbers, artifacts, a read-out.', 'h2')}</div>
  <div class="row">${f('Q1 milestone · by 31 Oct 2026', '', 'h2')}${f('Q2 milestone · by 31 Jan 2027', '', 'h2')}</div>
  <div class="row">${f('Depends on', 'Person or team, if any.', 'h1')}${f('Guardrail', 'What must not get worse while you do this.', 'h1')}</div>
  <div class="review">
    <div class="k">Peer review · reviewer ______________</div>
    <ul class="check">
      <li>Specific enough that a stranger could start Monday?</li>
      <li>Has a number, a source and a date?</li>
      <li>Names the FY27 goal it serves — and would Stuart agree it does?</li>
      <li>Could the owner hit this metric without helping the business?</li>
    </ul>
    <div class="k" style="margin-top:4pt">One improvement</div>
    <div style="min-height:0.45in"></div>
    <div class="verdict"><span>✔ Ready</span><span>✎ Fix one thing</span><span>↺ Rethink</span></div>
    <div class="k" style="margin-top:6pt">Author’s answer (Taken · No, because …)</div>
    <div style="min-height:0.35in"></div>
  </div>
  <div class="footer">Committed: signature ______________________ &nbsp; date ____________ &nbsp; · stuck over its card on the wall.</div>
</section>`;
}

function pagePersonalSheet() {
  const f = (k, hint, cls) => `<div class="f ${cls || ''}"><div class="k">${k}</div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
  return `
<section class="page sheet">
  <div class="title"><h1>Goal sheet · personal</h1><span class="small">Owner ______________ &nbsp; Goal 5</span></div>
  <div class="row first">${f('Title — what you are going to do', 'One line.', 'h1')}</div>
  <div class="row">${f('Why it matters to you', '', 'h2')}</div>
  <div class="row">${f('SMART sentence', 'Specific · Measurable · Achievable · Relevant · Time-bound.', 'h3')}</div>
  <div class="row">${f('Done when', 'What proves it.', 'h2')}${f('By', 'Date.', 'h2')}</div>
  <div class="row">${f('Q1 check-in · 31 Oct 2026', 'What will be true by then?', 'h2')}${f('Q2 check-in · 31 Jan 2027', '', 'h2')}</div>
  <div class="row">${f('What you need from the team, if anything', '', 'h2')}</div>
  <div class="review">
    <div class="k">Peer review · reviewer ______________ · two checks only</div>
    <ul class="check">
      <li>Specific enough that a stranger could tell whether it happened?</li>
      <li>Has a date?</li>
    </ul>
    <div class="k" style="margin-top:4pt">One improvement</div>
    <div style="min-height:0.45in"></div>
    <div class="verdict"><span>✔ Ready</span><span>✎ Fix one thing</span></div>
  </div>
  <div class="footer">Committed: signature ______________________ &nbsp; date ____________ &nbsp; · read aloud in one sentence at Commit, no questions.</div>
</section>`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>FY27 goals day pack</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}</style>
</head>
<body>
${pageCover()}
${pageRules()}
${pageRunOfShow()}
${pageLock()}
${pageHeaders()}
${pageCards()}
${pageGoalSheet()}
${pagePersonalSheet()}
</body>
</html>
`;

fs.writeFileSync(OUT, html);
const pages = (html.match(/<section class="page/g) || []).length;
console.log('wrote ' + path.relative(process.cwd(), OUT) + ' · ' + pages + ' pages · ' + LINES.length + ' areas · ' + SEEDS.length + ' cards (' + nStuart + ' Stuart, ' + nTeam + ' team)');

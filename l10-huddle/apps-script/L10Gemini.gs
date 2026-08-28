// L10 Huddle — Gemini service layer.
// One shared wrapper around the Gemini API for every feature in this app that
// needs generated text. Nothing in here is a feature by itself: it holds the
// key handling, the call, the retry/quota discipline and the safety guards, so
// each calling feature stays short and they all fail the same way.
//
// All globals are l10-prefixed (this script project is shared). No credentials
// live in code or in the sheet: the API key is read from the L10_GEMINI_API_KEY
// script property; the non-secret settings live in L10_Config (GEMINI_ENABLED /
// GEMINI_MODEL / GEMINI_DAILY_CAP). Dormant until the key is set — every entry
// point returns {ok:false} rather than throwing, so a feature that calls into
// this file degrades to "no suggestion" instead of breaking the huddle.
//
// Setup (one-time):
//   1. Create an API key at aistudio.google.com -> Get API key.
//   2. L10 Huddle -> Gemini -> Set API key...     (stored in script properties)
//   3. L10 Huddle -> Gemini -> Test connection    (verifies the key + the model)
//   4. Optional: L10_Config GEMINI_MODEL / GEMINI_DAILY_CAP.
//
// Two rules this file enforces for its callers, not just documents:
//   - Generated text may never introduce a figure that was not in the input.
//     l10GeminiGuardNumbers_ checks that and reports every unsupported number;
//     any caller writing near the scorecard, the recap or the summary must run
//     it and discard rather than publish a failing draft.
//   - Blanks stay blank. A "___" placeholder in the input marks a number that
//     has to come from the live tool; the guard fails a draft that fills them.

var L10_GEMINI_KEY_PROP = 'L10_GEMINI_API_KEY';
var L10_GEMINI_COUNT_PROP = 'L10_GEMINI_CALLS';       // {date:'yyyy-MM-dd', n:0}
var L10_GEMINI_HOST = 'https://generativelanguage.googleapis.com';
var L10_GEMINI_API_VERSION = 'v1beta';
var L10_GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
var L10_GEMINI_DEFAULT_CAP = 200;                     // calls per day, all features
var L10_GEMINI_CACHE_SEC = 900;                       // identical prompt reuse window
var L10_GEMINI_MAX_ATTEMPTS = 3;

function l10GeminiKey_() {
  return String(PropertiesService.getScriptProperties().getProperty(L10_GEMINI_KEY_PROP) || '').trim();
}

// Non-secret settings, read once per call site. Guarded so this file still
// loads (and reports "off") in a project where L10_Config has not been built.
function l10GeminiSettings_(cfg) {
  try { cfg = cfg || l10Config_(); } catch (e) { cfg = {}; }
  var cap = Number(cfg.GEMINI_DAILY_CAP);
  return {
    key: l10GeminiKey_(),
    model: String(cfg.GEMINI_MODEL || '').trim() || L10_GEMINI_DEFAULT_MODEL,
    cap: isFinite(cap) && cap > 0 ? Math.floor(cap) : L10_GEMINI_DEFAULT_CAP,
    on: String(cfg.GEMINI_ENABLED === undefined ? 'YES' : cfg.GEMINI_ENABLED).toUpperCase() !== 'NO'
  };
}

// The kill switch and the key are separate on purpose: GEMINI_ENABLED=NO turns
// every feature off in one edit without anyone having to destroy the key.
function l10GeminiEnabled_(s) {
  s = s || l10GeminiSettings_();
  return !!(s.key && s.on);
}

// ---------------------------------------------------------------------------
// Daily budget
// ---------------------------------------------------------------------------

// A shared per-day call counter across every feature, so a loop introduced by
// one of them cannot quietly spend the whole quota. Counted on calls that
// actually reach the API — cache hits and refusals are free.
function l10GeminiBudget_(s, spend) {
  var props = PropertiesService.getScriptProperties();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Chicago', 'yyyy-MM-dd');
  var state = { date: today, n: 0 };
  try {
    var raw = props.getProperty(L10_GEMINI_COUNT_PROP);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.date === today) state = { date: today, n: Number(parsed.n) || 0 };
    }
  } catch (e) {}
  if (spend) {
    state.n++;
    props.setProperty(L10_GEMINI_COUNT_PROP, JSON.stringify(state));
  }
  return { used: state.n, cap: s.cap, left: Math.max(0, s.cap - state.n) };
}

function l10_geminiUsage() {
  var s = l10GeminiSettings_();
  var b = l10GeminiBudget_(s, false);
  return { enabled: l10GeminiEnabled_(s), model: s.model, used: b.used, cap: b.cap, left: b.left };
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

function l10GeminiUrl_(s) {
  return L10_GEMINI_HOST + '/' + L10_GEMINI_API_VERSION + '/models/' +
      encodeURIComponent(s.model) + ':generateContent';
}

// One HTTP call. Never throws — returns {code, json, text}.
function l10GeminiFetch_(s, body) {
  try {
    var res = UrlFetchApp.fetch(l10GeminiUrl_(s), {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': s.key },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
    var text = res.getContentText();
    var json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) {}
    return { code: res.getResponseCode(), json: json, text: text };
  } catch (e) {
    return { code: 0, json: null, text: String(e) };
  }
}

function l10GeminiErr_(r) {
  var msg = '';
  if (r && r.json && r.json.error && r.json.error.message) msg = String(r.json.error.message);
  if (!msg && r) msg = String(r.text || '').slice(0, 160);
  return (r ? ('HTTP ' + r.code + ' ') : '') + msg;
}

function l10GeminiRetryable_(code) {
  return code === 0 || code === 429 || code === 500 || code === 502 || code === 503 || code === 504;
}

// Pull the text out of a response, and say why there is none when there isn't:
// a prompt or a draft stopped by a safety filter or the token ceiling has to
// read as a clear refusal, not as an empty suggestion the room might trust.
function l10GeminiText_(json) {
  if (!json) return { ok: false, error: 'empty response' };
  if (json.promptFeedback && json.promptFeedback.blockReason) {
    return { ok: false, error: 'request blocked (' + json.promptFeedback.blockReason + ')' };
  }
  var cand = json.candidates && json.candidates[0];
  if (!cand) return { ok: false, error: 'no candidate returned' };
  var parts = (cand.content && cand.content.parts) || [];
  var text = parts.map(function (p) { return String(p.text || ''); }).join('').trim();
  if (!text) {
    var why = String(cand.finishReason || 'no text');
    return { ok: false, error: why === 'MAX_TOKENS' ? 'output cut off (raise maxTokens)' : ('no text (' + why + ')') };
  }
  return { ok: true, text: text };
}

// The one entry point every feature uses.
//   prompt  the full instruction + data block
//   opts    {system, temperature, maxTokens, schema, cache}
// Returns {ok, text, cached} or {ok:false, error, off}. Never throws.
function l10GeminiGenerate_(prompt, opts) {
  opts = opts || {};
  var s = l10GeminiSettings_();
  if (!s.key) return { ok: false, off: true, error: 'No Gemini API key set (L10 Huddle > Gemini > Set API key).' };
  if (!s.on) return { ok: false, off: true, error: 'Gemini is switched off (GEMINI_ENABLED=NO in L10_Config).' };
  var text = String(prompt || '').trim();
  if (!text) return { ok: false, error: 'Empty prompt.' };

  var body = {
    contents: [{ role: 'user', parts: [{ text: text }] }],
    generationConfig: {
      temperature: opts.temperature === undefined ? 0.2 : Number(opts.temperature),
      maxOutputTokens: Number(opts.maxTokens) || 1024
    }
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: String(opts.system) }] };
  if (opts.schema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = opts.schema;
  }

  // Identical prompts inside the window reuse the answer: re-opening a page or
  // double-tapping a suggest button should not cost a call or shuffle wording.
  var cache = null, cacheKey = '';
  if (opts.cache !== false) {
    try {
      cache = CacheService.getScriptCache();
      cacheKey = 'l10gem_' + Utilities.base64EncodeWebSafe(
          Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s.model + ' ' + JSON.stringify(body)));
      var hit = cache.get(cacheKey);
      if (hit) return { ok: true, text: hit, cached: true };
    } catch (e) { cache = null; }
  }

  var budget = l10GeminiBudget_(s, false);
  if (budget.left <= 0) {
    return { ok: false, error: 'Daily Gemini call cap reached (' + budget.cap + '). Raise GEMINI_DAILY_CAP in L10_Config or try tomorrow.' };
  }

  var last = null;
  for (var attempt = 1; attempt <= L10_GEMINI_MAX_ATTEMPTS; attempt++) {
    var r = l10GeminiFetch_(s, body);
    l10GeminiBudget_(s, true);
    if (r.code >= 200 && r.code < 300) {
      var out = l10GeminiText_(r.json);
      if (!out.ok) return { ok: false, error: out.error };
      if (cache) { try { cache.put(cacheKey, out.text, L10_GEMINI_CACHE_SEC); } catch (e) {} }
      return { ok: true, text: out.text, cached: false };
    }
    last = r;
    if (!l10GeminiRetryable_(r.code) || attempt === L10_GEMINI_MAX_ATTEMPTS) break;
    Utilities.sleep(600 * attempt * attempt);   // 0.6s, then 2.4s
  }
  return { ok: false, error: l10GeminiErr_(last) };
}

// Structured output. Pass a responseSchema and get parsed data back, so callers
// never hand-parse prose into rows. Returns {ok, data} or {ok:false, error}.
function l10GeminiJson_(prompt, schema, opts) {
  opts = opts || {};
  opts.schema = schema;
  var r = l10GeminiGenerate_(prompt, opts);
  if (!r.ok) return r;
  try {
    return { ok: true, data: JSON.parse(r.text), cached: !!r.cached };
  } catch (e) {
    return { ok: false, error: 'Model returned unparseable JSON.' };
  }
}

// ---------------------------------------------------------------------------
// Safety guards
// ---------------------------------------------------------------------------

// Every number-like token in a string, normalized ("$1,240.50" -> "1240.5",
// "40.2%" -> "40.2"). Used both to build the allowed set from the input and to
// list what a draft actually claims.
function l10GeminiNumbers_(str) {
  var out = [];
  String(str === undefined || str === null ? '' : str)
      .replace(/-?\d[\d,]*(?:\.\d+)?/g, function (m) {
        var n = m.replace(/,/g, '');
        if (n.indexOf('.') > -1) n = n.replace(/0+$/, '').replace(/\.$/, '');
        out.push(n);
        return m;
      });
  return out;
}

// The labels whose value the source left blank: a line like "- Brady A/S: ___"
// yields "Brady A/S". These are the figures that must come from the live tool.
function l10GeminiBlankLabels_(sourceText) {
  var labels = [];
  String(sourceText || '').split('\n').forEach(function (line) {
    var m = /^\s*(?:[-*•]\s*)?(.+?)\s*:\s*_{2,}/.exec(line);
    if (m) {
      var label = m[1].trim();
      if (label && labels.indexOf(label) === -1) labels.push(label);
    }
  });
  return labels;
}

// A blank is "filled" when the draft keeps a blank label AND puts a number next
// to it. Dropping the line entirely is fine — a summary is allowed to leave
// things out; what it may never do is present a value the source didn't have.
// Counting "___" occurrences cannot tell those two apart, so don't.
function l10GeminiBlankFills_(sourceText, draftText) {
  var draft = String(draftText || '');
  var filled = [];
  l10GeminiBlankLabels_(sourceText).forEach(function (label) {
    var at = draft.toLowerCase().indexOf(label.toLowerCase());
    while (at > -1) {
      var after = draft.slice(at + label.length, at + label.length + 40);
      // A digit before the next line break, with the blank no longer in place.
      var upto = after.split('\n')[0];
      if (/\d/.test(upto) && !/_{2,}/.test(upto)) { filled.push(label); return; }
      at = draft.toLowerCase().indexOf(label.toLowerCase(), at + 1);
    }
  });
  return filled;
}

// The never-invent-a-number gate. A draft passes only if every figure in it
// also appears in the source it was built from, and if it left the blanks
// blank — a plausible-looking fill is the exact failure this app must not ship.
// Returns {ok, unsupported:[...], filledBlanks:[...]}. Callers discard on
// failure; they must not publish a draft that fails this.
//
// This is a backstop, not a fact-checker: it proves no new figure appeared and
// no blank was answered. It cannot tell whether a supported number was attached
// to the right metric, so a draft still goes in front of a person before it is
// sent anywhere.
function l10GeminiGuardNumbers_(sourceText, draftText) {
  var allowed = {};
  l10GeminiNumbers_(sourceText).forEach(function (n) { allowed[n] = true; });
  var unsupported = [];
  l10GeminiNumbers_(draftText).forEach(function (n) {
    if (!allowed[n] && unsupported.indexOf(n) === -1) unsupported.push(n);
  });
  var filledBlanks = l10GeminiBlankFills_(sourceText, draftText);
  return {
    ok: !unsupported.length && !filledBlanks.length,
    unsupported: unsupported,
    filledBlanks: filledBlanks
  };
}

// Shared preamble for any feature that drafts text over huddle data. Kept here
// so the rules are stated once and cannot drift between features.
var L10_GEMINI_GROUNDING =
    'You are drafting for a paid-media team\'s weekly huddle tool. Rules you must follow exactly:\n' +
    '1. Use only facts present in the DATA block. Never add a number, percentage, currency amount ' +
    'or date that does not appear there verbatim. Do not round, rescale or recompute the numbers you are given.\n' +
    '2. "___" marks a figure the reader must pull from the live tool. Leave every "___" exactly as it is.\n' +
    '3. If the data does not support a point, omit the point. Never fill a gap with a plausible value.\n' +
    '4. Plain, direct language. No preamble, no sign-off, no commentary about how the text was produced.\n' +
    '5. Where a colour is used to carry meaning, also state that meaning in words.';

// ---------------------------------------------------------------------------
// Connection test + menu
// ---------------------------------------------------------------------------

function l10GeminiTestConnection_() {
  var s = l10GeminiSettings_();
  if (!s.key) return { ok: false, error: 'No API key set. Use Gemini > Set API key first.' };
  if (!s.on) return { ok: false, error: 'GEMINI_ENABLED is NO in L10_Config — switch it to YES to use Gemini.' };
  var r = l10GeminiGenerate_('Reply with the single word: ready', { maxTokens: 16, temperature: 0, cache: false });
  if (!r.ok) return { ok: false, error: r.error, model: s.model };
  var b = l10GeminiBudget_(s, false);
  return { ok: true, model: s.model, reply: r.text, used: b.used, cap: b.cap };
}

function l10MenuSetGeminiKey() {
  var ui = SpreadsheetApp.getUi();
  var has = !!l10GeminiKey_();
  var resp = ui.prompt('Gemini API key',
    'Paste the API key for the Gemini API.\n' +
    'Create one at aistudio.google.com -> Get API key.\n' +
    'Stored in script properties, never in the sheet.' +
    (has ? '\n\n(A key is already set — paste to replace, or leave blank to clear.)' : ''),
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var key = String(resp.getResponseText() || '').trim();
  PropertiesService.getScriptProperties().setProperty(L10_GEMINI_KEY_PROP, key);
  ui.alert(key ? 'Key saved. Now run Gemini > Test connection.' : 'Key cleared — Gemini features are now off.');
}

function l10MenuTestGemini() {
  var ui = SpreadsheetApp.getUi();
  var r = l10GeminiTestConnection_();
  if (!r.ok) {
    ui.alert('Gemini test failed' + (r.model ? ' (model ' + r.model + ')' : '') + ':\n\n' + r.error +
      '\n\nIf the model name is the problem, set GEMINI_MODEL in L10_Config to one your key can reach.');
    return;
  }
  ui.alert('Gemini connected.\n\nModel: ' + r.model + '\nReplied: ' + r.reply +
    '\nCalls used today: ' + r.used + ' of ' + r.cap + '.');
}

function l10MenuGeminiStatus() {
  var u = l10_geminiUsage();
  SpreadsheetApp.getUi().alert('Gemini status\n\n' +
    'State: ' + (u.enabled ? 'on' : 'off — set an API key and GEMINI_ENABLED=YES') + '\n' +
    'Model: ' + u.model + '\n' +
    'Calls used today: ' + u.used + ' of ' + u.cap + ' (' + u.left + ' left)\n\n' +
    'Switch everything off in one edit with GEMINI_ENABLED=NO in L10_Config; the key stays set.');
}

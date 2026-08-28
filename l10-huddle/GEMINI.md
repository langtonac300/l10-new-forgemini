# Gemini service layer — added 2026-08-28

The shared plumbing every Gemini-powered feature in this app calls. It is
**not a feature by itself**: nothing in the app generates text yet. This file
exists so the first feature that needs generated text — and every one after it
— gets key handling, retries, a quota ceiling, a kill switch and the
never-invent-a-number guard for free, and so all of them fail identically.

Lives in [`apps-script/L10Gemini.gs`](./apps-script/L10Gemini.gs) (+ 2 small
edits to `L10Setup.gs`: three `L10_Config` rows and a **Gemini** submenu).
Modeled deliberately on [`L10Jira.gs`](./apps-script/L10Jira.gs) — same
credential shape, same "dormant until configured", same test-connection menu.

## Setup (one-time)

1. Create an API key at **aistudio.google.com → Get API key**.
2. **L10 Huddle → Gemini → Set API key…** — stored in the `L10_GEMINI_API_KEY`
   script property, **never in the sheet**.
3. **L10 Huddle → Gemini → Test connection** — verifies the key reaches the
   configured model and reports today's call count.
4. Optional: `L10_Config` → `GEMINI_MODEL`, `GEMINI_DAILY_CAP`.

**L10 Huddle → Gemini → Status / usage** reports on/off, model, and calls used
today without spending one.

## Configuration

| `L10_Config` key | Default | What it does |
|---|---|---|
| `GEMINI_ENABLED` | `YES` | Master switch. `NO` turns **every** Gemini feature off in one edit — the key stays set, so turning it back on is one cell, not a re-provision. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | The model called. Change if the key can't reach the default or a different speed/quality trade is wanted. |
| `GEMINI_DAILY_CAP` | `200` | Ceiling on API calls per day **across all features combined**, so one runaway loop can't spend the quota. |

Key: `L10_GEMINI_API_KEY` script property. Counter: `L10_GEMINI_CALLS`.

## What a calling feature gets

```js
// Prose:
var r = l10GeminiGenerate_(prompt, { system: L10_GEMINI_GROUNDING, maxTokens: 800 });
if (!r.ok) { /* r.error is human-readable; r.off means unconfigured, not broken */ }

// Rows, not prose — pass a responseSchema and get parsed data:
var r = l10GeminiJson_(prompt, { type: 'object', properties: { … } });
```

- **Never throws.** Every entry point returns `{ok:false, error}`. A feature
  that calls in degrades to "no suggestion", never to a broken huddle. `off:true`
  distinguishes *not configured* from *failed*, so the UI can stay quiet rather
  than showing an error for a key nobody set.
- **Retries** 429/5xx/network three times with backoff (0.6s, 2.4s). A 400 is
  not retried — a bad request stays bad.
- **Caches** identical prompts for 15 minutes. Re-opening a page or
  double-tapping a suggest button costs nothing and returns the same wording.
- **Refuses clearly.** A safety block, an empty candidate or a `MAX_TOKENS`
  truncation all come back as a stated error, never as empty text a room might
  read as "the model had nothing to say".
- **Budget-aware.** Cache hits and refusals are free; only calls that reach the
  API count.

## The two safety rules, enforced in code

The repo rule is *never invent a number*. A prompt instruction is not
enforcement, so the guard is code:

```js
var g = l10GeminiGuardNumbers_(sourceText, draft.text);
if (!g.ok) { /* discard the draft — do not publish it */ }
```

`l10GeminiGuardNumbers_` fails a draft that:

1. **contains a figure not in the source** — every number-like token in the
   draft must appear in the input, normalized for `$`, `%`, commas and trailing
   zeros. Rounding `38.4` to `38` fails: that is a new number.
2. **answers a blank.** `___` marks a figure that must come from the live tool.
   A draft may *omit* a blank line (a summary is allowed to leave things out)
   but may never put a value next to a blank label — including a value borrowed
   from elsewhere in the source, which the number check alone would miss.

Returns `{ok, unsupported:[…], filledBlanks:[…]}` so a caller can say *what*
was wrong, not just that something was.

**It is a backstop, not a fact-checker.** It proves no new figure appeared and
no blank was answered. It cannot tell whether a supported number was attached
to the right metric — so a draft still goes in front of a person before it is
sent anywhere.

`L10_GEMINI_GROUNDING` is the shared system preamble carrying the same rules in
prose (plus: no preamble or sign-off, and state in words any meaning carried by
colour — the colourblind-accessibility rule applies to generated text too).
Stated once here so it can't drift between features.

## Verifying the guard

The guard is pure string logic with no Apps Script dependency, so it can be
exercised outside the workbook — extract the four functions and run them in
Node. The behaviour it must hold:

| Draft, against a source with `Brady A/S: 38.4%` … `NB visitors: ___` | Verdict |
|---|---|
| restates `38.4%` faithfully | pass |
| summarizes and omits the blank lines entirely | pass |
| carries `NB visitors: ___` through unchanged | pass |
| rounds to `about 38%` | **blocked** — new number |
| adds "up from 41.2% last week" | **blocked** — new number |
| writes `NB visitors: 12500` | **blocked** — new number *and* filled blank |
| writes `NB visitors: 7` (borrowed from the experiment count) | **blocked** — filled blank |

## Scope status

**Undecided.** The plumbing is deliberately feature-free so the first surface
can be chosen on its merits rather than inherited from whatever got built
first. Candidates considered, none selected yet: IDS root-cause and playbook
suggestions · to-do polish and meaning-based dedupe · recap/summary drafting
(the guard above is what would make this safe) · scorecard movement narration ·
question-answering over the `L10_*` history · notes-or-transcript to rows ·
plain-English mail/chat intake replacing the regex parser in `L10Mail.gs` ·
auto-building the pre-huddle brief docket.

Whichever lands: it calls `l10GeminiGenerate_`/`l10GeminiJson_`, it runs the
guard if it goes anywhere near a number, and it ships to **both** copies —
this one and `momentum-huddle/` — since it is logic, not wording.

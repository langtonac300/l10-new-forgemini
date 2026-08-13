// Assemble the L10 app the way doGet()/l10Include() would, with google.script.run
// stubbed, so the real front end renders in headless Chromium against fixtures.
// Usage: node build.js  → writes preview.html next to this script.
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const APPS = path.resolve(HERE, '..', 'apps-script');

const read = (f) => fs.readFileSync(f, 'utf8');

let page = read(path.join(APPS, 'L10Index.html'));
const css = read(path.join(APPS, 'L10Css.html'));
const js = read(path.join(APPS, 'L10Js.html'));
const stub = read(path.join(HERE, 'stub.js'));
const fixtures = read(path.join(HERE, 'fixtures.js'));

// The include scriptlets, exactly as doGet's template resolves them.
// Function replacements: string replacements interpret $-patterns ($&, $', …)
// and the app's JS is full of them.
page = page.replace(`<?!= l10Include('L10Css'); ?>`, () => css);
// The stub must exist before L10Js executes (it calls boot() at load).
// __EMBED_SLOT__ lets the embed variant inject a fixture-built core payload
// between the stub and the app (the real page gets it inline from doGet).
page = page.replace(
  `<?!= l10Include('L10Js'); ?>`,
  () => `<script>\n${fixtures}\n</script>\n<script>\n${stub}\n</script>\n__EMBED_SLOT__${js}`
);
// The boot-embed scriptlet: null = the slice-fetch fallback path (what a
// pre-upgrade deployment serves). The embed variant overrides via the slot
// below — the value must be built AFTER fixtures.js has run.
page = page.replace(`<?!= bootJson ?>`, 'null');
// The webAppUrl template scriptlet — blank, matching the embedded-modal case.
page = page.replace(/<\?=[\s\S]*?\?>/g, '');
// No network in the harness: drop the Google Fonts links (CSP-irrelevant here,
// but a file:// page stalls retrying them). Global — there are two preconnects
// and a <noscript> fallback link now.
page = page.replace(/^\s*<link rel="preconnect"[^\n]*\n/gm, '');
page = page.replace(/^\s*<link href="https:\/\/fonts[^\n]*\n/gm, '');
page = page.replace(/^\s*<noscript><link href="https:\/\/fonts[^\n]*\n/gm, '');

if (page.includes('<?')) {
  const at = page.indexOf('<?');
  throw new Error('Unresolved scriptlet remains at char ' + at + ': ' + page.slice(at, at + 80));
}
fs.writeFileSync(path.join(HERE, 'preview.html'), page.replace('__EMBED_SLOT__', () => ''));
// The embed variant: window.__L10_BOOT built from the same fixtures' core
// slice (deep-copied — the embed path must not share references with later
// stubbed slice calls), so the production-primary boot path is exercised by
// the smoke suite too, not just the fallback.
const embedScript = `<script>\nwindow.__L10_BOOT = (function () {\n` +
  `  var f = window.__FIXTURES.l10_bootCore;\n` +
  `  var core = typeof f === 'function' ? f() : f;\n` +
  `  core = JSON.parse(JSON.stringify(core));\n` +
  `  core.sid = 'fixture-ss'; // activates the per-workbook snapshot, like doGet's sid\n` +
  `  return core;\n` +
  `})();\n</script>\n`;
fs.writeFileSync(path.join(HERE, 'preview-embed.html'), page.replace('__EMBED_SLOT__', () => embedScript));
console.log('preview.html + preview-embed.html written (' + page.length + ' bytes base)');

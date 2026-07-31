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

// The two include scriptlets, exactly as doGet's template resolves them.
// Function replacements: string replacements interpret $-patterns ($&, $', …)
// and the app's JS is full of them.
page = page.replace(`<?!= l10Include('L10Css'); ?>`, () => css);
// The stub must exist before L10Js executes (it calls boot() at load).
page = page.replace(
  `<?!= l10Include('L10Js'); ?>`,
  () => `<script>\n${fixtures}\n</script>\n<script>\n${stub}\n</script>\n${js}`
);
// The webAppUrl template scriptlet — blank, matching the embedded-modal case.
page = page.replace(/<\?=[\s\S]*?\?>/g, '');
// No network in the harness: drop the Google Fonts links (CSP-irrelevant here,
// but a file:// page stalls retrying them).
page = page.replace(/^\s*<link rel="preconnect"[^\n]*\n/m, '');
page = page.replace(/^\s*<link href="https:\/\/fonts[^\n]*\n/m, '');

if (page.includes('<?')) {
  const at = page.indexOf('<?');
  throw new Error('Unresolved scriptlet remains at char ' + at + ': ' + page.slice(at, at + 80));
}
fs.writeFileSync(path.join(HERE, 'preview.html'), page);
console.log('preview.html written (' + page.length + ' bytes)');

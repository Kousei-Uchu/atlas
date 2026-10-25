// Source scans from spec 15.2. Hits are failures here; if one is a genuine false
// positive, change the code so it no longer matches rather than weakening the scan.
// The one standing exception: the fixed notice wording says "no analytics".
const NOTICE_FILE = join('src', 'content', 'notices.js');
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const rules = [
  [/console\./, 'console use (profile data must never be logged)'],
  [/sendBeacon|XMLHttpRequest|WebSocket|EventSource/, 'a network API'],
  [/\bfetch\s*\(/, 'fetch (the app makes no requests)'],
  [/gtag|analytics|googletagmanager/i, 'an analytics reference'],
  [/dangerouslySetInnerHTML|\binnerHTML\b|\beval\s*\(|new Function\s*\(/, 'unsafe HTML or code evaluation'],
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(js|jsx|css|html)$/.test(name)) yield path;
  }
}

const hits = [];
for (const file of files('src')) {
  readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    for (const [pattern, why] of rules) if (pattern.test(line) && !(file === NOTICE_FILE && /analytics/i.test(why))) hits.push(`${file}:${index + 1}: ${why}`);
  });
}
if (hits.length > 0) {
  process.stderr.write(`Source check failed:\n- ${hits.join('\n- ')}\n`);
  process.exit(1);
}
process.stdout.write('Source check passed.\n');

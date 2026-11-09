// Source scans from spec 15.2. Hits are failures here; if one is a genuine false
// positive, change the code so it no longer matches rather than weakening the scan.
// Standing exceptions, and no others:
//  - the fixed notice and data-handling wording says "no analytics";
//  - the service worker passes the page's own same-origin requests on, so it may call fetch (M6-04, D-059).
//    It may not use any other rule's pattern, and scripts/check-dist.mjs checks the built file for other origins.
const NOTICE_FILES = [join('src', 'content', 'notices.js'), join('src', 'content', 'about.js')]; // both say "no analytics"
const WORKER_FILE = join('src', 'sw', 'worker.js');
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
    for (const [pattern, why] of rules) if (pattern.test(line) && !(NOTICE_FILES.includes(file) && /analytics/i.test(why)) && !(file === WORKER_FILE && /^fetch/.test(why))) hits.push(`${file}:${index + 1}: ${why}`);
  });
}
if (hits.length > 0) {
  process.stderr.write(`Source check failed:\n- ${hits.join('\n- ')}\n`);
  process.exit(1);
}
process.stdout.write('Source check passed.\n');

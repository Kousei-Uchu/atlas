// Post-build checks on the production output (M1-AC-10). Run by `npm run verify` and CI.
// Fails loudly rather than shipping a build that could send data anywhere.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync('dist/index.html', 'utf8');
const problems = [];

const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/i);
if (!meta) problems.push('dist/index.html has no CSP meta tag.');
else if (!/connect-src 'none'/.test(meta[1])) problems.push("The CSP meta tag does not contain connect-src 'none'.");

if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) problems.push('dist/index.html contains an inline script.');
if (/\son[a-z]+\s*=/i.test(html)) problems.push('dist/index.html contains an inline event handler.');
const external = html.match(/(?:src|href)=["']https?:\/\/[^"']+/gi);
if (external) problems.push(`dist/index.html references other origins: ${external.join(', ')}`);

const assetDir = join('dist', 'assets');
for (const name of readdirSync(assetDir)) {
  if (!name.endsWith('.css')) continue;
  const css = readFileSync(join(assetDir, name), 'utf8');
  if (/@import\s+url\(\s*["']?https?:|url\(\s*["']?https?:/i.test(css)) problems.push(`${name} loads something from another origin.`);
}

// Test-only libraries must not be in the shipped code.
for (const name of readdirSync(assetDir)) {
  if (!name.endsWith('.js')) continue;
  const js = readFileSync(join(assetDir, name), 'utf8');
  for (const marker of ['jsQR', 'axe-core', 'fake-indexeddb']) if (js.includes(marker)) problems.push(`${name} contains ${marker}, a test-only library.`);
}

// The service worker (M6-04): present, same-origin only, and it lists exactly the built files.
try {
  const sw = readFileSync('dist/sw.js', 'utf8');
  if (/https?:\/\//.test(sw)) problems.push('dist/sw.js names another origin.');
  if (/indexedDB|localStorage/.test(sw.replace(/\/\/.*$/gm, ''))) problems.push('dist/sw.js touches storage.');
  const listed = JSON.parse(sw.match(/const PRECACHE = (\[.*\]);/)[1]);
  const built = [...readdirSync(assetDir).map((n) => `/assets/${n}`), '/index.html'];
  for (const p of built) if (!listed.includes(p)) problems.push(`dist/sw.js does not list ${p}.`);
  for (const p of listed) if (p !== '/' && !built.includes(p)) problems.push(`dist/sw.js lists ${p}, which was not built.`);
} catch {
  problems.push('dist/sw.js is missing or unreadable (npm run build writes it).');
}

if (problems.length > 0) {
  process.stderr.write(`Build check failed:\n- ${problems.join('\n- ')}\n`);
  process.exit(1);
}
process.stdout.write('Build check passed: CSP present, no inline scripts, no other origins.\n');

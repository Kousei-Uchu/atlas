// Writes dist/sw.js after the build (M6-04): a version, the list of built files, and the worker body.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dist = 'dist';
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(full);
  }
};
walk(dist);

const paths = files
  .map((f) => `/${relative(dist, f).split(sep).join('/')}`)
  .filter((p) => p !== '/sw.js' && !p.endsWith('.map'));

const hash = createHash('sha256');
for (const p of paths) { hash.update(p); hash.update(readFileSync(join(dist, p))); }
const version = hash.digest('hex').slice(0, 12);

const precache = ['/', ...paths];
const body = readFileSync('src/sw/worker.js', 'utf8');
writeFileSync(join(dist, 'sw.js'), `const VERSION = ${JSON.stringify(version)};\nconst PRECACHE = ${JSON.stringify(precache)};\n${body}`);
process.stdout.write(`Wrote dist/sw.js (version ${version}, ${precache.length} files).\n`);

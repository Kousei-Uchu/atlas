// M6-05: the privacy copy rules, checked against every fixed sentence the app shows (D-060).
// The rules are in docs/PRIVACY_COPY_REVIEW.md. A sentence that breaks one is a failure, not a style note.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as notices from '../../src/content/notices.js';
import { ABOUT_SECTIONS, ABOUT_TITLE } from '../../src/content/about.js';

const fixed = [
  ...Object.values(notices).flatMap((v) => (typeof v === 'string' ? [v] : typeof v === 'object' ? Object.values(v).filter((x) => typeof x === 'string') : [])),
  ABOUT_TITLE,
  ...ABOUT_SECTIONS.flatMap((s) => [s.heading, ...s.body]),
];

// Promises the app cannot keep. "not encrypted" and "private browsing" are fine; claims are not.
const OVERCLAIMS = [
  /\b(100%|guarantee[sd]?|completely|totally|fully|absolutely|bank-level|military|unhackable|impossible)\b/i,
  /\b(anonymous|anonymously|confidential|confidentially)\b/i,
  /\b(secure|securely|security)\b(?<!not secure)/i,
  /\b(safe|safely)\b/i,
  /\b(protect|protects|protected|protection)\b/i,
  /\b(forever|permanently safe|nobody can|no one can)\b/i,
];

describe('fixed sentences make no promise the app cannot keep', () => {
  it('has sentences to check', () => expect(fixed.length).toBeGreaterThan(20));
  for (const text of fixed) {
    it(text.slice(0, 70), () => {
      for (const rule of OVERCLAIMS) {
        // The delete notice says "permanently removes", which is a plain description of an action, so it is allowed.
        expect(text.replace(/permanently removes/g, '')).not.toMatch(rule);
      }
      // "private" only appears as the browser mode, never as a claim about the Atlas.
      expect(text.replace(/private browsing/gi, '')).not.toMatch(/\bprivate(ly)?\b/i);
    });
  }
});

describe('the data-handling page says each true thing it must', () => {
  const all = ABOUT_SECTIONS.flatMap((s) => s.body).join(' ');
  it.each([
    ['charts stay on this device', /stored in this browser, on this device/],
    ['no account and no server', /no account and no server/],
    ['no upload and no analytics', /does not upload anything, and it has no analytics/],
    ['the host sees a page load, not charts', /host of this page can see that the page was loaded/],
    ['the fragment is not sent', /after the # stays in your browser/],
    ['offline files are kept', /own files .* are also kept on this device/],
    ['links are readable by anyone and not encrypted', /Anyone who has it can read it\. It is not encrypted/],
    ['backups are not encrypted', /full backup holds everything[^]*It is not encrypted/],
    ['delete cannot reach copies made already', /cannot reach backup files, exports or links/],
    ['not consent', /not permission, and it does not replace asking/],
    ['browser data can vanish and others may read it', /Clearing browser data[^.]*\. ?|other people who use this browser profile may be able to read them/],
  ])('%s', (_name, pattern) => expect(all).toMatch(pattern));

  it('headings are unique and every section has text', () => {
    const headings = ABOUT_SECTIONS.map((s) => s.heading);
    expect(new Set(headings).size).toBe(headings.length);
    for (const s of ABOUT_SECTIONS) expect(s.body.length).toBeGreaterThan(0);
  });
});

describe('no other file under src makes a privacy claim in on-screen text', () => {
  function* files(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) yield* files(path);
      else if (/\.(jsx?)$/.test(name)) yield path;
    }
  }
  const skip = (path) => path.includes(join('src', 'content', 'templates')) || path.includes(join('src', 'content', 'about.js')) || path.includes(join('src', 'content', 'notices.js'));
  it('says notes, views and exports are "left out", never "private" or "safe"', () => {
    const hits = [];
    for (const file of files('src')) {
      if (skip(file)) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const text = line.replace(/\/\/.*$/, '').replace(/private browsing( modes)?/gi, '');
        if (/(['"`>])[^'"`<]*\b(stay(s)? private|is private|are private|kept private|is safe|are safe|is secure|are secure|safely stored)\b/i.test(text)) hits.push(`${file}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });
});

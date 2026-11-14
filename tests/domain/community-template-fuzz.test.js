// Seeded fuzz of the community template gate (M8-07 hardening): any mutation of a valid file either
// is refused with reasons or can be added and leaves a valid profile. Never throws, never loops.
import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { reviewCommunityTemplate, addCommunityTemplate } from '../../src/domain/community-template.js';
import { validateProfile } from '../../src/domain/validation.js';

const NOW = '2026-11-14T10:00:00.000Z';
const base = {
  templateId: 'my-group', version: 1, title: 'Our group', summary: 'Things we agreed to ask.',
  defaultVisibility: 'hidden', adultIntended: false, isSample: false, statement: 'preferences-not-consent',
  categories: [{ key: 'a', name: 'Ways we talk', sensitivity: 'normal', items: [{ key: 'a-1', label: 'A voice message' }, { key: 'a-2', type: 'text', label: 'Best time' }] }],
};
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const NASTY = ['', ' ', '‮', '​', 'https://x.io', 'a@b.co', '@me', '+61 400 000 000', '<b>', '](x)', '__proto__', 'constructor', '😀', 'é'.repeat(300), 'x'.repeat(5000), null, 0, -1, 2 ** 60, true, [], {}, [[]], { a: { b: { c: {} } } }];

function mutate(value, rand, depth = 0) {
  const copy = JSON.parse(JSON.stringify(value));
  const paths = [];
  (function walk(v, path) {
    if (v && typeof v === 'object') for (const k of Object.keys(v)) { paths.push([...path, k]); walk(v[k], [...path, k]); }
  }(copy, []));
  const steps = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < steps; i += 1) {
    const path = paths[Math.floor(rand() * paths.length)];
    let cursor = copy;
    for (const k of path.slice(0, -1)) cursor = cursor?.[k];
    if (cursor === undefined || cursor === null || typeof cursor !== 'object') continue;
    const last = path[path.length - 1];
    const r = rand();
    if (r < 0.2) delete cursor[last];
    else if (r < 0.3) cursor[`extra${i}`] = NASTY[Math.floor(rand() * NASTY.length)];
    else cursor[last] = NASTY[Math.floor(rand() * NASTY.length)];
  }
  return depth > 0 ? mutate(copy, rand, depth - 1) : copy;
}

describe('community template gate under mutation', () => {
  it('never throws; every accepted file adds cleanly to a valid profile; refusals carry reasons', () => {
    const rand = rng(20261114);
    let accepted = 0;
    let refused = 0;
    for (let n = 0; n < 6000; n += 1) {
      const text = JSON.stringify(mutate(base, rand, n % 3));
      let result;
      expect(() => { result = reviewCommunityTemplate(text); }, text.slice(0, 80)).not.toThrow();
      if (!result.ok) {
        refused += 1;
        expect(result.problems.length).toBeGreaterThan(0);
        for (const p of result.problems) expect(typeof p).toBe('string');
        continue;
      }
      accepted += 1;
      const p0 = createStarterProfile({ id: 'p1', title: 'T', now: NOW });
      let k = 0;
      const added = addCommunityTemplate(p0, { template: result.template, makeId: (x) => `${x}_f${String(++k).padStart(6, '0')}` }, NOW);
      expect(added.ok, added.error).toBe(true);
      expect(validateProfile(JSON.parse(JSON.stringify(added.profile))).ok).toBe(true);
      expect(added.profile.categories.filter((c) => c.origin === null && c.visibility !== 'hidden')).toEqual([]);
    }
    expect(accepted).toBeGreaterThan(20);
    expect(refused).toBeGreaterThan(50);
  });

  it('refuses structurally hostile text without throwing', () => {
    const deep = `${'['.repeat(5000)}${']'.repeat(5000)}`;
    for (const t of [deep, '{"a":'.repeat(500), '\u0000', '{"templateId":"x"', '"\\ud800"', '{"__proto__":{"polluted":true}}']) {
      expect(() => reviewCommunityTemplate(t)).not.toThrow();
      expect(reviewCommunityTemplate(t).ok).toBe(false);
    }
    expect({}.polluted).toBeUndefined();
  });
});

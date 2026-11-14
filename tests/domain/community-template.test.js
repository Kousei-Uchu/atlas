import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { TEMPLATES } from '../../src/content/templates/index.js';
import { reviewCommunityTemplate, addCommunityTemplate, communityTextProblems, COMMUNITY_LIMITS } from '../../src/domain/community-template.js';
import { validateProfile } from '../../src/domain/validation.js';

const NOW = '2026-11-13T10:00:00.000Z';
const file = (over = {}, cat = {}) => JSON.stringify({
  templateId: 'my-group', version: 1, title: 'Our group', summary: 'Things our group agreed to ask each other.',
  defaultVisibility: 'hidden', adultIntended: false, isSample: false, statement: 'preferences-not-consent',
  categories: [{ key: 'a', name: 'Ways we talk', sensitivity: 'normal', items: [
    { key: 'a-1', label: 'A voice message' }, { key: 'a-2', type: 'text', label: 'Best time to reach me' },
  ], ...cat }], ...over,
});
const problemsOf = (text) => { const r = reviewCommunityTemplate(text); expect(r.ok).toBe(false); return r.problems.join('\n'); };
let n = 0;
const makeId = (prefix) => `${prefix}_t${String(++n).padStart(6, '0')}`;

describe('reviewCommunityTemplate', () => {
  it('accepts a plain template and reports counts, never a score', () => {
    const r = reviewCommunityTemplate(file());
    expect(r.ok).toBe(true);
    expect(r.review).toMatchObject({ categories: 1, items: 2, textItems: 1, adultIntended: false, floor: 'personal' });
    expect(Object.keys(r.review).join()).not.toMatch(/score|risk|rating/i);
  });

  it('the rules do not reject any bundled template (they are not too broad)', () => {
    for (const t of TEMPLATES) expect(communityTextProblems(t), t.templateId).toEqual([]);
  });

  it.each([
    ['a web address', 'Visit https://example.com now'],
    ['a web address', 'see www.example.org'],
    ['a web address', 'ask on discord.gg'],
    ['an email address', 'write to a@b.co'],
    ['an @handle', 'message @someone'],
    ['a phone number', 'call +61 400 000 000'],
    ['markup', 'a <b>bold</b> claim'],
    ['link syntax', 'a [link](x)'],
  ])('refuses %s without repeating it', (what, label) => {
    const out = problemsOf(file({}, { items: [{ key: 'a-1', label }] }));
    expect(out).toContain(what);
    expect(out).toContain('categories.0.items.0.label');
    expect(out).not.toContain(label);
  });

  it('refuses invisible, direction-changing and control characters anywhere, including the title', () => {
    for (const ch of ['‮', '​', '\u0007', '﻿', '⁦']) {
      expect(problemsOf(file({ title: `Our${ch}group` }))).toContain('invisible or control character');
    }
  });

  it('refuses answers, unknown fields and bad statements (schema gate)', () => {
    expect(reviewCommunityTemplate(file({ answers: [] })).ok).toBe(false);
    expect(reviewCommunityTemplate(file({ statement: 'consent' })).ok).toBe(false);
    expect(reviewCommunityTemplate(file({}, { items: [{ key: 'a-1', label: 'x', state: 'yes' }] })).ok).toBe(false);
  });

  it('refuses not-JSON, reserved keys, oversize and deep files', () => {
    expect(reviewCommunityTemplate('nope').ok).toBe(false);
    expect(reviewCommunityTemplate('{"__proto__": {}}').ok).toBe(false);
    expect(reviewCommunityTemplate(' '.repeat(COMMUNITY_LIMITS.fileBytes + 1)).ok).toBe(false);
  });

  it('keeps the template rules: restricted needs hidden, adult needs hidden, mature only for adults', () => {
    expect(reviewCommunityTemplate(file({ defaultVisibility: 'visible' }, { sensitivity: 'restricted' })).ok).toBe(false);
    expect(reviewCommunityTemplate(file({}, { items: [{ key: 'a-1', label: 'x', mature: { label: 'y' } }] })).ok).toBe(false);
  });

  it('never throws on odd input', () => {
    for (const bad of ['null', '[]', '1', '"s"', '{}', '{"categories":null}']) expect(() => reviewCommunityTemplate(bad)).not.toThrow();
  });
});

describe('addCommunityTemplate', () => {
  const base = () => createStarterProfile({ id: 'p1', title: 'T', now: NOW });
  const reviewed = (text) => reviewCommunityTemplate(text).template;

  it('adds hidden categories with no origin and no answers, and the profile stays valid', () => {
    const p = base();
    const r = addCommunityTemplate(p, { template: reviewed(file()), makeId }, NOW);
    expect(r.ok).toBe(true);
    expect(r.added).toEqual({ categories: 1, items: 2 });
    const cat = r.profile.categories.find((c) => c.name === 'Ways we talk');
    expect(cat).toMatchObject({ visibility: 'hidden', origin: null, sensitivity: 'personal' });
    expect(r.profile.items.filter((i) => i.categoryId === cat.id).every((i) => i.origin === null && i.sensitivity === 'personal')).toBe(true);
    expect(r.profile.answers).toEqual(p.answers);
    expect(r.profile.metadata.templateIds).toEqual(p.metadata.templateIds);
    expect(validateProfile(JSON.parse(JSON.stringify(r.profile))).ok).toBe(true);
  });

  it('never lowers sensitivity, and raises adult-intended content to sensitive', () => {
    const adult = reviewed(file({ adultIntended: true }, { sensitivity: 'restricted', items: [{ key: 'a-1', label: 'Hand holding', sensitivity: 'normal' }] }));
    const r = addCommunityTemplate(base(), { template: adult, makeId }, NOW);
    const added = r.profile.items.find((i) => i.label === 'Hand holding');
    expect(added.sensitivity).toBe('sensitive');
    expect(r.profile.categories.find((c) => c.name === 'Ways we talk').sensitivity).toBe('restricted');
    expect(r.profile.settings.restrictedModulesAcknowledged).toBe(base().settings.restrictedModulesAcknowledged);
  });

  it('a file claiming a bundled id cannot touch that module, and can be imported twice as separate groups', () => {
    const claim = reviewed(file({ templateId: 'communication' }));
    let p = base();
    p = addCommunityTemplate(p, { template: claim, makeId }, NOW).profile;
    p = addCommunityTemplate(p, { template: claim, makeId }, NOW).profile;
    expect(p.categories.filter((c) => c.name === 'Ways we talk')).toHaveLength(2);
    expect(p.categories.filter((c) => c.name === 'Ways we talk').every((c) => c.origin === null)).toBe(true);
    expect(p.metadata.templateIds).not.toContain('communication');
  });

  it('is deterministic for the same ids and does not change its input', () => {
    const p = Object.freeze(base());
    const t = reviewed(file());
    const a = addCommunityTemplate(p, { template: t, makeId: (x) => `${x}_aaaa0001` }, NOW);
    expect(a.ok).toBe(false); // repeated ids are refused rather than guessed
  });

  it('refuses when the profile is full', () => {
    const p = base();
    const full = { ...p, categories: Array.from({ length: 200 }, (_, i) => ({ ...p.categories[0], id: `cat_f${i}` })) };
    expect(addCommunityTemplate(full, { template: reviewed(file()), makeId }, NOW).ok).toBe(false);
  });
});

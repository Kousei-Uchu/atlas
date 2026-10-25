import { describe, it, expect } from 'vitest';
import { createStarterProfile, createDefaultStates } from '../../src/domain/defaults.js';
import { parseJsonText, validateProfile } from '../../src/domain/validation.js';
import { LIMITS } from '../../src/domain/limits.js';
import { isValidId, newId } from '../../src/domain/ids.js';

const NOW = '2026-10-26T00:00:00.000Z';
const starter = () => createStarterProfile({ id: 'profile_test', now: NOW });
const clone = (v) => structuredClone(v);
const code = (result) => (result.ok ? 'ok' : result.error.code);

describe('starter profile', () => {
  it('is valid and has no answers, so everything is Unanswered (I-01)', () => {
    const result = validateProfile(starter());
    expect(result.ok).toBe(true);
    expect(result.profile.answers).toEqual([]);
  });
  it('does not share state between calls', () => {
    const a = createDefaultStates();
    a[0].label = 'Changed';
    expect(createDefaultStates()[0].label).toBe('No');
  });
});

describe('ids', () => {
  it('accepts and rejects the right shapes', () => {
    expect(isValidId('item_abc-1')).toBe(true);
    for (const bad of ['', '_x', 'a b', 'a/b', 'x'.repeat(81), 42, null]) expect(isValidId(bad)).toBe(false);
  });
  it('generates valid ids', () => {
    expect(isValidId(newId('item'))).toBe(true);
    expect(newId('item', () => 'abc')).toBe('item_abc');
  });
});

describe('hostile JSON (I-08, spec 10.2)', () => {
  it('rejects oversized text before parsing', () => {
    expect(code(parseJsonText('x'.repeat(11), { maxBytes: 10 }))).toBe('file-too-large');
  });
  it('rejects malformed JSON', () => {
    expect(code(parseJsonText('{not json'))).toBe('not-json');
  });
  it.each(['__proto__', 'constructor', 'prototype'])('rejects the key %s, even nested', (key) => {
    expect(code(parseJsonText(`{"a":[{"${key}":1}]}`))).toBe('forbidden-key');
  });
  it('rejects excess depth without overflowing the stack', () => {
    const deep = '['.repeat(50_000) + ']'.repeat(50_000);
    expect(code(parseJsonText(deep, { maxBytes: 1_000_000 }))).toMatch(/too-deep|not-json/);
    const moderate = '['.repeat(LIMITS.jsonDepth + 1) + ']'.repeat(LIMITS.jsonDepth + 1);
    expect(code(parseJsonText(moderate))).toBe('too-deep');
  });
  it('accepts ordinary JSON', () => {
    expect(parseJsonText('{"a":[1,2,{"b":null}]}')).toEqual({ ok: true, value: { a: [1, 2, { b: null }] } });
  });
});

describe('profile validation errors (I-14)', () => {
  it('rejects a newer schema version with an update message', () => {
    const p = starter();
    p.schemaVersion = 2;
    const r = validateProfile(p);
    expect(code(r)).toBe('newer-version');
    expect(r.error.message).toMatch(/Update the app/);
  });
  it('rejects unknown fields and names them', () => {
    const p = starter();
    p.surprise = true;
    p.items[0].extra = 1;
    const r = validateProfile(p);
    expect(code(r)).toBe('unknown-fields');
    expect(r.error.problems.join(' ')).toMatch(/surprise/);
    expect(r.error.problems.join(' ')).toMatch(/items\.0\.extra/);
  });
  it('rejects over-limit counts before schema validation', () => {
    const p = starter();
    p.items = Array.from({ length: LIMITS.items + 1 }, () => ({}));
    expect(code(validateProfile(p))).toBe('over-limit');
  });
  it('rejects schema problems', () => {
    const p = starter();
    p.states[0].color = 'red';
    expect(code(validateProfile(p))).toBe('schema-invalid');
    expect(code(validateProfile(null))).toBe('schema-invalid');
    expect(code(validateProfile([]))).toBe('schema-invalid');
  });
  it('does not mutate or repair its input', () => {
    const p = starter();
    p.items[0].categoryId = 'gone';
    const before = JSON.stringify(p);
    validateProfile(p);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('integrity (spec 5.7)', () => {
  const mutate = (fn) => { const p = clone(starter()); fn(p); return validateProfile(p); };
  const problemsOf = (r) => r.error.problems.join(' | ');

  it('rejects dangling references', () => {
    const r = mutate((p) => { p.items[0].categoryId = 'gone'; });
    expect(code(r)).toBe('integrity-invalid');
    expect(problemsOf(r)).toMatch(/missing category/);
    expect(problemsOf(mutate((p) => { p.answers.push({ itemId: 'gone', stateId: 'yes', noteShareable: false }); }))).toMatch(/missing item/);
    expect(problemsOf(mutate((p) => { p.answers.push({ itemId: 'starter_hug', stateId: 'gone', noteShareable: false }); }))).toMatch(/missing state/);
    expect(problemsOf(mutate((p) => { p.views.push({ id: 'v', name: 'V', audienceId: null, includedItemIds: ['gone'], includeSensitive: false, restrictedOptInItemIds: [], includeNotes: false, visualization: { type: 'matrix', options: {} } }); }))).toMatch(/missing item/);
  });
  it('rejects duplicate ids', () => {
    expect(problemsOf(mutate((p) => { p.items.push(clone(p.items[0])); }))).toMatch(/Duplicate item id/);
    expect(problemsOf(mutate((p) => { p.states.push(clone(p.states[0])); }))).toMatch(/Duplicate state id/);
    expect(problemsOf(mutate((p) => { p.answers.push({ itemId: 'starter_hug', stateId: 'yes', noteShareable: false }, { itemId: 'starter_hug', stateId: 'no', noteShareable: false }); }))).toMatch(/Duplicate answer id/);
  });
  it('rejects category loops, self-parents and excess depth', () => {
    expect(problemsOf(mutate((p) => { p.categories[0].parentId = p.categories[1].id; p.categories[1].parentId = p.categories[0].id; }))).toMatch(/loop/);
    expect(problemsOf(mutate((p) => { p.categories[0].parentId = p.categories[0].id; }))).toMatch(/loop/);
    const deep = mutate((p) => {
      const mk = (id, parentId) => ({ ...clone(p.categories[0]), id, parentId });
      p.categories = [mk('c1', null), mk('c2', 'c1'), mk('c3', 'c2'), mk('c4', 'c3')];
      p.items = [];
    });
    expect(problemsOf(deep)).toMatch(/deeper than 3/);
  });
  it('never stores Unanswered as an answer (I-01, D-012)', () => {
    expect(problemsOf(mutate((p) => { p.answers.push({ itemId: 'starter_hug', stateId: 'unanswered', noteShareable: false }); }))).toMatch(/absence of an answer/);
  });
  it('rejects empty answers and type mismatches', () => {
    expect(problemsOf(mutate((p) => { p.answers.push({ itemId: 'starter_hug', noteShareable: false }); }))).toMatch(/empty/);
    expect(problemsOf(mutate((p) => { p.answers.push({ itemId: 'starter_hug', text: 'hi', noteShareable: false }); }))).toMatch(/takes a state/);
  });
  it('accepts a note with no state, and a valid answer', () => {
    expect(mutate((p) => { p.answers.push({ itemId: 'starter_hug', note: 'Ask first', noteShareable: false }); }).ok).toBe(true);
    expect(mutate((p) => { p.answers.push({ itemId: 'starter_hug', stateId: 'yes', noteShareable: false }); }).ok).toBe(true);
  });
  it('protects the Unanswered state', () => {
    expect(code(mutate((p) => { p.states = p.states.filter((s) => s.id !== 'unanswered'); }))).toBe('integrity-invalid');
    expect(code(mutate((p) => { p.states.find((s) => s.id === 'unanswered').semantic = 'positive'; }))).toBe('integrity-invalid');
    expect(code(mutate((p) => { p.states.find((s) => s.id === 'unanswered').cycleOrder = null; }))).toBe('integrity-invalid');
    expect(code(mutate((p) => { p.states.find((s) => s.id === 'yes').cycleOrder = 40; }))).toBe('integrity-invalid');
  });
});

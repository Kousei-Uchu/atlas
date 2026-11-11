import { describe, expect, it } from 'vitest';
import { compareProfiles } from '../../src/domain/profile-compare.js';
import { addModule } from '../../src/domain/module-commands.js';
import { setItemState, setItemText } from '../../src/domain/commands.js';
import { getTemplate } from '../../src/content/templates/index.js';
import { createBlankProfile } from '../../src/domain/defaults.js';

const NOW = '2026-11-11T00:00:00.000Z';
const make = (id, ...modules) => {
  let p = createBlankProfile({ id, title: id, now: NOW });
  for (const m of modules) {
    const r = addModule(p, { template: getTemplate(m), visibility: 'visible', acknowledgeAdult: true }, NOW);
    expect(r.ok).toBe(true);
    p = r.profile;
  }
  return p;
};
const item = (p, key) => p.items.find((i) => i.origin?.key === key);
const set = (p, key, label) => {
  const r = setItemState(p, { itemId: item(p, key).id, stateId: p.states.find((s) => s.label === label).id }, NOW);
  expect(r.ok).toBe(true);
  return r.profile;
};

describe('compareProfiles', () => {
  const key = (p) => p.items.find((i) => i.type === 'state' && i.origin?.key).origin.key;

  it('has nothing to list for two charts with no answers', () => {
    const r = compareProfiles(make('a', 'personal-space'), make('b', 'personal-space'));
    expect(r).toMatchObject({ differences: [], same: 0, onlyInMine: 0, onlyInTheirs: 0 });
  });

  it('lists differences with both answers, counts the same, and ignores two Unanswered', () => {
    let a = make('a', 'personal-space');
    let b = make('b', 'personal-space');
    const k = key(a);
    const other = a.items.filter((i) => i.type === 'state' && i.origin?.key !== k)[0].origin.key;
    a = set(a, k, 'Yes'); b = set(b, k, 'No');
    a = set(a, other, 'Yes'); b = set(b, other, 'Yes');
    const r = compareProfiles(a, b);
    expect(r.differences).toHaveLength(1);
    expect(r.differences[0].mine.label).toBe('Yes');
    expect(r.differences[0].theirs.label).toBe('No');
    expect(r.same).toBe(1);
  });

  it('shows Unanswered against an answer as a difference, never as a match', () => {
    let a = make('a', 'personal-space');
    const b = make('b', 'personal-space');
    a = set(a, key(a), 'Yes');
    const r = compareProfiles(a, b);
    expect(r.differences).toHaveLength(1);
    expect(r.differences[0].theirs.isUnanswered).toBe(true);
    expect(r.same).toBe(0);
  });

  it('counts answered questions only one chart has, and never reads own words or notes', () => {
    let a = make('a', 'personal-space', 'overwhelm-plan');
    const b = make('b', 'personal-space');
    a = set(a, 'others-ask', 'Yes');
    a = setItemText(a, { itemId: item(a, 'signs-feel').id, text: 'secret words' }, NOW).profile;
    const r = compareProfiles(a, b);
    expect(r.onlyInMine).toBe(1);
    expect(r.onlyInTheirs).toBe(0);
    expect(JSON.stringify(r)).not.toContain('secret words');
  });

  it('leaves hidden groups out of both sides, and counts own questions as not comparable', () => {
    let a = make('a', 'personal-space');
    let b = make('b', 'personal-space');
    a = set(a, key(a), 'Yes'); b = set(b, key(b), 'No');
    const hidden = { ...b, categories: b.categories.map((c) => ({ ...c, visibility: 'hidden' })) };
    expect(compareProfiles(a, hidden).differences).toEqual([]);
    const custom = { ...a, items: [...a.items, { ...a.items.find((i) => i.type === 'state'), id: 'item_custom', origin: undefined }] };
    expect(compareProfiles(custom, b).notComparable).toBe(1);
  });

  it('is symmetric in what it finds, does not change either profile and has no verdict wording', () => {
    let a = make('a', 'personal-space'); let b = make('b', 'personal-space');
    a = set(a, key(a), 'Yes'); b = set(b, key(b), 'No');
    const before = JSON.stringify([a, b]);
    const ab = compareProfiles(a, b); const ba = compareProfiles(b, a);
    expect(ab.differences.map((d) => d.key)).toEqual(ba.differences.map((d) => d.key));
    expect(JSON.stringify([a, b])).toBe(before);
    expect(Object.keys(ab).join()).not.toMatch(/score|match|compat|percent|total/i);
  });
});

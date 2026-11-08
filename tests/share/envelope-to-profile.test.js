import { describe, it, expect } from 'vitest';
import { profileFromEnvelope } from '../../src/share/envelope-to-profile.js';
import { checkEnvelope } from '../../src/share/envelope.js';
import { validateProfile } from '../../src/domain/validation.js';
import { CONSENT_NOTICE } from '../../src/content/notices.js';
import { LIMITS } from '../../src/domain/limits.js';

const NOW = '2026-11-06T10:00:00.000Z';
let counter = 0;
const makeId = (prefix) => { counter += 1; return `${prefix}_t${counter}`; };
const YES = { label: 'Yes', description: 'Generally comfortable with this.', icon: 'check', pattern: 'solid', color: '#1B5E20', textColor: '#FFFFFF', semantic: 'positive' };
const OWN = { label: 'Only on Tuesdays', description: '', icon: 'star', pattern: 'dots', color: '#FFEEAA', textColor: '#222222', semantic: 'conditional' };
const envelope = (extra = {}) => {
  const r = checkEnvelope({
    format: 'atlas-share', title: 'Guide for friends', createdAt: NOW, includesNotes: true, statement: CONSENT_NOTICE, states: [YES, OWN],
    groups: [
      { name: 'Contact', items: [
        { label: 'A hug', kind: 'state', state: 0, text: null, note: 'At greetings' },
        { label: 'A wave', kind: 'state', state: 1, text: null, note: null },
      ] },
      { name: 'Words', items: [{ label: 'How to ask', kind: 'text', state: null, text: 'Ask first', note: null }] },
    ],
    ...extra,
  });
  expect(r.ok, JSON.stringify(r.problems)).toBe(true);
  return r.envelope;
};
const build = (e = envelope()) => { const r = profileFromEnvelope(e, { id: 'profile_copy', now: NOW, makeId }); expect(r.ok, r.error).toBe(true); return r.profile; };

describe('a shared chart saved as a copy (D-016, I-12)', () => {
  it('is a valid new profile with the chart in it and nothing else', () => {
    const p = build();
    expect(validateProfile(p).ok).toBe(true);
    expect(p).toMatchObject({ id: 'profile_copy', revision: 0, title: 'Shared: Guide for friends', createdAt: NOW, audiences: [], overrides: [], views: [] });
    expect(p.categories.map((c) => c.name)).toEqual(['Contact', 'Words']);
    expect(p.items.map((i) => i.label)).toEqual(['A hug', 'A wave', 'How to ask']);
    expect(p.description).toMatch(/not permission/);
  });

  it('keeps each answer, and keeps text and notes, without making a note shareable', () => {
    const p = build();
    const byLabel = (label) => p.answers.find((a) => a.itemId === p.items.find((i) => i.label === label).id);
    expect(byLabel('A hug')).toMatchObject({ stateId: 'yes', note: 'At greetings', noteShareable: false });
    expect(byLabel('A wave').stateId).toMatch(/^shared_/);
    expect(byLabel('How to ask')).toMatchObject({ text: 'Ask first', noteShareable: false });
  });

  it('reuses a built-in state when it is exactly that one, and adds the chart\'s own otherwise', () => {
    const p = build();
    expect(p.states.filter((s) => s.id === 'yes')).toHaveLength(1);
    const own = p.states.find((s) => s.label === 'Only on Tuesdays');
    expect(own).toMatchObject({ icon: 'star', pattern: 'dots', color: '#FFEEAA', isSelectable: true, isUnanswered: false });
    expect(p.states.some((s) => s.isUnanswered)).toBe(true); // Unanswered always exists (I-01)
  });

  it('does not treat a look-alike as the built-in state', () => {
    const p = build(envelope({ states: [{ ...YES, color: '#000001' }, OWN] }));
    expect(p.states.filter((s) => s.label === 'Yes')).toHaveLength(2);
  });

  it('marks categories personal, items normal, and gives no origin, so nothing is updated from a template', () => {
    const p = build();
    expect(new Set(p.categories.map((c) => c.sensitivity))).toEqual(new Set(['personal']));
    expect(p.items.every((i) => i.origin === null && i.sensitivity === 'normal')).toBe(true);
    expect(p.metadata.templateIds).toEqual([]);
  });

  it('stays within the state limit with a full set of states', () => {
    const many = Array.from({ length: LIMITS.states }, (_, i) => ({ ...OWN, label: `State ${i}`, color: `#0000${(i + 16).toString(16).padStart(2, '0')}` }));
    const e = envelope({ states: many, groups: [{ name: 'G', items: many.map((_, i) => ({ label: `I${i}`, kind: 'state', state: i, text: null, note: null })) }] });
    const p = build(e);
    expect(p.states.length).toBeLessThanOrEqual(LIMITS.states);
    expect(p.states.some((s) => s.isUnanswered)).toBe(true);
    // The last state did not fit: its answer is Unanswered, never a yes, and the profile says so.
    expect(p.answers.some((a) => a.itemId === p.items[LIMITS.states - 1].id)).toBe(false);
    expect(p.answers).toHaveLength(LIMITS.states - 1);
    expect(p.description).toMatch(/1 of its states could not be kept/);
  });

  it('cuts long names to fit and never changes the envelope', () => {
    const e = envelope({ title: 'T'.repeat(LIMITS.titleLength), groups: [{ name: 'N'.repeat(300), items: [{ label: 'x', kind: 'text', state: null, text: '', note: null }] }] });
    const before = JSON.stringify(e);
    const p = build(e);
    expect(p.title.length).toBeLessThanOrEqual(LIMITS.titleLength);
    expect(p.categories[0].name.length).toBeLessThanOrEqual(LIMITS.categoryNameLength);
    expect(JSON.stringify(e)).toBe(before);
  });
});

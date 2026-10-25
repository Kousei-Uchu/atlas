import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { validateProfile } from '../../src/domain/validation.js';
import * as cmd from '../../src/domain/commands.js';
import * as pal from '../../src/domain/palette-commands.js';
import { effectiveStateId, getAnswer, stateUsage } from '../../src/domain/selectors.js';
import { getCycle, getNextState } from '../../src/domain/state-cycle.js';
import { LIMITS } from '../../src/domain/limits.js';

const T0 = '2026-10-26T00:00:00.000Z';
const T1 = '2026-10-26T01:00:00.000Z';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
const fresh = () => deepFreeze(createStarterProfile({ id: 'profile_test', now: T0 }));
const mustBeValid = (result) => {
  expect(result.ok, JSON.stringify(result)).toBe(true);
  const v = validateProfile(result.profile);
  expect(v.ok, v.ok ? '' : v.error.problems.join('; ')).toBe(true);
  return deepFreeze(result.profile);
};
const cycleIds = (p) => getCycle([...p.states]).map((s) => s.id);
const answer = (p, itemId, stateId) => mustBeValid(cmd.setItemState(p, { itemId, stateId }, T1));

describe('updateState (I-03)', () => {
  it('renames and recolours without touching any answer', () => {
    const p = answer(fresh(), 'starter_hug', 'yes');
    const r = mustBeValid(pal.updateState(p, { id: 'yes', changes: { label: 'Happy to', color: '#00ff00', textColor: '#000000', icon: 'heart', pattern: 'dots' } }, T1));
    const yes = r.states.find((s) => s.id === 'yes');
    expect(yes).toMatchObject({ label: 'Happy to', color: '#00FF00', textColor: '#000000', icon: 'heart', pattern: 'dots' });
    expect(r.answers).toBe(p.answers);
    expect(effectiveStateId(r, 'starter_hug')).toBe('yes');
    expect(r.updatedAt).toBe(T1);
    expect(r.revision).toBe(0);
  });
  it('is a no-op (same reference) when nothing changes', () => {
    const p = fresh();
    expect(pal.updateState(p, { id: 'yes', changes: { label: 'Yes' } }, T1).profile).toBe(p);
  });
  it('rejects empty, over-long and duplicate names, so states stay distinguishable without colour (I-09)', () => {
    const p = fresh();
    expect(pal.updateState(p, { id: 'yes', changes: { label: '   ' } }, T1).ok).toBe(false);
    expect(pal.updateState(p, { id: 'yes', changes: { label: 'x'.repeat(LIMITS.stateLabelLength + 1) } }, T1).ok).toBe(false);
    expect(pal.updateState(p, { id: 'yes', changes: { label: ' no ' } }, T1).ok).toBe(false);
  });
  it('rejects bad colours, icons, patterns, meanings, unknown fields and unknown states', () => {
    const p = fresh();
    for (const changes of [{ color: 'red' }, { color: '#12345' }, { textColor: 5 }, { icon: 'skull' }, { pattern: 'plaid' }, { semantic: 'great' }, { cycleOrder: 5 }, { isSystem: true }, { description: 'x'.repeat(301) }]) {
      expect(pal.updateState(p, { id: 'yes', changes }, T1).ok, JSON.stringify(changes)).toBe(false);
    }
    expect(pal.updateState(p, { id: 'ghost', changes: { label: 'X' } }, T1).ok).toBe(false);
  });
  it('lets Unanswered be restyled but never changes its meaning', () => {
    const p = fresh();
    const r = mustBeValid(pal.updateState(p, { id: 'unanswered', changes: { color: '#EEEEEE', label: 'No answer yet' } }, T1));
    expect(r.states.find((s) => s.id === 'unanswered')).toMatchObject({ label: 'No answer yet', semantic: 'neutral', isUnanswered: true });
    expect(pal.updateState(p, { id: 'unanswered', changes: { semantic: 'positive' } }, T1).ok).toBe(false);
  });
  it('allows a custom state to change meaning', () => {
    let p = mustBeValid(pal.addState(fresh(), { id: 'maybe', label: 'Maybe', semantic: 'uncertain' }, T1));
    p = mustBeValid(pal.updateState(p, { id: 'maybe', changes: { semantic: 'conditional' } }, T1));
    expect(p.states.find((s) => s.id === 'maybe').semantic).toBe('conditional');
  });
});

describe('addState', () => {
  it('adds a picker-only state by default and does not touch the cycle or any answer (I-01)', () => {
    const p = fresh();
    const r = mustBeValid(pal.addState(p, { id: 'ask', label: 'Ask me', semantic: 'conditional', color: '#abcdef', icon: 'star' }, T1));
    expect(r.states.at(-1)).toMatchObject({ id: 'ask', label: 'Ask me', color: '#ABCDEF', cycleOrder: null, isSystem: false, isUnanswered: false, isSelectable: true, pattern: 'solid' });
    expect(cycleIds(r)).toEqual(cycleIds(p));
    expect(r.answers).toBe(p.answers);
    expect(effectiveStateId(r, 'starter_hug')).toBe('unanswered');
  });
  it('can join the end of the cycle', () => {
    const r = mustBeValid(pal.addState(fresh(), { id: 'love', label: 'Love it', semantic: 'positive', inCycle: true }, T1));
    expect(cycleIds(r)).toEqual(['no', 'unsure', 'unanswered', 'conditional', 'yes', 'love']);
  });
  it('rejects duplicate ids and names, bad ids, and the state limit', () => {
    const p = fresh();
    expect(pal.addState(p, { id: 'yes', label: 'Other', semantic: 'neutral' }, T1).ok).toBe(false);
    expect(pal.addState(p, { id: 'bad id', label: 'Other', semantic: 'neutral' }, T1).ok).toBe(false);
    expect(pal.addState(p, { id: 'dup', label: 'YES', semantic: 'neutral' }, T1).ok).toBe(false);
    expect(pal.addState(p, { id: 'blank', label: '', semantic: 'neutral' }, T1).ok).toBe(false);
    const full = deepFreeze({ ...p, states: [...p.states, ...Array.from({ length: LIMITS.states - p.states.length }, (_, i) => ({ ...p.states[0], id: `s${i}`, label: `S${i}`, cycleOrder: null }))] });
    expect(full.states).toHaveLength(LIMITS.states);
    expect(pal.addState(full, { id: 'extra', label: 'Extra', semantic: 'neutral' }, T1).ok).toBe(false);
  });
});

describe('cycle membership and order (D-006)', () => {
  it('moves a state earlier and later by swapping with its neighbour', () => {
    let p = mustBeValid(pal.moveStateInCycle(fresh(), { id: 'yes', direction: 'earlier' }, T1));
    expect(cycleIds(p)).toEqual(['no', 'unsure', 'unanswered', 'yes', 'conditional']);
    p = mustBeValid(pal.moveStateInCycle(p, { id: 'no', direction: 'later' }, T1));
    expect(cycleIds(p)).toEqual(['unsure', 'no', 'unanswered', 'yes', 'conditional']);
  });
  it('does nothing at either end', () => {
    const p = fresh();
    expect(pal.moveStateInCycle(p, { id: 'no', direction: 'earlier' }, T1)).toMatchObject({ ok: true, moved: false, profile: p });
    expect(pal.moveStateInCycle(p, { id: 'yes', direction: 'later' }, T1)).toMatchObject({ ok: true, moved: false, profile: p });
  });
  it('lets Unanswered move, and the cycle then follows the new order (stepping uses the order, not the labels)', () => {
    let p = mustBeValid(pal.moveStateInCycle(fresh(), { id: 'unanswered', direction: 'later' }, T1));
    expect(cycleIds(p)).toEqual(['no', 'unsure', 'conditional', 'unanswered', 'yes']);
    // From Unanswered, one positive step is now Yes, but it is still exactly one step.
    expect(getNextState('unanswered', p.states, 'positive', { endBehaviour: 'clamp' })).toMatchObject({ ok: true, stateId: 'yes' });
    p = answer(p, 'starter_hug', 'conditional');
    expect(mustBeValid(cmd.stepItemState(p, { itemId: 'starter_hug', action: 'secondary' }, T1)).answers).toEqual([]);
  });
  it('rejects bad directions and states that are not in the cycle', () => {
    const p = fresh();
    expect(pal.moveStateInCycle(p, { id: 'yes', direction: 'up' }, T1).ok).toBe(false);
    expect(pal.moveStateInCycle(p, { id: 'not-applicable', direction: 'later' }, T1).ok).toBe(false);
    expect(pal.moveStateInCycle(p, { id: 'ghost', direction: 'later' }, T1).ok).toBe(false);
  });
  it('adds a state to the cycle at the end, and takes it out again', () => {
    let p = mustBeValid(pal.setStateInCycle(fresh(), { id: 'not-applicable', inCycle: true }, T1));
    expect(cycleIds(p)).toEqual(['no', 'unsure', 'unanswered', 'conditional', 'yes', 'not-applicable']);
    p = mustBeValid(pal.setStateInCycle(p, { id: 'yes', inCycle: false }, T1));
    expect(cycleIds(p)).toEqual(['no', 'unsure', 'unanswered', 'conditional', 'not-applicable']);
    expect(p.states.find((s) => s.id === 'yes').cycleOrder).toBeNull();
  });
  it('never removes Unanswered from the cycle', () => {
    expect(pal.setStateInCycle(fresh(), { id: 'unanswered', inCycle: false }, T1).ok).toBe(false);
  });
  it('an answer held by a state taken out of the cycle is kept, and a click leaves it for Unanswered (D-007)', () => {
    let p = answer(fresh(), 'starter_hug', 'yes');
    p = mustBeValid(pal.setStateInCycle(p, { id: 'yes', inCycle: false }, T1));
    expect(effectiveStateId(p, 'starter_hug')).toBe('yes');
    const r = mustBeValid(cmd.stepItemState(p, { itemId: 'starter_hug', action: 'secondary' }, T1));
    expect(effectiveStateId(r, 'starter_hug')).toBe('unanswered');
  });
  it('ordering and membership are no-ops when nothing changes', () => {
    const p = fresh();
    expect(pal.setStateInCycle(p, { id: 'yes', inCycle: true }, T1).profile).toBe(p);
  });
});

describe('removeState: clear or reassign', () => {
  const withMaybe = () => {
    let p = mustBeValid(pal.addState(fresh(), { id: 'maybe', label: 'Maybe', semantic: 'uncertain', inCycle: true }, T1));
    p = answer(p, 'starter_hug', 'maybe');
    p = answer(p, 'starter_call', 'maybe');
    p = mustBeValid(cmd.setItemNote(p, { itemId: 'starter_call', note: 'Only after lunch' }, T1));
    return p;
  };

  it('reports how many answers and overrides depend on a state', () => {
    expect(stateUsage(withMaybe(), 'maybe')).toEqual({ answers: 2, overrides: 0 });
  });
  it('clearing makes those items Unanswered, drops empty records and keeps notes', () => {
    const r = pal.removeState(withMaybe(), { id: 'maybe', replacementId: null }, T1);
    const p = mustBeValid(r);
    expect(r).toMatchObject({ affectedAnswers: 2, affectedOverrides: 0 });
    expect(p.states.some((s) => s.id === 'maybe')).toBe(false);
    expect(effectiveStateId(p, 'starter_hug')).toBe('unanswered');
    expect(getAnswer(p, 'starter_hug')).toBeNull();
    expect(getAnswer(p, 'starter_call')).toEqual({ itemId: 'starter_call', note: 'Only after lunch', noteShareable: false });
  });
  it('reassigns to a state that is not more permissive', () => {
    const p = mustBeValid(pal.removeState(withMaybe(), { id: 'maybe', replacementId: 'no' }, T1));
    expect(effectiveStateId(p, 'starter_hug')).toBe('no');
    expect(effectiveStateId(p, 'starter_call')).toBe('no');
    expect(getAnswer(p, 'starter_call').note).toBe('Only after lunch');
  });
  it('refuses to reassign to a more permissive state, so a removal can never create a Yes (I-01)', () => {
    const before = withMaybe();
    for (const replacementId of ['yes', 'conditional']) {
      const r = pal.removeState(before, { id: 'maybe', replacementId }, T1);
      expect(r.ok, replacementId).toBe(false);
      expect(r.error).toMatch(/more permissive/);
    }
  });
  it('allows any replacement when nothing uses the state', () => {
    const p = mustBeValid(pal.addState(fresh(), { id: 'maybe', label: 'Maybe', semantic: 'negative' }, T1));
    expect(pal.removeState(p, { id: 'maybe', replacementId: 'yes' }, T1).ok).toBe(true);
  });
  it('rejects built-in states, unknown states, self or unanswered as a replacement, and unselectable replacements', () => {
    const p = withMaybe();
    expect(pal.removeState(p, { id: 'unanswered', replacementId: null }, T1).ok).toBe(false);
    expect(pal.removeState(p, { id: 'ghost', replacementId: null }, T1).ok).toBe(false);
    expect(pal.removeState(p, { id: 'maybe', replacementId: 'maybe' }, T1).ok).toBe(false);
    expect(pal.removeState(p, { id: 'maybe', replacementId: 'unanswered' }, T1).ok).toBe(false);
    expect(pal.removeState(p, { id: 'maybe', replacementId: 'ghost' }, T1).ok).toBe(false);
    const locked = deepFreeze({ ...p, states: p.states.map((s) => (s.id === 'no' ? { ...s, isSelectable: false } : s)) });
    expect(pal.removeState(locked, { id: 'maybe', replacementId: 'no' }, T1).ok).toBe(false);
  });
  it('overrides follow the same choice: reassigned, or deleted when cleared (I-04 stays intact)', () => {
    let p = mustBeValid(pal.addState(fresh(), { id: 'maybe', label: 'Maybe', semantic: 'uncertain' }, T1));
    p = answer(p, 'starter_hug', 'yes');
    p = deepFreeze({
      ...p,
      audiences: [{ id: 'aud', name: 'Friends', type: 'friends', description: '', parentId: null }],
      overrides: [{ id: 'ov', itemId: 'starter_hug', audienceId: 'aud', stateId: 'maybe', enabled: true, explanation: '' }],
    });
    expect(validateProfile(p).ok).toBe(true);
    expect(stateUsage(p, 'maybe')).toEqual({ answers: 0, overrides: 1 });
    const cleared = mustBeValid(pal.removeState(p, { id: 'maybe', replacementId: null }, T1));
    expect(cleared.overrides).toEqual([]);
    expect(effectiveStateId(cleared, 'starter_hug')).toBe('yes'); // the default answer is untouched
    const moved = mustBeValid(pal.removeState(p, { id: 'maybe', replacementId: 'no' }, T1));
    expect(moved.overrides[0].stateId).toBe('no');
  });
  it('leaves an in-cycle state out of the cycle once removed, and the rest still steps normally', () => {
    const p = mustBeValid(pal.removeState(withMaybe(), { id: 'maybe', replacementId: null }, T1));
    expect(cycleIds(p)).toEqual(['no', 'unsure', 'unanswered', 'conditional', 'yes']);
  });
});

describe('removalReplacements', () => {
  const ids = (p, id) => pal.removalReplacements(p, id).map((s) => s.id);
  it('offers only states that are not more permissive, never Unanswered or the state itself', () => {
    const p = mustBeValid(pal.addState(fresh(), { id: 'maybe', label: 'Maybe', semantic: 'uncertain' }, T1));
    expect(ids(p, 'maybe')).toEqual(['no', 'unsure', 'not-applicable']);
    expect(ids(p, 'conditional')).toEqual(['no', 'unsure', 'not-applicable', 'maybe']); // Maybe is uncertain, so no more permissive
    expect(ids(p, 'yes')).toEqual(['no', 'unsure', 'conditional', 'not-applicable', 'maybe']);
    expect(ids(p, 'no')).toEqual([]);
    expect(ids(p, 'ghost')).toEqual([]);
  });
  it('agrees with removeState: every offered state is accepted, every other one is refused', () => {
    let p = mustBeValid(pal.addState(fresh(), { id: 'maybe', label: 'Maybe', semantic: 'uncertain' }, T1));
    p = answer(p, 'starter_hug', 'maybe');
    const offered = new Set(ids(p, 'maybe'));
    for (const s of p.states.filter((x) => x.id !== 'maybe' && !x.isUnanswered)) {
      expect(pal.removeState(p, { id: 'maybe', replacementId: s.id }, T1).ok, s.id).toBe(offered.has(s.id));
    }
  });
});

describe('purity (I-05)', () => {
  it('never mutates its input (frozen profile) and keeps unrelated parts shared', () => {
    const p = fresh();
    const r = mustBeValid(pal.updateState(p, { id: 'yes', changes: { color: '#112233' } }, T1));
    expect(r.categories).toBe(p.categories);
    expect(r.items).toBe(p.items);
    expect(p.states.find((s) => s.id === 'yes').color).toBe('#1B5E20');
  });
});

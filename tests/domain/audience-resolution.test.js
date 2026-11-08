import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { addAudience, setOverride, setOverrideEnabled } from '../../src/domain/audience-commands.js';
import { setItemState } from '../../src/domain/commands.js';
import { resolveItem, resolveAll, listConflicts, explainResolution } from '../../src/domain/audience-resolution.js';

const NOW = '2026-10-26T10:00:00.000Z';
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };

function setup() {
  const p0 = createStarterProfile({ id: 'p1', title: 'T', now: NOW });
  const [a, b] = p0.items.filter((i) => i.type === 'state');
  let p = addAudience(p0, { id: 'aud_1', name: 'Partner', type: 'partner' }, NOW).profile;
  p = addAudience(p, { id: 'aud_2', name: 'Work', type: 'school-work' }, NOW).profile;
  return { p, a, b };
}
const answer = (p, itemId, stateId) => setItemState(p, { itemId, stateId }, NOW).profile;
const override = (p, id, itemId, audienceId, stateId, explanation = '') => setOverride(p, { id, itemId, audienceId, stateId, explanation }, NOW).profile;
const conflictOf = (p, itemId, audienceId, states) => ({
  ...p,
  overrides: [...p.overrides, ...states.map((stateId, i) => ({ id: `ov_c${i}`, itemId, audienceId, stateId, enabled: true, explanation: '' }))],
});

describe('resolveItem', () => {
  it('an item with no answer and no override resolves to Unanswered (I-01)', () => {
    const { p, a } = setup();
    const r = resolveItem(p, a.id, 'aud_1');
    expect(r).toMatchObject({ stateId: 'unanswered', defaultStateId: 'unanswered', source: 'unanswered', differs: false, moreOpenThanDefault: false });
  });

  it('uses the item\u2019s own answer when no override applies', () => {
    const { p, a } = setup();
    const r = resolveItem(answer(p, a.id, 'no'), a.id, 'aud_1');
    expect(r).toMatchObject({ stateId: 'no', source: 'answer', overrideId: null, differs: false });
  });

  it('an enabled override wins over the answer and says so', () => {
    const { p, a } = setup();
    const r = resolveItem(override(answer(p, a.id, 'yes'), 'ov_1', a.id, 'aud_1', 'no', 'Not with them'), a.id, 'aud_1');
    expect(r).toMatchObject({ stateId: 'no', defaultStateId: 'yes', source: 'override', overrideId: 'ov_1', explanation: 'Not with them', differs: true, moreOpenThanDefault: false });
  });

  it('flags an override that is more open than the default, but still honours it', () => {
    const { p, a } = setup();
    const r = resolveItem(override(answer(p, a.id, 'no'), 'ov_1', a.id, 'aud_1', 'yes'), a.id, 'aud_1');
    expect(r).toMatchObject({ stateId: 'yes', differs: true, moreOpenThanDefault: true });
  });

  it('an override over an unanswered item can be more open too', () => {
    const { p, a } = setup();
    expect(resolveItem(override(p, 'ov_1', a.id, 'aud_1', 'conditional'), a.id, 'aud_1').moreOpenThanDefault).toBe(true);
  });

  it('a disabled override is ignored', () => {
    const { p, a } = setup();
    const off = setOverrideEnabled(override(answer(p, a.id, 'no'), 'ov_1', a.id, 'aud_1', 'yes'), { id: 'ov_1', enabled: false }, NOW).profile;
    expect(resolveItem(off, a.id, 'aud_1')).toMatchObject({ stateId: 'no', source: 'answer' });
  });

  it('an override for one audience does not reach another, or the default', () => {
    const { p, a } = setup();
    const x = override(answer(p, a.id, 'no'), 'ov_1', a.id, 'aud_1', 'yes');
    expect(resolveItem(x, a.id, 'aud_2')).toMatchObject({ stateId: 'no', source: 'answer' });
    expect(resolveItem(x, a.id, null)).toMatchObject({ stateId: 'no', source: 'answer' });
  });

  it('a null audience is the default view and ignores every override', () => {
    const { p, a } = setup();
    const x = override(p, 'ov_1', a.id, 'aud_1', 'yes');
    expect(resolveItem(x, a.id, null)).toMatchObject({ stateId: 'unanswered', source: 'unanswered' });
  });

  it('an override to Unanswered shows Unanswered and is never more open', () => {
    const { p, a } = setup();
    const r = resolveItem(override(answer(p, a.id, 'yes'), 'ov_1', a.id, 'aud_1', 'unanswered'), a.id, 'aud_1');
    expect(r).toMatchObject({ stateId: 'unanswered', source: 'override', differs: true, moreOpenThanDefault: false });
  });

  it('an override that points at a missing state falls to Unanswered, never to a positive state (I-01)', () => {
    const { p, a } = setup();
    const broken = { ...p, overrides: [{ id: 'ov_1', itemId: a.id, audienceId: 'aud_1', stateId: 'gone', enabled: true, explanation: '' }] };
    // Over a default of Yes or Unsure it is no more open than the default.
    expect(resolveItem(answer(broken, a.id, 'yes'), a.id, 'aud_1')).toMatchObject({ stateId: 'unanswered', source: 'override', moreOpenThanDefault: false });
    expect(resolveItem(answer(broken, a.id, 'unsure'), a.id, 'aud_1')).toMatchObject({ stateId: 'unanswered', moreOpenThanDefault: false });
    // Unanswered ranks above No (the same ranking removeState uses), so over a No it is flagged,
    // but it is still never a positive state.
    const overNo = resolveItem(answer(broken, a.id, 'no'), a.id, 'aud_1');
    expect(overNo.stateId).toBe('unanswered');
    expect(overNo.moreOpenThanDefault).toBe(true);
  });

  it('an answer pointing at a missing state resolves to Unanswered (I-01)', () => {
    const { p, a } = setup();
    const broken = { ...p, answers: [{ itemId: a.id, stateId: 'gone', noteShareable: false }] };
    expect(resolveItem(broken, a.id, 'aud_1')).toMatchObject({ stateId: 'unanswered', source: 'unanswered' });
  });
});

describe('conflicts (D-013)', () => {
  it('two enabled overrides that disagree are a conflict: nothing is chosen, nothing is open', () => {
    const { p, a } = setup();
    const x = conflictOf(answer(p, a.id, 'no'), a.id, 'aud_1', ['yes', 'no']);
    const r = resolveItem(x, a.id, 'aud_1');
    expect(r).toMatchObject({ stateId: 'unanswered', source: 'conflict', overrideId: null, conflictOverrideIds: ['ov_c0', 'ov_c1'], moreOpenThanDefault: false });
  });

  it('the order of the overrides does not decide anything', () => {
    const { p, a } = setup();
    const one = resolveItem(conflictOf(p, a.id, 'aud_1', ['yes', 'no']), a.id, 'aud_1');
    const two = resolveItem(conflictOf(p, a.id, 'aud_1', ['no', 'yes']), a.id, 'aud_1');
    expect(one.stateId).toBe(two.stateId);
    expect(one.source).toBe(two.source);
  });

  it('two enabled overrides that agree are not a conflict', () => {
    const { p, a } = setup();
    const x = conflictOf(p, a.id, 'aud_1', ['no', 'no']);
    expect(resolveItem(x, a.id, 'aud_1')).toMatchObject({ stateId: 'no', source: 'override', overrideId: 'ov_c0' });
    expect(listConflicts(x)).toEqual([]);
  });

  it('a disabled duplicate does not make a conflict', () => {
    const { p, a } = setup();
    const x = conflictOf(p, a.id, 'aud_1', ['yes', 'no']);
    const off = { ...x, overrides: x.overrides.map((o) => (o.id === 'ov_c1' ? { ...o, enabled: false } : o)) };
    expect(resolveItem(off, a.id, 'aud_1')).toMatchObject({ stateId: 'yes', source: 'override' });
    expect(listConflicts(off)).toEqual([]);
  });

  it('lists every conflict in a stable order', () => {
    const { p, a, b } = setup();
    let x = conflictOf(p, b.id, 'aud_2', ['yes', 'no']);
    x = { ...x, overrides: [...x.overrides, { id: 'ov_z0', itemId: a.id, audienceId: 'aud_1', stateId: 'yes', enabled: true, explanation: '' }, { id: 'ov_z1', itemId: a.id, audienceId: 'aud_1', stateId: 'conditional', enabled: true, explanation: '' }] };
    const found = listConflicts(x);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ itemId: a.id, audienceId: 'aud_1', overrideIds: ['ov_z0', 'ov_z1'], stateIds: ['conditional', 'yes'] });
    expect(found[1]).toMatchObject({ itemId: b.id, audienceId: 'aud_2' });
  });

  it('setting one override for the pair clears the conflict', () => {
    const { p, a } = setup();
    const fixed = setOverride(conflictOf(p, a.id, 'aud_1', ['yes', 'no']), { id: 'ov_n', itemId: a.id, audienceId: 'aud_1', stateId: 'no' }, NOW).profile;
    expect(listConflicts(fixed)).toEqual([]);
    expect(resolveItem(fixed, a.id, 'aud_1')).toMatchObject({ stateId: 'no', source: 'override' });
  });
});

describe('resolveAll', () => {
  it('covers every state item in item order, and skips text items', () => {
    const { p, a } = setup();
    const withText = { ...p, items: [...p.items, { ...a, id: 'txt', type: 'text' }] };
    const all = resolveAll(withText, 'aud_1');
    expect(all.map((r) => r.itemId)).toEqual(withText.items.filter((i) => i.type === 'state').map((i) => i.id));
    expect(all.every((r) => r.audienceId === 'aud_1')).toBe(true);
  });

  it('agrees with resolveItem for every item', () => {
    const { p, a, b } = setup();
    const x = override(override(answer(p, a.id, 'yes'), 'ov_1', a.id, 'aud_1', 'no'), 'ov_2', b.id, 'aud_1', 'yes');
    for (const r of resolveAll(x, 'aud_1')) expect(r).toEqual(resolveItem(x, r.itemId, 'aud_1'));
  });
});

describe('the default answer is never changed by an override (I-04)', () => {
  it('answers, and the default resolution, are identical before and after overrides', () => {
    const { p, a, b } = setup();
    const answered = answer(answer(p, a.id, 'yes'), b.id, 'no');
    const x = override(override(answered, 'ov_1', a.id, 'aud_1', 'no'), 'ov_2', b.id, 'aud_1', 'yes');
    expect(x.answers).toBe(answered.answers);
    expect(resolveAll(x, null)).toEqual(resolveAll(answered, null));
  });
});

describe('explainResolution', () => {
  it.each([
    ['unanswered', (p, a) => resolveItem(p, a.id, 'aud_1'), /Partner sees Unanswered\. Nothing is answered.*never a yes/],
    ['answer', (p, a) => resolveItem(answer(p, a.id, 'no'), a.id, 'aud_1'), /Partner sees No, which is your own answer\. No override applies/],
    ['override', (p, a) => resolveItem(override(answer(p, a.id, 'no'), 'ov_1', a.id, 'aud_1', 'yes', 'Close friend'), a.id, 'aud_1'), /Partner sees Yes because of an override\. Your own answer is No\. Your reason: Close friend/],
    ['matching override', (p, a) => resolveItem(override(answer(p, a.id, 'no'), 'ov_1', a.id, 'aud_1', 'no'), a.id, 'aud_1'), /matches your own answer/],
    ['conflict', (p, a) => resolveItem(conflictOf(answer(p, a.id, 'no'), a.id, 'aud_1', ['yes', 'no']), a.id, 'aud_1'), /2 overrides that disagree.*nothing is shown until you keep one.*No/],
  ])('says why for %s', (_name, build, pattern) => {
    const { p, a } = setup();
    const r = build(p, a);
    const text = explainResolution(r.source === 'unanswered' ? p : { ...p, answers: p.answers }, r);
    expect(text).toMatch(pattern);
  });

  it('uses the same words with no audience', () => {
    const { p, a } = setup();
    expect(explainResolution(p, resolveItem(p, a.id, null))).toMatch(/^Everyone sees Unanswered/);
  });
});

describe('purity (I-05)', () => {
  it('resolving never changes a frozen profile', () => {
    const { p, a } = setup();
    const frozen = deepFreeze(conflictOf(override(answer(p, a.id, 'yes'), 'ov_1', a.id, 'aud_2', 'no'), a.id, 'aud_1', ['yes', 'no']));
    expect(() => { resolveAll(frozen, 'aud_1'); resolveAll(frozen, 'aud_2'); resolveAll(frozen, null); listConflicts(frozen); explainResolution(frozen, resolveItem(frozen, a.id, 'aud_1')); }).not.toThrow();
  });
});

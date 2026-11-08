import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { validateProfile } from '../../src/domain/validation.js';
import { setItemState, deleteItem, deleteCategory } from '../../src/domain/commands.js';
import { removeState } from '../../src/domain/palette-commands.js';
import {
  addAudience, updateAudience, deleteAudience, setOverride, setOverrideEnabled, removeOverride,
  overridesForAudience, viewsUsingAudience,
} from '../../src/domain/audience-commands.js';
import { LIMITS } from '../../src/domain/limits.js';

const NOW = '2026-10-26T10:00:00.000Z';
const LATER = '2026-10-26T11:00:00.000Z';

const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };

function base() {
  const p = createStarterProfile({ id: 'p1', title: 'T', now: NOW });
  const item = p.items.find((i) => i.type === 'state');
  return { p, item };
}
const withAudience = (p, over = {}) => addAudience(p, { id: 'aud_1', name: 'Partner', type: 'partner', ...over }, NOW).profile;
const view = (over = {}) => ({
  id: 'view_1', name: 'For partner', audienceId: 'aud_1', includedItemIds: [], includeSensitive: false,
  restrictedOptInItemIds: [], includeNotes: false, visualization: { type: 'matrix', options: {} }, ...over,
});

describe('addAudience', () => {
  it('adds an audience, trims the name and stamps updatedAt', () => {
    const { p } = base();
    const r = addAudience(p, { id: 'aud_1', name: '  Partner ', type: 'partner', description: 'Someone close' }, LATER);
    expect(r.ok).toBe(true);
    expect(r.profile.audiences).toEqual([{ id: 'aud_1', name: 'Partner', type: 'partner', description: 'Someone close', parentId: null }]);
    expect(r.profile.updatedAt).toBe(LATER);
    expect(validateProfile(r.profile).ok).toBe(true);
  });

  it.each([
    ['a bad id', { id: 'no good' }, /id is not available/],
    ['an empty name', { name: '   ' }, /needs a name/],
    ['an unknown kind', { type: 'boss' }, /listed kinds/],
    ['a long name', { name: 'x'.repeat(LIMITS.categoryNameLength + 1) }, /characters or fewer/],
    ['a long description', { description: 'x'.repeat(LIMITS.descriptionLength + 1) }, /characters or fewer/],
  ])('refuses %s', (_label, over, message) => {
    const { p } = base();
    const r = addAudience(p, { id: 'aud_1', name: 'Partner', type: 'partner', ...over }, NOW);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(message);
  });

  it('refuses a repeated id and a repeated name (ignoring case)', () => {
    const { p } = base();
    const one = withAudience(p);
    expect(addAudience(one, { id: 'aud_1', name: 'Other', type: 'friends' }, NOW).ok).toBe(false);
    const clash = addAudience(one, { id: 'aud_2', name: 'PARTNER', type: 'friends' }, NOW);
    expect(clash.ok).toBe(false);
    expect(clash.error).toMatch(/already an audience called “Partner”/);
  });

  it('stops at the limit', () => {
    const { p } = base();
    const many = { ...p, audiences: Array.from({ length: LIMITS.audiences }, (_, i) => ({ id: `a${i}`, name: `A${i}`, type: 'group', description: '', parentId: null })) };
    const r = addAudience(many, { id: 'extra', name: 'Extra', type: 'group' }, NOW);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/up to 50 audiences/);
  });
});

describe('updateAudience', () => {
  it('changes only the fields given', () => {
    const { p } = base();
    const r = updateAudience(withAudience(p), { id: 'aud_1', name: 'Close partner' }, LATER);
    expect(r.profile.audiences[0]).toMatchObject({ name: 'Close partner', type: 'partner', description: '' });
    expect(r.profile.updatedAt).toBe(LATER);
  });

  it('returns the same profile when nothing changes', () => {
    const { p } = base();
    const one = withAudience(p);
    expect(updateAudience(one, { id: 'aud_1', name: 'Partner' }, LATER).profile).toBe(one);
  });

  it('allows keeping its own name but not taking another audience\u2019s', () => {
    const { p } = base();
    const two = addAudience(withAudience(p), { id: 'aud_2', name: 'Friends', type: 'friends' }, NOW).profile;
    expect(updateAudience(two, { id: 'aud_2', name: 'friends' }, NOW).ok).toBe(true);
    expect(updateAudience(two, { id: 'aud_2', name: 'partner' }, NOW).ok).toBe(false);
  });

  it('refuses a missing audience and a bad kind', () => {
    const { p } = base();
    expect(updateAudience(p, { id: 'nope', name: 'X' }, NOW).ok).toBe(false);
    expect(updateAudience(withAudience(p), { id: 'aud_1', type: 'boss' }, NOW).ok).toBe(false);
  });
});

describe('setOverride', () => {
  it('adds an override without touching the answer (I-04)', () => {
    const { p, item } = base();
    const answered = setItemState(withAudience(p), { itemId: item.id, stateId: 'no' }, NOW).profile;
    const r = setOverride(answered, { id: 'ov_1', itemId: item.id, audienceId: 'aud_1', stateId: 'yes', explanation: 'Only for them' }, LATER);
    expect(r.ok).toBe(true);
    expect(r.profile.overrides).toEqual([{ id: 'ov_1', itemId: item.id, audienceId: 'aud_1', stateId: 'yes', enabled: true, explanation: 'Only for them' }]);
    expect(r.profile.answers).toBe(answered.answers);
    expect(validateProfile(r.profile).ok).toBe(true);
  });

  it('replaces the override for the same item and audience, keeping its id', () => {
    const { p, item } = base();
    const one = setOverride(withAudience(p), { id: 'ov_1', itemId: item.id, audienceId: 'aud_1', stateId: 'yes' }, NOW).profile;
    const two = setOverride(one, { id: 'ov_2', itemId: item.id, audienceId: 'aud_1', stateId: 'no', explanation: 'Changed my mind' }, LATER).profile;
    expect(two.overrides).toHaveLength(1);
    expect(two.overrides[0]).toMatchObject({ id: 'ov_1', stateId: 'no', explanation: 'Changed my mind', enabled: true });
  });

  it('turns a disabled override back on when set again', () => {
    const { p, item } = base();
    const one = setOverride(withAudience(p), { id: 'ov_1', itemId: item.id, audienceId: 'aud_1', stateId: 'yes' }, NOW).profile;
    const off = setOverrideEnabled(one, { id: 'ov_1', enabled: false }, NOW).profile;
    expect(setOverride(off, { id: 'x', itemId: item.id, audienceId: 'aud_1', stateId: 'yes' }, NOW).profile.overrides[0].enabled).toBe(true);
  });

  it('collapses an imported conflict into the one the person now chooses', () => {
    const { p, item } = base();
    const dup = { ...withAudience(p), overrides: [
      { id: 'ov_a', itemId: item.id, audienceId: 'aud_1', stateId: 'yes', enabled: true, explanation: '' },
      { id: 'ov_b', itemId: item.id, audienceId: 'aud_1', stateId: 'no', enabled: true, explanation: '' },
    ] };
    const r = setOverride(dup, { id: 'ov_c', itemId: item.id, audienceId: 'aud_1', stateId: 'no' }, LATER);
    expect(r.profile.overrides).toEqual([{ id: 'ov_a', itemId: item.id, audienceId: 'aud_1', stateId: 'no', enabled: true, explanation: '' }]);
  });

  it('returns the same profile when nothing changes', () => {
    const { p, item } = base();
    const one = setOverride(withAudience(p), { id: 'ov_1', itemId: item.id, audienceId: 'aud_1', stateId: 'yes' }, NOW).profile;
    expect(setOverride(one, { id: 'ov_9', itemId: item.id, audienceId: 'aud_1', stateId: 'yes' }, LATER).profile).toBe(one);
  });

  it('lets an audience see Unanswered', () => {
    const { p, item } = base();
    expect(setOverride(withAudience(p), { id: 'ov_1', itemId: item.id, audienceId: 'aud_1', stateId: 'unanswered' }, NOW).ok).toBe(true);
  });

  it('refuses a text item, a missing item, audience or state, and an unselectable state', () => {
    const { p, item } = base();
    const withText = { ...withAudience(p), items: [...p.items, { ...item, id: 'txt', type: 'text' }] };
    expect(setOverride(withText, { id: 'o', itemId: 'txt', audienceId: 'aud_1', stateId: 'yes' }, NOW).error).toMatch(/take a state/);
    expect(setOverride(withAudience(p), { id: 'o', itemId: 'gone', audienceId: 'aud_1', stateId: 'yes' }, NOW).error).toMatch(/item no longer/);
    expect(setOverride(withAudience(p), { id: 'o', itemId: item.id, audienceId: 'gone', stateId: 'yes' }, NOW).error).toMatch(/audience no longer/);
    expect(setOverride(withAudience(p), { id: 'o', itemId: item.id, audienceId: 'aud_1', stateId: 'gone' }, NOW).error).toMatch(/does not exist/);
    const locked = { ...withAudience(p), states: p.states.map((s) => (s.id === 'yes' ? { ...s, isSelectable: false } : s)) };
    expect(setOverride(locked, { id: 'o', itemId: item.id, audienceId: 'aud_1', stateId: 'yes' }, NOW).error).toMatch(/cannot be selected/);
  });

  it('refuses a bad new id, a long explanation, and going past the limit', () => {
    const { p, item } = base();
    const one = withAudience(p);
    expect(setOverride(one, { id: 'bad id', itemId: item.id, audienceId: 'aud_1', stateId: 'yes' }, NOW).ok).toBe(false);
    expect(setOverride(one, { id: 'o', itemId: item.id, audienceId: 'aud_1', stateId: 'yes', explanation: 'x'.repeat(LIMITS.descriptionLength + 1) }, NOW).ok).toBe(false);
    const full = { ...one, overrides: Array.from({ length: LIMITS.overrides }, (_, i) => ({ id: `o${i}`, itemId: 'other', audienceId: 'aud_1', stateId: 'yes', enabled: true, explanation: '' })) };
    expect(setOverride(full, { id: 'new', itemId: item.id, audienceId: 'aud_1', stateId: 'yes' }, NOW).error).toMatch(/up to 5000 overrides/);
  });
});

describe('setOverrideEnabled and removeOverride', () => {
  function withOverride() {
    const { p, item } = base();
    const profile = setOverride(withAudience(p), { id: 'ov_1', itemId: item.id, audienceId: 'aud_1', stateId: 'yes' }, NOW).profile;
    return { profile, item };
  }

  it('turns an override off and on, keeping it', () => {
    const { profile } = withOverride();
    const off = setOverrideEnabled(profile, { id: 'ov_1', enabled: false }, LATER);
    expect(off.profile.overrides[0]).toMatchObject({ enabled: false, stateId: 'yes' });
    expect(setOverrideEnabled(off.profile, { id: 'ov_1', enabled: true }, LATER).profile.overrides[0].enabled).toBe(true);
    expect(setOverrideEnabled(profile, { id: 'ov_1', enabled: true }, LATER).profile).toBe(profile);
  });

  it('refuses a missing override or a non-boolean', () => {
    const { profile } = withOverride();
    expect(setOverrideEnabled(profile, { id: 'nope', enabled: true }, NOW).ok).toBe(false);
    expect(setOverrideEnabled(profile, { id: 'ov_1', enabled: 'yes' }, NOW).ok).toBe(false);
  });

  it('removes an override', () => {
    const { profile } = withOverride();
    expect(removeOverride(profile, { id: 'ov_1' }, LATER).profile.overrides).toEqual([]);
    expect(removeOverride(profile, { id: 'nope' }, LATER).ok).toBe(false);
  });
});

describe('deleteAudience', () => {
  it('deletes the audience and its overrides, and says how many', () => {
    const { p, item } = base();
    const two = addAudience(withAudience(p), { id: 'aud_2', name: 'Friends', type: 'friends' }, NOW).profile;
    const a = setOverride(two, { id: 'ov_1', itemId: item.id, audienceId: 'aud_1', stateId: 'yes' }, NOW).profile;
    const b = setOverride(a, { id: 'ov_2', itemId: item.id, audienceId: 'aud_2', stateId: 'no' }, NOW).profile;
    const r = deleteAudience(b, { id: 'aud_1' }, LATER);
    expect(r.ok).toBe(true);
    expect(r.removedOverrides).toBe(1);
    expect(r.profile.audiences.map((x) => x.id)).toEqual(['aud_2']);
    expect(r.profile.overrides.map((o) => o.id)).toEqual(['ov_2']);
    expect(validateProfile(r.profile).ok).toBe(true);
  });

  it('is refused while a view is built on the audience, and names the view', () => {
    const { p } = base();
    const profile = { ...withAudience(p), views: [view()] };
    const r = deleteAudience(profile, { id: 'aud_1' }, NOW);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/“For partner”/);
    expect(viewsUsingAudience(profile, 'aud_1')).toHaveLength(1);
  });

  it('frees a child\u2019s parent link rather than leaving it dangling', () => {
    const { p } = base();
    const parent = withAudience(p);
    const child = { ...parent, audiences: [...parent.audiences, { id: 'aud_2', name: 'Kid', type: 'family', description: '', parentId: 'aud_1' }] };
    const r = deleteAudience(child, { id: 'aud_1' }, NOW);
    expect(r.profile.audiences[0].parentId).toBeNull();
    expect(validateProfile(r.profile).ok).toBe(true);
  });

  it('refuses a missing audience', () => {
    const { p } = base();
    expect(deleteAudience(p, { id: 'nope' }, NOW).ok).toBe(false);
  });
});

describe('keeping the rest of the profile consistent', () => {
  it('deleting an item or its category removes its overrides', () => {
    const { p, item } = base();
    const profile = setOverride(withAudience(p), { id: 'ov_1', itemId: item.id, audienceId: 'aud_1', stateId: 'yes' }, NOW).profile;
    expect(deleteItem(profile, { id: item.id }, NOW).profile.overrides).toEqual([]);
    expect(deleteCategory(profile, { id: item.categoryId }, NOW).profile.overrides).toEqual([]);
  });

  it('removing a state moves or clears its overrides, never making them more open', () => {
    const { p, item } = base();
    const profile = setOverride(withAudience(p), { id: 'ov_1', itemId: item.id, audienceId: 'aud_1', stateId: 'conditional' }, NOW).profile;
    expect(removeState(profile, { id: 'conditional', replacementId: 'yes' }, NOW).ok).toBe(false);
    expect(removeState(profile, { id: 'conditional', replacementId: null }, NOW).profile.overrides).toEqual([]);
    expect(removeState(profile, { id: 'conditional', replacementId: 'no' }, NOW).profile.overrides[0].stateId).toBe('no');
  });
});

describe('overridesForAudience', () => {
  it('lists one audience\u2019s overrides in id order', () => {
    const { p, item } = base();
    const two = addAudience(withAudience(p), { id: 'aud_2', name: 'Friends', type: 'friends' }, NOW).profile;
    const items = p.items.filter((i) => i.type === 'state').slice(0, 2);
    let x = setOverride(two, { id: 'ov_b', itemId: items[0].id, audienceId: 'aud_1', stateId: 'yes' }, NOW).profile;
    x = setOverride(x, { id: 'ov_a', itemId: items[1].id, audienceId: 'aud_1', stateId: 'no' }, NOW).profile;
    x = setOverride(x, { id: 'ov_c', itemId: item.id, audienceId: 'aud_2', stateId: 'no' }, NOW).profile;
    expect(overridesForAudience(x, 'aud_1').map((o) => o.id)).toEqual(['ov_a', 'ov_b']);
  });
});

describe('purity (I-05)', () => {
  it('no command changes its input', () => {
    const { p, item } = base();
    const frozen = deepFreeze(withAudience(p));
    expect(() => {
      addAudience(frozen, { id: 'aud_2', name: 'Friends', type: 'friends' }, LATER);
      updateAudience(frozen, { id: 'aud_1', name: 'Other' }, LATER);
      const withOv = setOverride(frozen, { id: 'ov_1', itemId: item.id, audienceId: 'aud_1', stateId: 'yes' }, LATER).profile;
      setOverrideEnabled(withOv, { id: 'ov_1', enabled: false }, LATER);
      removeOverride(withOv, { id: 'ov_1' }, LATER);
      deleteAudience(withOv, { id: 'aud_1' }, LATER);
    }).not.toThrow();
  });
});

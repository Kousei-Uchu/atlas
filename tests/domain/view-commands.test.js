import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { validateProfile } from '../../src/domain/validation.js';
import { addCategory, addItem } from '../../src/domain/commands.js';
import { addAudience, deleteAudience } from '../../src/domain/audience-commands.js';
import {
  addView, renameView, setViewAudience, setViewItems, addViewItems, removeViewItems,
  setViewIncludeSensitive, setViewIncludeNotes, setRestrictedOptIn, deleteView,
} from '../../src/domain/view-commands.js';
import { LIMITS } from '../../src/domain/limits.js';

const NOW = '2026-10-26T10:00:00.000Z';
const LATER = '2026-10-26T11:00:00.000Z';
const must = (r) => { expect(r.ok, r.error).toBe(true); return r.profile; };
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };

function base() {
  let p = createStarterProfile({ id: 'p1', now: NOW });
  p = must(addCategory(p, { id: 'cat_r', name: 'Restricted', sensitivity: 'restricted' }, NOW));
  p = must(addItem(p, { id: 'item_r', categoryId: 'cat_r', label: 'R' }, NOW));
  p = must(addItem(p, { id: 'item_r2', categoryId: 'cat_r', label: 'R2' }, NOW));
  p = must(addAudience(p, { id: 'aud_1', name: 'Partner', type: 'partner' }, NOW));
  const starter = p.items.find((i) => i.type === 'state' && i.categoryId !== 'cat_r');
  return { p, starter: starter.id };
}
const withView = (p, over = {}) => must(addView(p, { id: 'view_1', name: 'For partner', audienceId: 'aud_1', ...over }, NOW));

describe('addView', () => {
  it('starts empty with every sharing switch off (I-11)', () => {
    const { p } = base();
    const v = withView(p).views[0];
    expect(v).toEqual({
      id: 'view_1', name: 'For partner', audienceId: 'aud_1', includedItemIds: [], includeSensitive: false,
      restrictedOptInItemIds: [], includeNotes: false, visualization: { type: 'matrix', options: {} },
    });
    expect(validateProfile(withView(p)).ok).toBe(true);
  });
  it('allows no audience, trims the name, stamps updatedAt', () => {
    const { p } = base();
    const r = must(addView(p, { id: 'view_1', name: '  Default  ' }, LATER));
    expect(r.views[0]).toMatchObject({ name: 'Default', audienceId: null });
    expect(r.updatedAt).toBe(LATER);
  });
  it.each([
    ['an empty name', { name: '  ' }, /needs a name/],
    ['a long name', { name: 'x'.repeat(LIMITS.categoryNameLength + 1) }, /characters or fewer/],
    ['an unknown audience', { audienceId: 'nope' }, /no longer exists/],
    ['a bad id', { id: 'bad id' }, /not available/],
  ])('refuses %s', (_n, over, message) => {
    const { p } = base();
    const r = addView(p, { id: 'view_1', name: 'V', ...over }, NOW);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(message);
  });
  it('refuses a name that matches another view ignoring case, and a duplicate id', () => {
    const { p } = base();
    const q = withView(p);
    expect(addView(q, { id: 'view_2', name: 'for PARTNER' }, NOW).error).toMatch(/already a view/);
    expect(addView(q, { id: 'view_1', name: 'Other' }, NOW).ok).toBe(false);
  });
  it('refuses past the limit', () => {
    let { p } = base();
    for (let i = 0; i < LIMITS.views; i += 1) p = must(addView(p, { id: `view_${i}`, name: `V${i}` }, NOW));
    expect(addView(p, { id: 'view_x', name: 'One more' }, NOW).error).toMatch(/up to 50 views/);
  });
});

describe('rename and audience', () => {
  it('renames, and does nothing for the same name', () => {
    const { p } = base();
    const q = withView(p);
    expect(must(renameView(q, { id: 'view_1', name: 'New' }, LATER)).views[0].name).toBe('New');
    expect(renameView(q, { id: 'view_1', name: 'For partner' }, LATER).profile).toBe(q);
    expect(renameView(q, { id: 'nope', name: 'x' }, LATER).ok).toBe(false);
  });
  it('points a view at another audience or none, keeping the picks and switches', () => {
    let { p, starter } = base();
    p = must(addAudience(p, { id: 'aud_2', name: 'Friends', type: 'friends' }, NOW));
    p = must(setViewIncludeSensitive(withView(p), { id: 'view_1', includeSensitive: true }, NOW));
    p = must(setViewItems(p, { id: 'view_1', itemIds: [starter] }, NOW));
    const q = must(setViewAudience(p, { id: 'view_1', audienceId: 'aud_2' }, NOW));
    expect(q.views[0]).toMatchObject({ audienceId: 'aud_2', includeSensitive: true, includedItemIds: [starter] });
    expect(must(setViewAudience(q, { id: 'view_1', audienceId: null }, NOW)).views[0].audienceId).toBeNull();
    expect(setViewAudience(q, { id: 'view_1', audienceId: 'gone' }, NOW).ok).toBe(false);
  });
  it('lets the audience be deleted once the view no longer uses it', () => {
    const { p } = base();
    const q = withView(p);
    expect(deleteAudience(q, { id: 'aud_1' }, NOW).ok).toBe(false);
    const r = must(setViewAudience(q, { id: 'view_1', audienceId: null }, NOW));
    expect(deleteAudience(r, { id: 'aud_1' }, NOW).ok).toBe(true);
  });
});

describe('the allowlist', () => {
  it('replaces it, drops unknown and repeated ids, and keeps the order given', () => {
    const { p, starter } = base();
    const q = must(setViewItems(withView(p), { id: 'view_1', itemIds: ['item_r', 'nope', starter, 'item_r'] }, NOW));
    expect(q.views[0].includedItemIds).toEqual(['item_r', starter]);
    expect(validateProfile(q).ok).toBe(true);
  });
  it('changes nothing when the list is the same', () => {
    const { p, starter } = base();
    const q = must(setViewItems(withView(p), { id: 'view_1', itemIds: [starter] }, NOW));
    expect(setViewItems(q, { id: 'view_1', itemIds: [starter] }, LATER).profile).toBe(q);
  });
  it('adds and removes, and creates no opt-in when adding', () => {
    const { p, starter } = base();
    let q = must(addViewItems(withView(p), { id: 'view_1', itemIds: ['item_r'] }, NOW));
    q = must(addViewItems(q, { id: 'view_1', itemIds: [starter, 'item_r'] }, NOW));
    expect(q.views[0].includedItemIds).toEqual(['item_r', starter]);
    expect(q.views[0].restrictedOptInItemIds).toEqual([]);
    q = must(removeViewItems(q, { id: 'view_1', itemIds: ['item_r'] }, NOW));
    expect(q.views[0].includedItemIds).toEqual([starter]);
  });
  it('drops the restricted opt-in when an item leaves the list, so picking it again asks again (I-11)', () => {
    const { p } = base();
    let q = must(addViewItems(withView(p), { id: 'view_1', itemIds: ['item_r'] }, NOW));
    q = must(setRestrictedOptIn(q, { id: 'view_1', itemId: 'item_r', optIn: true }, NOW));
    expect(q.views[0].restrictedOptInItemIds).toEqual(['item_r']);
    q = must(removeViewItems(q, { id: 'view_1', itemIds: ['item_r'] }, NOW));
    expect(q.views[0].restrictedOptInItemIds).toEqual([]);
    q = must(addViewItems(q, { id: 'view_1', itemIds: ['item_r'] }, NOW));
    expect(q.views[0].restrictedOptInItemIds).toEqual([]);
    expect(q.views[0].restrictedOptInItemIds).toEqual([]);
  });
  it('refuses a missing view and a non-list', () => {
    const { p } = base();
    expect(setViewItems(p, { id: 'nope', itemIds: [] }, NOW).ok).toBe(false);
    expect(setViewItems(withView(p), { id: 'view_1', itemIds: 'item_r' }, NOW).ok).toBe(false);
    expect(addViewItems(withView(p), { id: 'view_1' }, NOW).ok).toBe(false);
    expect(removeViewItems(withView(p), { id: 'view_1', itemIds: null }, NOW).ok).toBe(false);
  });
});

describe('the switches', () => {
  it.each([
    ['includeSensitive', setViewIncludeSensitive],
    ['includeNotes', setViewIncludeNotes],
  ])('%s: sets, ignores no-ops and refuses non-booleans', (field, command) => {
    const { p } = base();
    const q = withView(p);
    const on = must(command(q, { id: 'view_1', [field]: true }, LATER));
    expect(on.views[0][field]).toBe(true);
    expect(on.updatedAt).toBe(LATER);
    expect(command(on, { id: 'view_1', [field]: true }, LATER).profile).toBe(on);
    expect(command(q, { id: 'view_1', [field]: 'yes' }, LATER).ok).toBe(false);
    expect(command(q, { id: 'nope', [field]: true }, LATER).ok).toBe(false);
  });
});

describe('setRestrictedOptIn', () => {
  it('needs the item to be picked and restricted', () => {
    const { p, starter } = base();
    const q = withView(p);
    expect(setRestrictedOptIn(q, { id: 'view_1', itemId: 'item_r', optIn: true }, NOW).error).toMatch(/Pick the item/);
    const picked = must(addViewItems(q, { id: 'view_1', itemIds: [starter, 'item_r'] }, NOW));
    expect(setRestrictedOptIn(picked, { id: 'view_1', itemId: starter, optIn: true }, NOW).error).toMatch(/Only restricted/);
    expect(setRestrictedOptIn(picked, { id: 'view_1', itemId: 'gone', optIn: true }, NOW).ok).toBe(false);
    expect(setRestrictedOptIn(picked, { id: 'view_1', itemId: 'item_r', optIn: 'yes' }, NOW).ok).toBe(false);
  });
  it('opts in and out, once each', () => {
    const { p } = base();
    const picked = must(addViewItems(withView(p), { id: 'view_1', itemIds: ['item_r', 'item_r2'] }, NOW));
    const on = must(setRestrictedOptIn(picked, { id: 'view_1', itemId: 'item_r', optIn: true }, NOW));
    expect(setRestrictedOptIn(on, { id: 'view_1', itemId: 'item_r', optIn: true }, NOW).profile).toBe(on);
    const both = must(setRestrictedOptIn(on, { id: 'view_1', itemId: 'item_r2', optIn: true }, NOW));
    expect(both.views[0].restrictedOptInItemIds).toEqual(['item_r', 'item_r2']);
    const off = must(setRestrictedOptIn(both, { id: 'view_1', itemId: 'item_r', optIn: false }, NOW));
    expect(off.views[0].restrictedOptInItemIds).toEqual(['item_r2']);
    expect(setRestrictedOptIn(off, { id: 'view_1', itemId: 'item_r', optIn: false }, NOW).profile).toBe(off);
  });
});

describe('deleteView and purity', () => {
  it('deletes a view and nothing else', () => {
    const { p } = base();
    const q = withView(p);
    const r = must(deleteView(q, { id: 'view_1' }, LATER));
    expect(r.views).toEqual([]);
    expect(r.items).toEqual(q.items);
    expect(r.audiences).toEqual(q.audiences);
    expect(deleteView(r, { id: 'view_1' }, LATER).ok).toBe(false);
  });
  it('never changes its input, and never touches answers or overrides (I-04, I-05)', () => {
    const { p, starter } = base();
    const frozen = deepFreeze(withView(p));
    const out = must(addViewItems(frozen, { id: 'view_1', itemIds: [starter] }, NOW));
    expect(out.answers).toBe(frozen.answers);
    expect(out.overrides).toBe(frozen.overrides);
    expect(out.items).toBe(frozen.items);
  });
});

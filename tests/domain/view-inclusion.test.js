// The inclusion rule (spec 5.6, I-11, D-044): what a view would include, and why anything is held back.
import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { validateProfile } from '../../src/domain/validation.js';
import { addCategory, addItem, setItemNote, setNoteShareable, setItemState, setItemText, deleteItem } from '../../src/domain/commands.js';
import { addAudience, setOverride } from '../../src/domain/audience-commands.js';
import { setViewItems } from '../../src/domain/view-commands.js';
import { evaluateView, categoryIsShown, REASON_TEXT, INCLUSION_REASONS } from '../../src/domain/view-inclusion.js';

const NOW = '2026-10-26T10:00:00.000Z';
const must = (r) => { expect(r.ok, r.error).toBe(true); return r.profile; };

const baseView = (over = {}) => ({
  id: 'view_1', name: 'V', audienceId: null, includedItemIds: [], includeSensitive: false,
  restrictedOptInItemIds: [], includeNotes: false, visualization: { type: 'matrix', options: {} }, ...over,
});

/** A profile with one category per sensitivity level, one item each, and a text item. */
function fixture() {
  let p = createStarterProfile({ id: 'p1', now: NOW });
  p = { ...p, categories: [], items: [], answers: [] };
  const levels = ['normal', 'personal', 'sensitive', 'restricted'];
  for (const level of levels) {
    p = must(addCategory(p, { id: `cat_${level}`, name: `Cat ${level}`, sensitivity: level }, NOW));
    p = must(addItem(p, { id: `item_${level}`, categoryId: `cat_${level}`, label: `Item ${level}`, sensitivity: level }, NOW));
    p = must(setItemState(p, { itemId: `item_${level}`, stateId: 'yes' }, NOW));
  }
  p = must(addItem(p, { id: 'item_text', categoryId: 'cat_normal', label: 'Words', type: 'text' }, NOW));
  p = must(setItemText(p, { itemId: 'item_text', text: 'My words' }, NOW));
  return p;
}
const all = ['item_normal', 'item_personal', 'item_sensitive', 'item_restricted', 'item_text'];
const withView = (p, over) => ({ ...p, views: [baseView({ includedItemIds: all, ...over })] });
const evaluate = (p) => evaluateView(p, p.views[0]);
const ids = (entries) => entries.map((e) => e.itemId);

describe('evaluateView: the allowlist and the sensitivity gate', () => {
  it('includes nothing from an empty view', () => {
    const r = evaluate(withView(fixture(), { includedItemIds: [] }));
    expect(r.entries).toEqual([]);
    expect(r.counts).toMatchObject({ selected: 0, included: 0, held: 0 });
  });

  it('never includes an item that was not picked, whatever its level', () => {
    const r = evaluate(withView(fixture(), { includedItemIds: ['item_normal'] }));
    expect(ids(r.included)).toEqual(['item_normal']);
    expect(ids(r.entries)).toEqual(['item_normal']);
  });

  it('includes normal and personal items, and holds sensitive and restricted ones back by default', () => {
    const r = evaluate(withView(fixture()));
    expect(ids(r.included)).toEqual(['item_normal', 'item_text', 'item_personal']);
    expect(Object.fromEntries(r.held.map((e) => [e.itemId, e.reason]))).toEqual({ item_sensitive: 'sensitive', item_restricted: 'restricted' });
    expect(r.counts.byReason).toMatchObject({ sensitive: 1, restricted: 1, 'hidden-category': 0, conflict: 0 });
  });

  it('includes sensitive items only when the view says so, and that switch never opens restricted ones', () => {
    const r = evaluate(withView(fixture(), { includeSensitive: true }));
    expect(ids(r.included)).toContain('item_sensitive');
    expect(ids(r.included)).not.toContain('item_restricted');
  });

  it('includes a restricted item only when it is listed for this view, and the list needs no other switch', () => {
    const r = evaluate(withView(fixture(), { restrictedOptInItemIds: ['item_restricted'] }));
    expect(ids(r.included)).toContain('item_restricted');
    expect(ids(r.included)).not.toContain('item_sensitive');
  });

  it('ignores an opt-in for an item that is not picked', () => {
    const r = evaluate(withView(fixture(), { includedItemIds: ['item_normal'], restrictedOptInItemIds: ['item_restricted'] }));
    expect(ids(r.entries)).toEqual(['item_normal']);
  });

  it('uses the higher of the item’s level and its category’s (D-015)', () => {
    let p = fixture();
    p = { ...p, categories: p.categories.map((c) => (c.id === 'cat_normal' ? { ...c, sensitivity: 'restricted' } : c)) };
    const r = evaluate(withView(p, { includedItemIds: ['item_normal'] }));
    expect(r.held[0]).toMatchObject({ itemId: 'item_normal', reason: 'restricted', sensitivity: 'restricted' });
  });

  it('holds an item back at once when its level is raised after it was picked and opted in', () => {
    let p = withView(fixture(), { includedItemIds: ['item_sensitive'], includeSensitive: true });
    expect(evaluate(p).included).toHaveLength(1);
    p = { ...p, items: p.items.map((i) => (i.id === 'item_sensitive' ? { ...i, sensitivity: 'restricted' } : i)) };
    expect(evaluate(p).held[0].reason).toBe('restricted');
  });

  it('holds back an item in a hidden category, or under a hidden parent', () => {
    let p = withView(fixture(), { includedItemIds: ['item_normal'] });
    p = { ...p, categories: p.categories.map((c) => (c.id === 'cat_normal' ? { ...c, visibility: 'hidden' } : c)) };
    expect(evaluate(p).held[0].reason).toBe('hidden-category');
    expect(categoryIsShown(p, 'cat_normal')).toBe(false);
    expect(categoryIsShown(p, 'cat_personal')).toBe(true);
    const child = must(addCategory(fixture(), { id: 'cat_child', name: 'Child', parentId: 'cat_normal' }, NOW));
    const hiddenParent = { ...child, categories: child.categories.map((c) => (c.id === 'cat_normal' ? { ...c, visibility: 'hidden' } : c)) };
    expect(categoryIsShown(hiddenParent, 'cat_child')).toBe(false);
    expect(categoryIsShown(fixture(), 'nope')).toBe(false);
  });

  it('lists entries in chart order, not in the order they were picked', () => {
    const r = evaluate(withView(fixture(), { includedItemIds: ['item_personal', 'item_normal'] }));
    expect(ids(r.entries)).toEqual(['item_normal', 'item_personal']);
  });

  it('has a plain-words reason for every reason', () => {
    for (const reason of INCLUSION_REASONS) expect(REASON_TEXT[reason], reason).toMatch(/\w/);
  });
});

describe('evaluateView: values, and what a held-back entry carries (I-11)', () => {
  it('carries the item’s own answer for everyone, and the typed text for a text item', () => {
    const r = evaluate(withView(fixture()));
    const normal = r.included.find((e) => e.itemId === 'item_normal');
    expect(normal.value).toMatchObject({ kind: 'state', stateId: 'yes', source: 'answer', differs: false });
    expect(r.included.find((e) => e.itemId === 'item_text').value).toEqual({ kind: 'text', text: 'My words' });
  });

  it('gives a held-back entry no value and no note, so a consumer that forgets to filter still leaks nothing', () => {
    let p = fixture();
    p = must(setItemNote(p, { itemId: 'item_restricted', note: 'Very private' }, NOW));
    p = must(setNoteShareable(p, { itemId: 'item_restricted', shareable: true }, NOW));
    const r = evaluate(withView(p, { includeNotes: true }));
    const held = r.held.find((e) => e.itemId === 'item_restricted');
    expect(held.value).toBeNull();
    expect(held.note).toBeNull();
    expect(JSON.stringify(r.included)).not.toMatch(/Very private|item_restricted/);
  });

  it('shows Unanswered for an item with no answer, never a yes', () => {
    let p = fixture();
    p = { ...p, answers: p.answers.filter((a) => a.itemId !== 'item_normal') };
    const r = evaluate(withView(p, { includedItemIds: ['item_normal'] }));
    expect(r.included[0].value).toMatchObject({ stateId: 'unanswered', source: 'unanswered' });
  });
});

describe('evaluateView: notes need both switches', () => {
  const noted = () => {
    let p = fixture();
    p = must(setItemNote(p, { itemId: 'item_normal', note: 'A shareable note' }, NOW));
    p = must(setItemNote(p, { itemId: 'item_personal', note: 'A private note' }, NOW));
    return must(setNoteShareable(p, { itemId: 'item_normal', shareable: true }, NOW));
  };
  const notes = (p) => Object.fromEntries(evaluate(p).included.map((e) => [e.itemId, e.note]));

  it('carries no note when the view does not include notes, even if the note is shareable', () => {
    expect(notes(withView(noted(), { includeNotes: false })).item_normal).toBeNull();
  });
  it('carries no note when the note is not marked shareable, even if the view includes notes', () => {
    expect(notes(withView(noted(), { includeNotes: true })).item_personal).toBeNull();
  });
  it('carries the note only when both agree', () => {
    const r = notes(withView(noted(), { includeNotes: true }));
    expect(r.item_normal).toBe('A shareable note');
    expect(evaluate(withView(noted(), { includeNotes: true })).counts.notes).toBe(1);
  });
});

describe('evaluateView: audiences and conflicts (I-04, D-013, D-044)', () => {
  const audienced = () => {
    let p = fixture();
    p = must(addAudience(p, { id: 'aud_1', name: 'Friends', type: 'friends' }, NOW));
    return p;
  };

  it('shows the audience’s override and not the default answer, and leaves the answer alone', () => {
    let p = audienced();
    p = must(setOverride(p, { id: 'ov_1', itemId: 'item_normal', audienceId: 'aud_1', stateId: 'no', explanation: 'Not for friends' }, NOW));
    const before = JSON.stringify(p.answers);
    const r = evaluate(withView(p, { audienceId: 'aud_1', includedItemIds: ['item_normal'] }));
    expect(r.included[0].value).toMatchObject({ stateId: 'no', source: 'override', differs: true, explanation: 'Not for friends' });
    expect(JSON.stringify(p.answers)).toBe(before);
    // The same item for no audience still shows the default.
    expect(evaluate(withView(p, { audienceId: null, includedItemIds: ['item_normal'] })).included[0].value.stateId).toBe('yes');
  });

  it('does not use another audience’s override', () => {
    let p = audienced();
    p = must(addAudience(p, { id: 'aud_2', name: 'Family', type: 'family' }, NOW));
    p = must(setOverride(p, { id: 'ov_1', itemId: 'item_normal', audienceId: 'aud_2', stateId: 'no' }, NOW));
    expect(evaluate(withView(p, { audienceId: 'aud_1', includedItemIds: ['item_normal'] })).included[0].value.stateId).toBe('yes');
  });

  const conflicted = () => {
    let p = audienced();
    p = { ...p, overrides: [
      { id: 'ov_a', itemId: 'item_normal', audienceId: 'aud_1', stateId: 'yes', enabled: true, explanation: '' },
      { id: 'ov_b', itemId: 'item_normal', audienceId: 'aud_1', stateId: 'no', enabled: true, explanation: '' },
    ] };
    return p;
  };

  it('is not buildable while an included item has a conflict for the view’s audience, and shows nothing for it', () => {
    const r = evaluate(withView(conflicted(), { audienceId: 'aud_1', includedItemIds: ['item_normal', 'item_personal'] }));
    expect(r.buildable).toBe(false);
    expect(r.conflicts).toEqual(['item_normal']);
    expect(r.held[0]).toMatchObject({ itemId: 'item_normal', reason: 'conflict', value: null });
    expect(ids(r.included)).toEqual(['item_personal']);
  });

  it('does not mind a conflict on an item that is not picked, on another audience, or on an item already held back', () => {
    expect(evaluate(withView(conflicted(), { audienceId: 'aud_1', includedItemIds: ['item_personal'] })).buildable).toBe(true);
    expect(evaluate(withView(conflicted(), { audienceId: null, includedItemIds: ['item_normal'] })).buildable).toBe(true);
    const hidden = { ...conflicted(), categories: conflicted().categories.map((c) => (c.id === 'cat_normal' ? { ...c, visibility: 'hidden' } : c)) };
    const r = evaluate(withView(hidden, { audienceId: 'aud_1', includedItemIds: ['item_normal'] }));
    expect(r.held[0].reason).toBe('hidden-category');
    expect(r.buildable).toBe(true);
  });

  it('becomes buildable once the person keeps one override', () => {
    let p = withView(conflicted(), { audienceId: 'aud_1', includedItemIds: ['item_normal'] });
    expect(evaluate(p).buildable).toBe(false);
    p = must(setOverride(p, { id: 'ov_c', itemId: 'item_normal', audienceId: 'aud_1', stateId: 'no' }, NOW));
    const r = evaluate(p);
    expect(r.buildable).toBe(true);
    expect(r.included[0].value.stateId).toBe('no');
  });

  it('is not buildable when the audience is missing, and says so', () => {
    const r = evaluate(withView(fixture(), { audienceId: 'aud_gone', includedItemIds: ['item_normal'] }));
    expect(r.buildable).toBe(false);
    expect(r.problems[0]).toMatch(/audience/);
  });
});

describe('evaluateView: purity and edits that remove items', () => {
  it('changes nothing', () => {
    const p = withView(fixture(), { includeSensitive: true });
    const snapshot = JSON.stringify(p);
    evaluate(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('is unaffected by an item that is deleted: the view stays valid and the item is gone from it', () => {
    let p = withView(fixture(), { restrictedOptInItemIds: ['item_restricted'] });
    p = must(deleteItem(p, { id: 'item_restricted' }, NOW));
    expect(p.views[0].includedItemIds).not.toContain('item_restricted');
    expect(p.views[0].restrictedOptInItemIds).toEqual([]);
    expect(validateProfile(p).ok).toBe(true);
    expect(evaluate(p).entries.map((e) => e.itemId)).not.toContain('item_restricted');
  });

  it('keeps working through setViewItems (a view built with the commands)', () => {
    let p = { ...fixture(), views: [baseView()] };
    p = must(setViewItems(p, { id: 'view_1', itemIds: ['item_normal', 'item_restricted'] }, NOW));
    expect(ids(evaluate(p).included)).toEqual(['item_normal']);
  });
});

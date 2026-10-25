import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { setItemsState, setItemsNote, moveItemsToCategory } from '../../src/domain/bulk-commands.js';
import { setItemState, setItemNote, setNoteShareable } from '../../src/domain/commands.js';
import { effectiveSensitivity, effectiveStateId, getAnswer, sortedByOrder } from '../../src/domain/selectors.js';
import { validateProfile } from '../../src/domain/validation.js';

const T0 = '2026-10-26T09:00:00.000Z';
const T1 = '2026-10-26T10:00:00.000Z';
const fresh = () => createStarterProfile({ id: 'p1', now: T0 });
const contact = ['starter_hug', 'starter_high_five', 'starter_shoulder', 'starter_sit_close'];

describe('setItemsState', () => {
  it('sets one state on every selected item and counts them', () => {
    const r = setItemsState(fresh(), { itemIds: contact, stateId: 'no' }, T1);
    expect(r).toMatchObject({ ok: true, changed: 4, unchanged: 0, skipped: 0 });
    for (const id of contact) expect(effectiveStateId(r.profile, id)).toBe('no');
    expect(effectiveStateId(r.profile, 'starter_text')).toBe('unanswered');
    expect(r.profile.updatedAt).toBe(T1);
  });

  it('counts items already in that state as unchanged', () => {
    const start = setItemState(fresh(), { itemId: 'starter_hug', stateId: 'yes' }, T0).profile;
    const r = setItemsState(start, { itemIds: ['starter_hug', 'starter_high_five'], stateId: 'yes' }, T1);
    expect(r).toMatchObject({ changed: 1, unchanged: 1 });
  });

  it('returns the same profile when nothing changes', () => {
    const start = fresh();
    const r = setItemsState(start, { itemIds: ['starter_hug'], stateId: 'unanswered' }, T1);
    expect(r.profile).toBe(start);
    expect(r.changed).toBe(0);
  });

  it('skips text items and counts them', () => {
    const start = fresh();
    const withText = { ...start, items: [...start.items, { ...start.items[0], id: 'txt', type: 'text', label: 'Free text', sortOrder: 900 }] };
    const r = setItemsState(withText, { itemIds: ['starter_hug', 'txt'], stateId: 'no' }, T1);
    expect(r).toMatchObject({ changed: 1, skipped: 1 });
    expect(getAnswer(r.profile, 'txt')).toBeNull();
  });

  it('Unanswered clears the state and keeps the note (D-012)', () => {
    let p = setItemState(fresh(), { itemId: 'starter_hug', stateId: 'yes' }, T0).profile;
    p = setItemNote(p, { itemId: 'starter_hug', note: 'ask first' }, T0).profile;
    const r = setItemsState(p, { itemIds: ['starter_hug'], stateId: 'unanswered' }, T1);
    expect(effectiveStateId(r.profile, 'starter_hug')).toBe('unanswered');
    expect(getAnswer(r.profile, 'starter_hug').note).toBe('ask first');
  });

  it('refuses an empty selection, unknown items and unknown or unselectable states', () => {
    expect(setItemsState(fresh(), { itemIds: [], stateId: 'no' }, T1).ok).toBe(false);
    expect(setItemsState(fresh(), { itemIds: ['gone'], stateId: 'no' }, T1).ok).toBe(false);
    expect(setItemsState(fresh(), { itemIds: contact, stateId: 'nope' }, T1).ok).toBe(false);
    const p = fresh();
    const locked = { ...p, states: p.states.map((s) => (s.id === 'yes' ? { ...s, isSelectable: false } : s)) };
    expect(setItemsState(locked, { itemIds: contact, stateId: 'yes' }, T1).ok).toBe(false);
  });

  it('ignores duplicate ids and does not mutate its input (I-05)', () => {
    const start = fresh();
    const before = JSON.stringify(start);
    Object.freeze(start); Object.freeze(start.answers); Object.freeze(start.items);
    const r = setItemsState(start, { itemIds: ['starter_hug', 'starter_hug'], stateId: 'no' }, T1);
    expect(r.changed).toBe(1);
    expect(JSON.stringify(start)).toBe(before);
  });

  it('produces a profile that still validates', () => {
    const r = setItemsState(fresh(), { itemIds: contact, stateId: 'conditional' }, T1);
    expect(validateProfile(r.profile).ok).toBe(true);
  });
});

describe('setItemsNote', () => {
  it('replaces notes on every selected item', () => {
    const r = setItemsNote(fresh(), { itemIds: contact, note: '  ask me first  ' }, T1);
    expect(r).toMatchObject({ ok: true, changed: 4 });
    expect(getAnswer(r.profile, 'starter_hug').note).toBe('ask me first');
  });

  it('does not touch the state on an item that gets a note', () => {
    const p = setItemState(fresh(), { itemId: 'starter_hug', stateId: 'yes' }, T0).profile;
    const r = setItemsNote(p, { itemIds: ['starter_hug'], note: 'x' }, T1);
    expect(effectiveStateId(r.profile, 'starter_hug')).toBe('yes');
  });

  it('an empty note clears notes, drops note-only records, and un-shares', () => {
    let p = setItemsNote(fresh(), { itemIds: ['starter_hug', 'starter_high_five'], note: 'n' }, T0).profile;
    p = setItemState(p, { itemId: 'starter_high_five', stateId: 'yes' }, T0).profile;
    p = setNoteShareable(p, { itemId: 'starter_high_five', shareable: true }, T0).profile;
    const r = setItemsNote(p, { itemIds: ['starter_hug', 'starter_high_five'], note: '' }, T1);
    expect(r.changed).toBe(2);
    expect(getAnswer(r.profile, 'starter_hug')).toBeNull();
    expect(getAnswer(r.profile, 'starter_high_five')).toMatchObject({ stateId: 'yes', noteShareable: false });
    expect(getAnswer(r.profile, 'starter_high_five').note).toBeUndefined();
  });

  it('counts items that already have that note as unchanged', () => {
    const p = setItemsNote(fresh(), { itemIds: ['starter_hug'], note: 'same' }, T0).profile;
    const r = setItemsNote(p, { itemIds: ['starter_hug', 'starter_high_five'], note: 'same' }, T1);
    expect(r).toMatchObject({ changed: 1, unchanged: 1 });
  });

  it('refuses an over-long note, bad input and an empty selection', () => {
    expect(setItemsNote(fresh(), { itemIds: contact, note: 'x'.repeat(4001) }, T1).ok).toBe(false);
    expect(setItemsNote(fresh(), { itemIds: contact, note: 5 }, T1).ok).toBe(false);
    expect(setItemsNote(fresh(), { itemIds: [], note: 'x' }, T1).ok).toBe(false);
  });
});

describe('moveItemsToCategory', () => {
  const inCategory = (p, id) => sortedByOrder(p.items.filter((i) => i.categoryId === id)).map((i) => i.id);

  it('moves items to the end of the target, keeping their relative order', () => {
    const r = moveItemsToCategory(fresh(), { itemIds: ['starter_shoulder', 'starter_hug'], categoryId: 'starter_communication' }, T1);
    expect(r).toMatchObject({ ok: true, changed: 2, unchanged: 0 });
    expect(inCategory(r.profile, 'starter_communication')).toEqual(['starter_text', 'starter_call', 'starter_notice', 'starter_hug', 'starter_shoulder']);
    expect(inCategory(r.profile, 'starter_contact')).toEqual(['starter_high_five', 'starter_sit_close']);
  });

  it('counts items already in the target as unchanged', () => {
    const r = moveItemsToCategory(fresh(), { itemIds: ['starter_text', 'starter_hug'], categoryId: 'starter_communication' }, T1);
    expect(r).toMatchObject({ changed: 1, unchanged: 1 });
  });

  it('returns the same profile when nothing needs to move', () => {
    const start = fresh();
    expect(moveItemsToCategory(start, { itemIds: ['starter_text'], categoryId: 'starter_communication' }, T1).profile).toBe(start);
  });

  it('never lowers how sensitive an item is (D-032)', () => {
    const start = fresh(); // contact is personal, communication is normal
    expect(effectiveSensitivity(start, start.items.find((i) => i.id === 'starter_hug'))).toBe('personal');
    const r = moveItemsToCategory(start, { itemIds: ['starter_hug'], categoryId: 'starter_communication' }, T1);
    expect(effectiveSensitivity(r.profile, r.profile.items.find((i) => i.id === 'starter_hug'))).toBe('personal');
  });

  it('keeps answers, notes and views as they are (I-03)', () => {
    let p = setItemState(fresh(), { itemId: 'starter_hug', stateId: 'no' }, T0).profile;
    p = setItemNote(p, { itemId: 'starter_hug', note: 'note' }, T0).profile;
    const r = moveItemsToCategory(p, { itemIds: ['starter_hug'], categoryId: 'starter_communication' }, T1);
    expect(r.profile.answers).toBe(p.answers);
    expect(r.profile.views).toBe(p.views);
  });

  it('refuses a missing or hidden category, unknown items and an empty selection', () => {
    expect(moveItemsToCategory(fresh(), { itemIds: contact, categoryId: 'gone' }, T1).ok).toBe(false);
    const p = fresh();
    const hidden = { ...p, categories: p.categories.map((c) => (c.id === 'starter_communication' ? { ...c, visibility: 'hidden' } : c)) };
    expect(moveItemsToCategory(hidden, { itemIds: contact, categoryId: 'starter_communication' }, T1).ok).toBe(false);
    expect(moveItemsToCategory(fresh(), { itemIds: ['gone'], categoryId: 'starter_communication' }, T1).ok).toBe(false);
    expect(moveItemsToCategory(fresh(), { itemIds: [], categoryId: 'starter_communication' }, T1).ok).toBe(false);
  });

  it('produces a profile that still validates and does not mutate its input (I-05)', () => {
    const start = fresh();
    const before = JSON.stringify(start);
    Object.freeze(start); Object.freeze(start.items);
    const r = moveItemsToCategory(start, { itemIds: contact, categoryId: 'starter_communication' }, T1);
    expect(validateProfile(r.profile).ok).toBe(true);
    expect(JSON.stringify(start)).toBe(before);
  });
});

import { describe, it, expect } from 'vitest';
import { moveItem, moveCategory } from '../../src/domain/order-commands.js';
import { sortedByOrder } from '../../src/domain/selectors.js';

const NOW = '2026-10-26T10:00:00.000Z';
const cat = (id, parentId, sortOrder, visibility = 'visible') => ({
  id, name: id, description: '', parentId, sortOrder, visibility, sensitivity: 'normal', origin: null,
});
const item = (id, categoryId, sortOrder) => ({
  id, categoryId, type: 'state', label: id, description: '', sortOrder, sensitivity: 'normal', tags: [], origin: null,
});

const base = () => ({
  updatedAt: 'before',
  categories: [cat('a', null, 10), cat('b', null, 20), cat('c', null, 30), cat('sub', 'a', 10)],
  items: [item('i1', 'a', 10), item('i2', 'a', 20), item('i3', 'a', 30), item('other', 'b', 10)],
  answers: [{ itemId: 'i2', stateId: 'yes', noteShareable: false }],
  overrides: [],
  views: [],
});
const order = (list, filter = () => true) => sortedByOrder(list.filter(filter)).map((x) => x.id);

describe('moveItem', () => {
  it('moves an item later and earlier within its category', () => {
    const down = moveItem(base(), { id: 'i1', direction: 'later' }, NOW);
    expect(down.ok).toBe(true);
    expect(down.moved).toBe(true);
    expect(order(down.profile.items, (i) => i.categoryId === 'a')).toEqual(['i2', 'i1', 'i3']);
    const up = moveItem(down.profile, { id: 'i1', direction: 'earlier' }, NOW);
    expect(order(up.profile.items, (i) => i.categoryId === 'a')).toEqual(['i1', 'i2', 'i3']);
  });

  it('reports the new position among its siblings', () => {
    const result = moveItem(base(), { id: 'i3', direction: 'earlier' }, NOW);
    expect(result.position).toBe(2);
    expect(result.count).toBe(3);
  });

  it('does nothing at either end and says so', () => {
    const top = base();
    const first = moveItem(top, { id: 'i1', direction: 'earlier' }, NOW);
    expect(first).toMatchObject({ ok: true, moved: false, position: 1, count: 3 });
    expect(first.profile).toBe(top);
    expect(moveItem(top, { id: 'i3', direction: 'later' }, NOW).moved).toBe(false);
  });

  it('leaves items in other categories alone', () => {
    const start = base();
    const result = moveItem(start, { id: 'i1', direction: 'later' }, NOW);
    expect(result.profile.items.find((i) => i.id === 'other')).toBe(start.items.find((i) => i.id === 'other'));
  });

  it('repairs tied sort orders so the move is visible', () => {
    const tied = { ...base(), items: [item('x', 'a', 10), item('y', 'a', 10), item('z', 'a', 10)] };
    expect(order(tied.items)).toEqual(['x', 'y', 'z']);
    const result = moveItem(tied, { id: 'x', direction: 'later' }, NOW);
    expect(order(result.profile.items)).toEqual(['y', 'x', 'z']);
    expect(new Set(result.profile.items.map((i) => i.sortOrder)).size).toBe(3);
  });

  it('never touches answers, notes, states or views (I-03)', () => {
    const start = base();
    const result = moveItem(start, { id: 'i2', direction: 'later' }, NOW);
    expect(result.profile.answers).toBe(start.answers);
    expect(result.profile.views).toBe(start.views);
    expect(result.profile.items.map((i) => i.label).sort()).toEqual(start.items.map((i) => i.label).sort());
  });

  it('does not mutate its input and stamps updatedAt (I-05)', () => {
    const start = base();
    const frozen = JSON.stringify(start);
    Object.freeze(start); Object.freeze(start.items); Object.freeze(start.categories);
    const result = moveItem(start, { id: 'i1', direction: 'later' }, NOW);
    expect(JSON.stringify(start)).toBe(frozen);
    expect(result.profile.updatedAt).toBe(NOW);
  });

  it('refuses a missing item or a bad direction', () => {
    expect(moveItem(base(), { id: 'nope', direction: 'later' }, NOW).ok).toBe(false);
    expect(moveItem(base(), { id: 'i1', direction: 'sideways' }, NOW).ok).toBe(false);
  });
});

describe('moveCategory', () => {
  it('moves a top-level category among its siblings', () => {
    const result = moveCategory(base(), { id: 'c', direction: 'earlier' }, NOW);
    expect(order(result.profile.categories, (c) => c.parentId === null)).toEqual(['a', 'c', 'b']);
    expect(result.position).toBe(2);
    expect(result.count).toBe(3);
  });

  it('does nothing at the ends', () => {
    expect(moveCategory(base(), { id: 'a', direction: 'earlier' }, NOW).moved).toBe(false);
    expect(moveCategory(base(), { id: 'c', direction: 'later' }, NOW).moved).toBe(false);
  });

  it('keeps a sub-category inside its parent', () => {
    const start = { ...base(), categories: [...base().categories, cat('sub2', 'a', 20)] };
    const result = moveCategory(start, { id: 'sub', direction: 'later' }, NOW);
    expect(order(result.profile.categories, (c) => c.parentId === 'a')).toEqual(['sub2', 'sub']);
    expect(result.profile.categories.find((c) => c.id === 'sub').parentId).toBe('a');
    expect(moveCategory(start, { id: 'sub2', direction: 'later' }, NOW).moved).toBe(false);
  });

  it('steps over hidden categories so each press visibly moves', () => {
    const start = { ...base(), categories: [cat('a', null, 10), cat('h', null, 20, 'hidden'), cat('b', null, 30)] };
    const result = moveCategory(start, { id: 'a', direction: 'later' }, NOW);
    expect(order(result.profile.categories)).toEqual(['h', 'b', 'a']);
    expect(result.position).toBe(2);
    expect(result.count).toBe(2);
  });

  it('treats a category with only hidden neighbours as already at the end', () => {
    const start = { ...base(), categories: [cat('a', null, 10), cat('h', null, 20, 'hidden')] };
    expect(moveCategory(start, { id: 'a', direction: 'later' }, NOW).moved).toBe(false);
  });

  it('refuses a missing category or a bad direction', () => {
    expect(moveCategory(base(), { id: 'nope', direction: 'later' }, NOW).ok).toBe(false);
    expect(moveCategory(base(), { id: 'a', direction: 'x' }, NOW).ok).toBe(false);
  });
});

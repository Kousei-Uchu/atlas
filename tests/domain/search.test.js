import { describe, it, expect } from 'vitest';
import { filterTree, categoryChoices, normaliseText, searchTerms } from '../../src/domain/search.js';
import { getCategoryTree } from '../../src/domain/selectors.js';

const cat = (id, name, parentId = null, sortOrder = 10, visibility = 'visible') => ({
  id, name, description: '', parentId, sortOrder, visibility, sensitivity: 'normal', origin: null,
});
const item = (id, categoryId, label, extra = {}) => ({
  id, categoryId, type: 'state', label, description: '', sortOrder: 10, sensitivity: 'normal', tags: [], origin: null, ...extra,
});

const profile = {
  categories: [
    cat('c-touch', 'Touch', null, 10),
    cat('c-hug', 'Greetings', 'c-touch', 10),
    cat('c-talk', 'Café talk', null, 20),
    cat('c-secret', 'Hidden stuff', null, 30, 'hidden'),
  ],
  items: [
    item('i-hug', 'c-hug', 'A hug from a friend', { tags: ['affection'] }),
    item('i-hand', 'c-touch', 'Holding hands', { description: 'In public' }),
    item('i-cafe', 'c-talk', 'Talking about feelings'),
    item('i-hid', 'c-secret', 'A hug in secret'),
  ],
  answers: [{ itemId: 'i-hand', noteShareable: false, note: 'only on Tuesdays' }],
};
const tree = getCategoryTree(profile);

describe('normaliseText and searchTerms', () => {
  it('ignores case, accents and extra spaces', () => {
    expect(normaliseText('  Café   TIME ')).toBe('cafe time');
    expect(searchTerms('  Hug   FRIEND ')).toEqual(['hug', 'friend']);
    expect(searchTerms('   ')).toEqual([]);
  });
});

describe('filterTree', () => {
  it('shows everything when nothing is typed and no category is chosen', () => {
    const result = filterTree(tree, {});
    expect(result.active).toBe(false);
    expect(result.itemCount).toBe(3);
    expect(result.totalItems).toBe(3);
  });

  it('matches label, description and tags', () => {
    expect(filterTree(tree, { query: 'hug' }).itemCount).toBe(1);
    expect(filterTree(tree, { query: 'public' }).itemCount).toBe(1);
    expect(filterTree(tree, { query: 'affection' }).itemCount).toBe(1);
  });

  it('finds accented text from an unaccented query', () => {
    const result = filterTree(tree, { query: 'cafe' });
    expect(result.itemCount).toBe(1);
    expect(result.tree[0].category.id).toBe('c-talk');
  });

  it('needs every word, and words may come from the category name and the item', () => {
    expect(filterTree(tree, { query: 'greetings friend' }).itemCount).toBe(1);
    expect(filterTree(tree, { query: 'hug feelings' }).itemCount).toBe(0);
  });

  it('a category name alone shows every item beneath it', () => {
    expect(filterTree(tree, { query: 'touch' }).itemCount).toBe(2);
  });

  it('keeps the parent of a matching sub-category so the match has context', () => {
    const result = filterTree(tree, { query: 'hug' });
    expect(result.tree).toHaveLength(1);
    expect(result.tree[0].category.id).toBe('c-touch');
    expect(result.tree[0].items).toHaveLength(0);
    expect(result.tree[0].children[0].items[0].id).toBe('i-hug');
  });

  it('does not search notes (D-030)', () => {
    expect(filterTree(tree, { query: 'tuesdays' }).itemCount).toBe(0);
  });

  it('never returns hidden categories, even when they would match', () => {
    expect(filterTree(tree, { query: 'secret' }).itemCount).toBe(0);
  });

  it('filters to one category and everything beneath it', () => {
    const result = filterTree(tree, { categoryId: 'c-touch' });
    expect(result.active).toBe(true);
    expect(result.itemCount).toBe(2);
    expect(result.categoryCount).toBe(2);
    expect(result.totalItems).toBe(3);
  });

  it('combines a category with a query', () => {
    expect(filterTree(tree, { categoryId: 'c-touch', query: 'hands' }).itemCount).toBe(1);
    expect(filterTree(tree, { categoryId: 'c-talk', query: 'hands' }).itemCount).toBe(0);
  });

  it('ignores a category id that is not in the tree', () => {
    const result = filterTree(tree, { categoryId: 'c-gone' });
    expect(result.active).toBe(false);
    expect(result.itemCount).toBe(3);
  });

  it('does not change its input (I-05)', () => {
    const before = JSON.stringify(tree);
    filterTree(tree, { query: 'hug', categoryId: 'c-touch' });
    expect(JSON.stringify(tree)).toBe(before);
  });
});

describe('categoryChoices', () => {
  it('lists visible categories in order with their depth', () => {
    expect(categoryChoices(tree)).toEqual([
      { id: 'c-touch', name: 'Touch', depth: 0 },
      { id: 'c-hug', name: 'Greetings', depth: 1 },
      { id: 'c-talk', name: 'Café talk', depth: 0 },
    ]);
  });
});

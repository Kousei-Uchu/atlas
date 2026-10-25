// Ordering commands (spec 5.3, 5.4; M2-06). Same contract as commands.js:
// (profile, args, now) -> { ok, profile } | { ok: false, error }, pure, no mutation (I-05).
//
// Items move among the items of their own category. Categories move among their siblings.
// Order never touches answers, notes or state IDs, so moving a row cannot change what anyone
// has said about it (I-03).
import { sortedByOrder } from './selectors.js';

const ok = (profile, extra = {}) => ({ ok: true, profile, ...extra });
const fail = (error) => ({ ok: false, error });
const touch = (profile, now) => ({ ...profile, updatedAt: now });

const DIRECTIONS = ['earlier', 'later'];

/**
 * Move one entry earlier or later among its siblings, skipping over entries that are not
 * `eligible` (hidden categories). The skipped entries keep their relative order.
 * Returns the new order, or null when the entry is already at that end.
 */
function movedOrder(siblings, id, direction, eligible) {
  const from = siblings.findIndex((s) => s.id === id);
  const step = direction === 'earlier' ? -1 : 1;
  let to = from + step;
  while (to >= 0 && to < siblings.length && !eligible(siblings[to])) to += step;
  if (to < 0 || to >= siblings.length) return null;
  const next = [...siblings];
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry);
  return next;
}

/** Give siblings clean, distinct sort orders (10, 20, 30...) so ties can never hide a move. */
function renumber(list, ordered) {
  const orderById = new Map(ordered.map((entry, index) => [entry.id, (index + 1) * 10]));
  return list.map((entry) => (orderById.has(entry.id) && orderById.get(entry.id) !== entry.sortOrder
    ? { ...entry, sortOrder: orderById.get(entry.id) }
    : entry));
}

/** Where an entry sits among the entries a person can see, for announcements. */
function placeOf(ordered, id, eligible) {
  const shown = ordered.filter(eligible);
  return { position: shown.findIndex((s) => s.id === id) + 1, count: shown.length };
}

/**
 * Move an item one place earlier or later within its category.
 * At either end nothing changes and `moved` is false.
 * @param {{ id: string, direction: 'earlier'|'later' }} args
 */
export function moveItem(profile, { id, direction }, now) {
  if (!DIRECTIONS.includes(direction)) return fail('Direction must be earlier or later.');
  const item = profile.items.find((i) => i.id === id);
  if (!item) return fail('That item no longer exists.');
  const siblings = sortedByOrder(profile.items.filter((i) => i.categoryId === item.categoryId));
  const always = () => true;
  const next = movedOrder(siblings, id, direction, always);
  if (!next) return ok(profile, { moved: false, ...placeOf(siblings, id, always) });
  return ok(touch({ ...profile, items: renumber(profile.items, next) }, now), { moved: true, ...placeOf(next, id, always) });
}

/**
 * Move a category one place earlier or later among the categories with the same parent.
 * Hidden categories are stepped over, so every press visibly moves the category.
 * @param {{ id: string, direction: 'earlier'|'later' }} args
 */
export function moveCategory(profile, { id, direction }, now) {
  if (!DIRECTIONS.includes(direction)) return fail('Direction must be earlier or later.');
  const category = profile.categories.find((c) => c.id === id);
  if (!category) return fail('That category no longer exists.');
  const siblings = sortedByOrder(profile.categories.filter((c) => c.parentId === category.parentId));
  const shown = (c) => c.visibility === 'visible';
  const next = movedOrder(siblings, id, direction, shown);
  if (!next) return ok(profile, { moved: false, ...placeOf(siblings, id, shown) });
  return ok(touch({ ...profile, categories: renumber(profile.categories, next) }, now), { moved: true, ...placeOf(next, id, shown) });
}

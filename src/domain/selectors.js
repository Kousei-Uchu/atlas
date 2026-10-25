// Read-only views of a profile. Never mutate (I-05).
import { UNANSWERED_ID } from './defaults.js';
import { SENSITIVITY_LEVELS } from './schema.js';

const byOrderThenId = (a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function sortedByOrder(list) {
  return [...list].sort(byOrderThenId);
}

export function getAnswer(profile, itemId) {
  return profile.answers.find((a) => a.itemId === itemId) ?? null;
}

/**
 * The state an item resolves to. A missing answer, or one pointing at a state
 * that no longer exists, resolves to Unanswered and never to a positive state (I-01).
 */
export function effectiveStateId(profile, itemId) {
  const stateId = getAnswer(profile, itemId)?.stateId;
  if (stateId === undefined) return UNANSWERED_ID;
  return profile.states.some((s) => s.id === stateId) ? stateId : UNANSWERED_ID;
}

export function getState(profile, stateId) {
  return profile.states.find((s) => s.id === stateId) ?? null;
}

export function selectableStates(profile) {
  return profile.states.filter((s) => s.isSelectable);
}

/** An item's level is the higher of its own and its category's (D-015). */
export function effectiveSensitivity(profile, item) {
  const category = profile.categories.find((c) => c.id === item.categoryId);
  const own = SENSITIVITY_LEVELS.indexOf(item.sensitivity);
  const floor = category ? SENSITIVITY_LEVELS.indexOf(category.sensitivity) : 0;
  return SENSITIVITY_LEVELS[Math.max(own, floor)];
}

/**
 * Categories as a sorted tree with their items. Hidden categories (and their
 * children) are left out unless asked for.
 * @returns {{ category: object, items: object[], children: object[] }[]}
 */
export function getCategoryTree(profile, { includeHidden = false } = {}) {
  const build = (parentId) =>
    sortedByOrder(profile.categories.filter((c) => c.parentId === parentId))
      .filter((c) => includeHidden || c.visibility === 'visible')
      .map((category) => ({
        category,
        items: sortedByOrder(profile.items.filter((i) => i.categoryId === category.id)),
        children: build(category.id),
      }));
  return build(null);
}

/** Ids of a category and everything beneath it. */
export function descendantCategoryIds(profile, categoryId) {
  const found = new Set([categoryId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of profile.categories) {
      if (c.parentId !== null && found.has(c.parentId) && !found.has(c.id)) {
        found.add(c.id);
        grew = true;
      }
    }
  }
  return found;
}

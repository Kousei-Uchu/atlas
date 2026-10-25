// Every edit is a pure command: (profile, args, now) -> result.
// Commands return a new profile with structural sharing and never mutate their input (I-05).
// They do not touch `revision`; that belongs to the repository.
import { LIMITS } from './limits.js';
import { effectiveStateId, getAnswer, descendantCategoryIds } from './selectors.js';
import { getNextState, directionForAction } from './state-cycle.js';
import { isValidId } from './ids.js';

const ok = (profile, extra = {}) => ({ ok: true, profile, ...extra });
const fail = (error) => ({ ok: false, error });
const touch = (profile, now) => ({ ...profile, updatedAt: now });
const maxOrder = (list) => list.reduce((m, x) => Math.max(m, x.sortOrder), 0);

function cleanText(value, max, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') return { error: `${label} cannot be empty.` };
  if (text.length > max) return { error: `${label} must be ${max} characters or fewer.` };
  return { text };
}

/** Insert, replace or remove an answer record, keeping records minimal (D-012). */
function withAnswer(profile, itemId, patch) {
  const existing = getAnswer(profile, itemId);
  const merged = { ...(existing ?? { itemId, noteShareable: false }), ...patch };
  const next = { itemId, noteShareable: Boolean(merged.note) && merged.noteShareable === true };
  if (merged.stateId) next.stateId = merged.stateId;
  if (merged.text) next.text = merged.text;
  if (merged.note) next.note = merged.note;
  const hasContent = Boolean(next.stateId || next.text || next.note);
  let answers;
  if (!hasContent) answers = profile.answers.filter((a) => a.itemId !== itemId);
  else if (existing) answers = profile.answers.map((a) => (a.itemId === itemId ? next : a));
  else answers = [...profile.answers, next];
  return { ...profile, answers };
}

function findItem(profile, itemId, type) {
  const item = profile.items.find((i) => i.id === itemId);
  if (!item) return { error: 'That item no longer exists.' };
  if (type && item.type !== type) return { error: `That item does not take ${type === 'state' ? 'a state' : 'text'}.` };
  return { item };
}

// ---- answers ----

/** Set an item's state. Choosing Unanswered removes the stored state (D-012). */
export function setItemState(profile, { itemId, stateId }, now) {
  const { error } = findItem(profile, itemId, 'state');
  if (error) return fail(error);
  const state = profile.states.find((s) => s.id === stateId);
  if (!state) return fail('That state does not exist.');
  if (!state.isUnanswered && !state.isSelectable) return fail('That state cannot be selected.');
  if (effectiveStateId(profile, itemId) === stateId) return ok(profile);
  const patch = { stateId: state.isUnanswered ? undefined : stateId };
  return ok(touch(withAnswer(profile, itemId, patch), now));
}

/**
 * One click or key press along the configured cycle (D-003, D-021).
 * @param {{ itemId: string, action: 'primary'|'secondary' }} args
 */
export function stepItemState(profile, { itemId, action }, now) {
  const { error } = findItem(profile, itemId, 'state');
  if (error) return fail(error);
  const direction = directionForAction(action, profile.settings.interaction.primaryDirection);
  const result = getNextState(effectiveStateId(profile, itemId), profile.states, direction, {
    endBehaviour: profile.settings.cycle.endBehaviour,
  });
  if (!result.ok) return fail(result.error);
  if (result.clamped) return ok(profile, { clamped: true });
  return { ...setItemState(profile, { itemId, stateId: result.stateId }, now), clamped: false };
}

export function setItemText(profile, { itemId, text }, now) {
  const { error } = findItem(profile, itemId, 'text');
  if (error) return fail(error);
  if (typeof text !== 'string' || text.length > LIMITS.textLength) return fail(`Text must be ${LIMITS.textLength} characters or fewer.`);
  if ((getAnswer(profile, itemId)?.text ?? '') === text) return ok(profile);
  return ok(touch(withAnswer(profile, itemId, { text }), now));
}

export function setItemNote(profile, { itemId, note }, now) {
  const { error } = findItem(profile, itemId);
  if (error) return fail(error);
  if (typeof note !== 'string' || note.length > LIMITS.noteLength) return fail(`Notes must be ${LIMITS.noteLength} characters or fewer.`);
  if ((getAnswer(profile, itemId)?.note ?? '') === note) return ok(profile);
  return ok(touch(withAnswer(profile, itemId, { note }), now));
}

/** Notes are private unless the user marks one shareable (I-11). */
export function setNoteShareable(profile, { itemId, shareable }, now) {
  const { error } = findItem(profile, itemId);
  if (error) return fail(error);
  const answer = getAnswer(profile, itemId);
  if (!answer?.note) return fail('Add a note before choosing to share it.');
  if (answer.noteShareable === shareable) return ok(profile);
  return ok(touch(withAnswer(profile, itemId, { noteShareable: shareable === true }), now));
}

// ---- categories ----

export function addCategory(profile, { id, name, parentId = null, sensitivity = 'normal' }, now) {
  if (!isValidId(id) || profile.categories.some((c) => c.id === id)) return fail('That category id is not available.');
  const cleaned = cleanText(name, LIMITS.categoryNameLength, 'Category name');
  if (cleaned.error) return fail(cleaned.error);
  if (profile.categories.length >= LIMITS.categories) return fail(`A profile can have up to ${LIMITS.categories} categories.`);
  let depth = 1;
  if (parentId !== null) {
    let cursor = profile.categories.find((c) => c.id === parentId);
    if (!cursor) return fail('The parent category no longer exists.');
    while (cursor) { depth += 1; cursor = profile.categories.find((c) => c.id === cursor.parentId); }
  }
  if (depth > LIMITS.categoryDepth) return fail(`Categories can be nested up to ${LIMITS.categoryDepth} levels.`);
  const siblings = profile.categories.filter((c) => c.parentId === parentId);
  const category = {
    id, name: cleaned.text, description: '', parentId, sortOrder: maxOrder(siblings) + 10,
    visibility: 'visible', sensitivity, origin: null,
  };
  return ok(touch({ ...profile, categories: [...profile.categories, category] }, now));
}

export function renameCategory(profile, { id, name }, now) {
  const cleaned = cleanText(name, LIMITS.categoryNameLength, 'Category name');
  if (cleaned.error) return fail(cleaned.error);
  if (!profile.categories.some((c) => c.id === id)) return fail('That category no longer exists.');
  return ok(touch({ ...profile, categories: profile.categories.map((c) => (c.id === id ? { ...c, name: cleaned.text } : c)) }, now));
}

/**
 * Delete a category with its sub-categories, items, answers, overrides and view
 * references, so nothing is left dangling. Undo restores it all.
 */
export function deleteCategory(profile, { id }, now) {
  if (!profile.categories.some((c) => c.id === id)) return fail('That category no longer exists.');
  const doomedCategories = descendantCategoryIds(profile, id);
  const doomedItems = new Set(profile.items.filter((i) => doomedCategories.has(i.categoryId)).map((i) => i.id));
  return ok(touch(removeItems({
    ...profile,
    categories: profile.categories.filter((c) => !doomedCategories.has(c.id)),
  }, doomedItems), now), { removedItems: doomedItems.size });
}

// ---- items ----

export function addItem(profile, { id, categoryId, label, type = 'state', sensitivity = 'normal' }, now) {
  if (!isValidId(id) || profile.items.some((i) => i.id === id)) return fail('That item id is not available.');
  if (type !== 'state' && type !== 'text') return fail('Unknown item type.');
  const cleaned = cleanText(label, LIMITS.labelLength, 'Item name');
  if (cleaned.error) return fail(cleaned.error);
  if (!profile.categories.some((c) => c.id === categoryId)) return fail('That category no longer exists.');
  if (profile.items.length >= LIMITS.items) return fail(`A profile can have up to ${LIMITS.items} items.`);
  const item = {
    id, categoryId, type, label: cleaned.text, description: '',
    sortOrder: maxOrder(profile.items.filter((i) => i.categoryId === categoryId)) + 10,
    sensitivity, tags: [], origin: null,
  };
  return ok(touch({ ...profile, items: [...profile.items, item] }, now));
}

export function renameItem(profile, { id, label }, now) {
  const cleaned = cleanText(label, LIMITS.labelLength, 'Item name');
  if (cleaned.error) return fail(cleaned.error);
  if (!profile.items.some((i) => i.id === id)) return fail('That item no longer exists.');
  return ok(touch({ ...profile, items: profile.items.map((i) => (i.id === id ? { ...i, label: cleaned.text } : i)) }, now));
}

export function deleteItem(profile, { id }, now) {
  if (!profile.items.some((i) => i.id === id)) return fail('That item no longer exists.');
  return ok(touch(removeItems(profile, new Set([id])), now));
}

function removeItems(profile, itemIds) {
  if (itemIds.size === 0) return profile;
  return {
    ...profile,
    items: profile.items.filter((i) => !itemIds.has(i.id)),
    answers: profile.answers.filter((a) => !itemIds.has(a.itemId)),
    overrides: profile.overrides.filter((o) => !itemIds.has(o.itemId)),
    views: profile.views.map((v) => ({
      ...v,
      includedItemIds: v.includedItemIds.filter((x) => !itemIds.has(x)),
      restrictedOptInItemIds: v.restrictedOptInItemIds.filter((x) => !itemIds.has(x)),
    })),
  };
}


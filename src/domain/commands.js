// Every edit is a pure command: (profile, args, now) -> result.
// Commands return a new profile with structural sharing and never mutate their input (I-05).
// They do not touch `revision`; that belongs to the repository.
import { LIMITS } from './limits.js';
import { effectiveStateId, getAnswer, descendantCategoryIds } from './selectors.js';
import { getNextState, directionForAction } from './state-cycle.js';
import { isValidId } from './ids.js';
import { MAX_DECIMALS, canonicalDate, canonicalNumber } from './item-values.js';

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
  if (merged.choices && merged.choices.length > 0) next.choices = merged.choices;
  if (merged.note) next.note = merged.note;
  const hasContent = Boolean(next.stateId || next.text || next.choices || next.note);
  let answers;
  if (!hasContent) answers = profile.answers.filter((a) => a.itemId !== itemId);
  else if (existing) answers = profile.answers.map((a) => (a.itemId === itemId ? next : a));
  else answers = [...profile.answers, next];
  return { ...profile, answers };
}

function findItem(profile, itemId, type) {
  const item = profile.items.find((i) => i.id === itemId);
  if (!item) return { error: 'That item no longer exists.' };
  if (type && item.type !== type) return { error: `That item does not take ${{ state: 'a state', text: 'text', number: 'a number', date: 'a date', choice: 'a choice' }[type]}.` };
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

/** Set a number answer. Empty text clears it (Unanswered). Anything else must be a number in the one kept form. */
export function setItemNumber(profile, { itemId, text }, now) {
  const { error } = findItem(profile, itemId, 'number');
  if (error) return fail(error);
  if (typeof text !== 'string') return fail('A number is needed.');
  const value = text.trim() === '' ? '' : canonicalNumber(text);
  if (value === null) return fail(`Use digits, with up to ${MAX_DECIMALS} after a point, and no larger than a million million.`);
  if ((getAnswer(profile, itemId)?.text ?? '') === value) return ok(profile);
  return ok(touch(withAnswer(profile, itemId, { text: value }), now));
}

/** Set a date answer as YYYY-MM-DD. Empty text clears it (Unanswered). */
export function setItemDate(profile, { itemId, text }, now) {
  const { error } = findItem(profile, itemId, 'date');
  if (error) return fail(error);
  if (typeof text !== 'string') return fail('A date is needed.');
  const value = text.trim() === '' ? '' : canonicalDate(text);
  if (value === null) return fail('Use a real date written as year-month-day.');
  if ((getAnswer(profile, itemId)?.text ?? '') === value) return ok(profile);
  return ok(touch(withAnswer(profile, itemId, { text: value }), now));
}

/** Set the chosen options of a choice item. An empty list clears it (Unanswered). Order carries no meaning. */
export function setItemChoices(profile, { itemId, choiceIds }, now) {
  const { error, item } = findItem(profile, itemId, 'choice');
  if (error) return fail(error);
  if (!Array.isArray(choiceIds)) return fail('A list of options is needed.');
  const known = new Set((item.options ?? []).map((o) => o.id));
  if (choiceIds.some((id) => !known.has(id))) return fail('One of those options no longer exists.');
  const wanted = new Set(choiceIds);
  const ordered = (item.options ?? []).filter((o) => wanted.has(o.id)).map((o) => o.id);
  const current = getAnswer(profile, itemId)?.choices ?? [];
  if (current.length === ordered.length && current.every((id, i) => id === ordered[i])) return ok(profile);
  return ok(touch(withAnswer(profile, itemId, { choices: ordered }), now));
}

/**
 * Replace the options of a choice item. Commands are pure, so the caller supplies the ids; `planOptions` in
 * item-values.js keeps the id of every option whose label is unchanged. An option left out is removed from the
 * answer, and the rest of the answer stays.
 * @param {{ itemId: string, options: Array<{ id: string, label: string }> }} args
 */
export function setItemOptions(profile, { itemId, options }, now) {
  const { error, item } = findItem(profile, itemId, 'choice');
  if (error) return fail(error);
  const checked = checkOptions(options);
  if (checked.error) return fail(checked.error);
  if (JSON.stringify(checked.options) === JSON.stringify(item.options ?? [])) return ok(profile);
  const kept = new Set(checked.options.map((o) => o.id));
  const answer = getAnswer(profile, itemId);
  let next = { ...profile, items: profile.items.map((i) => (i.id === itemId ? { ...i, options: checked.options } : i)) };
  if (answer?.choices) next = withAnswer(next, itemId, { choices: answer.choices.filter((id) => kept.has(id)) });
  return ok(touch(next, now));
}

function checkOptions(options) {
  if (!Array.isArray(options) || options.length === 0) return { error: 'A choice item needs at least one option.' };
  if (options.length > LIMITS.optionsPerItem) return { error: `A choice item can have up to ${LIMITS.optionsPerItem} options.` };
  const labels = new Set();
  const ids = new Set();
  const list = [];
  for (const o of options) {
    const label = typeof o?.label === 'string' ? o.label.replace(/\s+/g, ' ').trim() : '';
    if (label === '') return { error: 'An option cannot be empty.' };
    if (label.length > LIMITS.optionLabelLength) return { error: `An option can be up to ${LIMITS.optionLabelLength} characters.` };
    if (!isValidId(o.id) || ids.has(o.id)) return { error: 'An option id is not available.' };
    if (labels.has(label.toLowerCase())) return { error: 'Two options cannot have the same name.' };
    labels.add(label.toLowerCase());
    ids.add(o.id);
    list.push({ id: o.id, label });
  }
  return { options: list };
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

export function addItem(profile, { id, categoryId, label, type = 'state', sensitivity = 'normal', options, unit }, now) {
  if (!isValidId(id) || profile.items.some((i) => i.id === id)) return fail('That item id is not available.');
  if (!['state', 'text', 'number', 'date', 'choice'].includes(type)) return fail('Unknown item type.');
  let optionList;
  if (type === 'choice') {
    const checked = checkOptions(options);
    if (checked.error) return fail(checked.error);
    optionList = checked.options;
  } else if (options !== undefined) return fail('Only a choice item has options.');
  const cleanUnit = typeof unit === 'string' ? unit.replace(/\s+/g, ' ').trim() : '';
  if (cleanUnit !== '' && type !== 'number') return fail('Only a number item has a unit.');
  if (cleanUnit.length > LIMITS.unitLength) return fail(`A unit can be up to ${LIMITS.unitLength} characters.`);
  const cleaned = cleanText(label, LIMITS.labelLength, 'Item name');
  if (cleaned.error) return fail(cleaned.error);
  if (!profile.categories.some((c) => c.id === categoryId)) return fail('That category no longer exists.');
  if (profile.items.length >= LIMITS.items) return fail(`A profile can have up to ${LIMITS.items} items.`);
  const item = {
    id, categoryId, type, label: cleaned.text, description: '',
    sortOrder: maxOrder(profile.items.filter((i) => i.categoryId === categoryId)) + 10,
    sensitivity, tags: [], origin: null,
    ...(optionList ? { options: optionList } : {}),
    ...(cleanUnit !== '' ? { unit: cleanUnit } : {}),
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


// Bulk commands (spec 13, M2-07). Same contract as commands.js:
// (profile, args, now) -> { ok, profile, ... } | { ok: false, error }, pure, no mutation (I-05).
//
// Each one is built from the single-item commands, so every rule that applies to one item
// applies to many (Unanswered is never invented, a cleared state keeps its note, text items
// take no state). The whole change is one result, so the UI commits it as one undo step.
// Nothing here runs without the person asking; the UI confirms first and says how many
// items change.
import { LIMITS } from './limits.js';
import { setItemNote, setItemState } from './commands.js';
import { effectiveSensitivity, effectiveStateId, getAnswer, sortedByOrder } from './selectors.js';

const ok = (profile, extra = {}) => ({ ok: true, profile, ...extra });
const fail = (error) => ({ ok: false, error });
const touch = (profile, now) => ({ ...profile, updatedAt: now });

/** Check the id list: a non-empty array of items that all still exist. Returns unique ids. */
function pickItems(profile, itemIds) {
  if (!Array.isArray(itemIds) || itemIds.length === 0) return { error: 'Select at least one item first.' };
  const unique = [...new Set(itemIds)];
  const known = new Set(profile.items.map((i) => i.id));
  if (unique.some((id) => !known.has(id))) return { error: 'Some of the selected items no longer exist.' };
  return { ids: unique };
}

/**
 * Set the same state on many items. Items that take text instead of a state are skipped and
 * counted. Choosing Unanswered clears the stored state and keeps any note (D-012).
 * @param {{ itemIds: string[], stateId: string }} args
 * @returns {{ ok: true, profile: object, changed: number, unchanged: number, skipped: number } | { ok: false, error: string }}
 */
export function setItemsState(profile, { itemIds, stateId }, now) {
  const picked = pickItems(profile, itemIds);
  if (picked.error) return fail(picked.error);
  const state = profile.states.find((s) => s.id === stateId);
  if (!state) return fail('That state does not exist.');
  if (!state.isUnanswered && !state.isSelectable) return fail('That state cannot be selected.');

  let next = profile;
  let changed = 0; let unchanged = 0; let skipped = 0;
  for (const id of picked.ids) {
    const item = profile.items.find((i) => i.id === id);
    if (item.type !== 'state') { skipped += 1; continue; }
    if (effectiveStateId(next, id) === stateId) { unchanged += 1; continue; }
    const result = setItemState(next, { itemId: id, stateId }, now);
    if (!result.ok) return fail(result.error);
    next = result.profile;
    changed += 1;
  }
  return ok(changed > 0 ? touch(next, now) : profile, { changed, unchanged, skipped });
}

/**
 * Replace the note on many items with the same text, or clear them all with an empty string.
 * Clearing a note also turns off "allow this note to be shared" for that item.
 * @param {{ itemIds: string[], note: string }} args
 */
export function setItemsNote(profile, { itemIds, note }, now) {
  const picked = pickItems(profile, itemIds);
  if (picked.error) return fail(picked.error);
  if (typeof note !== 'string') return fail('The note must be text.');
  const text = note.trim();
  if (text.length > LIMITS.noteLength) return fail(`Notes must be ${LIMITS.noteLength} characters or fewer.`);

  let next = profile;
  let changed = 0; let unchanged = 0;
  for (const id of picked.ids) {
    if ((getAnswer(next, id)?.note ?? '') === text) { unchanged += 1; continue; }
    const result = setItemNote(next, { itemId: id, note: text }, now);
    if (!result.ok) return fail(result.error);
    next = result.profile;
    changed += 1;
  }
  return ok(changed > 0 ? touch(next, now) : profile, { changed, unchanged });
}

/**
 * Move many items into one category, after the items already there, keeping their order
 * relative to each other. A moved item never gets a lower sensitivity than it had: its own
 * level is raised to what it was effectively, so moving it out of a sensitive category cannot
 * quietly make it look less sensitive (D-015, D-032). Answers, notes and views are untouched.
 * @param {{ itemIds: string[], categoryId: string }} args
 */
export function moveItemsToCategory(profile, { itemIds, categoryId }, now) {
  const picked = pickItems(profile, itemIds);
  if (picked.error) return fail(picked.error);
  const target = profile.categories.find((c) => c.id === categoryId);
  if (!target) return fail('That category no longer exists.');
  if (target.visibility !== 'visible') return fail('Items cannot be moved into a hidden category.');

  const chosen = new Set(picked.ids);
  const moving = sortedByOrder(profile.items.filter((i) => chosen.has(i.id) && i.categoryId !== categoryId));
  const unchanged = picked.ids.length - moving.length;
  if (moving.length === 0) return ok(profile, { changed: 0, unchanged });

  const lastOrder = profile.items.filter((i) => i.categoryId === categoryId).reduce((m, i) => Math.max(m, i.sortOrder), 0);
  const placed = new Map(moving.map((item, index) => [item.id, {
    ...item,
    categoryId,
    sortOrder: lastOrder + (index + 1) * 10,
    sensitivity: effectiveSensitivity(profile, item),
  }]));
  const items = profile.items.map((i) => placed.get(i.id) ?? i);
  return ok(touch({ ...profile, items }, now), { changed: moving.length, unchanged });
}

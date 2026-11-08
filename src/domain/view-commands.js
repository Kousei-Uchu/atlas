// View commands (spec 5.6; I-04, I-05, I-11; M4-04). Pure, same contract as commands.js:
// (profile, args, now) -> { ok, profile } or { ok: false, error }.
//
// A view is an allowlist of items for one audience, with three switches: include sensitive
// items, include notes, and a per-item opt-in for restricted items. Nothing here builds an
// export. `view-inclusion.js` decides what a view would include, and a view can only grow
// more open through a choice the person makes here.
import { LIMITS } from './limits.js';
import { isValidId } from './ids.js';
import { effectiveSensitivity } from './selectors.js';

const ok = (profile, extra = {}) => ({ ok: true, profile, ...extra });
const fail = (error) => ({ ok: false, error });
const touch = (profile, now) => ({ ...profile, updatedAt: now });

const find = (profile, id) => profile.views.find((v) => v.id === id);
const replace = (profile, view, now) => ok(touch({ ...profile, views: profile.views.map((v) => (v.id === view.id ? view : v)) }, now));

function cleanName(profile, value, exceptId) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') return { error: 'A view needs a name.' };
  if (text.length > LIMITS.categoryNameLength) return { error: `A view name must be ${LIMITS.categoryNameLength} characters or fewer.` };
  const clash = profile.views.find((v) => v.id !== exceptId && v.name.trim().toLowerCase() === text.toLowerCase());
  if (clash) return { error: `There is already a view called “${clash.name}”.` };
  return { text };
}

/** Keep only ids of items that exist, once each, in the order given. */
function knownItemIds(profile, ids) {
  const items = new Set(profile.items.map((i) => i.id));
  return [...new Set(ids)].filter((id) => items.has(id));
}

/**
 * Make a new view. It starts empty, with sensitive items, restricted items and notes all off, so
 * nothing is included until the person picks it (I-11).
 * @param {{ id: string, name: string, audienceId?: string|null }} args
 */
export function addView(profile, { id, name, audienceId = null }, now) {
  if (!isValidId(id) || profile.views.some((v) => v.id === id)) return fail('That view id is not available.');
  if (profile.views.length >= LIMITS.views) return fail(`A profile can have up to ${LIMITS.views} views.`);
  if (audienceId !== null && !profile.audiences.some((a) => a.id === audienceId)) return fail('That audience no longer exists.');
  const cleaned = cleanName(profile, name);
  if (cleaned.error) return fail(cleaned.error);
  const view = {
    id, name: cleaned.text, audienceId, includedItemIds: [], includeSensitive: false,
    restrictedOptInItemIds: [], includeNotes: false, visualization: { type: 'matrix', options: {} },
  };
  return ok(touch({ ...profile, views: [...profile.views, view] }, now));
}

export function renameView(profile, { id, name }, now) {
  const view = find(profile, id);
  if (!view) return fail('That view no longer exists.');
  const cleaned = cleanName(profile, name, id);
  if (cleaned.error) return fail(cleaned.error);
  if (cleaned.text === view.name) return ok(profile);
  return replace(profile, { ...view, name: cleaned.text }, now);
}

/**
 * Point a view at a different audience, or at none (the default answers). Which items are picked
 * and every switch stay as they were, and what the view shows is recomputed from the new audience.
 */
export function setViewAudience(profile, { id, audienceId }, now) {
  const view = find(profile, id);
  if (!view) return fail('That view no longer exists.');
  if (audienceId !== null && !profile.audiences.some((a) => a.id === audienceId)) return fail('That audience no longer exists.');
  if (view.audienceId === audienceId) return ok(profile);
  return replace(profile, { ...view, audienceId }, now);
}

/**
 * Replace the allowlist. An item that leaves the list also loses its restricted opt-in, so picking
 * it again later asks again and never shares a restricted item because of an old choice.
 * @param {{ id: string, itemIds: string[] }} args
 */
export function setViewItems(profile, { id, itemIds }, now) {
  const view = find(profile, id);
  if (!view) return fail('That view no longer exists.');
  if (!Array.isArray(itemIds)) return fail('Choose which items to include.');
  const next = knownItemIds(profile, itemIds);
  if (next.length > LIMITS.items) return fail(`A view can include up to ${LIMITS.items} items.`);
  const keep = new Set(next);
  const restrictedOptInItemIds = view.restrictedOptInItemIds.filter((x) => keep.has(x));
  if (JSON.stringify(next) === JSON.stringify(view.includedItemIds) && restrictedOptInItemIds.length === view.restrictedOptInItemIds.length) return ok(profile);
  return replace(profile, { ...view, includedItemIds: next, restrictedOptInItemIds }, now);
}

/** Add items to the allowlist. Nothing already there moves, and no opt-in is created. */
export function addViewItems(profile, { id, itemIds }, now) {
  const view = find(profile, id);
  if (!view) return fail('That view no longer exists.');
  if (!Array.isArray(itemIds)) return fail('Choose which items to include.');
  return setViewItems(profile, { id, itemIds: [...view.includedItemIds, ...itemIds] }, now);
}

/** Take items off the allowlist, and with them any restricted opt-in. */
export function removeViewItems(profile, { id, itemIds }, now) {
  const view = find(profile, id);
  if (!view) return fail('That view no longer exists.');
  if (!Array.isArray(itemIds)) return fail('Choose which items to remove.');
  const drop = new Set(itemIds);
  return setViewItems(profile, { id, itemIds: view.includedItemIds.filter((x) => !drop.has(x)) }, now);
}

function setSwitch(profile, id, field, value, now) {
  const view = find(profile, id);
  if (!view) return fail('That view no longer exists.');
  if (typeof value !== 'boolean') return fail('That choice is either on or off.');
  if (view[field] === value) return ok(profile);
  return replace(profile, { ...view, [field]: value }, now);
}

/** Allow items at the sensitive level. Restricted items are never allowed by this switch. */
export function setViewIncludeSensitive(profile, { id, includeSensitive }, now) {
  return setSwitch(profile, id, 'includeSensitive', includeSensitive, now);
}

/** Allow notes, but only the notes the person has also marked as shareable on the item. */
export function setViewIncludeNotes(profile, { id, includeNotes }, now) {
  return setSwitch(profile, id, 'includeNotes', includeNotes, now);
}

/**
 * Choose to include, or stop including, one restricted item. The item must already be picked and
 * must be restricted, so an opt-in can never exist for an item that needs none or is not in the view.
 * @param {{ id: string, itemId: string, optIn: boolean }} args
 */
export function setRestrictedOptIn(profile, { id, itemId, optIn }, now) {
  const view = find(profile, id);
  if (!view) return fail('That view no longer exists.');
  if (typeof optIn !== 'boolean') return fail('That choice is either on or off.');
  const item = profile.items.find((i) => i.id === itemId);
  if (!item) return fail('That item no longer exists.');
  const has = view.restrictedOptInItemIds.includes(itemId);
  if (!optIn) {
    if (!has) return ok(profile);
    return replace(profile, { ...view, restrictedOptInItemIds: view.restrictedOptInItemIds.filter((x) => x !== itemId) }, now);
  }
  if (!view.includedItemIds.includes(itemId)) return fail('Pick the item for this view first.');
  if (effectiveSensitivity(profile, item) !== 'restricted') return fail('Only restricted items need this choice.');
  if (has) return ok(profile);
  return replace(profile, { ...view, restrictedOptInItemIds: [...view.restrictedOptInItemIds, itemId] }, now);
}

export function deleteView(profile, { id }, now) {
  if (!find(profile, id)) return fail('That view no longer exists.');
  return ok(touch({ ...profile, views: profile.views.filter((v) => v.id !== id) }, now));
}

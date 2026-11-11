// Audience and override commands (spec 5.6, 7; D-013, I-04; M4-01). Pure, same contract as
// commands.js (I-05): (profile, args, now) -> { ok, profile } or { ok: false, error }.
//
// An override is a per-audience exception for one item. It never edits the default answer
// (I-04) and carries no priority (D-013): two enabled overrides for one item and audience are
// a conflict that is reported, never settled by order.
import { LIMITS } from './limits.js';
import { isValidId } from './ids.js';
import { AUDIENCE_TYPES } from './schema.js';

const ok = (profile, extra = {}) => ({ ok: true, profile, ...extra });
const fail = (error) => ({ ok: false, error });
const touch = (profile, now) => ({ ...profile, updatedAt: now });

function cleanName(profile, value, exceptId) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') return { error: 'An audience needs a name.' };
  if (text.length > LIMITS.categoryNameLength) return { error: `An audience name must be ${LIMITS.categoryNameLength} characters or fewer.` };
  // Two audiences with one name could not be told apart on the review screen.
  const clash = profile.audiences.find((a) => a.id !== exceptId && a.name.trim().toLowerCase() === text.toLowerCase());
  if (clash) return { error: `There is already an audience called “${clash.name}”.` };
  return { text };
}

function cleanLongText(value, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > LIMITS.descriptionLength) return { error: `${label} must be ${LIMITS.descriptionLength} characters or fewer.` };
  return { text };
}

// ---- audiences ----

/** @param {{ id: string, name: string, type: string, description?: string }} args */
export function addAudience(profile, { id, name, type, description = '' }, now) {
  if (!isValidId(id) || profile.audiences.some((a) => a.id === id)) return fail('That audience id is not available.');
  if (!AUDIENCE_TYPES.includes(type)) return fail('Choose one of the listed kinds of audience.');
  if (profile.audiences.length >= LIMITS.audiences) return fail(`A profile can have up to ${LIMITS.audiences} audiences.`);
  const cleaned = cleanName(profile, name);
  if (cleaned.error) return fail(cleaned.error);
  const desc = cleanLongText(description, 'The description');
  if (desc.error) return fail(desc.error);
  const audience = { id, name: cleaned.text, type, description: desc.text, parentId: null };
  return ok(touch({ ...profile, audiences: [...profile.audiences, audience] }, now));
}

/** Change an audience's name, kind or description. Only the fields given change. */
export function updateAudience(profile, { id, name, type, description }, now) {
  const current = profile.audiences.find((a) => a.id === id);
  if (!current) return fail('That audience no longer exists.');
  const next = { ...current };
  if (name !== undefined) {
    const cleaned = cleanName(profile, name, id);
    if (cleaned.error) return fail(cleaned.error);
    next.name = cleaned.text;
  }
  if (type !== undefined) {
    if (!AUDIENCE_TYPES.includes(type)) return fail('Choose one of the listed kinds of audience.');
    next.type = type;
  }
  if (description !== undefined) {
    const desc = cleanLongText(description, 'The description');
    if (desc.error) return fail(desc.error);
    next.description = desc.text;
  }
  if (next.name === current.name && next.type === current.type && next.description === current.description) return ok(profile);
  return ok(touch({ ...profile, audiences: profile.audiences.map((a) => (a.id === id ? next : a)) }, now));
}

/**
 * Place an audience inside another one, or at the top level (`parentId: null`). Used by the relationship graph
 * (M7-06). An audience cannot sit inside itself or inside one of its own children.
 * @param {{ id: string, parentId: string | null }} args
 */
export function setAudienceParent(profile, { id, parentId }, now) {
  const current = profile.audiences.find((a) => a.id === id);
  if (!current) return fail('That audience no longer exists.');
  const target = parentId ?? null;
  if (target !== null) {
    const parent = profile.audiences.find((a) => a.id === target);
    if (!parent) return fail('The audience to place it inside no longer exists.');
    for (let cursor = parent, hops = 0; cursor; hops += 1) {
      if (cursor.id === id) return fail('An audience cannot be placed inside itself or inside one of its own.');
      if (hops > profile.audiences.length) break;
      cursor = cursor.parentId === null ? null : profile.audiences.find((a) => a.id === cursor.parentId);
    }
  }
  if (current.parentId === target) return ok(profile);
  return ok(touch({ ...profile, audiences: profile.audiences.map((a) => (a.id === id ? { ...a, parentId: target } : a)) }, now));
}

/**
 * Views that use an audience. Deleting the audience would drop its overrides, and a view
 * built on it could then show the default answer instead, which may be more open. So the
 * delete is refused until those views are changed or removed.
 */
export function viewsUsingAudience(profile, audienceId) {
  return profile.views.filter((v) => v.audienceId === audienceId);
}

/** Delete an audience and its overrides. Refused while a view is built on it. */
export function deleteAudience(profile, { id }, now) {
  if (!profile.audiences.some((a) => a.id === id)) return fail('That audience no longer exists.');
  const using = viewsUsingAudience(profile, id);
  if (using.length > 0) {
    const names = using.map((v) => `“${v.name}”`).join(', ');
    return fail(`${using.length === 1 ? 'A view uses' : 'Views use'} this audience: ${names}. Change or remove ${using.length === 1 ? 'it' : 'them'} first.`);
  }
  const removed = profile.overrides.filter((o) => o.audienceId === id).length;
  return ok(touch({
    ...profile,
    audiences: profile.audiences
      .filter((a) => a.id !== id)
      .map((a) => (a.parentId === id ? { ...a, parentId: null } : a)),
    overrides: profile.overrides.filter((o) => o.audienceId !== id),
  }, now), { removedOverrides: removed });
}

// ---- overrides ----

/**
 * Set what one audience sees for one item. The pair has one override: setting it again
 * replaces whatever was there, including a conflicting pair, because the person has now
 * chosen. The override can show any selectable state or Unanswered. It never changes the
 * item's own answer (I-04).
 * @param {{ id: string, itemId: string, audienceId: string, stateId: string, explanation?: string }} args
 */
export function setOverride(profile, { id, itemId, audienceId, stateId, explanation = '' }, now) {
  const item = profile.items.find((i) => i.id === itemId);
  if (!item) return fail('That item no longer exists.');
  if (item.type !== 'state') return fail('Only items that take a state can have an audience override.');
  if (!profile.audiences.some((a) => a.id === audienceId)) return fail('That audience no longer exists.');
  const state = profile.states.find((s) => s.id === stateId);
  if (!state) return fail('That state does not exist.');
  if (!state.isUnanswered && !state.isSelectable) return fail('That state cannot be selected.');
  const note = cleanLongText(explanation, 'The explanation');
  if (note.error) return fail(note.error);

  const existing = profile.overrides.filter((o) => o.itemId === itemId && o.audienceId === audienceId);
  const keepId = existing[0]?.id ?? id;
  if (existing.length === 0) {
    if (!isValidId(id) || profile.overrides.some((o) => o.id === id)) return fail('That override id is not available.');
    if (profile.overrides.length >= LIMITS.overrides) return fail(`A profile can have up to ${LIMITS.overrides} overrides.`);
  }
  const record = { id: keepId, itemId, audienceId, stateId, enabled: true, explanation: note.text };
  if (existing.length === 1 && JSON.stringify(existing[0]) === JSON.stringify(record)) return ok(profile);
  const rest = profile.overrides.filter((o) => !(o.itemId === itemId && o.audienceId === audienceId));
  return ok(touch({ ...profile, overrides: [...rest, record] }, now));
}

/** Turn an override off or on without losing it. A disabled override is ignored. */
export function setOverrideEnabled(profile, { id, enabled }, now) {
  const current = profile.overrides.find((o) => o.id === id);
  if (!current) return fail('That override no longer exists.');
  if (typeof enabled !== 'boolean') return fail('An override is either on or off.');
  if (current.enabled === enabled) return ok(profile);
  return ok(touch({ ...profile, overrides: profile.overrides.map((o) => (o.id === id ? { ...o, enabled } : o)) }, now));
}

/** Remove an override. The audience then sees the default answer again. */
export function removeOverride(profile, { id }, now) {
  if (!profile.overrides.some((o) => o.id === id)) return fail('That override no longer exists.');
  return ok(touch({ ...profile, overrides: profile.overrides.filter((o) => o.id !== id) }, now));
}

/** Overrides of one audience, in a stable order. */
export function overridesForAudience(profile, audienceId) {
  return profile.overrides.filter((o) => o.audienceId === audienceId).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Snapshot commands (M7-03, D-063). Pure, same contract as commands.js (I-05):
// (profile, args, now) -> { ok, profile } or { ok: false, error }.
//
// A snapshot is the answers to state questions at one moment. It keeps names as well as ids so it stays
// readable after items are renamed or deleted. It never holds notes, a person's own words, audiences or views.
// Deleting an item does not remove it from earlier snapshots; a snapshot has to be deleted on its own.
import { LIMITS } from './limits.js';
import { isValidId } from './ids.js';
import { UNANSWERED_ID } from './defaults.js';
import { effectiveStateId, getState, sortedByOrder } from './selectors.js';

const ok = (profile, extra = {}) => ({ ok: true, profile, ...extra });
const fail = (error) => ({ ok: false, error });
const touch = (profile, now) => ({ ...profile, updatedAt: now });

/** The answers a snapshot would hold right now: one entry per state question that has an answer. */
export function snapshotEntries(profile) {
  const categoryName = new Map(profile.categories.map((c) => [c.id, c.name]));
  const entries = [];
  for (const item of sortedByOrder(profile.items)) {
    if (item.type !== 'state') continue;
    const stateId = effectiveStateId(profile, item.id);
    if (stateId === UNANSWERED_ID) continue; // Unanswered is the absence of an answer (I-01)
    entries.push({
      itemId: item.id,
      label: item.label,
      categoryName: categoryName.get(item.categoryId) ?? '',
      stateId,
      stateLabel: getState(profile, stateId).label,
    });
  }
  return entries;
}

function cleanLabel(profile, value, exceptId) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') return { error: 'A snapshot needs a name.' };
  if (text.length > LIMITS.titleLength) return { error: `A snapshot name must be ${LIMITS.titleLength} characters or fewer.` };
  const clash = profile.snapshots.find((s) => s.id !== exceptId && s.label.trim().toLowerCase() === text.toLowerCase());
  if (clash) return { error: `There is already a snapshot called “${clash.label}”.` };
  return { text };
}

/** @param {{ id: string, label: string }} args */
export function takeSnapshot(profile, { id, label }, now) {
  if (!isValidId(id) || profile.snapshots.some((s) => s.id === id)) return fail('A snapshot needs its own new id.');
  const named = cleanLabel(profile, label);
  if (named.error) return fail(named.error);
  if (profile.snapshots.length >= LIMITS.snapshots) {
    return fail(`You can keep ${LIMITS.snapshots} snapshots. Delete an older one to make room.`);
  }
  const entries = snapshotEntries(profile);
  if (entries.length === 0) return fail('There are no answers to save yet. Answer something first.');
  const used = profile.snapshots.reduce((n, s) => n + s.entries.length, 0);
  if (used + entries.length > LIMITS.snapshotEntries) {
    return fail('The saved snapshots are full. Delete an older one to make room.');
  }
  return ok(touch({ ...profile, snapshots: [...profile.snapshots, { id, label: named.text, takenAt: now, entries }] }, now));
}

/** @param {{ id: string, label: string }} args */
export function renameSnapshot(profile, { id, label }, now) {
  const snap = profile.snapshots.find((s) => s.id === id);
  if (!snap) return fail('That snapshot no longer exists.');
  const named = cleanLabel(profile, label, id);
  if (named.error) return fail(named.error);
  return ok(touch({ ...profile, snapshots: profile.snapshots.map((s) => (s.id === id ? { ...s, label: named.text } : s)) }, now));
}

/** @param {{ id: string }} args */
export function deleteSnapshot(profile, { id }, now) {
  if (!profile.snapshots.some((s) => s.id === id)) return fail('That snapshot no longer exists.');
  return ok(touch({ ...profile, snapshots: profile.snapshots.filter((s) => s.id !== id) }, now));
}

export function deleteAllSnapshots(profile, _args, now) {
  if (profile.snapshots.length === 0) return fail('There are no snapshots to delete.');
  return ok(touch({ ...profile, snapshots: [] }, now));
}

// The timeline: how answers changed between snapshots and now (M7-03, D-063). Pure and read-only.
// It describes changes in plain words and never scores them, so nothing here says better, worse, more or less.
import { LIMITS } from './limits.js';
import { snapshotEntries } from './snapshot-commands.js';

/**
 * Compare two lists of entries, matched by item.
 * @returns {{ newlyAnswered: object[], cleared: object[], changed: Array<{ before: object, after: object }>, same: number }}
 */
export function diffEntries(before, after) {
  const was = new Map(before.map((e) => [e.itemId, e]));
  const now = new Map(after.map((e) => [e.itemId, e]));
  const newlyAnswered = [];
  const cleared = [];
  const changed = [];
  let same = 0;
  for (const entry of after) {
    const prior = was.get(entry.itemId);
    if (!prior) newlyAnswered.push(entry);
    else if (prior.stateId !== entry.stateId) changed.push({ before: prior, after: entry });
    else same += 1;
  }
  for (const entry of before) if (!now.has(entry.itemId)) cleared.push(entry);
  return { newlyAnswered, cleared, changed, same };
}

export const changeCount = (diff) => diff.newlyAnswered.length + diff.cleared.length + diff.changed.length;

/**
 * Oldest to newest: every snapshot, then the chart as it is now. Each point after the first says how many
 * answers changed since the one before it.
 * @returns {Array<{ key: string, kind: 'snapshot' | 'now', snapshot: object | null, entries: object[], changesSincePrevious: number | null }>}
 */
export function timeline(profile) {
  const points = [
    ...[...profile.snapshots].sort((a, b) => a.takenAt.localeCompare(b.takenAt) || a.id.localeCompare(b.id))
      .map((snapshot) => ({ key: snapshot.id, kind: 'snapshot', snapshot, entries: snapshot.entries })),
    { key: 'now', kind: 'now', snapshot: null, entries: snapshotEntries(profile) },
  ];
  return points.map((point, i) => ({
    ...point,
    changesSincePrevious: i === 0 ? null : changeCount(diffEntries(points[i - 1].entries, point.entries)),
  }));
}

/**
 * A new profile with the answers a snapshot held (I-12: the open profile is not changed).
 * It keeps the chart's structure and states, drops notes, the person's own words, overrides, views and history,
 * and leaves out answers whose item or state no longer exists, reporting how many.
 * @param {{ id: string, title?: string }} args
 */
export function profileFromSnapshot(profile, snapshotId, { id }, now) {
  const snap = profile.snapshots.find((s) => s.id === snapshotId);
  if (!snap) return { ok: false, error: 'That snapshot no longer exists.' };
  if (typeof id !== 'string' || id === '' || id === profile.id) return { ok: false, error: 'A new profile needs its own new id.' };
  const itemIds = new Set(profile.items.filter((i) => i.type === 'state').map((i) => i.id));
  const stateIds = new Set(profile.states.map((s) => s.id));
  const answers = [];
  let skipped = 0;
  for (const entry of snap.entries) {
    if (itemIds.has(entry.itemId) && stateIds.has(entry.stateId)) answers.push({ itemId: entry.itemId, stateId: entry.stateId, noteShareable: false });
    else skipped += 1;
  }
  let title = `${profile.title} (as at ${snap.label})`;
  if (title.length > LIMITS.titleLength) title = title.slice(0, LIMITS.titleLength);
  // Text items keep no answer, so their own-words entries and every note are not carried over.
  return {
    ok: true,
    skipped,
    profile: { ...profile, id, title, revision: 0, createdAt: now, updatedAt: now, answers, overrides: [], views: [], snapshots: [] },
  };
}


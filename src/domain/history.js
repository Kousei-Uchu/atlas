// In-memory undo/redo (D-025). Snapshots share structure, so 100 entries are cheap.
// Not persisted. `revision` belongs to storage, so it always follows the live profile
// and is never rolled back by undo (otherwise the next save would raise ConflictError).
import { LIMITS } from './limits.js';

/** @param {object} profile */
export function createHistory(profile) {
  return { past: [], present: profile, future: [], lastGroup: null };
}

export const canUndo = (h) => h.past.length > 0;
export const canRedo = (h) => h.future.length > 0;

/**
 * Record a new profile. Consecutive commits with the same `group` (for example
 * typing in one note field) collapse into a single undo step.
 */
export function commit(history, profile, { group = null, limit = LIMITS.undoHistory } = {}) {
  if (profile === history.present) return history;
  const merge = group !== null && group === history.lastGroup;
  const past = merge ? history.past : [...history.past, history.present].slice(-limit);
  return { past, present: profile, future: [], lastGroup: group };
}

export function undo(history, now) {
  if (!canUndo(history)) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: carry(previous, history.present, now),
    future: [history.present, ...history.future],
    lastGroup: null,
  };
}

export function redo(history, now) {
  if (!canRedo(history)) return history;
  const [next, ...rest] = history.future;
  return {
    past: [...history.past, history.present],
    present: carry(next, history.present, now),
    future: rest,
    lastGroup: null,
  };
}

/** After a successful save, adopt the new revision without creating an undo step. */
export function syncRevision(history, revision) {
  if (history.present.revision === revision) return history;
  return { ...history, present: { ...history.present, revision } };
}

function carry(snapshot, live, now) {
  return { ...snapshot, revision: live.revision, ...(now ? { updatedAt: now } : {}) };
}

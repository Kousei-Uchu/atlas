// Profile-level commands (spec 9; M2-08). Pure, same contract as commands.js (I-05).
import { LIMITS } from './limits.js';

const ok = (profile, extra = {}) => ({ ok: true, profile, ...extra });
const fail = (error) => ({ ok: false, error });

/**
 * Rename the open profile. An ordinary command, so it can be undone.
 * @param {{ title: string }} args
 */
export function renameProfile(profile, { title }, now) {
  const text = typeof title === 'string' ? title.trim() : '';
  if (text === '') return fail('A profile needs a name.');
  if (text.length > LIMITS.titleLength) return fail(`A profile name must be ${LIMITS.titleLength} characters or fewer.`);
  if (text === profile.title) return ok(profile);
  return ok({ ...profile, title: text, updatedAt: now });
}

/** "Copy of X", cut short if needed so it still fits the title limit. */
export function copyTitle(title) {
  const prefix = 'Copy of ';
  const room = LIMITS.titleLength - prefix.length;
  return `${prefix}${title.length > room ? `${title.slice(0, room - 1).trimEnd()}…` : title}`;
}

/**
 * A separate copy of a profile under a new id, at revision 0, ready to store as NEW (I-12).
 * Everything inside it (states, categories, items, answers, notes, settings) is kept as is.
 * The original is not changed.
 * @param {{ id: string, title?: string }} args
 */
export function duplicateProfile(profile, { id, title }, now) {
  if (typeof id !== 'string' || id === '' || id === profile.id) return fail('A copy needs its own new id.');
  const text = (typeof title === 'string' && title.trim() !== '' ? title.trim() : copyTitle(profile.title));
  if (text.length > LIMITS.titleLength) return fail(`A profile name must be ${LIMITS.titleLength} characters or fewer.`);
  return ok({ ...profile, id, title: text, revision: 0, createdAt: now, updatedAt: now });
}

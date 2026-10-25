// Device preferences (M2-04): how the app looks on this device. These are not part of any
// profile, so they never appear in a backup and never change an answer. They live in the
// existing `settings` store under their own keys.
//
// Reads and writes validate against a fixed list. An unknown stored value is ignored rather
// than trusted, so a damaged record can only ever fall back to "follow the device".
import { STORE_SETTINGS } from './database.js';

const THEME_KEY = 'theme';

/** The theme choices, in menu order. `system` means follow the device setting. */
export const THEME_CHOICES = Object.freeze(['system', 'light', 'dark', 'high-contrast']);

/** @param {unknown} value */
export function isThemeChoice(value) {
  return typeof value === 'string' && THEME_CHOICES.includes(value);
}

/**
 * The saved theme choice. Returns `system` when nothing is saved or the value is not recognised.
 * @param {import('idb').IDBPDatabase} db
 * @returns {Promise<'system' | 'light' | 'dark' | 'high-contrast'>}
 */
export async function loadThemeChoice(db) {
  const record = await db.get(STORE_SETTINGS, THEME_KEY);
  return isThemeChoice(record?.value) ? record.value : 'system';
}

/**
 * Save the theme choice. Rejects an unknown value so nothing unexpected is ever stored.
 * @param {import('idb').IDBPDatabase} db
 * @param {string} choice
 */
export async function saveThemeChoice(db, choice) {
  if (!isThemeChoice(choice)) throw new RangeError(`Unknown theme: ${String(choice)}`);
  await db.put(STORE_SETTINGS, { key: THEME_KEY, value: choice });
}

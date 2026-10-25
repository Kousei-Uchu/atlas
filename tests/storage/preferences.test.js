import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openAtlasDb, STORE_SETTINGS } from '../../src/storage/database.js';
import { isThemeChoice, loadThemeChoice, saveThemeChoice, THEME_CHOICES } from '../../src/storage/preferences.js';
import { createProfile, deleteAllData, getActiveProfileId, setActiveProfileId } from '../../src/storage/profile-repository.js';
import { createStarterProfile } from '../../src/domain/defaults.js';

let db;
let counter = 0;
beforeEach(async () => {
  counter += 1;
  db = await openAtlasDb({ name: `atlas-prefs-test-${counter}` });
});
afterEach(() => db.close());

describe('theme preference', () => {
  it('follows the device when nothing is saved', async () => {
    expect(await loadThemeChoice(db)).toBe('system');
  });

  it.each(THEME_CHOICES)('saves and reloads %s', async (choice) => {
    await saveThemeChoice(db, choice);
    expect(await loadThemeChoice(db)).toBe(choice);
  });

  it('refuses to store an unknown theme', async () => {
    await expect(saveThemeChoice(db, 'neon')).rejects.toThrow(RangeError);
    expect(await loadThemeChoice(db)).toBe('system');
  });

  it('ignores a damaged stored value instead of trusting it', async () => {
    await db.put(STORE_SETTINGS, { key: 'theme', value: '<script>alert(1)</script>' });
    expect(await loadThemeChoice(db)).toBe('system');
    await db.put(STORE_SETTINGS, { key: 'theme', value: 42 });
    expect(await loadThemeChoice(db)).toBe('system');
  });

  it('recognises only the listed choices', () => {
    expect(isThemeChoice('dark')).toBe(true);
    expect(isThemeChoice('Dark')).toBe(false);
    expect(isThemeChoice(undefined)).toBe(false);
  });

  it('does not disturb the active-profile pointer, and is cleared by delete-all', async () => {
    const profile = createStarterProfile({ id: 'profile_a', now: '2026-10-26T00:00:00.000Z' });
    await createProfile(db, profile);
    await setActiveProfileId(db, 'profile_a');
    await saveThemeChoice(db, 'high-contrast');
    expect(await getActiveProfileId(db)).toBe('profile_a');

    await deleteAllData(db);
    expect(await loadThemeChoice(db)).toBe('system');
  });
});

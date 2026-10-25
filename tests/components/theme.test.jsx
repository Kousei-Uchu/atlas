// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { freshDb, renderAtlas, seriousViolations } from './helpers.jsx';
import { STORE_SETTINGS } from '../../src/storage/database.js';
import { loadThemeChoice } from '../../src/storage/preferences.js';
import { listProfiles, loadProfile } from '../../src/storage/profile-repository.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(() => {
  db.close();
  document.documentElement.removeAttribute('data-theme');
  vi.restoreAllMocks();
});

const theme = () => document.documentElement.getAttribute('data-theme');
const menu = () => screen.getByRole('combobox', { name: 'Appearance' });
const liveRegion = () => document.querySelector('[role="status"][aria-live="polite"]');

describe('Appearance menu (M2-04)', () => {
  it('offers the four choices and follows the device by default', async () => {
    await renderAtlas(db);
    expect(menu().value).toBe('system');
    expect(theme()).toBeNull();
    const options = [...menu().querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toEqual(['Match my device', 'Light', 'Dark', 'High contrast']);
  });

  it('applies the high-contrast theme at once and announces it', async () => {
    const { user } = await renderAtlas(db);
    await user.selectOptions(menu(), 'High contrast');
    expect(theme()).toBe('high-contrast');
    // The session may pad repeated messages so a screen reader says them again, so compare trimmed.
    expect(liveRegion().textContent.trim()).toBe('Appearance set to High contrast');
  });

  it.each([['Light', 'light'], ['Dark', 'dark']])('applies %s', async (label, value) => {
    const { user } = await renderAtlas(db);
    await user.selectOptions(menu(), label);
    expect(theme()).toBe(value);
  });

  it('goes back to following the device by removing the attribute', async () => {
    const { user } = await renderAtlas(db);
    await user.selectOptions(menu(), 'Dark');
    await user.selectOptions(menu(), 'Match my device');
    expect(theme()).toBeNull();
  });

  it('saves the choice and restores it after a reload', async () => {
    const first = await renderAtlas(db);
    await first.user.selectOptions(menu(), 'High contrast');
    await waitFor(async () => expect(await loadThemeChoice(db)).toBe('high-contrast'));

    first.unmount();
    document.documentElement.removeAttribute('data-theme');
    await renderAtlas(db);
    await waitFor(() => expect(theme()).toBe('high-contrast'));
    expect(menu().value).toBe('high-contrast');
  });

  it('keeps the choice out of the profile, so backups and answers are untouched (I-03)', async () => {
    const { user } = await renderAtlas(db);
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    const [summary] = await listProfiles(db);
    const before = JSON.stringify((await loadProfile(db, summary.id)).profile);

    await user.selectOptions(menu(), 'High contrast');
    await waitFor(async () => expect(await loadThemeChoice(db)).toBe('high-contrast'));
    expect(JSON.stringify((await loadProfile(db, summary.id)).profile)).toBe(before);
  });

  it('ignores a damaged saved value and follows the device', async () => {
    await db.put(STORE_SETTINGS, { key: 'theme', value: 'neon' });
    await renderAtlas(db);
    expect(menu().value).toBe('system');
    expect(theme()).toBeNull();
  });

  it('still applies the theme for this visit, and says so, when the choice cannot be saved (I-13)', async () => {
    const realPut = db.put.bind(db);
    vi.spyOn(db, 'put').mockImplementation((store, ...rest) => (
      store === STORE_SETTINGS ? Promise.reject(new Error('disk full')) : realPut(store, ...rest)
    ));
    const { user } = await renderAtlas(db);
    await user.selectOptions(menu(), 'Dark');

    expect(theme()).toBe('dark');
    const message = await screen.findByText('This choice could not be saved, so it will reset when you reload.');
    expect(menu().getAttribute('aria-describedby')).toBe(message.id);
  });

  it('clears the saved-failure message after a later choice is saved', async () => {
    const realPut = db.put.bind(db);
    let fail = true;
    vi.spyOn(db, 'put').mockImplementation((store, ...rest) => (
      store === STORE_SETTINGS && fail ? Promise.reject(new Error('disk full')) : realPut(store, ...rest)
    ));
    const { user } = await renderAtlas(db);
    await user.selectOptions(menu(), 'Dark');
    await screen.findByText(/could not be saved/);

    fail = false;
    await user.selectOptions(menu(), 'Light');
    await waitFor(() => expect(screen.queryByText(/could not be saved/)).toBeNull());
    expect(await loadThemeChoice(db)).toBe('light');
  });

  it('has no serious or critical accessibility violations in the high-contrast theme', async () => {
    const { user, container } = await renderAtlas(db);
    await user.selectOptions(menu(), 'High contrast');
    expect(await seriousViolations(container)).toEqual([]);
  });
});

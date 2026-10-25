// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { freshDb, renderAtlas, seriousViolations, stateButton } from './helpers.jsx';
import { loadProfile, listProfiles } from '../../src/storage/profile-repository.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(() => db.close());

const HUG = 'A hug from a friend';
const nameField = () => screen.getByRole('textbox', { name: 'Name of this profile' });
const headerName = () => document.querySelector('.profile-name').textContent;
const panel = () => screen.getByRole('heading', { name: 'Profiles' }).closest('section');

async function allStored() {
  await waitFor(async () => expect(screen.getByText('Saved')).toBeTruthy());
  const list = await listProfiles(db);
  return Promise.all(list.map(async (s) => (await loadProfile(db, s.id)).profile));
}

describe('rename profile (M2-08)', () => {
  it('renames the open profile, shows it in the header, and saves it', async () => {
    const { user } = await renderAtlas(db);
    expect(headerName()).toBe('Profile: My profile');
    await user.clear(nameField());
    await user.type(nameField(), '  Work me ');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(headerName()).toBe('Profile: Work me');
    expect(nameField().value).toBe('Work me');
    const [profile] = await allStored();
    expect(profile.title).toBe('Work me');
  });

  it('is disabled when the name is blank or unchanged', async () => {
    const { user } = await renderAtlas(db);
    expect(screen.getByRole('button', { name: 'Rename' }).disabled).toBe(true);
    await user.clear(nameField());
    expect(screen.getByRole('button', { name: 'Rename' }).disabled).toBe(true);
    await user.type(nameField(), 'Other');
    expect(screen.getByRole('button', { name: 'Rename' }).disabled).toBe(false);
  });

  it('can be undone, and the field follows', async () => {
    const { user } = await renderAtlas(db);
    await user.clear(nameField());
    await user.type(nameField(), 'Temp');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(headerName()).toBe('Profile: My profile');
    expect(nameField().value).toBe('My profile');
  });
});

describe('make a copy (M2-08)', () => {
  it('opens a separate copy with the same answers, and leaves the original alone', async () => {
    const { user } = await renderAtlas(db);
    await user.click(stateButton(HUG));
    await user.click(screen.getByRole('button', { name: 'Make a copy of this profile' }));
    await waitFor(() => expect(headerName()).toBe('Profile: Copy of My profile'));
    expect(stateButton(HUG).textContent).toBe('Unsure');

    await user.click(stateButton(HUG)); // Unsure moves toward No
    expect(stateButton(HUG).textContent).toBe('No');

    const profiles = await allStored();
    expect(profiles).toHaveLength(2);
    const original = profiles.find((p) => p.title === 'My profile');
    const copy = profiles.find((p) => p.title === 'Copy of My profile');
    expect(original.id).not.toBe(copy.id);
    expect(original.answers.map((a) => a.stateId)).toEqual(['unsure']);
    expect(copy.answers.map((a) => a.stateId)).toEqual(['no']);
  });

  it('flushes unsaved edits first, so the copy includes the latest answer', async () => {
    const { user } = await renderAtlas(db, { debounceMs: 5000 });
    await user.click(stateButton(HUG));
    await user.click(screen.getByRole('button', { name: 'Make a copy of this profile' }));
    await waitFor(() => expect(headerName()).toBe('Profile: Copy of My profile'));
    expect(stateButton(HUG).textContent).toBe('Unsure');
    const profiles = await allStored();
    expect(profiles.find((p) => p.title === 'My profile').answers).toHaveLength(1);
  });

  it('lists both profiles in the switcher', async () => {
    const { user } = await renderAtlas(db);
    await user.click(screen.getByRole('button', { name: 'Make a copy of this profile' }));
    await waitFor(() => expect(headerName()).toBe('Profile: Copy of My profile'));
    const options = within(screen.getByRole('combobox', { name: 'Open a profile' })).getAllByRole('option').map((o) => o.textContent);
    expect(options.sort()).toEqual(['Copy of My profile (open)', 'My profile']);
  });
});

describe('storage usage (M2-08)', () => {
  it('shows the profile size and the browser’s own estimate', async () => {
    const estimate = async () => ({ usage: 5 * 1024 * 1024, quota: 2 * 1024 ** 3 });
    await renderAtlas(db, { estimate });
    await waitFor(() => expect(within(panel()).getByText(/This site is using about 5\.0 MB of about 2\.0 GB/)).toBeTruthy());
    expect(within(panel()).getByText(/This profile takes about \d/)).toBeTruthy();
    expect(within(panel()).getByText(/These are estimates/)).toBeTruthy();
  });

  it('says plainly when the browser gives no estimate', async () => {
    await renderAtlas(db, { estimate: async () => null });
    await waitFor(() => expect(within(panel()).getByText('This browser does not say how much space is used.')).toBeTruthy());
  });

  it('has no serious accessibility violations', async () => {
    const { container } = await renderAtlas(db, { estimate: async () => null });
    expect(await seriousViolations(container)).toEqual([]);
  });
});

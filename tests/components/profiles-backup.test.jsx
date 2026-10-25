// @vitest-environment jsdom
// M1-13: backup export, import-as-new, profile switcher and delete actions
// (M1-AC-08, M1-AC-09 at the UI, I-12).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { freshDb, renderAtlas, seriousViolations, stateButton } from './helpers.jsx';
import { listProfiles, loadProfile } from '../../src/storage/profile-repository.js';
import { buildBackup, parseBackupText, RAW_RECORD_FORMAT } from '../../src/storage/backup.js';
import { DELETE_ALL_DESCRIPTION, IMPORT_NOTICE, BACKUP_NOTICE } from '../../src/content/notices.js';
import { LIMITS } from '../../src/domain/limits.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(() => db.close());

const HUG = 'A hug from a friend';
const FIXED_NOW = '2026-10-26T01:02:03.000Z';

const render = (props = {}) => {
  const saveFile = vi.fn();
  return renderAtlas(db, { now: () => FIXED_NOW, saveFile, ...props }).then((r) => ({ ...r, saveFile }));
};

const jsonFile = (value, name = 'backup.json') => new File([typeof value === 'string' ? value : JSON.stringify(value)], name, { type: 'application/json' });
const fileInput = () => screen.getByLabelText('Choose a backup file (.json)');

async function storedProfiles() {
  const list = await listProfiles(db);
  return Promise.all(list.map(async (s) => (await loadProfile(db, s.id)).profile));
}

/** Snapshot every raw stored record, to prove a failed import changes nothing. */
async function rawSnapshot() {
  return JSON.stringify(await db.getAll('profiles'));
}

describe('full backup export (M1-AC-08)', () => {
  it('labels the backup as containing everything and unencrypted', async () => {
    await render();
    expect(screen.getByText(BACKUP_NOTICE)).toBeTruthy();
  });

  it('downloads a backup file that imports back to a deep-equal profile', async () => {
    const { user, saveFile } = await render();
    await user.click(stateButton(HUG)); // Unsure
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Download full backup' }));
    expect(saveFile).toHaveBeenCalledTimes(1);
    const [filename, text] = saveFile.mock.calls[0];
    expect(filename).toBe('atlas-backup-my-profile-2026-10-26.json');

    const parsed = parseBackupText(text);
    expect(parsed.ok).toBe(true);
    const [original] = await storedProfiles();
    expect(parsed.profile).toEqual(original);
  });
});

describe('import as a new profile (I-12, M1-AC-08)', () => {
  it('previews a valid backup, then creates a NEW profile and leaves the old one untouched', async () => {
    const { user, saveFile } = await render();
    await user.click(stateButton(HUG));
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Download full backup' }));
    const text = saveFile.mock.calls[0][1];
    const before = await storedProfiles();

    await user.upload(fileInput(), jsonFile(text));
    const preview = await screen.findByRole('region', { name: 'Import preview' });
    expect(within(preview).getByText(/Ready to import: My profile/)).toBeTruthy();
    expect(within(preview).getByText('1 answers')).toBeTruthy();
    expect(within(preview).getByText(/same internal id is already stored/)).toBeTruthy();
    expect((await storedProfiles())).toHaveLength(1); // nothing is stored before confirming

    await user.click(within(preview).getByRole('button', { name: 'Import as new profile' }));
    await waitFor(async () => expect(await storedProfiles()).toHaveLength(2));

    const after = await storedProfiles();
    expect(after.find((p) => p.id === before[0].id)).toEqual(before[0]); // original byte-for-byte equal
    const copy = after.find((p) => p.id !== before[0].id);
    expect({ ...copy, id: before[0].id, revision: 0 }).toEqual({ ...before[0], revision: 0 });
    expect(screen.queryByRole('region', { name: 'Import preview' })).toBeNull();
    expect(stateButton(HUG).textContent).toBe('Unsure'); // the imported copy is open
  });

  it('cancelling the preview stores nothing', async () => {
    const { user, saveFile } = await render();
    await user.click(screen.getByRole('button', { name: 'Download full backup' }));
    await user.upload(fileInput(), jsonFile(saveFile.mock.calls[0][1]));
    const preview = await screen.findByRole('region', { name: 'Import preview' });
    await user.click(within(preview).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Import preview' })).toBeNull();
    expect(await storedProfiles()).toHaveLength(1);
  });

  it('shows the import notice', async () => {
    await render();
    expect(screen.getByText(IMPORT_NOTICE)).toBeTruthy();
  });
});

describe('hostile imports are refused and change nothing (M1-AC-09)', () => {
  /** A valid backup as a plain object, to damage in different ways. */
  async function validBackup() {
    const [profile] = await storedProfiles();
    return JSON.parse(JSON.stringify(buildBackup(profile, FIXED_NOW)));
  }

  const cases = [
    ['malformed JSON', async () => '{ not json', /not valid JSON|JSON/i],
    ['the wrong format', async () => ({ format: 'something-else' }), null],
    ['a newer format version', async () => ({ ...(await validBackup()), formatVersion: 99 }), null],
    ['unknown fields', async () => ({ ...(await validBackup()), extra: 1 }), null],
    ['a dangling reference', async () => {
      const b = await validBackup();
      b.profile.answers.push({ itemId: 'missing-item', stateId: 'yes', note: '', noteShareable: false });
      return b;
    }, null],
    ['duplicate ids', async () => {
      const b = await validBackup();
      b.profile.items.push({ ...b.profile.items[0] });
      return b;
    }, null],
    ['a category cycle', async () => {
      const b = await validBackup();
      const [first, second] = b.profile.categories;
      first.parentId = second.id;
      second.parentId = first.id;
      return b;
    }, null],
    ['forbidden keys', async () => '{"format":"atlas-backup","__proto__":{"x":1}}', null],
    ['excess nesting', async () => {
      let deep = {};
      for (let i = 0; i < LIMITS.jsonDepth + 3; i += 1) deep = { a: deep };
      return { ...(await validBackup()), extra: deep };
    }, null],
  ];

  it.each(cases)('refuses %s with a readable message', async (_name, make, pattern) => {
    const { user } = await render();
    const body = await make();
    const snapshot = await rawSnapshot();

    await user.upload(fileInput(), jsonFile(body));
    const banner = (await screen.findByText(/Nothing was imported/)).closest('[role="alert"]');
    expect(banner.textContent).toContain('Nothing was imported and your existing profiles are unchanged.');
    if (pattern) expect(banner.textContent).toMatch(pattern);
    expect(screen.queryByRole('region', { name: 'Import preview' })).toBeNull();
    expect(await rawSnapshot()).toBe(snapshot);
  });

  it('refuses an oversized file before reading it', async () => {
    const { user } = await render();
    const big = jsonFile('{}');
    Object.defineProperty(big, 'size', { value: LIMITS.backupFileBytes + 1 });
    const readSpy = vi.spyOn(big, 'text');
    const snapshot = await rawSnapshot();

    await user.upload(fileInput(), big);
    expect(await screen.findByText(/Nothing was imported/)).toBeTruthy();
    expect(readSpy).not.toHaveBeenCalled();
    expect(await rawSnapshot()).toBe(snapshot);
  });

  it('refuses an over-limit item count', async () => {
    const { user } = await render();
    const b = await validBackup();
    const template = b.profile.items[0];
    b.profile.items = Array.from({ length: LIMITS.items + 1 }, (_, i) => ({ ...template, id: `item_x${i}` }));
    await user.upload(fileInput(), jsonFile(b));
    expect(await screen.findByText(/Nothing was imported/)).toBeTruthy();
    expect(await storedProfiles()).toHaveLength(1);
  });
});

describe('profiles: switch, create, delete', () => {
  it('creates a named profile and opens it', async () => {
    const { user } = await render();
    await user.type(screen.getByLabelText('New profile name'), 'Work chart');
    await user.click(screen.getByRole('button', { name: 'Create profile' }));
    await waitFor(() => expect(screen.getByText('Profile: Work chart')).toBeTruthy());
    expect(await storedProfiles()).toHaveLength(2);
  });

  it('switches between profiles and keeps each one’s answers', async () => {
    const { user } = await render();
    await user.click(stateButton(HUG)); // Unsure in the first profile
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    await user.type(screen.getByLabelText('New profile name'), 'Second');
    await user.click(screen.getByRole('button', { name: 'Create profile' }));
    await waitFor(() => expect(screen.getByText('Profile: Second')).toBeTruthy());
    expect(stateButton(HUG).textContent).toBe('Unanswered');

    await user.selectOptions(screen.getByLabelText('Open a profile'), screen.getByRole('option', { name: 'My profile' }));
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(screen.getByText('Profile: My profile')).toBeTruthy());
    expect(stateButton(HUG).textContent).toBe('Unsure');
  });

  it('deletes only the open profile, after a confirmation that names it', async () => {
    const { user } = await render();
    await user.type(screen.getByLabelText('New profile name'), 'Second');
    await user.click(screen.getByRole('button', { name: 'Create profile' }));
    await waitFor(() => expect(screen.getByText('Profile: Second')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Delete this profile' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete “Second”?' });
    expect(dialog).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Delete profile' }));

    await waitFor(async () => expect((await storedProfiles()).map((p) => p.title)).toEqual(['My profile']));
    await waitFor(() => expect(screen.getByText('Profile: My profile')).toBeTruthy());
  });

  it('cancelling a delete changes nothing', async () => {
    const { user } = await render();
    await user.click(screen.getByRole('button', { name: 'Delete this profile' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await storedProfiles()).toHaveLength(1);
  });

  it('deleting the last profile leaves a fresh sample profile, not an empty app', async () => {
    const { user } = await render();
    const [original] = await storedProfiles();
    await user.click(screen.getByRole('button', { name: 'Delete this profile' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete profile' }));
    await waitFor(async () => {
      const all = await storedProfiles();
      expect(all).toHaveLength(1);
      expect(all[0].id).not.toBe(original.id);
    });
    expect(stateButton(HUG).textContent).toBe('Unanswered');
  });

  it('deletes all local data only after a confirmation that says what it removes', async () => {
    const { user } = await render();
    await user.click(stateButton(HUG));
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    const [original] = await storedProfiles();

    await user.click(screen.getByRole('button', { name: 'Delete all local data' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete all local data?' });
    expect(within(dialog).getByText(DELETE_ALL_DESCRIPTION)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Delete everything' }));

    await waitFor(async () => {
      const all = await storedProfiles();
      expect(all).toHaveLength(1);
      expect(all[0].id).not.toBe(original.id);
      expect(all[0].answers).toEqual([]);
    });
  });
});

describe('an unreadable stored record (spec 9, I-14)', () => {
  it('is reported, left unchanged, and can be downloaded as a raw record', async () => {
    const broken = { id: 'profile_broken', title: 'Broken', schemaVersion: 1, updatedAt: '2026-10-01T00:00:00.000Z', items: 'oops' };
    await db.put('profiles', broken);
    await db.put('settings', { key: 'activeProfileId', value: 'profile_broken' });
    const snapshot = await rawSnapshot();

    const saveFile = vi.fn();
    const { user } = await renderAtlas(db, { saveFile, now: () => FIXED_NOW });
    expect(await screen.findByText('The stored data has not been changed.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Download the unreadable record' }));
    const [filename, text] = saveFile.mock.calls[0];
    expect(filename).toBe('atlas-raw-record-2026-10-26.json');
    expect(JSON.parse(text)).toEqual({ format: RAW_RECORD_FORMAT, exportedAt: FIXED_NOW, record: broken });
    expect(parseBackupText(text).ok).toBe(false); // cannot be mistaken for a backup
    expect(await rawSnapshot()).toBe(snapshot);
  });
});

describe('accessibility of the new panels (M1-AC-05)', () => {
  it('has no serious or critical axe violations', async () => {
    const { container } = await render();
    expect(await seriousViolations(container)).toEqual([]);
  });
});

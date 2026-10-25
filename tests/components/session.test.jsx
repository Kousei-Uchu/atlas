// @vitest-environment jsdom
// M1-12: autosave status, "Saved" only after commit, failed saves and the multi-tab
// conflict banner (I-13, M1-AC-06, M1-AC-13).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { freshDb, renderAtlas, stateButton } from './helpers.jsx';
import { listProfiles, loadProfile, saveProfile } from '../../src/storage/profile-repository.js';
import { CONFLICT_HELP, SAVE_ERROR_HELP, SAVE_STATUS_TEXT } from '../../src/content/notices.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(() => db.close());

const HUG = 'A hug from a friend';

/** The status text in the toolbar. */
const status = () => document.querySelector('.save-status').textContent;

/**
 * Wrap a real database so a test can slow down or fail commits to the profiles store.
 *  - `hold()` makes the next write commit for real but report completion only on `release()`.
 *  - `failing = true` makes writes throw as a full disk would.
 */
function controllableDb(real) {
  const control = { failing: false, held: null };
  control.hold = () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    control.held = { gate, release };
  };
  control.release = () => control.held?.release();

  const db2 = new Proxy(real, {
    get(target, prop) {
      if (prop === 'transaction') {
        return (...args) => {
          const tx = target.transaction(...args);
          const isProfileWrite = args[1] === 'readwrite' && [].concat(args[0]).includes('profiles');
          if (!isProfileWrite) return tx;
          if (control.failing) {
            return {
              done: tx.done,
              abort: () => tx.abort(),
              objectStore: (name) => {
                const store = tx.objectStore(name);
                return { get: (k) => store.get(k), put: async () => { throw new DOMException('Out of space', 'QuotaExceededError'); } };
              },
            };
          }
          if (control.held) {
            const { gate } = control.held;
            return { done: tx.done.then(() => gate), abort: () => tx.abort(), objectStore: (name) => tx.objectStore(name) };
          }
          return tx;
        };
      }
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { db: db2, control };
}

async function storedProfile() {
  const [summary] = await listProfiles(db);
  return (await loadProfile(db, summary.id)).profile;
}

describe('autosave status (I-13)', () => {
  it('shows Saved on a fresh chart and after an edit has committed', async () => {
    const { user } = await renderAtlas(db);
    expect(status()).toBe(SAVE_STATUS_TEXT.saved);
    await user.click(stateButton(HUG));
    await waitFor(() => expect(status()).toBe(SAVE_STATUS_TEXT.saved));
    expect((await storedProfile()).answers.map((a) => a.stateId)).toEqual(['unsure']);
  });

  it('does not say Saved until the storage transaction has committed', async () => {
    const { db: slow, control } = controllableDb(db);
    const { user } = await renderAtlas(slow);
    control.hold();
    await user.click(stateButton(HUG));

    // The write is in flight: the status must stay on Saving…
    await waitFor(() => expect(status()).toBe(SAVE_STATUS_TEXT.saving));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(status()).toBe(SAVE_STATUS_TEXT.saving);

    control.release();
    await waitFor(() => expect(status()).toBe(SAVE_STATUS_TEXT.saved));
  });
});

describe('a failed save (M1-AC-06)', () => {
  it('shows Could not save, keeps the data on screen and in memory, and stores nothing', async () => {
    const { db: flaky, control } = controllableDb(db);
    const { user } = await renderAtlas(flaky);
    control.failing = true;
    await user.click(stateButton(HUG));

    await waitFor(() => expect(status()).toBe(SAVE_STATUS_TEXT.error));
    expect(screen.getByText(SAVE_ERROR_HELP)).toBeTruthy();
    expect(stateButton(HUG).textContent).toBe('Unsure'); // still on screen
    expect((await storedProfile()).answers).toEqual([]); // nothing reached storage
    expect(screen.queryByText(SAVE_STATUS_TEXT.saved)).toBeNull();
  });

  it('saves the kept change when the person tries again', async () => {
    const { db: flaky, control } = controllableDb(db);
    const { user } = await renderAtlas(flaky);
    control.failing = true;
    await user.click(stateButton(HUG));
    await waitFor(() => expect(status()).toBe(SAVE_STATUS_TEXT.error));

    control.failing = false;
    await user.click(screen.getByRole('button', { name: 'Try saving again' }));
    await waitFor(() => expect(status()).toBe(SAVE_STATUS_TEXT.saved));
    expect(screen.queryByRole('button', { name: 'Try saving again' })).toBeNull();
    expect((await storedProfile()).answers.map((a) => a.stateId)).toEqual(['unsure']);
  });
});

describe('editing in two tabs (M1-AC-13)', () => {
  /** Simulate another tab saving the same profile. */
  async function otherTabSaves(title) {
    const current = await storedProfile();
    return saveProfile(db, { ...current, title });
  }

  it('stops saving, shows the conflict banner, and never overwrites the other tab', async () => {
    const { user } = await renderAtlas(db);
    await otherTabSaves('Edited in the other tab');

    await user.click(stateButton(HUG));
    await waitFor(() => expect(status()).toBe(SAVE_STATUS_TEXT.conflict));

    expect(screen.getByText(CONFLICT_HELP, { exact: false }).closest('[role="alert"]').textContent).toContain(CONFLICT_HELP);
    expect(screen.getByRole('button', { name: 'Reload latest version' })).toBeTruthy();
    const after = await storedProfile();
    expect(after.title).toBe('Edited in the other tab');
    expect(after.answers).toEqual([]); // this tab's change was not written
  });

  it('pauses editing after a conflict instead of piling up unsaved work', async () => {
    const { user } = await renderAtlas(db);
    await otherTabSaves('Other tab');
    await user.click(stateButton(HUG));
    await waitFor(() => expect(status()).toBe(SAVE_STATUS_TEXT.conflict));

    await user.click(stateButton(HUG));
    expect(screen.getByText(/Editing is paused because this profile changed in another tab/)).toBeTruthy();
    expect(stateButton(HUG).textContent).toBe('Unsure'); // the second click changed nothing
  });

  it('reloads the latest stored version and lets editing continue', async () => {
    const { user } = await renderAtlas(db);
    await otherTabSaves('Other tab');
    await user.click(stateButton(HUG));
    await waitFor(() => expect(status()).toBe(SAVE_STATUS_TEXT.conflict));

    await user.click(screen.getByRole('button', { name: 'Reload latest version' }));
    await waitFor(() => expect(status()).toBe(SAVE_STATUS_TEXT.saved));
    expect(screen.getByText('Profile: Other tab')).toBeTruthy();
    expect(stateButton(HUG).textContent).toBe('Unanswered'); // this tab's discarded change is gone

    await user.click(stateButton(HUG));
    await waitFor(() => expect(status()).toBe(SAVE_STATUS_TEXT.saved));
    expect((await storedProfile()).answers.map((a) => a.stateId)).toEqual(['unsure']);
  });

  it('reports a profile deleted in another tab as a conflict, not a silent re-create', async () => {
    const { user } = await renderAtlas(db);
    const [summary] = await listProfiles(db);
    await db.delete('profiles', summary.id);

    await user.click(stateButton(HUG));
    await waitFor(() => expect(status()).toBe(SAVE_STATUS_TEXT.conflict));
    expect(await listProfiles(db)).toEqual([]);
  });
});

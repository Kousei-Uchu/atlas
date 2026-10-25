import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openAtlasDb, requestPersistentStorage, estimateStorage, STORE_PROFILES } from '../../src/storage/database.js';
import {
  createProfile, saveProfile, loadProfile, loadRawRecord, listProfiles, deleteProfile, deleteAllData,
  getActiveProfileId, setActiveProfileId, ConflictError, InvalidProfileError, ProfileExistsError,
} from '../../src/storage/profile-repository.js';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { setItemState } from '../../src/domain/commands.js';
import { effectiveStateId } from '../../src/domain/selectors.js';

let n = 0;
let name;
let db;
const open = () => openAtlasDb({ name });
const starter = (id = 'profile_a', now = '2026-10-26T00:00:00.000Z') => createStarterProfile({ id, now });

beforeEach(async () => { name = `atlas-test-${++n}`; db = await open(); });
afterEach(() => db.close());

describe('create and load', () => {
  it('stores a profile at revision 0 and loads it back deep-equal', async () => {
    const stored = await createProfile(db, starter());
    expect(stored.revision).toBe(0);
    const loaded = await loadProfile(db, 'profile_a');
    expect(loaded).toEqual({ ok: true, profile: stored });
  });
  it('survives closing and reopening the database (reload)', async () => {
    let p = await createProfile(db, starter());
    const changed = setItemState(p, { itemId: 'starter_hug', stateId: 'yes' }, '2026-10-26T01:00:00.000Z').profile;
    p = await saveProfile(db, changed);
    db.close();
    db = await open();
    const loaded = await loadProfile(db, 'profile_a');
    expect(effectiveStateId(loaded.profile, 'starter_hug')).toBe('yes');
    expect(loaded.profile.revision).toBe(1);
  });
  it('never overwrites an existing profile on create (I-12)', async () => {
    await createProfile(db, starter());
    const other = { ...starter(), title: 'Different' };
    await expect(createProfile(db, other)).rejects.toBeInstanceOf(ProfileExistsError);
    expect((await loadProfile(db, 'profile_a')).profile.title).toBe('My profile');
  });
  it('reports a missing profile', async () => {
    expect(await loadProfile(db, 'nope')).toEqual({ ok: false, code: 'not-found' });
  });
  it('refuses to store an invalid profile and writes nothing', async () => {
    const bad = { ...starter(), items: [{ nonsense: true }] };
    await expect(createProfile(db, bad)).rejects.toBeInstanceOf(InvalidProfileError);
    expect(await listProfiles(db)).toEqual([]);
  });
});

describe('revision checks (M1-AC-13, R-04)', () => {
  it('increments the revision on each save', async () => {
    let p = await createProfile(db, starter());
    p = await saveProfile(db, { ...p, title: 'One' });
    p = await saveProfile(db, { ...p, title: 'Two' });
    expect(p.revision).toBe(2);
  });
  it('rejects a stale save from another tab and leaves the other tab\'s data intact', async () => {
    const created = await createProfile(db, starter());
    const tabB = await open();
    try {
      const a = await saveProfile(db, { ...created, title: 'From tab A' });
      expect(a.revision).toBe(1);
      const err = await saveProfile(tabB, { ...created, title: 'From stale tab B' }).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictError);
      expect(err.details).toMatchObject({ reason: 'stale', expected: 0, actual: 1 });
      expect((await loadProfile(db, 'profile_a')).profile.title).toBe('From tab A');
    } finally { tabB.close(); }
  });
  it('lets exactly one of two simultaneous saves win', async () => {
    const created = await createProfile(db, starter());
    const results = await Promise.allSettled([
      saveProfile(db, { ...created, title: 'First' }),
      saveProfile(db, { ...created, title: 'Second' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected.reason).toBeInstanceOf(ConflictError);
    expect((await loadProfile(db, 'profile_a')).profile.revision).toBe(1);
  });
  it('reports a profile deleted elsewhere rather than recreating it', async () => {
    const created = await createProfile(db, starter());
    await deleteProfile(db, 'profile_a');
    const err = await saveProfile(db, { ...created, title: 'Ghost' }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.details.reason).toBe('deleted');
    expect(await listProfiles(db)).toEqual([]);
  });
  it('does not overwrite a record saved by a newer schema version (I-14)', async () => {
    const created = await createProfile(db, starter());
    await db.put(STORE_PROFILES, { ...created, schemaVersion: 2 });
    const err = await saveProfile(db, { ...created, title: 'Old app' }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((await loadRawRecord(db, 'profile_a')).schemaVersion).toBe(2);
  });
  it('rejects an invalid profile before touching storage', async () => {
    const created = await createProfile(db, starter());
    const err = await saveProfile(db, { ...created, items: [{ nonsense: 1 }] }).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidProfileError);
    expect((await loadProfile(db, 'profile_a')).profile.revision).toBe(0);
  });
});

describe('failed writes are visible and harmless (I-13, M1-AC-06)', () => {
  // A connection whose put aborts the transaction, as a quota error would.
  const quotaFailingDb = (real) => ({
    transaction: (...args) => {
      const tx = real.transaction(...args);
      return {
        done: tx.done,
        abort: () => tx.abort(),
        objectStore: (storeName) => {
          const store = tx.objectStore(storeName);
          return {
            get: (k) => store.get(k),
            put: async () => { throw new DOMException('Out of space', 'QuotaExceededError'); },
          };
        },
      };
    },
  });

  it('rejects, leaves stored data unchanged, and never resolves as saved', async () => {
    const created = await createProfile(db, starter());
    let resolved = false;
    const err = await saveProfile(quotaFailingDb(db), { ...created, title: 'Lost?' })
      .then(() => { resolved = true; })
      .catch((e) => e);
    expect(resolved).toBe(false);
    expect(err.name).toBe('QuotaExceededError');
    const after = (await loadProfile(db, 'profile_a')).profile;
    expect(after.title).toBe('My profile');
    expect(after.revision).toBe(0);
  });
  it('can save again once the problem clears', async () => {
    const created = await createProfile(db, starter());
    await saveProfile(quotaFailingDb(db), { ...created, title: 'X' }).catch(() => {});
    const ok = await saveProfile(db, { ...created, title: 'Retry' });
    expect(ok.title).toBe('Retry');
  });
});

describe('invalid stored records are never repaired or overwritten (spec 9)', () => {
  it('reports them with the raw record, lists them, and leaves them byte-identical', async () => {
    const raw = { id: 'profile_bad', title: 'Broken', updatedAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1, items: 'oops' };
    await db.put(STORE_PROFILES, raw);
    const loaded = await loadProfile(db, 'profile_bad');
    expect(loaded).toMatchObject({ ok: false, code: 'invalid' });
    expect(loaded.raw).toEqual(raw);
    expect(loaded.error.message).toBeTruthy();
    expect(await listProfiles(db)).toMatchObject([{ id: 'profile_bad', title: 'Broken', valid: false }]);
    expect(await loadRawRecord(db, 'profile_bad')).toEqual(raw);
  });
  it('lists valid profiles newest first alongside invalid ones', async () => {
    await createProfile(db, starter('profile_old', '2026-01-01T00:00:00.000Z'));
    await createProfile(db, starter('profile_new', '2026-06-01T00:00:00.000Z'));
    await db.put(STORE_PROFILES, { id: 'profile_bad' });
    const list = await listProfiles(db);
    expect(list.map((p) => p.id)).toEqual(['profile_new', 'profile_old', 'profile_bad']);
    expect(list.map((p) => p.valid)).toEqual([true, true, false]);
  });
});

describe('active profile and deletion', () => {
  it('stores the active profile id and clears it when that profile is deleted', async () => {
    await createProfile(db, starter('profile_a'));
    await createProfile(db, starter('profile_b'));
    expect(await getActiveProfileId(db)).toBeNull();
    await setActiveProfileId(db, 'profile_a');
    expect(await getActiveProfileId(db)).toBe('profile_a');
    await deleteProfile(db, 'profile_b');
    expect(await getActiveProfileId(db)).toBe('profile_a');
    await deleteProfile(db, 'profile_a');
    expect(await getActiveProfileId(db)).toBeNull();
  });
  it('deleteAllData removes every profile and setting', async () => {
    await createProfile(db, starter('profile_a'));
    await setActiveProfileId(db, 'profile_a');
    await deleteAllData(db);
    expect(await listProfiles(db)).toEqual([]);
    expect(await getActiveProfileId(db)).toBeNull();
  });
});

describe('persistent storage helpers', () => {
  it('handle missing, working and failing storage APIs', async () => {
    expect(await requestPersistentStorage(undefined)).toBeNull();
    expect(await requestPersistentStorage({ persist: async () => true })).toBe(true);
    expect(await requestPersistentStorage({ persist: async () => { throw new Error('no'); } })).toBe(false);
    expect(await estimateStorage({ estimate: async () => ({ usage: 5, quota: 10 }) })).toEqual({ usage: 5, quota: 10 });
    expect(await estimateStorage(undefined)).toBeNull();
  });
});

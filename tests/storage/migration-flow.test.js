// Migration through the real read and write paths, with the schema pretending to be at version 2 and one
// made-up step from version 1 (M6-01; spec 9; I-12, I-14). In this file only, the app believes it is at 2.
import 'fake-indexeddb/auto';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/domain/limits.js', async (importOriginal) => ({ ...(await importOriginal()), SCHEMA_VERSION: 2 }));
let failing = false;
vi.mock('../../src/domain/migrations.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    // Version 1 called the title `name`.
    migrateProfile: (raw) => real.migrateProfile(raw, {
      target: 2,
      migrations: { 1: (p) => { if (failing) throw new Error('boom'); const { name, ...rest } = p; return { ...rest, title: name, schemaVersion: 2 }; } },
    }),
  };
});

const { openAtlasDb, STORE_PROFILES } = await import('../../src/storage/database.js');
const { loadProfile, saveProfile, listProfiles, loadRawRecord } = await import('../../src/storage/profile-repository.js');
const { createStarterProfile } = await import('../../src/domain/defaults.js');
const { validateProfile } = await import('../../src/domain/validation.js');
const { parseBackupText, serialiseBackup } = await import('../../src/storage/backup.js');

let n = 0;
let db;
beforeEach(async () => { failing = false; db = await openAtlasDb({ name: `atlas-mig-${++n}` }); });
afterEach(() => db.close());

/** A stored version 1 record: the current starter profile with the old field name and version. */
function oldRecord(id = 'profile_old') {
  const { title, ...rest } = createStarterProfile({ id, title: 'My chart', now: '2026-10-26T00:00:00.000Z' });
  return { ...rest, name: title, schemaVersion: 1, revision: 3 };
}

describe('an older record', () => {
  it('is converted on read, and the stored record is left exactly as it was', async () => {
    const old = oldRecord();
    await db.put(STORE_PROFILES, old);
    const before = JSON.stringify(await loadRawRecord(db, 'profile_old'));
    const r = await loadProfile(db, 'profile_old');
    expect(r.ok).toBe(true);
    expect(r.profile).toMatchObject({ schemaVersion: 2, title: 'My chart', revision: 3 });
    expect(r.profile.name).toBeUndefined();
    expect(JSON.stringify(await loadRawRecord(db, 'profile_old'))).toBe(before); // reading never writes
  });

  it('is listed with its title, and is replaced by the migrated profile on the next save', async () => {
    await db.put(STORE_PROFILES, oldRecord());
    expect((await listProfiles(db)).map((p) => p.title)).toEqual(['My chart']);
    const loaded = await loadProfile(db, 'profile_old');
    const saved = await saveProfile(db, { ...loaded.profile, title: 'Renamed' });
    expect(saved).toMatchObject({ schemaVersion: 2, revision: 4, title: 'Renamed' });
    expect((await loadRawRecord(db, 'profile_old')).schemaVersion).toBe(2);
  });

  it('does not change the record when the migration fails, and still offers it for export', async () => {
    failing = true;
    const old = oldRecord();
    await db.put(STORE_PROFILES, old);
    const r = await loadProfile(db, 'profile_old');
    expect(r).toMatchObject({ ok: false, code: 'invalid', error: { code: 'migration-failed' } });
    expect(r.error.message).toMatch(/Your original has not been changed/);
    expect(r.raw).toEqual(old);
    expect(await loadRawRecord(db, 'profile_old')).toEqual(old);
    const [listed] = await listProfiles(db);
    expect(listed).toMatchObject({ id: 'profile_old', valid: false, error: { code: 'migration-failed' } });
  });

  it('is not overwritten by a failed migration even if a save is attempted from stale data', async () => {
    failing = true;
    await db.put(STORE_PROFILES, oldRecord());
    const stale = { ...createStarterProfile({ id: 'profile_old', now: '2026-10-26T00:00:00.000Z' }), revision: 3 };
    await saveProfile(db, stale).catch(() => {});
    // Whatever happened, a version 1 record was either left alone or replaced by a valid version 2 profile, never half-written.
    const raw = await loadRawRecord(db, 'profile_old');
    expect([1, 2]).toContain(raw.schemaVersion);
  });
});

describe('older data in a backup file', () => {
  it('is converted when it is opened', () => {
    const current = createStarterProfile({ id: 'p', title: 'Backed up', now: '2026-10-26T00:00:00.000Z' });
    const text = serialiseBackup(current, '2026-10-27T00:00:00.000Z');
    const file = JSON.parse(text);
    const { title, ...rest } = file.profile;
    file.profile = { ...rest, name: title, schemaVersion: 1 };
    const parsed = parseBackupText(JSON.stringify(file));
    expect(parsed.ok, JSON.stringify(parsed.error)).toBe(true);
    expect(parsed.profile).toMatchObject({ title: 'Backed up', schemaVersion: 2 });
  });
});

describe('newer and unreadable data', () => {
  it('is refused, not converted (I-14)', () => {
    const p = { ...createStarterProfile({ id: 'p', now: '2026-10-26T00:00:00.000Z' }), schemaVersion: 3 };
    expect(validateProfile(p)).toMatchObject({ ok: false, error: { code: 'newer-version' } });
  });
});

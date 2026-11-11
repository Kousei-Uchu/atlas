// The real version 1 to 2 migration (M7-03), through the real read, write and backup paths.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openAtlasDb, STORE_PROFILES } from '../../src/storage/database.js';
import { loadProfile, saveProfile, loadRawRecord, listProfiles } from '../../src/storage/profile-repository.js';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { parseBackupText, serialiseBackup } from '../../src/storage/backup.js';
import { validateProfile } from '../../src/domain/validation.js';
import { SCHEMA_VERSION } from '../../src/domain/limits.js';

const NOW = '2026-10-26T00:00:00.000Z';
let n = 0;
let db;
beforeEach(async () => { db = await openAtlasDb({ name: `atlas-v2-${++n}` }); });
afterEach(() => db.close());

/** What the app stored before history existed: the same profile, at version 1, with no `snapshots`. */
function v1Record(id = 'profile_v1') {
  const { snapshots, ...rest } = createStarterProfile({ id, title: 'Made last month', now: NOW });
  void snapshots;
  return { ...rest, schemaVersion: 1, revision: 5 };
}

it('the app is at schema version 2', () => expect(SCHEMA_VERSION).toBe(2));

describe('a stored version 1 profile', () => {
  it('opens as version 2 with empty history, and the stored record is not changed by reading', async () => {
    await db.put(STORE_PROFILES, v1Record());
    const before = JSON.stringify(await loadRawRecord(db, 'profile_v1'));
    const r = await loadProfile(db, 'profile_v1');
    expect(r.ok).toBe(true);
    expect(r.profile).toMatchObject({ schemaVersion: 2, title: 'Made last month', revision: 5, snapshots: [] });
    expect(JSON.stringify(await loadRawRecord(db, 'profile_v1'))).toBe(before);
    expect((await listProfiles(db)).map((p) => p.title)).toEqual(['Made last month']);
  });

  it('keeps every answer, note and setting exactly, and becomes version 2 on the next save', async () => {
    const old = v1Record();
    old.answers = [{ itemId: old.items[0].id, stateId: 'yes', note: 'a private note', noteShareable: false }];
    await db.put(STORE_PROFILES, old);
    const loaded = await loadProfile(db, 'profile_v1');
    expect(loaded.profile.answers).toEqual(old.answers);
    expect(loaded.profile.settings).toEqual(old.settings);
    const saved = await saveProfile(db, loaded.profile);
    expect(saved).toMatchObject({ schemaVersion: 2, revision: 6 });
    expect((await loadRawRecord(db, 'profile_v1')).schemaVersion).toBe(2);
  });

  it('is refused by a version 1 app once it has been saved as version 2 (the old app sees newer data)', () => {
    // An old app has SCHEMA_VERSION 1: a version 2 record is "newer" to it. Same check, other direction.
    const current = createStarterProfile({ id: 'p', now: NOW });
    expect(validateProfile({ ...current, schemaVersion: SCHEMA_VERSION + 1 })).toMatchObject({ ok: false, error: { code: 'newer-version' } });
  });
});

describe('a version 1 backup file', () => {
  it('is converted when opened, and imports as a new profile with empty history', () => {
    const current = createStarterProfile({ id: 'p', title: 'Old backup', now: NOW });
    const file = JSON.parse(serialiseBackup(current, NOW));
    delete file.profile.snapshots;
    file.profile.schemaVersion = 1;
    const parsed = parseBackupText(JSON.stringify(file));
    expect(parsed.ok, JSON.stringify(parsed.error)).toBe(true);
    expect(parsed.profile).toMatchObject({ schemaVersion: 2, snapshots: [] });
  });

  it('a version 2 backup keeps its snapshots', () => {
    const current = { ...createStarterProfile({ id: 'p', title: 'New', now: NOW }), snapshots: [{ id: 's1', label: 'Before', takenAt: NOW, entries: [] }] };
    const parsed = parseBackupText(serialiseBackup(current, NOW));
    expect(parsed.ok).toBe(true);
    expect(parsed.profile.snapshots.map((s) => s.label)).toEqual(['Before']);
  });
});

describe('snapshot checks in validation', () => {
  const base = () => createStarterProfile({ id: 'p', now: NOW });
  const snap = (id, entries = []) => ({ id, label: id, takenAt: NOW, entries });
  const entry = (itemId) => ({ itemId, label: 'x', categoryName: 'c', stateId: 'yes', stateLabel: 'Yes' });

  it('refuses duplicate snapshot ids and duplicate items inside one snapshot', () => {
    expect(validateProfile({ ...base(), snapshots: [snap('s1'), snap('s1')] })).toMatchObject({ ok: false, error: { code: 'integrity-invalid' } });
    expect(validateProfile({ ...base(), snapshots: [snap('s1', [entry('i1'), entry('i1')])] })).toMatchObject({ ok: false });
  });

  it('refuses more snapshots than the limit, and unknown fields in a snapshot, and notes smuggled in', () => {
    const many = Array.from({ length: 21 }, (_, i) => snap(`s${i}`));
    expect(validateProfile({ ...base(), snapshots: many })).toMatchObject({ ok: false, error: { code: 'over-limit' } });
    expect(validateProfile({ ...base(), snapshots: [{ ...snap('s1'), extra: 1 }] })).toMatchObject({ ok: false, error: { code: 'unknown-fields' } });
    expect(validateProfile({ ...base(), snapshots: [snap('s1', [{ ...entry('i1'), note: 'secret' }])] })).toMatchObject({ ok: false, error: { code: 'unknown-fields' } });
  });
});

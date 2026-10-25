// M1-AC-03 / I-01: no path turns a missing answer into a positive state.
// Each path a profile can arrive by is checked: default, repository round trip,
// backup round trip, and a profile whose answers were removed.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { effectiveStateId, getState } from '../../src/domain/selectors.js';
import { validateProfile } from '../../src/domain/validation.js';
import { createProfile, loadProfile } from '../../src/storage/profile-repository.js';
import { importProfileAsNew, parseBackupText, serialiseBackup } from '../../src/storage/backup.js';
import { openAtlasDb } from '../../src/storage/database.js';

const NOW = '2026-10-26T00:00:00.000Z';
let db;
beforeEach(async () => { db = await openAtlasDb({ name: `missing-${Math.random()}` }); });

function everyItemIsUnanswered(profile) {
  expect(profile.items.length).toBeGreaterThan(0);
  for (const item of profile.items) {
    const id = effectiveStateId(profile, item.id);
    expect(id).toBe('unanswered');
    expect(getState(profile, id).semantic).toBe('neutral');
  }
}

describe('a missing answer is Unanswered on every path (I-01)', () => {
  it('in the default starter profile', () => {
    const p = createStarterProfile({ id: 'profile_a', now: NOW });
    expect(p.answers).toEqual([]);
    everyItemIsUnanswered(p);
  });

  it('after a store and load', async () => {
    await createProfile(db, createStarterProfile({ id: 'profile_a', now: NOW }));
    everyItemIsUnanswered((await loadProfile(db, 'profile_a')).profile);
  });

  it('after a backup export, parse and import as new', async () => {
    const p = createStarterProfile({ id: 'profile_a', now: NOW });
    const parsed = parseBackupText(serialiseBackup(p, NOW));
    expect(parsed.ok).toBe(true);
    const stored = await importProfileAsNew(db, parsed.profile);
    everyItemIsUnanswered((await loadProfile(db, stored.id)).profile);
  });

  it('when a backup file simply has no answers for some items', () => {
    const p = createStarterProfile({ id: 'profile_a', now: NOW });
    const withOne = { ...p, answers: [{ itemId: p.items[0].id, stateId: 'yes', note: '', noteShareable: false }] };
    const parsed = parseBackupText(serialiseBackup(withOne, NOW));
    expect(parsed.ok).toBe(true);
    expect(effectiveStateId(parsed.profile, p.items[0].id)).toBe('yes');
    for (const item of parsed.profile.items.slice(1)) expect(effectiveStateId(parsed.profile, item.id)).toBe('unanswered');
  });

  it('a stored answer that names Unanswered is rejected rather than guessed at', () => {
    const p = createStarterProfile({ id: 'profile_a', now: NOW });
    const bad = { ...p, answers: [{ itemId: p.items[0].id, stateId: 'unanswered', note: '', noteShareable: false }] };
    expect(validateProfile(bad).ok).toBe(false);
  });

  it('an answer whose state was removed resolves to Unanswered, not to a neighbour', () => {
    const p = createStarterProfile({ id: 'profile_a', now: NOW });
    const dangling = { ...p, answers: [{ itemId: p.items[0].id, stateId: 'gone', note: '', noteShareable: false }] };
    expect(effectiveStateId(dangling, p.items[0].id)).toBe('unanswered');
  });
});

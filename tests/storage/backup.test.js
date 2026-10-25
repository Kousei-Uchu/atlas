import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openAtlasDb } from '../../src/storage/database.js';
import { createProfile, loadProfile, loadRawRecord, listProfiles } from '../../src/storage/profile-repository.js';
import {
  buildBackup, serialiseBackup, backupFilename, serialiseRawRecord, checkBackupFileSize,
  parseBackupText, previewBackup, importProfileAsNew,
} from '../../src/storage/backup.js';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { addCategory, addItem, setItemNote, setItemState, setNoteShareable } from '../../src/domain/commands.js';
import { effectiveStateId } from '../../src/domain/selectors.js';
import { LIMITS } from '../../src/domain/limits.js';

const NOW = '2026-10-26T00:00:00.000Z';
const LATER = '2026-10-26T09:30:00.000Z';
const clone = (value) => structuredClone(value);
const code = (result) => (result.ok ? 'ok' : result.error.code);

/** Freeze a value all the way down, to prove a function never mutates its input (I-05). */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

/** A profile with answers, a note, a custom category and item, so a round trip means something. */
function richProfile(id = 'profile_rich') {
  let p = createStarterProfile({ id, now: NOW, title: 'Rich profile' });
  const run = (result) => {
    expect(result.ok).toBe(true);
    p = result.profile;
  };
  run(setItemState(p, { itemId: 'starter_hug', stateId: 'yes' }, NOW));
  run(setItemState(p, { itemId: 'starter_shoulder', stateId: 'no' }, NOW));
  run(setItemState(p, { itemId: 'starter_call', stateId: 'not-applicable' }, NOW));
  run(setItemNote(p, { itemId: 'starter_hug', note: 'Only after we have said hello.' }, NOW));
  run(setNoteShareable(p, { itemId: 'starter_hug', shareable: true }, NOW));
  run(addCategory(p, { id: 'cat_custom', name: 'My own category', sensitivity: 'sensitive' }, NOW));
  run(addItem(p, { id: 'item_custom', categoryId: 'cat_custom', label: 'Something I added' }, NOW));
  return p;
}

/** Backup text with a profile edit applied, for building hostile files. */
function backupWith(edit, envelopeEdit) {
  const profile = clone(richProfile());
  edit?.(profile);
  const envelope = clone(buildBackup(profile, LATER));
  envelopeEdit?.(envelope);
  return JSON.stringify(envelope);
}

let n = 0;
let db;
beforeEach(async () => { db = await openAtlasDb({ name: `atlas-backup-test-${++n}` }); });
afterEach(() => db.close());

describe('export', () => {
  it('wraps the profile in a labelled full-profile envelope', () => {
    const envelope = buildBackup(richProfile(), LATER);
    expect(envelope).toMatchObject({ format: 'atlas-backup', formatVersion: 1, kind: 'full-profile', exportedAt: LATER });
    expect(envelope.profile.id).toBe('profile_rich');
  });
  it('does not mutate the profile (I-05)', () => {
    const frozen = deepFreeze(richProfile());
    expect(() => serialiseBackup(frozen, LATER)).not.toThrow();
  });
  it('builds a safe, readable file name', () => {
    expect(backupFilename({ title: 'Sam & Alex: our chart!' }, LATER)).toBe('atlas-backup-sam-alex-our-chart-2026-10-26.json');
    expect(backupFilename({ title: '???' }, LATER)).toBe('atlas-backup-profile-2026-10-26.json');
    expect(backupFilename({ title: 'x'.repeat(200) }, LATER).length).toBeLessThan(80);
  });
});

describe('round trip (M1-AC-08)', () => {
  it('export then import as new gives a deep-equal profile', async () => {
    const original = richProfile();
    const parsed = parseBackupText(serialiseBackup(original, LATER));
    expect(parsed.ok).toBe(true);
    expect(parsed.exportedAt).toBe(LATER);
    const stored = await importProfileAsNew(db, parsed.profile);
    const loaded = await loadProfile(db, stored.id);
    expect(loaded.ok).toBe(true);
    // IDs, states, notes, answers and order all survive.
    expect(loaded.profile).toEqual(original);
    expect(loaded.profile.answers.find((a) => a.itemId === 'starter_hug')).toEqual({
      itemId: 'starter_hug', stateId: 'yes', note: 'Only after we have said hello.', noteShareable: true,
    });
  });

  it('leaves the existing profile untouched', async () => {
    await createProfile(db, richProfile('profile_existing'));
    const before = JSON.stringify(await loadRawRecord(db, 'profile_existing'));
    const incoming = parseBackupText(serialiseBackup(richProfile('profile_incoming'), LATER));
    await importProfileAsNew(db, incoming.profile);
    expect(JSON.stringify(await loadRawRecord(db, 'profile_existing'))).toBe(before);
    expect(await listProfiles(db)).toHaveLength(2);
  });

  it('assigns a new profile id on collision and keeps every other id (I-12)', async () => {
    const existing = await createProfile(db, richProfile('profile_same'));
    const before = JSON.stringify(await loadRawRecord(db, 'profile_same'));
    const incoming = parseBackupText(serialiseBackup(richProfile('profile_same'), LATER)).profile;
    const stored = await importProfileAsNew(db, incoming, { makeId: () => 'profile_fresh' });
    expect(stored.id).toBe('profile_fresh');
    expect(JSON.stringify(await loadRawRecord(db, 'profile_same'))).toBe(before);
    expect({ ...stored, id: existing.id }).toEqual({ ...incoming, id: existing.id });
  });

  it('keeps trying fresh ids if a generated one is also taken', async () => {
    await createProfile(db, richProfile('profile_same'));
    await createProfile(db, richProfile('profile_taken'));
    const incoming = parseBackupText(serialiseBackup(richProfile('profile_same'), LATER)).profile;
    const ids = ['profile_taken', 'profile_free'];
    const stored = await importProfileAsNew(db, incoming, { makeId: () => ids.shift() });
    expect(stored.id).toBe('profile_free');
  });

  it('gives up with a readable error rather than overwriting', async () => {
    await createProfile(db, richProfile('profile_same'));
    const incoming = parseBackupText(serialiseBackup(richProfile('profile_same'), LATER)).profile;
    await expect(importProfileAsNew(db, incoming, { makeId: () => 'profile_same' })).rejects.toThrow(/free profile id/);
    expect(await listProfiles(db)).toHaveLength(1);
  });

  it('resets the revision to 0 for the new copy', async () => {
    const incoming = parseBackupText(serialiseBackup({ ...richProfile(), revision: 7 }, LATER)).profile;
    expect((await importProfileAsNew(db, incoming)).revision).toBe(0);
  });

  it('never turns a missing answer into a positive state (M1-AC-03)', async () => {
    const parsed = parseBackupText(serialiseBackup(richProfile(), LATER));
    const stored = await importProfileAsNew(db, parsed.profile);
    expect(effectiveStateId(stored, 'starter_text')).toBe('unanswered');
    expect(effectiveStateId(stored, 'item_custom')).toBe('unanswered');
  });
});

describe('hostile imports are rejected with a readable message (M1-AC-09)', () => {
  const deepNest = (levels) => `${'['.repeat(levels)}${']'.repeat(levels)}`;

  const cases = [
    ['not-json', 'malformed JSON', () => '{"format": "atlas-backup",'],
    ['not-json', 'an empty file', () => ''],
    ['file-too-large', 'an oversized file', () => 'x'.repeat(LIMITS.backupFileBytes + 1)],
    ['wrong-format', 'a different format name', () => backupWith(null, (e) => { e.format = 'something-else'; })],
    ['wrong-format', 'a JSON array', () => '[1, 2, 3]'],
    ['wrong-format', 'a JSON string', () => '"hello"'],
    ['wrong-format', 'a JSON null', () => 'null'],
    ['wrong-format', 'a selected-view kind', () => backupWith(null, (e) => { e.kind = 'selected-view'; })],
    ['wrong-format', 'a raw record export', () => serialiseRawRecord({ anything: true }, LATER)],
    ['newer-version', 'a newer backup format version', () => backupWith(null, (e) => { e.formatVersion = 2; })],
    ['newer-version', 'a newer profile schema version', () => backupWith((p) => { p.schemaVersion = 2; })],
    ['unknown-fields', 'an extra envelope field', () => backupWith(null, (e) => { e.extra = 1; })],
    ['unknown-fields', 'an extra profile field', () => backupWith((p) => { p.surprise = true; })],
    ['unknown-fields', 'an extra item field', () => backupWith((p) => { p.items[0].surprise = true; })],
    ['schema-invalid', 'a missing envelope timestamp', () => backupWith(null, (e) => { delete e.exportedAt; })],
    ['schema-invalid', 'a wrong value type', () => backupWith((p) => { p.title = 42; })],
    ['schema-invalid', 'a bad colour', () => backupWith((p) => { p.states[0].color = 'red'; })],
    ['schema-invalid', 'a profile that is not an object', () => backupWith(null, (e) => { e.profile = 'nope'; })],
    ['integrity-invalid', 'an item with a missing category', () => backupWith((p) => { p.items[0].categoryId = 'ghost'; })],
    ['integrity-invalid', 'an answer for a missing item', () => backupWith((p) => { p.answers.push({ itemId: 'ghost', stateId: 'yes', noteShareable: false }); })],
    ['integrity-invalid', 'an answer with a missing state', () => backupWith((p) => { p.answers[0].stateId = 'ghost'; })],
    ['integrity-invalid', 'an answer that stores Unanswered', () => backupWith((p) => { p.answers[0].stateId = 'unanswered'; })],
    ['integrity-invalid', 'duplicate item ids', () => backupWith((p) => { p.items.push({ ...p.items[0] }); })],
    ['integrity-invalid', 'duplicate state ids', () => backupWith((p) => { p.states.push({ ...p.states[0], cycleOrder: 99 }); })],
    ['integrity-invalid', 'a category loop', () => backupWith((p) => {
      p.categories[0].parentId = 'starter_communication';
      p.categories[1].parentId = 'starter_contact';
    })],
    ['integrity-invalid', 'a missing Unanswered state', () => backupWith((p) => { p.states = p.states.filter((s) => s.id !== 'unanswered'); })],
    ['integrity-invalid', 'a view that names a missing item', () => backupWith((p) => {
      p.views.push({
        id: 'view_x', name: 'X', audienceId: null, includedItemIds: ['ghost'], includeSensitive: false,
        restrictedOptInItemIds: [], includeNotes: false, visualization: { type: 'matrix', options: {} },
      });
    })],
    ['forbidden-key', 'a __proto__ key', () => backupWith().replace('"format"', '"__proto__": {"polluted": true}, "format"')],
    ['forbidden-key', 'a constructor key', () => backupWith().replace('"format"', '"constructor": 1, "format"')],
    ['forbidden-key', 'a prototype key nested in the profile', () => backupWith().replace('"title"', '"prototype": 1, "title"')],
    ['too-deep', 'excess nesting', () => `{"format":"atlas-backup","x":${deepNest(LIMITS.jsonDepth + 5)}}`],
    ['over-limit', 'too many items', () => backupWith((p) => {
      p.items = Array.from({ length: LIMITS.items + 1 }, (_, i) => ({ ...p.items[0], id: `item_${i}` }));
    })],
    ['over-limit', 'too many states', () => backupWith((p) => {
      p.states = Array.from({ length: LIMITS.states + 1 }, (_, i) => ({ ...p.states[0], id: `s${i}`, cycleOrder: i }));
    })],
  ];

  it.each(cases)('%s: %s', (expected, _label, makeText) => {
    const result = parseBackupText(makeText());
    expect(code(result)).toBe(expected);
    expect(result.error.message.length).toBeGreaterThan(10);
    expect(result.error.message).not.toMatch(/at .*\.js|stack|TypeError|ZodError/i);
  });

  it('names the offending fields for unknown-fields and integrity problems', () => {
    const unknown = parseBackupText(backupWith((p) => { p.surprise = true; }));
    expect(unknown.error.problems.join(' ')).toContain('surprise');
    const integrity = parseBackupText(backupWith((p) => { p.items[0].categoryId = 'ghost'; }));
    expect(integrity.error.problems.join(' ')).toContain('ghost');
  });

  it('checks file size before any reading happens', () => {
    expect(checkBackupFileSize(LIMITS.backupFileBytes)).toEqual({ ok: true });
    expect(code(checkBackupFileSize(LIMITS.backupFileBytes + 1))).toBe('file-too-large');
  });

  it('leaves stored data byte-identical across every rejected import', async () => {
    await createProfile(db, richProfile('profile_existing'));
    const before = JSON.stringify(await loadRawRecord(db, 'profile_existing'));
    for (const [, , makeText] of cases) {
      const result = parseBackupText(makeText());
      if (result.ok) await importProfileAsNew(db, result.profile);
    }
    expect(JSON.stringify(await loadRawRecord(db, 'profile_existing'))).toBe(before);
    expect(await listProfiles(db)).toHaveLength(1);
  });

  it('does not pollute Object.prototype', () => {
    parseBackupText(backupWith().replace('"format"', '"__proto__": {"polluted": true}, "format"'));
    expect({}.polluted).toBeUndefined();
  });
});

describe('preview', () => {
  it('reports counts', () => {
    const preview = previewBackup(richProfile(), { exportedAt: LATER });
    expect(preview.title).toBe('Rich profile');
    expect(preview.exportedAt).toBe(LATER);
    expect(preview.counts).toMatchObject({ categories: 3, items: 8, answers: 3, notes: 1, states: 6 });
  });
  it('warns about notes, restricted items and an id collision, and only then', () => {
    const quiet = previewBackup(createStarterProfile({ id: 'profile_q', now: NOW }));
    expect(quiet.warnings).toEqual([]);

    let p = richProfile();
    p = addCategory(p, { id: 'cat_r', name: 'Restricted', sensitivity: 'restricted' }, NOW).profile;
    p = addItem(p, { id: 'item_r', categoryId: 'cat_r', label: 'Hidden thing' }, NOW).profile;
    const loud = previewBackup(p, { existingIds: ['profile_rich'] });
    expect(loud.warnings).toHaveLength(3);
    expect(loud.warnings.join(' ')).toMatch(/same internal id/);
    expect(loud.warnings.join(' ')).toMatch(/1 item at the restricted level/);
    expect(loud.warnings.join(' ')).toMatch(/1 note\./);
  });
  it('does not mutate the profile (I-05)', () => {
    expect(() => previewBackup(deepFreeze(richProfile()))).not.toThrow();
  });
});

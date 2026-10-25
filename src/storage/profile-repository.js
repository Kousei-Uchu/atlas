// Revision-checked persistence for profiles (spec 9; I-12, I-13, I-14).
//
// - Each profile is one validated aggregate in one record.
// - Saves run in a single read-write transaction and compare the stored revision with
//   the profile's revision. A mismatch throws ConflictError and writes nothing.
// - A save resolves only after the transaction commits, so "Saved" can never be shown early.
// - Invalid stored records are reported, never repaired or overwritten.
import { SCHEMA_VERSION } from '../domain/limits.js';
import { validateProfile } from '../domain/validation.js';
import { STORE_PROFILES, STORE_SETTINGS } from './database.js';

const ACTIVE_KEY = 'activeProfileId';

export class ConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ConflictError';
    this.details = details;
  }
}

export class InvalidProfileError extends Error {
  /** @param {{ code: string, message: string, problems: string[] }} validationError */
  constructor(validationError) {
    super(validationError.message);
    this.name = 'InvalidProfileError';
    this.validationError = validationError;
  }
}

export class ProfileExistsError extends Error {
  constructor(id) {
    super('A profile with this id already exists.');
    this.name = 'ProfileExistsError';
    this.id = id;
  }
}

/**
 * Run work in one read-write transaction and resolve only after it commits.
 * Any error aborts the transaction, so a failed write leaves stored data unchanged.
 */
async function runWrite(db, stores, work) {
  const tx = db.transaction(stores, 'readwrite');
  const done = tx.done;
  done.catch(() => {}); // the rejection is surfaced below; avoid an unhandled-rejection report
  let result;
  try {
    result = await work(tx);
  } catch (error) {
    try { tx.abort(); } catch { /* already finished */ }
    throw error;
  }
  await done;
  return result;
}

function validated(profile) {
  const result = validateProfile(profile);
  if (!result.ok) throw new InvalidProfileError(result.error);
  return result.profile;
}

/**
 * Store a new profile at revision 0. Fails if the id is taken; never overwrites (I-12).
 * @returns {Promise<import('../domain/schema.js').Profile>} the stored profile
 */
export async function createProfile(db, profile) {
  const clean = { ...validated(profile), revision: 0 };
  return runWrite(db, [STORE_PROFILES], async (tx) => {
    const store = tx.objectStore(STORE_PROFILES);
    if (await store.get(clean.id)) throw new ProfileExistsError(clean.id);
    await store.add(clean);
    return clean;
  });
}

/**
 * Save changes. `profile.revision` must equal the stored revision; the stored revision
 * then becomes `revision + 1`. Resolves with the stored profile after commit.
 * @throws {ConflictError} stale revision, or the profile was deleted elsewhere
 * @throws {InvalidProfileError} the profile does not validate (nothing is written)
 */
export async function saveProfile(db, profile) {
  const clean = validated(profile);
  return runWrite(db, [STORE_PROFILES], async (tx) => {
    const store = tx.objectStore(STORE_PROFILES);
    const stored = await store.get(clean.id);
    if (!stored) throw new ConflictError('This profile was deleted in another tab.', { reason: 'deleted' });
    if (stored.schemaVersion !== SCHEMA_VERSION) {
      throw new ConflictError('This profile was saved by a different version of the app.', { reason: 'version' });
    }
    if (stored.revision !== clean.revision) {
      throw new ConflictError('This profile changed in another tab.', {
        reason: 'stale', expected: clean.revision, actual: stored.revision,
      });
    }
    const next = { ...clean, revision: clean.revision + 1 };
    await store.put(next);
    return next;
  });
}

/**
 * Load and validate one profile.
 * An invalid record is returned with its raw data so it can be exported; it is never modified.
 * @returns {Promise<
 *   { ok: true, profile: object } |
 *   { ok: false, code: 'not-found' } |
 *   { ok: false, code: 'invalid', error: object, raw: unknown }>}
 */
export async function loadProfile(db, id) {
  const raw = await db.get(STORE_PROFILES, id);
  if (raw === undefined) return { ok: false, code: 'not-found' };
  const result = validateProfile(raw);
  return result.ok ? result : { ok: false, code: 'invalid', error: result.error, raw };
}

/** The raw stored record, for exporting a profile that no longer validates. */
export function loadRawRecord(db, id) {
  return db.get(STORE_PROFILES, id);
}

/**
 * One summary per stored record, newest first. Invalid records are listed too,
 * so the person can still see and export them.
 */
export async function listProfiles(db) {
  const records = await db.getAll(STORE_PROFILES);
  return records
    .map((raw) => {
      const result = validateProfile(raw);
      const title = typeof raw?.title === 'string' ? raw.title : 'Unreadable profile';
      const updatedAt = typeof raw?.updatedAt === 'string' ? raw.updatedAt : '';
      return result.ok
        ? { id: raw.id, title: result.profile.title, updatedAt: result.profile.updatedAt, valid: true }
        : { id: raw?.id, title, updatedAt, valid: false, error: result.error };
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

export async function getActiveProfileId(db) {
  return (await db.get(STORE_SETTINGS, ACTIVE_KEY))?.value ?? null;
}

export function setActiveProfileId(db, id) {
  return runWrite(db, [STORE_SETTINGS], async (tx) => {
    await tx.objectStore(STORE_SETTINGS).put({ key: ACTIVE_KEY, value: id });
  });
}

/** Delete one profile, and clear the active-profile pointer if it pointed here. */
export function deleteProfile(db, id) {
  return runWrite(db, [STORE_PROFILES, STORE_SETTINGS], async (tx) => {
    await tx.objectStore(STORE_PROFILES).delete(id);
    const settings = tx.objectStore(STORE_SETTINGS);
    if ((await settings.get(ACTIVE_KEY))?.value === id) await settings.delete(ACTIVE_KEY);
  });
}

/** Remove every profile and setting. The UI must confirm first and say what this removes. */
export function deleteAllData(db) {
  return runWrite(db, [STORE_PROFILES, STORE_SETTINGS], async (tx) => {
    await tx.objectStore(STORE_PROFILES).clear();
    await tx.objectStore(STORE_SETTINGS).clear();
  });
}

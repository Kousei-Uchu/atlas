// Full-profile backup: export, safe parse, preview and import as a NEW profile.
// Spec 10.1 to 10.3. Invariants: I-08 (untrusted input), I-12 (never overwrite),
// I-14 (never silently drop data).
//
// Everything that reads a file goes through parseBackupText, which runs the same
// gate as every other untrusted source: size, JSON, forbidden keys, depth, envelope,
// then the full profile validation. Nothing here repairs or discards data.
import { z } from 'zod';
import { BACKUP_FORMAT_VERSION, LIMITS } from '../domain/limits.js';
import { newId } from '../domain/ids.js';
import { failure, parseJsonText, validateProfile } from '../domain/validation.js';
import { createProfile, ProfileExistsError } from './profile-repository.js';

export const BACKUP_FORMAT = 'atlas-backup';
export const BACKUP_KIND = 'full-profile';
export const RAW_RECORD_FORMAT = 'atlas-raw-record';

/** How many fresh ids to try if a generated profile id is somehow taken. */
const MAX_ID_ATTEMPTS = 5;

// Envelope shape. The profile itself is validated separately by validateProfile.
const envelopeSchema = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int().min(1),
  kind: z.literal(BACKUP_KIND),
  exportedAt: z.iso.datetime(),
  profile: z.unknown(),
});

// ---- export ----

/**
 * Wrap a profile in the backup envelope. Pure; does not touch the profile (I-05).
 * @param {import('../domain/schema.js').Profile} profile
 * @param {string} now ISO-8601 UTC timestamp
 */
export function buildBackup(profile, now) {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    kind: BACKUP_KIND,
    exportedAt: now,
    profile,
  };
}

/** Backup file contents. Pretty-printed so the person can read what it contains. */
export function serialiseBackup(profile, now) {
  return JSON.stringify(buildBackup(profile, now), null, 2);
}

/**
 * A readable, filesystem-safe file name such as `atlas-backup-my-profile-2026-10-26.json`.
 * @param {{ title: string }} profile
 * @param {string} now ISO-8601 UTC timestamp
 */
export function backupFilename(profile, now) {
  const slug = profile.title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `atlas-backup-${slug || 'profile'}-${now.slice(0, 10)}.json`;
}

/**
 * Export of a stored record that no longer validates (spec 9). It is labelled as a
 * raw record, and is deliberately NOT importable as a backup, so it cannot be
 * mistaken for one. It exists so the person can keep or send their data for repair.
 * @param {unknown} raw
 * @param {string} now
 */
export function serialiseRawRecord(raw, now) {
  return JSON.stringify({ format: RAW_RECORD_FORMAT, exportedAt: now, record: raw }, null, 2);
}

// ---- parse ----

/**
 * Check a file's size before reading it (spec 10.2 step 1).
 * @param {number} sizeInBytes
 * @returns {{ ok: true } | ReturnType<typeof failure>}
 */
export function checkBackupFileSize(sizeInBytes) {
  return sizeInBytes > LIMITS.backupFileBytes ? failure('file-too-large') : { ok: true };
}

/**
 * Turn backup text into a validated profile. Never throws, never repairs.
 * @param {string} text
 * @returns {{ ok: true, profile: import('../domain/schema.js').Profile, exportedAt: string }
 *   | ReturnType<typeof failure>}
 */
export function parseBackupText(text) {
  const parsed = parseJsonText(text);
  if (!parsed.ok) return parsed;
  const raw = parsed.value;

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || raw.format !== BACKUP_FORMAT) {
    return failure('wrong-format');
  }
  if (typeof raw.formatVersion === 'number' && raw.formatVersion > BACKUP_FORMAT_VERSION) {
    return failure('newer-version');
  }
  if (raw.kind !== BACKUP_KIND) {
    return failure('wrong-format', ['Only full-profile backups can be imported here.']);
  }

  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) {
    const unknown = [];
    const invalid = [];
    for (const issue of envelope.error.issues) {
      const where = issue.path.length > 0 ? issue.path.join('.') : 'file';
      if (issue.code === 'unrecognized_keys') unknown.push(...issue.keys.map((k) => `${where}.${k}`));
      else invalid.push(`${where}: ${issue.message}`);
    }
    return unknown.length > 0 ? failure('unknown-fields', unknown) : failure('schema-invalid', invalid);
  }

  const result = validateProfile(envelope.data.profile);
  if (!result.ok) return result;
  return { ok: true, profile: result.profile, exportedAt: envelope.data.exportedAt };
}

// ---- preview ----

/**
 * Plain counts and warnings for the confirmation step (spec 10.2 step 4).
 * Pure. Warnings state facts only; they never judge the content.
 * @param {import('../domain/schema.js').Profile} profile
 * @param {{ exportedAt?: string, existingIds?: Iterable<string> }} [context]
 */
export function previewBackup(profile, { exportedAt = null, existingIds = [] } = {}) {
  const categoryById = new Map(profile.categories.map((c) => [c.id, c]));
  const levels = ['normal', 'personal', 'sensitive', 'restricted'];
  const restricted = profile.items.filter((item) => {
    const own = levels.indexOf(item.sensitivity);
    const floor = levels.indexOf(categoryById.get(item.categoryId)?.sensitivity ?? 'normal');
    return Math.max(own, floor) === levels.indexOf('restricted');
  }).length;
  const notes = profile.answers.filter((a) => (a.note ?? '') !== '').length;

  const warnings = [];
  if (new Set(existingIds).has(profile.id)) {
    warnings.push('A profile with the same internal id is already stored. The imported copy will get a new id, and the existing profile will not be changed.');
  }
  if (restricted > 0) warnings.push(`Contains ${restricted} item${restricted === 1 ? '' : 's'} at the restricted level.`);
  if (notes > 0) warnings.push(`Contains ${notes} note${notes === 1 ? '' : 's'}.`);

  return {
    title: profile.title,
    exportedAt,
    counts: {
      states: profile.states.length,
      categories: profile.categories.length,
      items: profile.items.length,
      answers: profile.answers.length,
      notes,
      audiences: profile.audiences.length,
      views: profile.views.length,
    },
    warnings,
  };
}

// ---- import ----

/**
 * Save a validated imported profile as a NEW profile (I-12). Existing profiles are
 * never read for merging or overwritten. If the profile id is already taken, a fresh
 * id is assigned; every other id in the profile is preserved.
 *
 * The collision check and the write happen in one transaction (createProfile), so
 * there is no gap in which another tab could take the id.
 *
 * @param {import('idb').IDBPDatabase} db
 * @param {import('../domain/schema.js').Profile} profile already validated
 * @param {{ makeId?: () => string }} [options] injectable for tests
 * @returns {Promise<import('../domain/schema.js').Profile>} the stored profile
 */
export async function importProfileAsNew(db, profile, { makeId = () => newId('profile') } = {}) {
  let candidate = profile;
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
    try {
      return await createProfile(db, candidate);
    } catch (error) {
      if (!(error instanceof ProfileExistsError)) throw error;
      candidate = { ...profile, id: makeId() };
    }
  }
  throw new Error('Could not find a free profile id. Please try the import again.');
}

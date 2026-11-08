// Schema migrations (spec 9; I-12, I-14; M6-01). Pure.
//
// Each migration is an explicit function from version N to N+1, listed in MIGRATIONS under key N.
// The schema is at version 1, so the list is empty today. This harness exists so the first change to
// the schema has a tested, safe path ready before it is needed.
//
// What it guarantees:
//   - The input is never changed. Steps run on a copy, so the stored record stays as it was until
//     the person's next save writes the migrated profile (a read never writes).
//   - Steps run one at a time, N to N+1, in order. A missing step stops the chain.
//   - A step that throws, or returns anything but an object at the next version, fails the whole
//     migration. Nothing half-migrated is ever returned or kept.
//   - Newer data is never touched here (I-14), and nothing is repaired or dropped.
import { SCHEMA_VERSION } from './limits.js';

/** Migration N: a profile at version N in, a profile at version N+1 out. Empty while the schema is at 1. */
export const MIGRATIONS = Object.freeze({});

/**
 * @param {unknown} raw  A profile record, possibly from an older version.
 * @param {{ migrations?: Record<number, (profile: object) => object>, target?: number }} [options]
 * @returns {{ ok: true, profile: object, from: number, steps: number } |
 *   { ok: false, code: 'not-versioned' | 'newer-version' | 'missing-migration' | 'migration-failed', detail: string }}
 */
export function migrateProfile(raw, { migrations = MIGRATIONS, target = SCHEMA_VERSION } = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
    return { ok: false, code: 'not-versioned', detail: 'The record has no usable schema version.' };
  }
  const from = raw.schemaVersion;
  if (from > target) return { ok: false, code: 'newer-version', detail: `The record is at version ${from}, newer than ${target}.` };
  if (from === target) return { ok: true, profile: raw, from, steps: 0 };

  let current;
  try {
    current = structuredClone(raw);
  } catch {
    return { ok: false, code: 'migration-failed', detail: 'The record could not be copied.' };
  }
  for (let version = from; version < target; version += 1) {
    const step = migrations[version];
    if (typeof step !== 'function') return { ok: false, code: 'missing-migration', detail: `There is no migration from version ${version} to ${version + 1}.` };
    let next;
    try {
      next = step(current);
    } catch {
      return { ok: false, code: 'migration-failed', detail: `The migration from version ${version} to ${version + 1} failed.` };
    }
    if (next === null || typeof next !== 'object' || Array.isArray(next) || next.schemaVersion !== version + 1) {
      return { ok: false, code: 'migration-failed', detail: `The migration from version ${version} to ${version + 1} did not produce a version ${version + 1} profile.` };
    }
    current = next;
  }
  return { ok: true, profile: current, from, steps: target - from };
}

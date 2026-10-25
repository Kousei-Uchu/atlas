// IndexedDB setup (spec 9). One database, two stores.
// Storage persists validated data; it never decides what the data means (spec 4.3).
import { openDB, deleteDB } from 'idb';

export const DB_NAME = 'atlas-db';
export const DB_VERSION = 1;
export const STORE_PROFILES = 'profiles';
export const STORE_SETTINGS = 'settings';

/** @param {{ name?: string }} [options] */
export function openAtlasDb({ name = DB_NAME } = {}) {
  return openDB(name, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_PROFILES)) db.createObjectStore(STORE_PROFILES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
    },
    blocking() {
      // Another tab wants to upgrade. Close so it is not blocked.
      this.close?.();
    },
  });
}

export function deleteAtlasDb(name = DB_NAME) {
  return deleteDB(name);
}

/**
 * Ask the browser to keep this site's storage. Only call this after a user action,
 * never on load (spec 9). Returns true, false, or null when unsupported.
 */
export async function requestPersistentStorage(storage = globalThis.navigator?.storage) {
  if (!storage || typeof storage.persist !== 'function') return null;
  try {
    return await storage.persist();
  } catch {
    return false;
  }
}

/** Approximate usage for the settings screen. Returns null when unavailable. */
export async function estimateStorage(storage = globalThis.navigator?.storage) {
  if (!storage || typeof storage.estimate !== 'function') return null;
  try {
    const { usage = 0, quota = 0 } = await storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}

// Identifier rules (spec 5). IDs are stable and never reused.

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

export function isValidId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

/**
 * Create a new identifier such as `item_3f9c1a2b7d4e`.
 * Randomness is injectable so tests stay deterministic.
 * @param {string} prefix
 * @param {() => string} [randomHex]
 */
export function newId(prefix, randomHex = defaultRandomHex) {
  const id = `${prefix}_${randomHex()}`;
  if (!isValidId(id)) throw new Error(`Generated an invalid id: ${id}`);
  return id;
}

function defaultRandomHex() {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

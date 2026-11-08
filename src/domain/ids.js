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
  const c = globalThis.crypto;
  // randomUUID only exists on secure origins (https or localhost). Over plain http, such as a phone
  // reaching a computer on the home network, getRandomValues is still there (M6-03).
  if (typeof c?.randomUUID === 'function') return c.randomUUID().replace(/-/g, '').slice(0, 16);
  const bytes = c.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

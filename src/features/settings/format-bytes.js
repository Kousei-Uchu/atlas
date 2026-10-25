// Plain-language sizes for the storage display (M2-08). Uses 1024-based steps.
const UNITS = ['KB', 'MB', 'GB', 'TB'];

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'an unknown amount';
  if (bytes < 1024) return `${Math.round(bytes)} bytes`;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) { value /= 1024; unit += 1; }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}

/** Bytes a profile takes as stored JSON. An estimate: the browser adds its own overhead. */
export function profileBytes(profile) {
  return new TextEncoder().encode(JSON.stringify(profile)).length;
}

// The QR encoder is checked by scanning its output back with a separate decoder (jsQR), as a phone would (M5-04).
import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import { encodeQr, qrPath } from '../../src/share/qr.js';

/** Draw the code as pixels, with a quiet zone, the way a screen or print would show it. */
function pixels(modules, scale = 4, quiet = 4) {
  const n = modules.length + quiet * 2;
  const width = n * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  modules.forEach((row, y) => row.forEach((dark, x) => {
    if (!dark) return;
    for (let dy = 0; dy < scale; dy += 1) {
      for (let dx = 0; dx < scale; dx += 1) {
        const at = (((y + quiet) * scale + dy) * width + (x + quiet) * scale + dx) * 4;
        data[at] = 0; data[at + 1] = 0; data[at + 2] = 0;
      }
    }
  }));
  return { data, width };
}
const scan = (text, options) => {
  const qr = encodeQr(text, options);
  if (!qr.ok) return null;
  const { data, width } = pixels(qr.modules);
  const found = jsQR(data, width, width);
  return found ? found.data : undefined;
};

const url = (length) => `https://example.test/atlas/#atlas=1.${'AbC-_9xYz'.repeat(Math.ceil(length / 9)).slice(0, Math.max(0, length - 38))}`;

describe('QR encoder (M5-04)', () => {
  it('scans back to the same text at every size around the version changes, in both levels', () => {
    // Lengths on both sides of each version boundary, for versions 1 to 25, so every table row is used.
    const lengths = [1, 5, 14, 17, 20, 26, 32, 40, 47, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858, 929, 1003, 1091, 1171];
    for (const ecc of ['L', 'M']) {
      for (const length of lengths) {
        // jsQR cannot read version 23 at level L, and fails the same way on another encoder's code
        // for it (qrcode-generator), so that one size is left out. The app only uses level M.
        if (ecc === 'L' && length > 1003 && length <= 1091) continue;
        const text = 'x'.repeat(length).replace(/x/g, (_, i) => String.fromCharCode(33 + ((i * 7) % 90)));
        expect(scan(text, { ecc }), `${ecc} ${length}`).toBe(text);
      }
    }
  });

  it('scans back a real-looking share link', () => {
    for (const length of [120, 400, 900]) {
      const text = url(length);
      expect(scan(text)).toBe(text);
    }
  });

  it('handles non-ASCII text as UTF-8', () => {
    for (const text of ['café', '日本語のテキスト', 'a'.repeat(20) + '✓']) expect(scan(text)).toBe(text);
  });

  it('uses the smallest version that fits, and a bigger one when it must', () => {
    expect(encodeQr('a').version).toBe(1);
    expect(encodeQr('a'.repeat(14)).version).toBe(1); // 14 bytes fit version 1 at level M
    expect(encodeQr('a'.repeat(15)).version).toBe(2);
    expect(encodeQr('a'.repeat(200)).version).toBeGreaterThan(encodeQr('a'.repeat(100)).version);
  });

  it('level L holds more than level M in the same version', () => {
    expect(encodeQr('a'.repeat(17), { ecc: 'L' }).version).toBe(1);
    expect(encodeQr('a'.repeat(17), { ecc: 'M' }).version).toBe(2);
  });

  it('is square, has the three finder patterns and a dark module, and is deterministic', () => {
    const a = encodeQr('hello');
    const b = encodeQr('hello');
    expect(a.modules).toEqual(b.modules);
    expect(a.modules).toHaveLength(a.size);
    expect(a.modules.every((row) => row.length === a.size)).toBe(true);
    for (const [x, y] of [[0, 0], [a.size - 7, 0], [0, a.size - 7]]) expect(a.modules[y][x] && a.modules[y + 6][x + 6] && !a.modules[y + 1][x + 1]).toBe(true);
    expect(a.modules[a.size - 8][8]).toBe(true);
  });

  it('refuses text that is too long, without throwing', () => {
    expect(encodeQr('a'.repeat(3000))).toEqual({ ok: false, error: 'too-long' });
    expect(encodeQr('a'.repeat(2331)).ok).toBe(true);
    expect(encodeQr('a'.repeat(2332), { ecc: 'M' }).ok).toBe(false);
  });

  it('draws one path of rectangles, offset by the quiet zone', () => {
    const qr = encodeQr('a');
    const path = qrPath(qr.modules);
    expect(path).toMatch(/^M4 4h7v1h-7z/); // the top edge of the first finder pattern
    expect(path).toMatch(/^[Mhvz\d\s-]+$/);
  });
});

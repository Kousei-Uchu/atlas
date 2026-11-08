import { describe, it, expect } from 'vitest';
import { sizeAdvice, formatSize } from '../../src/share/size.js';

describe('size advice (spec 11.5, R-11)', () => {
  it.each([
    [0, 'target', false, false], [2047, 'target', false, false],
    [2048, 'reasonable', false, false], [8191, 'reasonable', false, false],
    [8192, 'warning', false, false], [32767, 'warning', false, false],
    [32768, 'strong', true, false], [102399, 'strong', true, false],
    [102400, 'file', true, true], [5_000_000, 'file', true, true],
  ])('%i bytes is %s (offer file %s, prefer file %s)', (bytes, band, offerFile, preferFile) => {
    expect(sizeAdvice(bytes)).toMatchObject({ band, offerFile, preferFile });
  });

  it('formats sizes in plain words', () => {
    expect(formatSize(312)).toBe('312 bytes');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(20 * 1024)).toBe('20 KB');
  });
});

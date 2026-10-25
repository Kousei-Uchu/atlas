import { describe, it, expect } from 'vitest';
import { formatBytes } from '../../src/features/settings/format-bytes.js';

describe('formatBytes', () => {
  it('uses plain units', () => {
    expect(formatBytes(0)).toBe('0 bytes');
    expect(formatBytes(900)).toBe('900 bytes');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(120 * 1024 * 1024)).toBe('120 MB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB');
  });
  it('does not guess for bad input', () => {
    expect(formatBytes(NaN)).toBe('an unknown amount');
    expect(formatBytes(-1)).toBe('an unknown amount');
  });
});

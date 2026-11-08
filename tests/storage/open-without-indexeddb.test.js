import { describe, it, expect } from 'vitest';
import { openAtlasDb } from '../../src/storage/database.js';

describe('openAtlasDb without IndexedDB (M6-01)', () => {
  it('rejects instead of throwing at once, so the app can show its storage message', async () => {
    const saved = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true });
    try {
      const attempt = openAtlasDb({ name: 'atlas-none' });
      expect(attempt).toBeInstanceOf(Promise);
      await expect(attempt).rejects.toBeDefined();
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { value: saved, configurable: true });
    }
  });
});

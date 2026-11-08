import { afterEach, expect, test, vi } from 'vitest';
import { isValidId, newId } from '../../src/domain/ids.js';

afterEach(() => vi.unstubAllGlobals());

test('ids still work where crypto.randomUUID is missing (plain http, M6-03)', () => {
  vi.stubGlobal('crypto', { getRandomValues: (a) => { a.fill(171); return a; } });
  const id = newId('item');
  expect(id).toBe('item_abababababababab');
  expect(isValidId(id)).toBe(true);
});

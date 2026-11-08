// Storage failure review (M6-01; spec 9, R-05, I-12): what the person sees when the browser's storage fails.
import { test as base, expect } from '@playwright/test';
import { test, stateButton, saved, HUG } from './fixtures.js';
import { checkEnvelope } from '../../src/share/envelope.js';
import { encodePayload } from '../../src/share/codec.js';
import { CONSENT_NOTICE } from '../../src/content/notices.js';

const STORAGE_MESSAGE = /could not open its storage, so charts cannot be saved here/;

base('storage that cannot be opened says so plainly and does not show a blank page', async ({ page }) => {
  await page.addInitScript(() => {
    const original = indexedDB.open.bind(indexedDB);
    indexedDB.open = () => { const request = original('atlas-never-used'); setTimeout(() => request.onerror?.(new Event('error')), 0); throw new DOMException('denied', 'SecurityError'); };
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(STORAGE_MESSAGE);
});

base('a browser with no storage at all gets the same message', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText(STORAGE_MESSAGE);
});

test('a failed save keeps the person\'s work on screen, says so, and recovers when storage works again', async ({ page }) => {
  await stateButton(page, HUG).click();
  await saved(page);
  const before = await stateButton(page, HUG).innerText();

  // Storage starts refusing writes, as it does when the disk quota is full.
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.__restorePut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function refuse() { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
  });
  await stateButton(page, HUG).click();
  await expect(page.locator('.save-status')).toHaveText('Could not save');
  await expect(page.getByRole('alert').first()).toBeVisible();
  const after = await stateButton(page, HUG).innerText();
  expect(after).not.toBe(before); // the change is still on screen and in memory (I-12)

  // Storage works again: "Try saving again" stores it, and nothing is lost.
  await page.evaluate(() => window.__restorePut());
  await page.getByRole('button', { name: 'Try saving again' }).click();
  await saved(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(stateButton(page, HUG)).toHaveText(after);
});

test('an unreadable stored record is shown, never overwritten, and can be exported', async ({ page }) => {
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('atlas-db'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('profiles', 'readwrite');
      const store = tx.objectStore('profiles');
      store.getAll().onsuccess = (e) => { for (const rec of e.target.result) store.put({ ...rec, items: 'not a list' }); };
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('alert').first()).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).toMatch(/could not be opened|not allowed|missing|export/i);
  expect(text).not.toMatch(/Saved$/m);
});

base('a share link still opens when storage is broken, and saving a copy fails safely', async ({ page }) => {
  const YES = { label: 'Yes', description: '', icon: 'check', pattern: 'solid', color: '#1B5E20', textColor: '#FFFFFF', semantic: 'positive' };
  const checked = checkEnvelope({
    format: 'atlas-share', title: 'Guide', createdAt: '2026-11-08T01:00:00.000Z', includesNotes: false, statement: CONSENT_NOTICE, states: [YES],
    groups: [{ name: 'Contact', items: [{ label: 'A hug', kind: 'state', state: 0, text: null, note: null }] }],
  });
  const { payload } = await encodePayload(checked.envelope);
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
  await page.goto(`/#atlas=1.${payload}`);
  await expect(page.getByRole('heading', { level: 2, name: 'Guide' })).toBeVisible();
  await page.getByRole('button', { name: 'Save a copy' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Save a copy' }).click();
  await expect(page.getByRole('alert')).toContainText(/could not be saved\. Nothing was changed/);
  await expect(page.getByText('A hug')).toBeVisible(); // the chart stays on screen
});

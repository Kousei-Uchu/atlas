import AxeBuilder from '@axe-core/playwright';
import { test, expect, HUG, tab } from './fixtures.js';
import { checkEnvelope } from '../../src/share/envelope.js';
import { encodePayload } from '../../src/share/codec.js';
import { CONSENT_NOTICE } from '../../src/content/notices.js';

const YES = { label: 'Yes', description: '', icon: 'check', pattern: 'solid', color: '#1B5E20', textColor: '#FFFFFF', semantic: 'positive' };
const NO = { label: 'No', description: '', icon: 'cross', pattern: 'solid', color: '#8C1D18', textColor: '#FFFFFF', semantic: 'negative' };

async function link(over = {}) {
  const checked = checkEnvelope({
    format: 'atlas-share', title: 'Guide for friends', createdAt: '2026-11-06T01:00:00.000Z', includesNotes: true, statement: CONSENT_NOTICE, states: [YES, NO],
    groups: [{ name: 'Contact', items: [
      { label: 'A hug', kind: 'state', state: 0, text: null, note: 'Only at greetings' },
      { label: 'A pat on the back', kind: 'state', state: 1, text: null, note: null },
      { label: 'How to ask', kind: 'text', state: null, text: 'Ask first', note: null },
    ] }],
    ...over,
  });
  if (!checked.ok) throw new Error(JSON.stringify(checked.problems));
  const enc = await encodePayload(checked.envelope);
  return `/#atlas=1.${enc.payload}`;
}
const open = async (page, url) => { await page.goto(url); await page.reload(); };

test('a share link opens as a read-only preview and leaves local data alone (D-016)', async ({ page }) => {
  await open(page, await link());
  await expect(page.getByRole('heading', { level: 2, name: 'Guide for friends' })).toBeVisible();
  await expect(page.getByText('You are looking at a shared chart.')).toBeVisible();
  await expect(page.getByText(CONSENT_NOTICE)).toBeVisible();
  await expect(page.getByText('Only at greetings')).toBeVisible();
  await expect(page.getByText('Ask first')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(0); // the editor is not here

  // Leaving brings back the person's own chart, unchanged, with the link gone from the address bar.
  await page.getByRole('button', { name: 'Leave without saving' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^${HUG}:`) })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await tab(page, 'Settings');
  await expect(page.getByRole('combobox', { name: 'Open a profile' }).locator('option')).toHaveCount(1);
});

test('Save a copy adds one new profile, opens it, and keeps the first profile (D-016, I-12)', async ({ page }) => {
  await open(page, await link());
  await page.getByRole('button', { name: 'Save a copy' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Save a copy' }).click();
  await expect(page.locator('.profile-name')).toHaveText('Profile: Shared: Guide for friends');
  await expect(page.getByRole('button', { name: /^A hug:/ })).toContainText('Yes');
  await expect(page.getByRole('button', { name: /^A pat on the back:/ })).toContainText('No');
  expect(new URL(page.url()).hash).toBe('');
  await page.reload();
  await expect(page.locator('.profile-name')).toHaveText('Profile: Shared: Guide for friends');
  await tab(page, 'Settings');
  await expect(page.getByRole('combobox', { name: 'Open a profile' }).locator('option')).toHaveCount(2);
});

test('markup in a link is shown as text and runs nothing (I-08)', async ({ page }) => {
  const errors = [];
  page.on('dialog', (d) => { errors.push(`dialog: ${d.message()}`); d.dismiss(); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await open(page, await link({ title: '<img src=x onerror=alert(1)>', groups: [{ name: '<script>alert(2)</script>', items: [{ label: '<a href="javascript:alert(3)">x</a>', kind: 'text', state: null, text: '<svg onload=alert(4)>', note: null }] }], states: [YES], includesNotes: false }));
  await expect(page.getByText('<svg onload=alert(4)>')).toBeVisible();
  expect(await page.locator('.shared-chart img, .shared-chart script, .shared-chart svg[onload], .shared-chart a').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('a damaged, cut-short, oversize or unknown-version link says why and saves nothing (I-08)', async ({ page }) => {
  const good = await link();
  for (const [bad, expected] of [
    [good.slice(0, good.length - 25), /damaged|cut short|does not hold/],
    ['/#atlas=1.@@@@', /damaged or cut short/],
    ['/#atlas=1.' + 'A'.repeat(300_000), /larger than the app opens/],
    ['/#atlas=2.abcd', /different version/],
    ['/#atlas=nothing', /damaged or cut short/],
  ]) {
    await open(page, bad);
    await expect(page.getByRole('alert')).toContainText(expected);
    await expect(page.getByRole('button', { name: 'Save a copy' })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Open my own charts' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^${HUG}:`) })).toBeVisible();
});

test('the preview has no serious accessibility violations in any theme', async ({ page }) => {
  await open(page, await link());
  await expect(page.getByRole('heading', { level: 2, name: 'Guide for friends' })).toBeVisible();
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => v.id), scheme).toEqual([]);
  }
  await page.getByRole('button', { name: 'Save a copy' }).click();
  const dialog = await new AxeBuilder({ page }).analyze();
  expect(dialog.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => v.id)).toEqual([]);
});

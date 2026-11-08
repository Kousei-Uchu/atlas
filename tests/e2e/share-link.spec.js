import AxeBuilder from '@axe-core/playwright';
import { test, expect, stateButton, HUG } from './fixtures.js';
import jsQR from 'jsqr';
import { SHARE_PRIVACY_NOTICE } from '../../src/content/notices.js';

async function viewWithHug(page) {
  await stateButton(page, HUG).click();
  await page.getByRole('button', { name: /^Open audiences/ }).click();
  await page.getByLabel('Name of the audience').fill('Friends');
  await page.getByLabel('Kind of audience').selectOption({ label: 'Friends' });
  await page.getByRole('button', { name: 'Add audience' }).click();
  await page.getByRole('button', { name: 'Open views' }).click();
  await page.getByLabel('Name of the view').fill('Guide for friends');
  await page.getByLabel('Who it is for').selectOption({ label: 'Friends' });
  await page.getByRole('button', { name: 'Make view' }).click();
  await page.getByRole('checkbox', { name: new RegExp(`^${HUG}`) }).check();
}

test('make a link, then open it in a clean browser: the same chart, read-only (M5-03, M5-02)', async ({ page, browser, baseURL }) => {
  await viewWithHug(page);
  await expect(page.getByTestId('share-privacy')).toHaveText(SHARE_PRIVACY_NOTICE);
  await page.getByRole('button', { name: 'Make a link' }).click();
  await expect(page.getByTestId('share-result')).toBeVisible();
  await expect(page.getByTestId('share-result')).toHaveAttribute('data-band', 'target');
  const link = await page.getByLabel('Share link').inputValue();
  expect(link.startsWith(`${baseURL}`.replace(/\/$/, ''))).toBe(true);
  expect(link).toContain('#atlas=1.');
  expect(link.length).toBeLessThan(2048);

  const clean = await browser.newContext();
  const other = await clean.newPage();
  const external = [];
  other.on('request', (r) => { if (!r.url().startsWith(baseURL) && !/^(data|blob|about):/.test(r.url())) external.push(r.url()); });
  await other.goto(link);
  await expect(other.getByRole('heading', { level: 2, name: 'Guide for friends' })).toBeVisible();
  await expect(other.getByText(HUG)).toBeVisible();
  await expect(other.getByText('Friends', { exact: true })).toHaveCount(0); // the audience is not in the link
  await expect(other.getByText(SHARE_PRIVACY_NOTICE)).toHaveCount(0);
  await other.getByRole('button', { name: 'Save a copy' }).click();
  await other.getByRole('alertdialog').getByRole('button', { name: 'Save a copy' }).click();
  await expect(other.locator('.profile-name')).toHaveText('Profile: Shared: Guide for friends');
  expect(external).toEqual([]);
  await clean.close();
});

test('the QR code on screen scans back to the same link, in every theme (M5-04)', async ({ page }) => {
  await viewWithHug(page);
  await page.getByRole('button', { name: 'Make a link' }).click();
  const link = await page.getByLabel('Share link').inputValue();
  await page.getByRole('button', { name: 'Show QR code' }).click();
  for (const theme of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label: theme });
    // Draw the SVG exactly as the page has it onto a canvas and read the pixels, as a camera would see it.
    const raster = await page.evaluate(async () => {
      const svg = document.querySelector('.qr-code');
      const xml = new XMLSerializer().serializeToString(svg);
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`; });
      const canvas = document.createElement('canvas');
      canvas.width = 560; canvas.height = 560;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, 560, 560);
      return { width: 560, height: 560, data: Array.from(ctx.getImageData(0, 0, 560, 560).data) };
    });
    const found = jsQR(Uint8ClampedArray.from(raster.data), raster.width, raster.height);
    expect(found?.data, theme).toBe(link);
  }
});

test('the link is removed when the view changes (M5-03)', async ({ page }) => {
  await viewWithHug(page);
  await page.getByRole('button', { name: 'Make a link' }).click();
  await expect(page.getByLabel('Share link')).toBeVisible();
  await page.getByRole('checkbox', { name: new RegExp(`^${HUG}`) }).uncheck();
  await expect(page.getByLabel('Share link')).toHaveCount(0);
});

test('the share section has no serious accessibility violations in any theme (M5-03)', async ({ page }) => {
  await viewWithHug(page);
  await page.getByRole('button', { name: 'Make a link' }).click();
  await expect(page.getByTestId('share-result')).toBeVisible();
  for (const theme of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label: theme });
    const results = await new AxeBuilder({ page }).include('.share-link').analyze();
    expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => v.id), theme).toEqual([]);
  }
});

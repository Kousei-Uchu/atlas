// M6-03: checks that do not depend on one browser engine, run in whichever projects are enabled.
import { test, expect, HUG, stateButton, saved, tab } from './fixtures.js';

test('the page tells the browser it is responsive and does not block zooming', async ({ page }) => {
  const content = await page.locator('meta[name=viewport]').getAttribute('content');
  expect(content).toContain('width=device-width');
  expect(content).not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/);
});

test('text fields are at least 16 px so iOS does not zoom the page when one is focused', async ({ page }) => {
  const small = [];
  for (const section of ['Chart', 'Modules', 'Explore', 'Share', 'Settings']) {
    await tab(page, section);
    for (let i = 0; i < 12; i += 1) {
      const o = page.getByRole('button', { name: /^Open (?!a profile)/ }).first();
      if (!(await o.count())) break;
      await o.click();
    }
    small.push(...await page.evaluate(() => [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=color]), select, textarea')]
      .filter((e) => e.offsetParent !== null && parseFloat(getComputedStyle(e).fontSize) < 16)
      .map((e) => `${e.tagName}:${e.id || e.name || e.className} ${getComputedStyle(e).fontSize}`)));
  }
  expect(small).toEqual([]);
});


test('landscape phone and a tablet width have no sideways scrolling', async ({ page }) => {
  for (const [width, height] of [[740, 360], [820, 1180], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}x${height}`).toBeLessThanOrEqual(1);
  }
});

test('large text (200%) keeps the chart usable', async ({ page }) => {
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(stateButton(page, HUG)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await stateButton(page, HUG).click();
  await saved(page);
});

test('the app works when the browser has no randomUUID, no clipboard and no compression streams', async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    try { Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true }); } catch { /* read-only here */ }
    try { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); } catch { /* read-only here */ }
    window.CompressionStream = undefined;
    window.DecompressionStream = undefined;
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(baseURL);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await stateButton(page, HUG).click();
  await expect(page.locator('.save-status')).toHaveText('Saved');
  // Making a new item uses an id, which is what randomUUID was needed for.
  await tab(page, 'Share');
  await page.getByRole('button', { name: /^Open audiences/ }).click();
  await page.getByLabel('Name of the audience').fill('Friends');
  await page.getByRole('button', { name: 'Add audience' }).click();
  await expect(page.getByText('Friends', { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test('the printed page and the download links use only local data', async ({ page }) => {
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('heading', { level: 1 })).toBeAttached();
  expect(page.external).toEqual([]);
});

import AxeBuilder from '@axe-core/playwright';
import { test, expect, HUG, stateButton, saved } from './fixtures.js';

const labels = (page) => page.locator('.item-row .item-label').allTextContents();

test('search narrows the chart, Clear filters restores it (M2-05)', async ({ page }) => {
  await page.getByRole('searchbox', { name: 'Search items' }).fill('hug');
  expect(await labels(page)).toEqual([HUG]);
  await expect(page.locator('.search-summary')).toContainText('Showing 1 of 7 items');

  // Answers can still be changed while filtered.
  await stateButton(page, HUG).click();
  await expect(stateButton(page, HUG)).toHaveText('Unsure');

  await page.getByRole('button', { name: 'Clear filters' }).click();
  expect(await labels(page)).toHaveLength(7);
  await expect(stateButton(page, HUG)).toHaveText('Unsure');
});

test('the category filter shows one category (M2-05)', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Show category' }).selectOption({ label: 'Sample: Communication' });
  expect(await labels(page)).toHaveLength(3);
  await expect(page.getByRole('heading', { name: 'Sample: Physical contact' })).toHaveCount(0);
});

test('an item moves down with the keyboard, keeps focus, and the order survives a reload (M2-06)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow is a desktop concern');
  const down = page.getByRole('button', { name: `Move item ${HUG} down` });
  await down.focus();
  await page.keyboard.press('Enter');
  expect((await labels(page)).slice(0, 2)).toEqual(['A high five', HUG]);
  await expect(down).toBeFocused();
  await saved(page);
  await page.reload();
  expect((await labels(page)).slice(0, 2)).toEqual(['A high five', HUG]);
});

test('a category moves down and the move buttons disappear while filtering (M2-06)', async ({ page }) => {
  await page.getByRole('button', { name: 'Move category Sample: Physical contact down' }).click();
  await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('Sample: Communication');
  await page.getByRole('searchbox', { name: 'Search items' }).fill('text');
  await expect(page.getByRole('button', { name: /^Move (item|category)/ })).toHaveCount(0);
});

test('axe finds no serious or critical violations with the search bar and move buttons (M2-05, M2-06)', async ({ page }) => {
  const check = async () => {
    const results = await new AxeBuilder({ page }).analyze();
    return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  };
  expect(await check()).toEqual([]);
  await page.getByRole('searchbox', { name: 'Search items' }).fill('hug');
  expect(await check()).toEqual([]);
});

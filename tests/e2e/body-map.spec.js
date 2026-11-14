// M7-01: the body map, driven through the production build (D-061).
import AxeBuilder from '@axe-core/playwright';
import { test, expect, saved, tab } from './fixtures.js';

const card = (page, title) => page.locator('.module').filter({ has: page.getByRole('heading', { name: title }) });
const MODULE = 'Body contact map';
const live = (page) => page.locator('[role="status"][aria-live="polite"]');

async function openMap(page) {
  await tab(page, 'Modules');
  await page.getByRole('button', { name: 'Open module library' }).click();
  await card(page, MODULE).getByRole('button', { name: `Add ${MODULE}` }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Turn on module' }).click();
  await page.getByRole('button', { name: 'Close module library' }).click();
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open body map' }).click();
}
const row = (page, name) => page.locator('.bm-list tbody tr').filter({ has: page.getByRole('rowheader', { name, exact: true }) });
const answer = (page, name) => row(page, name).getByRole('button').first();

test('without the module the panel says how to get it', async ({ page }) => {
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open body map' }).click();
  await expect(page.getByText('Add that module from the module library')).toBeVisible();
});

test('answer from the list and from the map, and the two agree (M7-01)', async ({ page }) => {
  await openMap(page);
  await expect(answer(page, 'Shoulders')).toHaveText('Unanswered');

  await answer(page, 'Shoulders').click();
  await expect(answer(page, 'Shoulders')).toHaveText('Unsure');
  await expect(live(page)).toContainText('Shoulders: Unsure');

  // Press the drawn shoulder (the first figure is the front).
  await tab(page, 'Explore');
  await page.locator('.bm-figure').first().locator('.bm-region').nth(3).locator('.bm-shape').first().click();
  await expect(answer(page, 'Shoulders')).toHaveText('No');
  await tab(page, 'Explore');
  await page.locator('.bm-figure').first().locator('.bm-region').nth(3).locator('.bm-shape').first().click({ button: 'right' });
  await expect(answer(page, 'Shoulders')).toHaveText('Unsure');

  // The same answer is in the chart (the map is only another way to edit it).
  await page.getByRole('button', { name: 'Close body map' }).click();
  await tab(page, 'Chart');
  await expect(page.getByRole('button', { name: /^Touch from a friend on my shoulders: Unsure/ })).toBeVisible();
  await saved(page);
});

test('each group keeps its own answers', async ({ page }) => {
  await openMap(page);
  await answer(page, 'Hands').click();
  await page.getByLabel('Who is touching').selectOption({ label: 'Touch from family' });
  await expect(answer(page, 'Hands')).toHaveText('Unanswered');
  await page.getByLabel('Who is touching').selectOption({ label: 'Touch from friends' });
  await expect(answer(page, 'Hands')).toHaveText('Unsure');
});

test('the map is not read twice and adds no Tab stops of its own', async ({ page }) => {
  await openMap(page);
  await expect(page.locator('.bm-svg')).toHaveCount(2);
  for (const svg of await page.locator('.bm-svg').all()) {
    await expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(await svg.locator('[tabindex], a, button').count()).toBe(0);
  }
});

test('colour is not the only cue: regions show an icon, and answers show as text', async ({ page }) => {
  await openMap(page);
  await answer(page, 'Face').click();
  await tab(page, 'Explore');
  await expect(page.locator('.bm-figure').first().locator('.bm-icon')).not.toHaveCount(0);
  await expect(row(page, 'Face')).toContainText('Unsure');
});

test('axe finds nothing serious with the map open, in every theme', async ({ page }) => {
  await openMap(page);
  await answer(page, 'Neck').click();
  for (const label of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label });
    const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target)}`), label).toEqual([]);
  }
});

test('the map fits a phone and 320 px with no sideways scrolling', async ({ page }) => {
  await openMap(page);
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

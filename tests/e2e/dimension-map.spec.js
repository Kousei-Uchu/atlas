// M7-02: the dimension map, driven through the production build (D-062).
import AxeBuilder from '@axe-core/playwright';
import { test, expect, saved, tab } from './fixtures.js';

const card = (page, title) => page.locator('.module').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const live = (page) => page.locator('[role="status"][aria-live="polite"]');

async function turnOn(page, title) {
  await tab(page, 'Modules');
  await page.getByRole('button', { name: 'Open module library' }).click();
  await card(page, title).getByRole('button', { name: `Add ${title}` }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Turn on module' }).click();
  await page.getByRole('button', { name: 'Close module library' }).click();
}

test('without a module the panel says what to turn on', async ({ page }) => {
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open dimension map' }).click();
  await expect(page.getByText('Turn one of them on')).toBeVisible();
});

test('choose an answer directly on an axis, with the arrow keys, and see it in the chart (M7-02)', async ({ page }) => {
  await turnOn(page, 'Attraction');
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open dimension map' }).click();
  const first = page.getByRole('radiogroup').first();
  const label = (await first.locator('.dm-label').textContent()).trim();

  await expect(first.getByRole('radio', { checked: true })).toContainText('Unanswered');
  await first.getByRole('radio', { name: 'Yes' }).click();
  await expect(first.getByRole('radio', { checked: true })).toContainText('Yes');
  await tab(page, 'Chart');
  await expect(live(page)).toContainText(`${label}: Yes`);

  // Arrow keys move and choose; only the chosen stop is a Tab stop.
  await tab(page, 'Explore');
  await first.getByRole('radio', { checked: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(first.getByRole('radio', { checked: true })).not.toContainText('Yes');
  expect(await first.locator('[role=radio][tabindex="0"]').count()).toBe(1);

  await page.keyboard.press('ArrowRight');
  await expect(first.getByRole('radio', { checked: true })).toContainText('Yes');
  await page.getByRole('button', { name: 'Close dimension map' }).click();
  await tab(page, 'Chart');
  await expect(page.getByRole('button', { name: new RegExp(`^${label}: Yes`) })).toBeVisible();
  await saved(page);
});

test('the two modules are never drawn together', async ({ page }) => {
  await turnOn(page, 'Attraction');
  await turnOn(page, 'Gender identity and expression');
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open dimension map' }).click();
  const select = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'Dimension map' }) }).locator('label.field select');
  await expect(select).toBeVisible();
  const firstText = await page.locator('.dm-group h3').first().textContent();
  await select.selectOption({ label: 'Gender identity and expression' });
  const secondText = await page.locator('.dm-group h3').first().textContent();
  expect(secondText).not.toBe(firstText);
  // nothing on screen adds, totals or scores
  await expect(page.locator('.dm-group').first()).not.toContainText(/score|total|overall|result|you are/i);
});

test('axe finds nothing serious in any theme, and it reflows at 320 px', async ({ page }) => {
  await turnOn(page, 'Attraction');
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open dimension map' }).click();
  await page.getByRole('radiogroup').first().getByRole('radio', { name: 'Conditional' }).click();
  for (const label of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label });
    const v = (await new AxeBuilder({ page }).analyze()).violations.filter((x) => ['serious', 'critical'].includes(x.impact));
    expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target)}`), label).toEqual([]);
  }
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

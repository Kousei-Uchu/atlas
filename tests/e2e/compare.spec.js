// M7-05: comparing two charts on this device, through the production build (D-065).
import AxeBuilder from '@axe-core/playwright';
import { test, expect, HUG, stateButton, tab } from './fixtures.js';

const panel = (page) => page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'Compare charts' }) });

// "My profile" ends at No; "My profile (as at Then)" is made from a snapshot taken at Unsure.
async function twoCharts(page) {
  await stateButton(page, HUG).click();            // Unsure
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open timeline' }).click();
  await page.getByLabel('Name for this snapshot').fill('Then');
  await page.getByRole('button', { name: 'Save snapshot' }).click();
  await tab(page, 'Chart');
  await stateButton(page, HUG).click();            // No
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Make a new profile from Then' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Make new profile' }).click();
  await expect(page.getByText('Profile: My profile (as at Then)')).toBeVisible();
}

test('with one chart, the panel says a second one is needed', async ({ page }) => {
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open comparison' }).click();
  await expect(panel(page)).toContainText('needs a second chart');
});

test('lists the differing answers side by side, and changes neither chart (M7-05)', async ({ page }) => {
  await twoCharts(page);
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open comparison' }).click();
  await panel(page).locator('label.field select').selectOption({ label: 'My profile' });
  const table = panel(page).getByRole('table', { name: 'Questions with different answers' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader')).toHaveText(['Question', 'My profile (as at Then)', 'My profile']);
  const row = table.getByRole('row').nth(1);
  await expect(row).toContainText('Unsure');
  await expect(row).toContainText('No');
  await expect(panel(page)).toContainText('a different answer');
  await expect(panel(page)).not.toContainText(/score|compatible|match|percent|overall/i);
  // reading changed nothing: this chart still says Unsure
  await tab(page, 'Chart');
  await expect(stateButton(page, HUG)).toHaveText('Unsure');
});

test('axe finds nothing serious in any theme, and it reflows at 320 px', async ({ page }) => {
  await twoCharts(page);
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open comparison' }).click();
  await panel(page).locator('label.field select').selectOption({ label: 'My profile' });
  await expect(panel(page).getByRole('table')).toBeVisible();
  for (const label of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label });
    const v = (await new AxeBuilder({ page }).analyze()).violations.filter((x) => ['serious', 'critical'].includes(x.impact));
    expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target)}`), label).toEqual([]);
  }
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

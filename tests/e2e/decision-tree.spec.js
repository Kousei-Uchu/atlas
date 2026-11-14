// M7-04: the decision tree, driven through the production build (D-064).
import AxeBuilder from '@axe-core/playwright';
import { test, expect, tab } from './fixtures.js';

const card = (page, title) => page.locator('.module').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

async function turnOn(page, title) {
  await tab(page, 'Modules');
  await page.getByRole('button', { name: 'Open module library' }).click();
  await card(page, title).getByRole('button', { name: `Add ${title}` }).click();
  const dialog = page.getByRole('alertdialog');
  if (await dialog.count()) await dialog.getByRole('button', { name: 'Turn on module' }).click();
  await page.getByRole('button', { name: 'Close module library' }).click();
}

test('without the plan the panel says what to turn on', async ({ page }) => {
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open decision tree' }).click();
  await expect(page.getByText('Turn that module on')).toBeVisible();
});

test('shows what is written and chosen in the plan as a nested list, and edits nothing (M7-04)', async ({ page }) => {
  await turnOn(page, 'Overwhelm or support plan');
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open decision tree' }).click();
  await expect(page.getByText('nothing has been written or chosen yet')).toBeVisible();
  await expect(page.getByText('Nothing here yet.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Close decision tree' }).click();

  await tab(page, 'Chart');
  await page.getByRole('textbox', { name: 'Answer for How I feel when it is getting too much' }).fill('Loud rooms');
  await page.getByRole('button', { name: /^Someone asking if I want help/ }).click();

  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open decision tree' }).click();
  const tree = page.getByRole('list', { name: 'When it is getting too much' });
  await expect(tree).toContainText('Early signs');
  await expect(tree).toContainText('How I feel when it is getting too much: Loud rooms');
  await expect(tree).toContainText('Someone asking if I want help');
  await expect(tree).not.toContainText('Someone staying quietly nearby');
  await expect(tree).not.toContainText(/score|total|overall|suggest/i);

  // A branch folds with the keyboard.
  const summary = tree.locator('summary', { hasText: 'Early signs' });
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(tree.getByText('Loud rooms')).toBeHidden();
});

test('axe finds nothing serious in any theme, and it reflows at 320 px', async ({ page }) => {
  await turnOn(page, 'Overwhelm or support plan');
  await tab(page, 'Chart');
  await page.getByRole('textbox', { name: 'Answer for How I feel when it is getting too much' }).fill('A very long note that must wrap inside a narrow screen without sideways scrolling');
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open decision tree' }).click();
  for (const label of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label });
    const v = (await new AxeBuilder({ page }).analyze()).violations.filter((x) => ['serious', 'critical'].includes(x.impact));
    expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target)}`), label).toEqual([]);
  }
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

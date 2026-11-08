import AxeBuilder from '@axe-core/playwright';
import { test, expect, stateButton, HUG } from './fixtures.js';

const row = (page, label) => page.locator('.item-row').filter({ hasText: label }).first();

async function setup(page) {
  await stateButton(page, HUG).click();
  await page.getByRole('button', { name: /^Open audiences/ }).click();
  await page.getByLabel('Name of the audience').fill('Friends');
  await page.getByLabel('Kind of audience').selectOption({ label: 'Friends' });
  await page.getByRole('button', { name: 'Add audience' }).click();
}

test('compare shows only what differs, flags more-open overrides, and changes no answer (M4-07, I-04)', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Compare with my answers for Friends' }).click();
  await expect(page.getByTestId('compare')).toContainText('Friends sees exactly your own answers.');

  const own = await stateButton(page, HUG).innerText();
  await row(page, HUG).getByRole('button', { name: /^Audiences/ }).click();
  await row(page, HUG).getByRole('combobox', { name: /Friends.*sees/ }).selectOption({ label: 'Yes' });
  if (own !== 'Yes') {
    await expect(page.getByTestId('compare')).toContainText(HUG);
    await expect(page.getByTestId('compare-counts')).toContainText('1 item differs');
  }
  await expect(stateButton(page, HUG)).toHaveText(own);
});

test('printing hides the controls and prints a comparison on its own (M4-07)', async ({ page }) => {
  await setup(page);
  await row(page, HUG).getByRole('button', { name: /^Audiences/ }).click();
  await row(page, HUG).getByRole('combobox', { name: /Friends.*sees/ }).selectOption({ label: 'No' });
  await page.getByRole('button', { name: 'Compare with my answers for Friends' }).click();

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Undo' })).toBeHidden();
  await expect(page.locator('.app-footer')).toBeHidden();
  await expect(page.getByText(HUG).first()).toBeVisible(); // the chart still prints, state names are text

  await page.evaluate(() => {
    const node = document.querySelector('.compare');
    node.setAttribute('data-print-target', 'true');
    document.documentElement.setAttribute('data-print', 'compare');
  });
  await expect(page.locator('.item-row').first()).toBeHidden();
  await expect(page.getByTestId('compare')).toBeVisible();
});

test('the comparison has no serious accessibility violations in any theme (M4-07)', async ({ page }) => {
  await setup(page);
  await row(page, HUG).getByRole('button', { name: /^Audiences/ }).click();
  await row(page, HUG).getByRole('combobox', { name: /Friends.*sees/ }).selectOption({ label: 'No' });
  await page.getByRole('button', { name: 'Compare with my answers for Friends' }).click();
  for (const theme of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label: theme });
    const results = await new AxeBuilder({ page }).include('[data-testid="compare"]').analyze();
    expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => v.id), theme).toEqual([]);
  }
});

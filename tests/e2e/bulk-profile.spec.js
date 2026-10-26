import AxeBuilder from '@axe-core/playwright';
import { test, expect, HUG, stateButton, saved } from './fixtures.js';

const FIVE = 'A high five';

test('bulk state: select two items, confirm, keep after reload, undo in one step (M2-07)', async ({ page }) => {
  await page.getByRole('button', { name: 'Select items' }).click();
  await page.getByRole('checkbox', { name: `Select ${HUG}` }).check();
  await page.getByRole('checkbox', { name: `Select ${FIVE}` }).check();
  await page.getByLabel('Set selected to').selectOption({ label: 'No' });
  await page.getByRole('button', { name: 'Set state…' }).click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('This sets 2 items to “No”');
  await dialog.getByRole('button', { name: 'Set 2 items' }).click();
  await expect(stateButton(page, HUG)).toHaveText('No');
  await expect(stateButton(page, FIVE)).toHaveText('No');
  await saved(page);

  await page.reload();
  await expect(stateButton(page, HUG)).toHaveText('No');

  await page.getByRole('button', { name: 'Select items' }).click();
  await page.getByRole('checkbox', { name: `Select ${HUG}` }).check();
  await page.getByLabel('Set selected to').selectOption({ label: 'Unanswered' });
  await page.getByRole('button', { name: 'Set state…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Set 1 item' }).click();
  await expect(stateButton(page, HUG)).toHaveText('Unanswered');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(stateButton(page, HUG)).toHaveText('No');
});

test('Escape closes the bulk dialog and changes nothing (M2-07)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow is a desktop concern');
  await page.getByRole('button', { name: 'Select items' }).click();
  await page.getByRole('checkbox', { name: `Select ${HUG}` }).check();
  await page.getByLabel('Set selected to').selectOption({ label: 'Yes' });
  await page.getByRole('button', { name: 'Set state…' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('never consent');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(stateButton(page, HUG)).toHaveText('Unanswered');
});

test('rename and copy a profile (M2-08)', async ({ page }) => {
  const field = page.getByRole('textbox', { name: 'Name of this profile' });
  await field.fill('Work me');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(page.locator('.profile-name')).toHaveText('Profile: Work me');
  await saved(page);

  await stateButton(page, HUG).click();
  await page.getByRole('button', { name: 'Make a copy of this profile' }).click();
  await expect(page.locator('.profile-name')).toHaveText('Profile: Copy of Work me');
  await expect(stateButton(page, HUG)).toHaveText('Unsure');
  await saved(page);

  await page.reload();
  await expect(page.locator('.profile-name')).toHaveText('Profile: Copy of Work me');
  await expect(page.getByRole('combobox', { name: 'Open a profile' }).locator('option')).toHaveCount(2);
});

test('the storage section reports sizes, and axe is clean with bulk selecting on (M2-07, M2-08)', async ({ page }) => {
  await expect(page.getByText(/This profile takes about/)).toBeVisible();
  await page.getByRole('button', { name: 'Select items' }).click();
  await page.getByRole('checkbox', { name: `Select ${HUG}` }).check();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});

import AxeBuilder from '@axe-core/playwright';
import { test, expect, HUG, stateButton, saved } from './fixtures.js';

const openSettings = async (page) => {
  await page.getByRole('button', { name: 'Edit click behaviour' }).click();
  await expect(page.getByRole('radio', { name: 'Toward No' })).toBeChecked();
};

test('choosing the other direction reverses a tap, and survives a reload (M2-09)', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('radio', { name: 'Toward Yes' }).check();
  await stateButton(page, HUG).click();
  await expect(stateButton(page, HUG)).toHaveText('Conditional');
  await saved(page);

  await page.reload();
  await page.getByRole('button', { name: 'Edit click behaviour' }).click();
  await expect(page.getByRole('radio', { name: 'Toward Yes' })).toBeChecked();
  await expect(stateButton(page, HUG)).toHaveText('Conditional');
});

test('going around at the end wraps from No to Yes (M2-09)', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('radio', { name: 'Go around to the other end' }).check();
  for (let i = 0; i < 3; i += 1) await stateButton(page, HUG).click(); // Unsure, No, then past the end
  await expect(stateButton(page, HUG)).toHaveText('Yes');
});

test('arrow keys move between the choices in a group (M2-09)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow is a desktop concern');
  await openSettings(page);
  await page.getByRole('radio', { name: 'Toward No' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: 'Toward Yes' })).toBeChecked();
});

test('the settings can be undone (M2-09)', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('radio', { name: 'Toward Yes' }).check();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('radio', { name: 'Toward No' })).toBeChecked();
});

test('the panel has no serious accessibility violations in any theme (M2-09)', async ({ page }) => {
  await openSettings(page);
  for (const theme of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label: theme });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, theme).toEqual([]);
  }
});

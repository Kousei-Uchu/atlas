import AxeBuilder from '@axe-core/playwright';
import { test, expect, HUG, stateButton, saved } from './fixtures.js';

const openPalette = async (page) => {
  await page.getByRole('button', { name: 'Edit palette' }).click();
  await expect(page.getByRole('list', { name: 'States in the click cycle, in order' })).toBeVisible();
};

test('renaming a state keeps the answer, and both survive a reload (I-03)', async ({ page }) => {
  await page.getByRole('combobox', { name: `Choose a state for ${HUG}` }).first().selectOption({ label: 'Yes' });
  await openPalette(page);
  await page.getByRole('button', { name: 'Edit Yes' }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Happy to');
  await page.getByRole('button', { name: 'Save changes to Yes' }).click();
  await expect(stateButton(page, HUG)).toHaveText('Happy to');
  await saved(page);
  await page.reload();
  await expect(stateButton(page, HUG)).toHaveText('Happy to');
});

test('reordering the cycle changes what a click does, one step at a time', async ({ page, isMobile }) => {
  test.skip(isMobile, 'uses a right click');
  await openPalette(page);
  await page.getByRole('button', { name: 'Move Yes earlier' }).click();
  await expect(page.getByRole('button', { name: 'Move Yes earlier' })).toBeFocused();
  await stateButton(page, HUG).click({ button: 'right' });
  await expect(stateButton(page, HUG)).toHaveText('Yes');
});

test('removing a state in use asks what to do and defaults to clearing', async ({ page }) => {
  await openPalette(page);
  await page.getByRole('textbox', { name: 'Name of the new state' }).fill('Maybe');
  await page.getByRole('button', { name: 'Add state' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: `Choose a state for ${HUG}` }).first().selectOption({ label: 'Maybe' });
  await page.getByRole('button', { name: 'Remove Maybe' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Remove “Maybe”?' });
  await expect(dialog).toContainText('1 answer currently use this state');
  await dialog.getByRole('button', { name: 'Remove state' }).click();
  await expect(stateButton(page, HUG)).toHaveText('Unanswered');
});

test('axe finds no serious or critical violations with the palette editor open, including contrast', async ({ page }) => {
  await openPalette(page);
  await page.getByRole('button', { name: 'Edit Yes' }).click();
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${scheme}: ${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual([]);
  }
});

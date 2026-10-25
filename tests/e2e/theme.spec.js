import AxeBuilder from '@axe-core/playwright';
import { test, expect, HUG, stateButton, saved } from './fixtures.js';

const appearance = (page) => page.getByRole('combobox', { name: 'Appearance' });
const seriousViolations = async (page, { exclude = [] } = {}) => {
  const builder = new AxeBuilder({ page });
  for (const selector of exclude) builder.exclude(selector);
  const results = await builder.analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);
};

/** Make "Yes" unreadable on purpose: text colour equal to its background colour. */
async function makeYesUnreadable(page) {
  await page.getByRole('button', { name: 'Edit palette' }).click();
  await page.getByRole('button', { name: 'Edit Yes' }).click();
  const background = await page.getByRole('textbox', { name: 'Background colour, as a hex code' }).inputValue();
  await page.getByRole('textbox', { name: 'Text and border colour, as a hex code' }).fill(background);
}

test('the theme choice applies, survives a reload, and can return to the device setting', async ({ page }) => {
  await appearance(page).selectOption({ label: 'High contrast' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'high-contrast');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'high-contrast');
  await expect(appearance(page)).toHaveValue('high-contrast');

  await appearance(page).selectOption({ label: 'Match my device' });
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
});

test('an explicit Light choice beats a dark device setting, and Dark beats a light one', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await appearance(page).selectOption({ label: 'Light' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(247, 247, 245)');

  await page.emulateMedia({ colorScheme: 'light' });
  await appearance(page).selectOption({ label: 'Dark' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(20, 20, 20)');
});

test('axe finds no serious or critical violations, including colour contrast, in every theme (M2-04)', async ({ page }) => {
  for (const label of ['Light', 'Dark', 'High contrast']) {
    await appearance(page).selectOption({ label });
    expect(await seriousViolations(page), label).toEqual([]);
  }
});

test('high contrast keeps an unreadable custom state readable, and keeps the stored colours (I-03)', async ({ page }) => {
  await page.getByRole('combobox', { name: `Choose a state for ${HUG}` }).first().selectOption({ label: 'Yes' });
  await makeYesUnreadable(page);
  await page.getByRole('button', { name: 'Save changes to Yes' }).click();
  await saved(page);

  await appearance(page).selectOption({ label: 'High contrast' });
  const badge = stateButton(page, HUG).locator('.state-badge');
  await expect(badge).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(badge).toHaveCSS('color', 'rgb(255, 255, 255)');
  expect(await seriousViolations(page)).toEqual([]);

  // Back in a normal theme the person's own colours are still there.
  await appearance(page).selectOption({ label: 'Light' });
  await expect(badge).not.toHaveCSS('color', 'rgb(255, 255, 255)');
});

test('a weak colour pair is warned about in words, and saving is still allowed (M2-03)', async ({ page }) => {
  await makeYesUnreadable(page);
  await expect(page.locator('.state-editor .contrast-note')).toContainText('Low contrast: 1.0 to 1');
  const save = page.getByRole('button', { name: 'Save changes to Yes' });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator('[data-state-id="yes"] .contrast-flag')).toHaveText('Low contrast (1.0 to 1)');
});

test('the palette editor passes axe with a warning showing', async ({ page }) => {
  await makeYesUnreadable(page);
  await expect(page.locator('.state-editor .contrast-note')).toBeVisible();
  // The live preview is deliberately unreadable here, so it is left out of the scan.
  // Everything else, including the warning text itself, must still pass.
  expect(await seriousViolations(page, { exclude: ['.state-editor-preview'] })).toEqual([]);
});

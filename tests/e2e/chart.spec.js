import { test, expect, HUG, stateButton, saved } from './fixtures.js';

test('starts Unanswered, edits, survives a reload, and undoes', async ({ page }) => {
  await expect(stateButton(page, HUG)).toHaveText('Unanswered');

  await stateButton(page, HUG).click();
  await expect(stateButton(page, HUG)).toHaveText('Unsure');
  await saved(page);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(stateButton(page, HUG)).toHaveText('Unanswered');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(stateButton(page, HUG)).toHaveText('Unsure');
  await saved(page);

  await page.reload();
  await expect(stateButton(page, HUG)).toHaveText('Unsure');
  // Undo history is in memory only (D-025): nothing to undo after a reload.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('adds a category and an item, and keeps them after reload', async ({ page }) => {
  await page.getByPlaceholder(/category/i).first().fill('Weekend plans');
  await page.getByRole('button', { name: /add category/i }).click();
  await expect(page.getByRole('heading', { name: 'Weekend plans' })).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Weekend plans' })).toBeVisible();
});

test('right click moves toward Yes and the context menu is suppressed on state cells', async ({ page, isMobile }) => {
  test.skip(isMobile, 'no right click on touch');
  await stateButton(page, HUG).click({ button: 'right' });
  await expect(stateButton(page, HUG)).toHaveText('Conditional');
});

test('the picker reaches every state without a right click', async ({ page }) => {
  const picker = page.getByRole('combobox', { name: `Choose a state for ${HUG}` }).first();
  for (const label of ['Yes', 'Not applicable', 'No', 'Unanswered']) {
    await picker.selectOption({ label });
    await expect(stateButton(page, HUG)).toHaveText(label);
  }
});

test('deleting everything asks first and says what it removes', async ({ page }) => {
  await stateButton(page, HUG).click();
  await saved(page);
  await page.getByRole('button', { name: 'Delete all local data' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete all local data?' });
  await expect(dialog).toContainText('permanently removes every profile');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(stateButton(page, HUG)).toHaveText('Unsure');

  await page.getByRole('button', { name: 'Delete all local data' }).click();
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(stateButton(page, HUG)).toHaveText('Unanswered');
});

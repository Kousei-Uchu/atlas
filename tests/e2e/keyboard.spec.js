import { test, expect, HUG, stateButton, saved } from './fixtures.js';

test('the chart can be used with the keyboard alone', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow is a desktop concern');
  await stateButton(page, HUG).focus();
  await expect(stateButton(page, HUG)).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(stateButton(page, HUG)).toHaveText('Unsure');
  await page.keyboard.press('Space');
  await expect(stateButton(page, HUG)).toHaveText('No');
  await page.keyboard.press('Shift+Enter');
  await expect(stateButton(page, HUG)).toHaveText('Unsure');
  await page.keyboard.press('Shift+Space');
  await expect(stateButton(page, HUG)).toHaveText('Unanswered');
  await saved(page);

  // Undo and redo shortcuts work outside text fields.
  await page.keyboard.press('Control+z');
  await expect(stateButton(page, HUG)).toHaveText('Unsure');
  await page.keyboard.press('Control+Shift+z');
  await expect(stateButton(page, HUG)).toHaveText('Unanswered');
});

test('focus is visible and tab order reaches the first state button', async ({ page, isMobile }) => {
  test.skip(isMobile);
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    if (await stateButton(page, HUG).evaluate((el) => el === document.activeElement)) break;
  }
  await expect(stateButton(page, HUG)).toBeFocused();
  const outline = await stateButton(page, HUG).evaluate((el) => {
    const s = getComputedStyle(el);
    return { width: parseFloat(s.outlineWidth), style: s.outlineStyle };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThanOrEqual(2);
});

test('the confirmation dialog traps focus and Escape cancels', async ({ page, isMobile }) => {
  test.skip(isMobile);
  await page.getByRole('button', { name: 'Delete all local data' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Delete everything' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Delete all local data' })).toBeFocused();
});

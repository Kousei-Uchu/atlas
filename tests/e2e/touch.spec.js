import { test, expect, HUG, stateButton, saved } from './fixtures.js';

test.describe('touch viewport', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone project only');

  test('every control is reachable and tappable at phone width', async ({ page }) => {
    await stateButton(page, HUG).tap();
    await expect(stateButton(page, HUG)).toHaveText('Unsure');
    await page.getByRole('combobox', { name: `Choose a state for ${HUG}` }).first().selectOption({ label: 'Yes' });
    await expect(stateButton(page, HUG)).toHaveText('Yes');
    await saved(page);
  });

  test('has no horizontal scroll and 44px targets for state buttons and picker', async ({ page }) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const locator of [stateButton(page, HUG), page.getByRole('button', { name: 'Undo' })]) {
      const box = await locator.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(43.5);
    }
  });
});

import { test, expect, HUG, stateButton, saved } from './fixtures.js';

// One pass through everything M2 added, in the order a person might use it (M2-10).
// The fixture also fails the test if any request leaves the app's own origin (I-06).
test('palette, click behaviour, search, bulk change and copy, in one session', async ({ page, isMobile }) => {
  test.skip(isMobile, 'long desktop flow; each step has its own phone-sized spec');

  // 1. Rename a state. The answer keeps pointing at it (I-03).
  await page.getByRole('button', { name: 'Edit palette' }).click();
  await page.getByRole('button', { name: 'Edit Yes' }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Happy to');
  await page.getByRole('button', { name: 'Save changes to Yes' }).click();
  await page.getByRole('button', { name: 'Hide palette editor' }).click();

  // 2. Flip the click direction and go around at the end.
  await page.getByRole('button', { name: 'Edit click behaviour' }).click();
  await page.getByRole('radio', { name: 'Toward Happy to' }).check();
  await page.getByRole('radio', { name: 'Go around to the other end' }).check();
  await page.getByRole('button', { name: 'Hide click behaviour' }).click();

  // 3. A primary click now goes toward the renamed state.
  await stateButton(page, HUG).click();
  await expect(stateButton(page, HUG)).toHaveText('Conditional');

  // 4. Search, then bulk change what is shown.
  await page.getByRole('searchbox', { name: 'Search items' }).fill('hug');
  await page.getByRole('button', { name: 'Select items' }).click();
  await page.getByRole('checkbox', { name: `Select ${HUG}` }).check();
  await page.getByLabel('Set selected to').selectOption({ label: 'Happy to' });
  await page.getByRole('button', { name: 'Set state…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Set 1 item' }).click();
  await expect(stateButton(page, HUG)).toHaveText('Happy to');
  await page.getByRole('button', { name: 'Clear filters' }).click();

  // 5. Make a copy. It carries the answer, the new name and both settings.
  await saved(page);
  await page.getByRole('button', { name: 'Make a copy of this profile' }).click();
  await expect(page.locator('.profile-name')).toHaveText('Profile: Copy of My profile');
  await expect(stateButton(page, HUG)).toHaveText('Happy to');
  await stateButton(page, HUG).click(); // one step past the end goes around
  await expect(stateButton(page, HUG)).toHaveText('No');

  // 6. Everything is still there after a reload.
  await saved(page);
  await page.reload();
  await expect(page.locator('.profile-name')).toHaveText('Profile: Copy of My profile');
  await expect(stateButton(page, HUG)).toHaveText('No');
});
